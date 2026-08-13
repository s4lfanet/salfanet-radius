require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { RouterOSClient } = require('routeros-client');
const { exec } = require('child_process');
const http = require('http');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
let webpush;
try { webpush = require('web-push'); } catch(_) { console.warn('[PUSH] web-push not installed — push notifications disabled. Run: npm install web-push'); }

// Timezone-safe date helpers for Asia/Jakarta (GMT+7 - WIB)
const getLocalPeriod = (date = new Date()) => {
    const d = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
};

const getLocalDate = (date = new Date()) => {
    const d = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Firebase Admin SDK untuk FCM (mobile push)
let firebaseAdmin = null;
try {
    const admin = require('firebase-admin');
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT || './mypmy-ccd3f-firebase-adminsdk-fbsvc-64338d0a83.json';
    const fs = require('fs');
    if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = require(serviceAccountPath);
        if (!admin.apps.length) {
            admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        }
        firebaseAdmin = admin;
        console.log('[FCM] Firebase Admin SDK initialized');
    } else {
        console.warn(`[FCM] Service account file tidak ditemukan: ${serviceAccountPath} — FCM mobile push disabled`);
    }
} catch(_) {
    console.warn('[FCM] firebase-admin not installed — Run: npm install firebase-admin');
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('[FATAL] JWT_SECRET environment variable is not set!');
    process.exit(1);
}

// Hitung settlement date: bayar 00:00-16:59 → hari itu; 17:00+ → hari berikutnya
function getSettlementDate(paidAt) {
    const d = paidAt ? new Date(paidAt) : new Date();
    const hour = d.getHours();
    if (hour >= 17) {
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        return next.toISOString().slice(0, 10);
    }
    return d.toISOString().slice(0, 10);
}

const app = express();

// Global error handlers to prevent crash from node-routeros errors
const isMikrotikError = (err) => {
    const msg = (err.message || '').toLowerCase();
    const errno = err.errno || '';
    return (
        errno === 'UNKNOWNREPLY' ||
        msg.includes('unknown reply') ||
        msg.includes('timed out') ||
        msg.includes('econnrefused') ||
        msg.includes('econnreset') ||
        msg.includes('epipe') ||
        msg.includes('socket hang up') ||
        msg.includes('etimedout') ||
        (err.constructor && err.constructor.name === 'RosException')
    );
};

process.on('uncaughtException', (err) => {
    if (isMikrotikError(err)) {
        console.error('[MIKROTIK] Uncaught RouterOS error (ignored to prevent crash):', err.message);
        return;
    }
    console.error('[UNCAUGHT EXCEPTION]', err.message);
    console.error(err.stack);
    // For truly unexpected exceptions, exit so Docker can restart
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    if (isMikrotikError(err)) {
        console.error('[MIKROTIK] Unhandled RouterOS rejection (ignored):', err.message);
        return;
    }
    console.error('[UNHANDLED REJECTION] at:', promise, 'reason:', reason);
});

// Security headers (sembunyikan X-Powered-By, tambah CSP dll)
app.use(helmet({ contentSecurityPolicy: false }));

// CORS: hanya izinkan domain sendiri
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://home.pmynet.id').split(',').map(s => s.trim());
app.use(cors({
    origin: (origin, cb) => {
        // izinkan request tanpa origin (mobile app, curl, server-to-server)
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error('CORS: origin tidak diizinkan'));
    },
    credentials: true,
}));

// Rate limiting login: maks 10 percobaan per 5 menit per IP
const loginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 10,
    message: { error: 'Terlalu banyak percobaan login. Coba lagi dalam 5 menit.' },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

const APP_VERSION = 'v1.2.1-IPPool-Simplify';
const BOOT_ID = Math.random().toString(36).substring(2, 11).toUpperCase();

console.log(`[${new Date().toISOString()}] [BOOT] HARD BOOT STARTING... Version: ${APP_VERSION}`);
console.log(`[SYSTEM] Starting App ${APP_VERSION} [BOOT_ID: ${BOOT_ID}] with DB_HOST=${process.env.DB_HOST || 'localhost'}`);

// Request logging middleware — hanya aktif di development
if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
        next();
    });
}

// Sanitasi pesan error: jangan bocorkan detail DB ke client
const safeError = (err) => {
    if (process.env.NODE_ENV === 'production') {
        // Sembunyikan pesan teknis MySQL / internal
        if (err?.code?.startsWith('ER_') || err?.code?.startsWith('ECONNREFUSED')) {
            return 'Terjadi kesalahan server. Silakan coba lagi.';
        }
    }
    return err?.message || 'Terjadi kesalahan.';
};

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Akses ditolak. Token tidak ditemukan.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token tidak valid.' });
        req.user = user;
        next();
    });
};

// Middleware for Admin-Only Access
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Akses ditolak. Membutuhkan hak akses Admin.' });
    }
};

// Middleware for Customer Portal
const isCustomer = (req, res, next) => {
    if (req.user && req.user.role === 'customer') {
        next();
    } else {
        res.status(403).json({ error: 'Akses ditolak. Halaman ini untuk pelanggan.' });
    }
};

// Middleware: admin atau NOC
const isAdminOrNoc = (req, res, next) => {
    if (req.user && ['admin', 'noc'].includes(req.user.role)) return next();
    res.status(403).json({ error: 'Akses ditolak. Membutuhkan hak akses Admin atau NOC.' });
};

// Middleware: admin atau collector
const isAdminOrCollector = (req, res, next) => {
    if (req.user && ['admin', 'collector'].includes(req.user.role)) return next();
    res.status(403).json({ error: 'Akses ditolak. Membutuhkan hak akses Admin atau Kolektor.' });
};

// Middleware: hanya staff internal (admin, noc, technician, collector) — bukan customer
const isStaff = (req, res, next) => {
    if (req.user && ['admin', 'noc', 'technician', 'collector'].includes(req.user.role)) return next();
    res.status(403).json({ error: 'Akses ditolak.' });
};

// ── Helper: ambil tenant_id dari JWT ──────────────────────────────────────
const getTenantId = (req) => {
    if (req.user?.is_super_admin && req.query.tenant_id) {
        return parseInt(req.query.tenant_id);
    }
    return req.user?.tenant_id || 1;
};

// Verifikasi bahwa username pelanggan milik tenant tertentu
const verifyTenantUser = async (username, tenantId) => {
    const [[row]] = await db.query(
        'SELECT 1 FROM customer_details WHERE username = ? AND tenant_id = ?',
        [username, tenantId]
    );
    return !!row;
};

// Verifikasi bahwa invoice milik tenant tertentu
const verifyTenantInvoice = async (invoiceId, tenantId) => {
    const [[row]] = await db.query(
        `SELECT 1 FROM billing_invoices i
         WHERE i.id = ? AND i.tenant_id = ?`,
        [invoiceId, tenantId]
    );
    return !!row;
};

// ── Middleware: hanya super admin ──────────────────────────────────────────
const isSuperAdmin = (req, res, next) => {
    if (req.user?.is_super_admin) return next();
    res.status(403).json({ error: 'Akses ditolak. Hanya Super Admin.' });
};

// ── TENANT MANAGEMENT API ──────────────────────────────────────────────────

// GET semua tenant
app.get('/api/tenants', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT t.*,
                (SELECT COUNT(*) FROM system_accounts sa WHERE sa.tenant_id = t.id) as total_staff,
                (SELECT COUNT(*) FROM customer_details cd WHERE cd.tenant_id = t.id) as total_pelanggan
            FROM tenants t
            WHERE t.id != 1
            ORDER BY t.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET akun admin untuk satu tenant
app.get('/api/tenants/:id/admin', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const [[row]] = await db.query(
            "SELECT username FROM system_accounts WHERE tenant_id = ? AND role = 'admin' ORDER BY id ASC LIMIT 1",
            [req.params.id]
        );
        res.json({ admin_username: row?.username || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST tambah tenant baru
app.post('/api/tenants', authenticateToken, isSuperAdmin, async (req, res) => {
    const { kode, nama, kontak, phone, email, alamat, admin_username, admin_password } = req.body;
    if (!kode || !nama) return res.status(400).json({ error: 'Kode dan nama wajib diisi.' });
    if (!admin_username || !admin_password) return res.status(400).json({ error: 'Username dan password admin wajib diisi.' });
    if (admin_password.length < 6) return res.status(400).json({ error: 'Password admin minimal 6 karakter.' });
    try {
        const [result] = await db.query(
            'INSERT INTO tenants (kode, nama, kontak, phone, email, alamat) VALUES (?, ?, ?, ?, ?, ?)',
            [kode.toUpperCase(), nama, kontak || null, phone || null, email || null, alamat || null]
        );
        const tenantId = result.insertId;
        const hashedPassword = await bcrypt.hash(admin_password, 10);
        await db.query(
            'INSERT INTO system_accounts (username, password, role, fullname, tenant_id) VALUES (?, ?, ?, ?, ?)',
            [admin_username.trim(), hashedPassword, 'admin', `Admin ${nama}`, tenantId]
        );
        res.status(201).json({ id: tenantId, message: `Mitra berhasil ditambahkan. Admin: ${admin_username}@${kode.toUpperCase()}` });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: `Kode mitra "${kode}" sudah digunakan.` });
        res.status(500).json({ error: err.message });
    }
});

// PUT update tenant
app.put('/api/tenants/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    const { nama, kontak, phone, email, alamat, status, admin_username, admin_password } = req.body;
    const tenantId = req.params.id;
    try {
        await db.query(
            'UPDATE tenants SET nama=?, kontak=?, phone=?, email=?, alamat=?, status=? WHERE id=?',
            [nama, kontak || null, phone || null, email || null, alamat || null, status || 'aktif', tenantId]
        );
        // Update akun admin jika ada perubahan
        if (admin_username || admin_password) {
            const [[existing]] = await db.query(
                "SELECT id FROM system_accounts WHERE tenant_id = ? AND role = 'admin' ORDER BY id ASC LIMIT 1",
                [tenantId]
            );
            if (existing) {
                const updates = [];
                const params = [];
                if (admin_username) { updates.push('username = ?'); params.push(admin_username.trim()); }
                if (admin_password) {
                    if (admin_password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter.' });
                    updates.push('password = ?');
                    params.push(await bcrypt.hash(admin_password, 10));
                }
                params.push(existing.id);
                await db.query(`UPDATE system_accounts SET ${updates.join(', ')} WHERE id = ?`, params);
            } else {
                // Belum ada akun admin — buat baru
                if (!admin_username || !admin_password) return res.status(400).json({ error: 'Mitra belum punya akun admin. Isi username dan password.' });
                const hashedPassword = await bcrypt.hash(admin_password, 10);
                await db.query(
                    'INSERT INTO system_accounts (username, password, role, fullname, tenant_id) VALUES (?, ?, ?, ?, ?)',
                    [admin_username.trim(), hashedPassword, 'admin', `Admin ${nama}`, tenantId]
                );
            }
        }
        res.json({ message: 'Mitra berhasil diupdate.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username admin sudah digunakan di mitra ini.' });
        res.status(500).json({ error: err.message });
    }
});

// PATCH set status tenant (aktif / nonaktif / berhenti)
app.patch('/api/tenants/:id/status', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const [[tenant]] = await db.query('SELECT status FROM tenants WHERE id = ?', [req.params.id]);
        if (!tenant) return res.status(404).json({ error: 'Mitra tidak ditemukan.' });
        if (req.params.id == 1) return res.status(400).json({ error: 'Tenant pusat tidak bisa diubah statusnya.' });
        const allowed = ['aktif', 'nonaktif', 'berhenti'];
        const newStatus = allowed.includes(req.body?.status) ? req.body.status
            : (tenant.status === 'aktif' ? 'nonaktif' : 'aktif');
        await db.query('UPDATE tenants SET status=? WHERE id=?', [newStatus, req.params.id]);
        const labels = { aktif: 'diaktifkan', nonaktif: 'dinonaktifkan', berhenti: 'dihentikan' };
        res.json({ status: newStatus, message: `Mitra berhasil ${labels[newStatus]}.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Super Admin Platform Settings ───────────────────────────────────────────

// GET — ambil pengaturan platform (dari tenant_id=1 sebagai referensi)
app.get('/api/super-admin/platform-settings', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const keys = ['company_name', 'company_logo', 'company_address', 'company_phone'];
        const [rows] = await db.query(
            `SELECT setting_key, setting_value FROM billing_settings WHERE setting_key IN (?) AND tenant_id = 1`,
            [keys]
        );
        const result = Object.fromEntries(keys.map(k => [k, '']));
        rows.forEach(r => { result[r.setting_key] = r.setting_value || '' });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST — simpan pengaturan platform ke SEMUA mitra sekaligus
app.post('/api/super-admin/platform-settings', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const ALLOWED = ['company_name', 'company_logo', 'company_address', 'company_phone'];
        const updates = Object.fromEntries(
            Object.entries(req.body).filter(([k]) => ALLOWED.includes(k))
        );
        if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Tidak ada data yang valid.' });

        // Ambil semua tenant_id yang ada
        const [tenants] = await db.query('SELECT id FROM tenants');
        for (const tenant of tenants) {
            for (const [key, value] of Object.entries(updates)) {
                await db.query(
                    'INSERT INTO billing_settings (setting_key, tenant_id, setting_value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
                    [key, tenant.id, value, value]
                );
            }
        }
        res.json({ message: `Pengaturan platform diterapkan ke ${tenants.length} mitra.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────

// System Diagnostic Info
app.get('/api/info', authenticateToken, (req, res) => {
    res.json({
        version: APP_VERSION,
        uptime: Math.floor(process.uptime()),
    });
});

// Connectivity Ping (No DB)
app.get('/api/ping', (req, res) => {
    res.send('pong');
});

// ─── Wilayah Indonesia (data lokal via idn-area-data, tanpa API eksternal) ──
// Format kode dikembalikan TANPA titik agar kompatibel dengan data lama di DB:
//   provinsi: "32", kabupaten: "3201", kecamatan: "320101", kelurahan: "3201011001"
let _wilayahProv = [], _wilayahKab = [], _wilayahKec = [], _wilayahKel = [];
let _wilayahLoaded = false;

const loadWilayahData = async () => {
    if (_wilayahLoaded) return;
    try {
        const idnArea = require('idn-area-data');
        [_wilayahProv, _wilayahKab, _wilayahKec, _wilayahKel] = await Promise.all([
            idnArea.getData('provinces'),
            idnArea.getData('regencies'),
            idnArea.getData('districts'),
            idnArea.getData('villages'),
        ]);
        _wilayahLoaded = true;
        console.log(`[WILAYAH] Loaded: ${_wilayahProv.length} prov, ${_wilayahKab.length} kab, ${_wilayahKec.length} kec, ${_wilayahKel.length} kel`);
    } catch (e) {
        console.error('[WILAYAH] Gagal load idn-area-data:', e.message);
    }
};

// Konversi kode idn-area-data (dengan titik) ke format tanpa titik
const rmDots = (code) => code.replace(/\./g, '');
// Konversi kode tanpa titik ke kode dengan titik (berdasarkan panjang)
const addDots = (kode) => {
    const k = String(kode);
    if (k.length === 4) return `${k.slice(0,2)}.${k.slice(2,4)}`;
    if (k.length === 6) return `${k.slice(0,2)}.${k.slice(2,4)}.${k.slice(4,6)}`;
    if (k.length >= 10) return `${k.slice(0,2)}.${k.slice(2,4)}.${k.slice(4,6)}.${k.slice(6)}`;
    return k;
};

// Pastikan data sudah dimuat sebelum endpoint wilayah dipanggil
loadWilayahData().catch(() => {});

app.get('/api/wilayah/provinsi', authenticateToken, async (req, res) => {
    await loadWilayahData();
    res.json(_wilayahProv.map(p => ({ kode: p.code, nama: p.name })));
});
app.get('/api/wilayah/kabupaten/:kode', authenticateToken, async (req, res) => {
    await loadWilayahData();
    const provCode = req.params.kode; // e.g. "32"
    res.json(_wilayahKab.filter(r => r.province_code === provCode).map(r => ({ kode: rmDots(r.code), nama: r.name })));
});
app.get('/api/wilayah/kecamatan/:kode', authenticateToken, async (req, res) => {
    await loadWilayahData();
    const regCode = addDots(req.params.kode); // "3201" → "32.01"
    res.json(_wilayahKec.filter(d => d.regency_code === regCode).map(d => ({ kode: rmDots(d.code), nama: d.name })));
});
app.get('/api/wilayah/kelurahan/:kode', authenticateToken, async (req, res) => {
    await loadWilayahData();
    const distCode = addDots(req.params.kode); // "320101" → "32.01.01"
    res.json(_wilayahKel.filter(v => v.district_code === distCode).map(v => ({ kode: rmDots(v.code), nama: v.name })));
});

// Server public IP — untuk pre-fill script MikroTik (admin only)
app.get('/api/server/ip', authenticateToken, isAdmin, (req, res) => {
    const os = require('os');
    const nets = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
        }
    }
    // Coba fetch public IP via shell jika tersedia
    exec("curl -s --max-time 3 ifconfig.me 2>/dev/null || curl -s --max-time 3 api.ipify.org 2>/dev/null", (err, stdout) => {
        const publicIp = (!err && stdout.trim().match(/^\d+\.\d+\.\d+\.\d+$/)) ? stdout.trim() : null;
        res.json({ ip: publicIp || ips[0] || null });
    });
});

// Create DB Pool with Timeout protection
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'radius',
    password: process.env.DB_PASS !== undefined ? process.env.DB_PASS : 'radpass',
    database: process.env.DB_NAME || 'radius',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000 // 10s timeout
});

// Diagnostic Endpoint (admin only)
app.get('/api/diag/db-status', authenticateToken, isAdmin, async (req, res) => {
    const start = Date.now();
    try {
        const [rows] = await db.query('SELECT 1 as connected');
        const latency = Date.now() - start;
        res.json({
            status: 'ok',
            database: 'connected',
            latency: `${latency}ms`,
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'radius',
            time: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({
            status: 'error',
            error: err.message,
            host: process.env.DB_HOST || 'localhost'
        });
    }
});

// INITIALIZE DATABASE (Minimal Fast Boot Strategy)
const initializeDatabase = async () => {
    const bootStart = Date.now();
    console.log(`[${new Date().toISOString()}] [BOOT] Memulai inisialisasi minimal...`);
    try {
        // ── Tabel Tenants (HARUS dibuat sebelum system_accounts) ──
        await db.query(`
            CREATE TABLE IF NOT EXISTS tenants (
                id INT AUTO_INCREMENT PRIMARY KEY,
                kode VARCHAR(20) UNIQUE NOT NULL,
                nama VARCHAR(100) NOT NULL,
                kontak VARCHAR(100),
                phone VARCHAR(20),
                email VARCHAR(100),
                alamat TEXT,
                status ENUM('aktif', 'nonaktif') DEFAULT 'aktif',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Seed: ISP pusat sebagai tenant pertama (id = 1)
        await db.query(`
            INSERT IGNORE INTO tenants (id, kode, nama, status)
            VALUES (1, 'PUSAT', 'ISP Pusat', 'aktif')
        `);

        // ONLY Critical Table: system_accounts (untuk login)
        await db.query(`
            CREATE TABLE IF NOT EXISTS system_accounts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('admin', 'collector', 'technician', 'noc') DEFAULT 'admin',
                fullname VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Pastikan kolom role punya ENUM 'noc' (untuk database yang sudah ada)
        await db.query(`
            ALTER TABLE system_accounts
            MODIFY COLUMN role ENUM('admin', 'collector', 'technician', 'noc') DEFAULT 'admin'
        `).catch(() => {}); // ignore jika sudah ada

        // Check and Seed Admin
        const [adminRows] = await db.query('SELECT COUNT(*) as count FROM system_accounts');
        if (adminRows[0].count === 0) {
            const adminHash = bcrypt.hashSync('admin123', 10);
            await db.query(
                `INSERT INTO system_accounts (username, password, role, fullname) VALUES ('admin', ?, 'admin', 'Administrator Mynet')`,
                [adminHash]
            );
            console.log(`[BOOT] Admin seeded.`);
        }

        // CPID sequence table — HARUS di-create di sini (di luar transaksi) agar DDL tidak
        // menyebabkan implicit commit saat generateCustomerID dipanggil di dalam transaksi PSB/import.
        await db.query(`
            CREATE TABLE IF NOT EXISTS cpid_sequence (
                tenant_id INT NOT NULL,
                \`last_value\` INT NOT NULL DEFAULT 0,
                PRIMARY KEY (tenant_id)
            )
        `);
        // Migrasi: jika masih pakai schema lama (kolom id), tambah tenant_id dan seed per tenant
        try {
            const [seqCols] = await db.query("SHOW COLUMNS FROM cpid_sequence");
            const seqColNames = seqCols.map(c => c.Field);
            if (seqColNames.includes('id') && !seqColNames.includes('tenant_id')) {
                await db.query("ALTER TABLE cpid_sequence ADD COLUMN tenant_id INT NOT NULL DEFAULT 1");
                await db.query("ALTER TABLE cpid_sequence DROP PRIMARY KEY");
                await db.query("ALTER TABLE cpid_sequence ADD PRIMARY KEY (tenant_id)");
                await db.query("ALTER TABLE cpid_sequence DROP COLUMN id");
            }
        } catch (e) {}
        // Seed sequence untuk tenant yang belum punya baris (berdasarkan data customer_details)
        await db.query(`
            INSERT INTO cpid_sequence (tenant_id, \`last_value\`)
            SELECT cd.tenant_id, IFNULL(MAX(CAST(SUBSTRING(cd.customer_id, 6) AS UNSIGNED)), 0)
            FROM customer_details cd
            WHERE cd.customer_id LIKE 'CPID-%' AND cd.tenant_id IS NOT NULL
            GROUP BY cd.tenant_id
            ON DUPLICATE KEY UPDATE last_value = GREATEST(last_value, VALUES(last_value))
        `).catch(() => {}); // ignore jika customer_details belum ada

        // Migration: pastikan territory_areas punya collector_id (tidak perlu tunggu 30 detik)
        try {
            const [taCols] = await db.query("SHOW COLUMNS FROM territory_areas").catch(() => [[]]);
            if (taCols.length > 0 && !taCols.map(c => c.Field).includes('collector_id')) {
                await db.query("ALTER TABLE territory_areas ADD COLUMN collector_id INT NULL, ADD INDEX idx_ta_collector (collector_id)");
                await db.query(`UPDATE territory_areas ta JOIN territories t ON ta.territory_id = t.id SET ta.collector_id = t.collector_id WHERE t.collector_id IS NOT NULL`);
                console.log('[BOOT] territory_areas.collector_id dimigrasikan.');
            }
        } catch (e) {} // non-fatal

        console.log(`[BOOT] Inisialisasi minimal selesai dalam ${Date.now() - bootStart}ms. API siap melayani.`);
    } catch (err) {
        console.error(`[FATAL] Gagal bootstrap database:`, err.message);
        // Kita tidak process.exit di sini agar API tetap nyala (mungkin DB belum up)
    }
};

// --- SMART MAINTENANCE & SELF-HEALING (Post-Boot Background) ---
const runSmartMaintenance = async () => {
    const syncStart = Date.now();
    console.log(`[${new Date().toISOString()}] [SYNC] Memulai pemeliharaan cerdas di latar belakang...`);
    try {
        // 1. Table Declarations (All others)
        const tables = [
            `CREATE TABLE IF NOT EXISTS mikrotik_config (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, host VARCHAR(100) NOT NULL, user VARCHAR(50) NOT NULL, pass VARCHAR(100), port INT DEFAULT 8728, radius_secret VARCHAR(100) DEFAULT 'Mynet@2026', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
            `CREATE TABLE IF NOT EXISTS nas (id int(10) NOT NULL AUTO_INCREMENT, nasname varchar(128) NOT NULL, shortname varchar(32), type varchar(30) DEFAULT 'other', ports int(5), secret varchar(60) DEFAULT 'secret' NOT NULL, server varchar(64), community varchar(50), description varchar(200) DEFAULT 'RADIUS Client', PRIMARY KEY (id), KEY nasname (nasname))`,
            `CREATE TABLE IF NOT EXISTS radcheck (id int(11) unsigned NOT NULL AUTO_INCREMENT, username varchar(64) NOT NULL DEFAULT '', attribute varchar(64) NOT NULL DEFAULT '', op char(2) NOT NULL DEFAULT '==', value varchar(253) NOT NULL DEFAULT '', PRIMARY KEY (id), KEY username (username(32)))`,
            `CREATE TABLE IF NOT EXISTS radreply (id int(11) unsigned NOT NULL AUTO_INCREMENT, username varchar(64) NOT NULL DEFAULT '', attribute varchar(64) NOT NULL DEFAULT '', op char(2) NOT NULL DEFAULT '=', value varchar(253) NOT NULL DEFAULT '', PRIMARY KEY (id), KEY username (username(32)))`,
            `CREATE TABLE IF NOT EXISTS radgroupreply (id int(11) unsigned NOT NULL AUTO_INCREMENT, groupname varchar(64) NOT NULL DEFAULT '', attribute varchar(64) NOT NULL DEFAULT '', op char(2) NOT NULL DEFAULT '=', value varchar(253) NOT NULL DEFAULT '', PRIMARY KEY (id), KEY groupname (groupname(32)))`,
            `CREATE TABLE IF NOT EXISTS radgroupcheck (id int(11) unsigned NOT NULL AUTO_INCREMENT, groupname varchar(64) NOT NULL DEFAULT '', attribute varchar(64) NOT NULL DEFAULT '', op char(2) NOT NULL DEFAULT '==', value varchar(253) NOT NULL DEFAULT '', PRIMARY KEY (id), KEY groupname (groupname(32)))`,
            `CREATE TABLE IF NOT EXISTS radpostauth (id int(11) unsigned NOT NULL AUTO_INCREMENT, username varchar(64) NOT NULL DEFAULT '', pass varchar(64) NOT NULL DEFAULT '', reply varchar(32) NOT NULL DEFAULT '', authdate timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (id), KEY username (username))`,
            `CREATE TABLE IF NOT EXISTS radusergroup (id int(11) unsigned NOT NULL AUTO_INCREMENT, username varchar(64) NOT NULL DEFAULT '', groupname varchar(64) NOT NULL DEFAULT '', priority int(11) NOT NULL DEFAULT '1', PRIMARY KEY (id), KEY username (username(32)))`,
            `CREATE TABLE IF NOT EXISTS radacct (radacctid bigint(21) NOT NULL AUTO_INCREMENT, acctsessionid varchar(64) NOT NULL DEFAULT '', acctuniqueid varchar(32) NOT NULL DEFAULT '', username varchar(64) NOT NULL DEFAULT '', groupname varchar(64) NOT NULL DEFAULT '', realm varchar(64) DEFAULT '', nasipaddress varchar(15) NOT NULL DEFAULT '', nasportid varchar(32) DEFAULT NULL, nasporttype varchar(32) DEFAULT NULL, acctstarttime datetime DEFAULT NULL, acctupdatetime datetime DEFAULT NULL, acctstoptime datetime DEFAULT NULL, acctinterval int(12) DEFAULT NULL, acctsessiontime int(12) unsigned DEFAULT NULL, acctauthentic varchar(32) DEFAULT NULL, connectinfo_start varchar(50) DEFAULT NULL, connectinfo_stop varchar(50) DEFAULT NULL, acctinputoctets bigint(20) DEFAULT NULL, acctoutputoctets bigint(20) DEFAULT NULL, calledstationid varchar(50) NOT NULL DEFAULT '', callingstationid varchar(50) NOT NULL DEFAULT '', acctterminatecause varchar(32) NOT NULL DEFAULT '', servicetype varchar(32) DEFAULT NULL, framedprotocol varchar(32) DEFAULT NULL, framedipaddress varchar(15) NOT NULL DEFAULT '', framedipv6address varchar(45) NOT NULL DEFAULT '', framedipv6prefix varchar(45) NOT NULL DEFAULT '', framedinterfaceid varchar(44) NOT NULL DEFAULT '', delegatedipv6prefix varchar(45) NOT NULL DEFAULT '', PRIMARY KEY (radacctid), UNIQUE KEY acctuniqueid (acctuniqueid), KEY username (username), KEY framedipaddress (framedipaddress), KEY acctsessionid (acctsessionid), KEY acctstarttime (acctstarttime), KEY acctstoptime (acctstoptime), KEY nasipaddress (nasipaddress))`,
            `CREATE TABLE IF NOT EXISTS radippool (id int(11) unsigned NOT NULL AUTO_INCREMENT, pool_name varchar(30) NOT NULL, framedipaddress varchar(15) NOT NULL DEFAULT '', nasipaddress varchar(15) NOT NULL DEFAULT '', calledstationid varchar(30), callingstationid varchar(30) NOT NULL, expiry_time datetime DEFAULT NULL, username varchar(64) NOT NULL DEFAULT '', pool_key varchar(30) NOT NULL, PRIMARY KEY (id), KEY poolname_username_expire (pool_name,username,expiry_time), KEY framedipaddress (framedipaddress))`,
            `CREATE TABLE IF NOT EXISTS bandwidth_profiles (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) UNIQUE NOT NULL, rate_limit VARCHAR(50) NOT NULL, price DECIMAL(10, 2) DEFAULT 0.00, description TEXT, pool_name VARCHAR(30), mikrotik_profile VARCHAR(50), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
            `CREATE TABLE IF NOT EXISTS bandwidth_profile_router_map (
                id INT AUTO_INCREMENT PRIMARY KEY,
                profile_id INT NOT NULL,
                nas_id INT NOT NULL,
                mikrotik_profile VARCHAR(100) NOT NULL,
                tenant_id INT NOT NULL DEFAULT 1,
                UNIQUE KEY uq_bprm (profile_id, nas_id),
                INDEX idx_bprm_tenant (tenant_id),
                INDEX idx_bprm_profile (profile_id)
            )`,
            `CREATE TABLE IF NOT EXISTS customer_details (username VARCHAR(64) PRIMARY KEY, customer_id VARCHAR(20) UNIQUE, fullname VARCHAR(100), phone VARCHAR(20), address TEXT, identity_number VARCHAR(50), due_date_day INT DEFAULT 1, auto_suspend TINYINT(1) DEFAULT 1, static_ip VARCHAR(15), territory_id INT NULL, nas_id INT, pop VARCHAR(100), odp VARCHAR(100), reseller VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
            `CREATE TABLE IF NOT EXISTS billing_invoices (id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(64) NOT NULL, period VARCHAR(7) NOT NULL, amount DECIMAL(10, 2) NOT NULL, status ENUM('unpaid', 'paid', 'cancelled') DEFAULT 'unpaid', payment_method VARCHAR(20) DEFAULT 'cash', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, paid_at TIMESTAMP NULL, INDEX (username), INDEX (period))`,
            `CREATE TABLE IF NOT EXISTS billing_settings (setting_key VARCHAR(50) PRIMARY KEY, setting_value TEXT, description VARCHAR(255))`,
            `CREATE TABLE IF NOT EXISTS territories (id INT AUTO_INCREMENT PRIMARY KEY, tenant_id INT NOT NULL DEFAULT 1, name VARCHAR(100) NOT NULL, description TEXT, collector_id INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_terr_tenant (tenant_id))`,
            `CREATE TABLE IF NOT EXISTS territory_areas (id INT AUTO_INCREMENT PRIMARY KEY, territory_id INT NOT NULL, tenant_id INT NOT NULL DEFAULT 1, kelurahan_kode VARCHAR(20) NOT NULL, kelurahan_nama VARCHAR(100) NOT NULL, kecamatan_nama VARCHAR(100), kabupaten_nama VARCHAR(100), dusun_nama VARCHAR(100) NOT NULL DEFAULT '', UNIQUE KEY uniq_territory_kel (territory_id, kelurahan_kode, dusun_nama), INDEX (kelurahan_kode), INDEX idx_ta_tenant (tenant_id), FOREIGN KEY (territory_id) REFERENCES territories(id) ON DELETE CASCADE)`,
            `CREATE TABLE IF NOT EXISTS payment_proofs (id INT AUTO_INCREMENT PRIMARY KEY, invoice_id INT NOT NULL, username VARCHAR(64) NOT NULL, bank_name VARCHAR(50), amount DECIMAL(10,2), transfer_date DATE, notes TEXT, proof_image MEDIUMTEXT, status ENUM('pending','approved','rejected') DEFAULT 'pending', reject_reason VARCHAR(255), reviewed_by_id INT NULL, reviewed_at TIMESTAMP NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX (invoice_id), INDEX (username), INDEX (status))`,
            // Tabel nama IP Pool (MikroTik yang manage actual pool, kita hanya simpan nama referensi)
            `CREATE TABLE IF NOT EXISTS app_ip_pools (id INT AUTO_INCREMENT PRIMARY KEY, tenant_id INT NOT NULL DEFAULT 1, name VARCHAR(64) NOT NULL, description TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_ippool_tenant (tenant_id), UNIQUE KEY uniq_pool_tenant (name, tenant_id))`,
            // Cache online detection via polling MikroTik /ppp/active (full local auth)
            `CREATE TABLE IF NOT EXISTS ppp_active_cache (
                username VARCHAR(64) NOT NULL,
                nas_id INT NOT NULL,
                tenant_id INT NOT NULL DEFAULT 1,
                framed_ip VARCHAR(45) DEFAULT NULL,
                mac_address VARCHAR(64) DEFAULT NULL,
                session_uptime VARCHAR(64) DEFAULT NULL,
                session_start DATETIME DEFAULT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (username, nas_id),
                INDEX idx_pac_tenant (tenant_id),
                INDEX idx_pac_username (username)
            )`
        ];

        for (const sql of tables) { await db.query(sql); }

        // 2. Schema Migrations (ALTER TABLE)
        try {
            const [columns] = await db.query("SHOW COLUMNS FROM bandwidth_profiles");
            const colNames = columns.map(c => c.Field);
            if (!colNames.includes('pool_name')) await db.query("ALTER TABLE bandwidth_profiles ADD COLUMN pool_name VARCHAR(30)");
            if (!colNames.includes('mikrotik_profile')) await db.query("ALTER TABLE bandwidth_profiles ADD COLUMN mikrotik_profile VARCHAR(50)");
            if (!colNames.includes('tenant_id')) await db.query("ALTER TABLE bandwidth_profiles ADD COLUMN tenant_id INT NULL, ADD INDEX idx_bp_tenant (tenant_id)");

            const [cColumns] = await db.query("SHOW COLUMNS FROM customer_details");
            const cColNames = cColumns.map(c => c.Field);
            if (!cColNames.includes('customer_id')) await db.query("ALTER TABLE customer_details ADD COLUMN customer_id VARCHAR(20) AFTER username");
            // Migrasi: ganti UNIQUE global customer_id → composite UNIQUE (customer_id, tenant_id)
            try {
                const [idxRows] = await db.query("SHOW INDEX FROM customer_details WHERE Key_name = 'customer_id'");
                if (idxRows.length > 0) {
                    await db.query("ALTER TABLE customer_details DROP INDEX customer_id");
                    await db.query("ALTER TABLE customer_details ADD UNIQUE KEY uniq_cpid_tenant (customer_id, tenant_id)");
                }
            } catch (e) {}
            if (!cColNames.includes('nas_id')) await db.query("ALTER TABLE customer_details ADD COLUMN nas_id INT");
            if (!cColNames.includes('pop')) await db.query("ALTER TABLE customer_details ADD COLUMN pop VARCHAR(100)");
            if (!cColNames.includes('odp')) await db.query("ALTER TABLE customer_details ADD COLUMN odp VARCHAR(100)");
            if (!cColNames.includes('reseller')) await db.query("ALTER TABLE customer_details ADD COLUMN reseller VARCHAR(100)");
            if (!cColNames.includes('territory_id')) await db.query("ALTER TABLE customer_details ADD COLUMN territory_id INT NULL");

            const [iColumns] = await db.query("SHOW COLUMNS FROM billing_invoices");
            const iColNames = iColumns.map(c => c.Field);
            if (!iColNames.includes('payment_method')) await db.query("ALTER TABLE billing_invoices ADD COLUMN payment_method VARCHAR(20) DEFAULT 'cash' AFTER status");
            if (!iColNames.includes('paid_by_id')) await db.query("ALTER TABLE billing_invoices ADD COLUMN paid_by_id INT NULL AFTER paid_at");
            if (!iColNames.includes('collector_proof')) await db.query("ALTER TABLE billing_invoices ADD COLUMN collector_proof MEDIUMTEXT NULL AFTER paid_by_id");
            if (!iColNames.includes('discount')) await db.query("ALTER TABLE billing_invoices ADD COLUMN discount INT NOT NULL DEFAULT 0 AFTER amount");
            if (!iColNames.includes('discount_reason')) await db.query("ALTER TABLE billing_invoices ADD COLUMN discount_reason VARCHAR(200) NULL AFTER discount");
            if (!iColNames.includes('discount_by')) await db.query("ALTER TABLE billing_invoices ADD COLUMN discount_by INT NULL AFTER discount_reason");
            if (!iColNames.includes('settlement_date')) {
                await db.query("ALTER TABLE billing_invoices ADD COLUMN settlement_date DATE NULL")
                // Backfill: hitung settlement_date dari paid_at yang sudah ada
                // Bayar 00:00-16:59 → hari itu; bayar 17:00+ → hari berikutnya
                await db.query(`UPDATE billing_invoices SET settlement_date =
                    CASE WHEN HOUR(paid_at) < 17 THEN DATE(paid_at)
                         ELSE DATE(DATE_ADD(paid_at, INTERVAL 1 DAY)) END
                    WHERE paid_at IS NOT NULL AND status = 'paid'`)
            }
            if (!iColNames.includes('cancelled_at')) await db.query("ALTER TABLE billing_invoices ADD COLUMN cancelled_at TIMESTAMP NULL")
            if (!iColNames.includes('cancelled_by')) await db.query("ALTER TABLE billing_invoices ADD COLUMN cancelled_by VARCHAR(64) NULL")
            if (!iColNames.includes('cancel_reason')) await db.query("ALTER TABLE billing_invoices ADD COLUMN cancel_reason TEXT NULL")
            if (!iColNames.includes('package_name')) await db.query("ALTER TABLE billing_invoices ADD COLUMN package_name VARCHAR(100) NULL AFTER period")

            const [cdColumns] = await db.query("SHOW COLUMNS FROM customer_details");
            const cdColNames = cdColumns.map(c => c.Field);
            if (!cdColNames.includes('territory_id')) await db.query("ALTER TABLE customer_details ADD COLUMN territory_id INT NULL");
            if (!cdColNames.includes('created_by_id')) await db.query("ALTER TABLE customer_details ADD COLUMN created_by_id INT NULL");
            if (!cdColNames.includes('pin_hash')) await db.query("ALTER TABLE customer_details ADD COLUMN pin_hash VARCHAR(255) NULL");
            if (!cdColNames.includes('pin_is_default')) await db.query("ALTER TABLE customer_details ADD COLUMN pin_is_default TINYINT(1) DEFAULT 1");
            if (!cdColNames.includes('status')) await db.query("ALTER TABLE customer_details ADD COLUMN status ENUM('aktif','berhenti') DEFAULT 'aktif'");
            if (!cdColNames.includes('stopped_at')) await db.query("ALTER TABLE customer_details ADD COLUMN stopped_at TIMESTAMP NULL DEFAULT NULL");
            if (!cdColNames.includes('ktp_photo')) await db.query("ALTER TABLE customer_details ADD COLUMN ktp_photo MEDIUMTEXT NULL");
            if (!cdColNames.includes('territory_area_id')) await db.query("ALTER TABLE customer_details ADD COLUMN territory_area_id INT NULL");
            if (!cdColNames.includes('latitude')) await db.query("ALTER TABLE customer_details ADD COLUMN latitude DECIMAL(10,7) NULL");
            if (!cdColNames.includes('longitude')) await db.query("ALTER TABLE customer_details ADD COLUMN longitude DECIMAL(10,7) NULL");
            // Kolom konfirmasi pembayaran awal PSB
            if (!cdColNames.includes('initial_payment_pending')) await db.query("ALTER TABLE customer_details ADD COLUMN initial_payment_pending TINYINT(1) DEFAULT 0");
            if (!cdColNames.includes('initial_payment_deadline')) await db.query("ALTER TABLE customer_details ADD COLUMN initial_payment_deadline DATETIME NULL");
            if (!cdColNames.includes('initial_payment_confirmed_by')) await db.query("ALTER TABLE customer_details ADD COLUMN initial_payment_confirmed_by VARCHAR(100) NULL");
            if (!cdColNames.includes('initial_payment_confirmed_at')) await db.query("ALTER TABLE customer_details ADD COLUMN initial_payment_confirmed_at DATETIME NULL");
            // Diskon persisten per pelanggan (nominal Rupiah, default 0)
            if (!cdColNames.includes('discount')) await db.query("ALTER TABLE customer_details ADD COLUMN discount INT NOT NULL DEFAULT 0");
            if (!cdColNames.includes('discount_note')) await db.query("ALTER TABLE customer_details ADD COLUMN discount_note VARCHAR(200) NULL");

            // === SYSTEM ACCOUNTS — tenant_id migration ===
            const [saColumns] = await db.query("SHOW COLUMNS FROM system_accounts");
            const saColNames = saColumns.map(c => c.Field);
            if (!saColNames.includes('tenant_id')) {
                await db.query("ALTER TABLE system_accounts ADD COLUMN tenant_id INT NOT NULL DEFAULT 1 AFTER id");
                await db.query("ALTER TABLE system_accounts ADD INDEX idx_sa_tenant (tenant_id)");
                // Hapus unique constraint lama (username saja), ganti jadi (username, tenant_id)
                await db.query("ALTER TABLE system_accounts DROP INDEX username").catch(() => {});
                await db.query("ALTER TABLE system_accounts ADD UNIQUE KEY uniq_user_tenant (username, tenant_id)");
                console.log('[MIGRATION] system_accounts: tenant_id ditambahkan');
            }
            if (!saColNames.includes('is_super_admin')) {
                await db.query("ALTER TABLE system_accounts ADD COLUMN is_super_admin TINYINT(1) DEFAULT 0 AFTER tenant_id");
                // Admin yang sudah ada (id=1, tenant pusat) dijadikan super admin
                await db.query("UPDATE system_accounts SET is_super_admin = 1 WHERE id = 1");
                console.log('[MIGRATION] system_accounts: is_super_admin ditambahkan');
            }

            // === TENANTS — tambah status berhenti ===
            try {
                await db.query("ALTER TABLE tenants MODIFY COLUMN status ENUM('aktif','nonaktif','berhenti') DEFAULT 'aktif'")
            } catch (e) { /* sudah ada */ }

            // === TENANTS — tambah export_token untuk MikroTik auto-sync ===
            const [tenantCols] = await db.query("SHOW COLUMNS FROM tenants").catch(() => [[]])
            const tenantColNames = tenantCols.map(c => c.Field)
            if (!tenantColNames.includes('export_token')) {
                await db.query("ALTER TABLE tenants ADD COLUMN export_token VARCHAR(64) NULL UNIQUE")
            }

            // === MIKROTIK CONFIG ===
            const [mtColumns] = await db.query("SHOW COLUMNS FROM mikrotik_config").catch(() => [[]])
            const mtColNames = mtColumns.map(c => c.Field)
            if (!mtColNames.includes('radius_nas_ip')) await db.query("ALTER TABLE mikrotik_config ADD COLUMN radius_nas_ip VARCHAR(100) NULL COMMENT 'WAN IP yang dipakai MikroTik saat kirim RADIUS (jika berbeda dari host)'")
            if (!mtColNames.includes('auth_mode')) { await db.query("ALTER TABLE mikrotik_config ADD COLUMN auth_mode ENUM('local', 'radius') NULL DEFAULT NULL COMMENT 'Mode autentikasi: local=PPP Secret, radius=FreeRADIUS, NULL=legacy'"); console.log('[MIGRATION] mikrotik_config: auth_mode ditambahkan') }
            if (!mtColNames.includes('tenant_id')) await db.query("ALTER TABLE mikrotik_config ADD COLUMN tenant_id INT NOT NULL DEFAULT 1, ADD INDEX idx_mt_tenant (tenant_id)")

            // === CUSTOMER DETAILS — connection_type untuk static IP ===
            const [cdCols2] = await db.query("SHOW COLUMNS FROM customer_details").catch(() => [[]])
            const cdColNames2 = cdCols2.map(c => c.Field)
            if (!cdColNames2.includes('connection_type')) {
                await db.query("ALTER TABLE customer_details ADD COLUMN connection_type ENUM('pppoe','static','hotspot') NOT NULL DEFAULT 'pppoe' AFTER username")
                console.log('[MIGRATION] customer_details: connection_type ditambahkan')
            } else {
                // Pastikan 'hotspot' ada di ENUM (upgrade dari versi lama)
                const [enumRows] = await db.query("SHOW COLUMNS FROM customer_details WHERE Field = 'connection_type'").catch(() => [[]])
                if (enumRows[0] && !enumRows[0].Type.includes('hotspot')) {
                    await db.query("ALTER TABLE customer_details MODIFY COLUMN connection_type ENUM('pppoe','static','hotspot') NOT NULL DEFAULT 'pppoe'")
                    console.log('[MIGRATION] customer_details: connection_type ditambahkan nilai hotspot')
                }
            }
            if (!cdColNames2.includes('mac_address')) {
                await db.query("ALTER TABLE customer_details ADD COLUMN mac_address VARCHAR(20) NULL")
                console.log('[MIGRATION] customer_details: mac_address ditambahkan')
            }
            if (!cdColNames2.includes('billing_type')) {
                await db.query("ALTER TABLE customer_details ADD COLUMN billing_type ENUM('prepaid','postpaid') NOT NULL DEFAULT 'prepaid'")
                console.log('[MIGRATION] customer_details: billing_type ditambahkan')
            }
            if (!cdColNames2.includes('is_isolated')) {
                await db.query("ALTER TABLE customer_details ADD COLUMN is_isolated TINYINT(1) NOT NULL DEFAULT 0")
                console.log('[MIGRATION] customer_details: is_isolated ditambahkan')
            }
            if (!cdColNames2.includes('original_install_date')) {
                await db.query("ALTER TABLE customer_details ADD COLUMN original_install_date DATE NULL DEFAULT NULL COMMENT 'Tanggal pemasangan asli saat PSB, tidak berubah meski admin edit install_date'")
                // Backfill dari installation_logs
                await db.query(`UPDATE customer_details cd JOIN installation_logs il ON il.username = cd.username SET cd.original_install_date = DATE(il.install_date) WHERE cd.original_install_date IS NULL AND il.install_date IS NOT NULL`)
                console.log('[MIGRATION] customer_details: original_install_date ditambahkan + backfill dari installation_logs')
            }

            // === CUSTOMER DETAILS — Migrasi PRIMARY KEY: username → id AUTO_INCREMENT + UNIQUE(username, tenant_id) ===
            // Mengizinkan username yang sama di mitra berbeda (multi-tenant)
            try {
                const [cdIdCols] = await db.query("SHOW COLUMNS FROM customer_details WHERE Field = 'id'")
                if (cdIdCols.length === 0) {
                    console.log('[MIGRATION] customer_details: Migrasi PRIMARY KEY username → id AUTO_INCREMENT...')
                    // Step 1: Tambah id dengan AUTO_INCREMENT + KEY sementara (MySQL wajib ada KEY untuk AUTO_INCREMENT)
                    // MySQL otomatis mengisi nilai sequential untuk semua baris yang sudah ada
                    await db.query("ALTER TABLE customer_details ADD COLUMN id INT UNSIGNED NOT NULL AUTO_INCREMENT FIRST, ADD KEY auto_cdid (id)")
                    // Step 2: Drop username sebagai PK, jadikan id sebagai PRIMARY KEY, tambah UNIQUE(username, tenant_id)
                    await db.query("ALTER TABLE customer_details DROP PRIMARY KEY, ADD PRIMARY KEY (id), ADD UNIQUE KEY uq_username_tenant (username, tenant_id), DROP KEY auto_cdid")
                    console.log('[MIGRATION] customer_details: PRIMARY KEY diubah ke id, UNIQUE(username, tenant_id) ditambahkan')
                }
            } catch (cdPkErr) {
                console.error('[MIGRATION] customer_details PK migration error:', cdPkErr.message)
            }

            // === RADCHECK DUPLICATE CLEANUP ===
            // Hapus entry radcheck duplikat (attribute=Cleartext-Password) yang terjadi akibat bug import
            // Simpan 1 entry per username (yang id-nya paling kecil = paling awal diinsert)
            try {
                const [dupRc] = await db.query(`
                    SELECT username, COUNT(*) as cnt
                    FROM radcheck
                    WHERE attribute = 'Cleartext-Password'
                    GROUP BY username
                    HAVING cnt > 1
                `)
                if (dupRc.length > 0) {
                    for (const row of dupRc) {
                        await db.query(`
                            DELETE FROM radcheck
                            WHERE username = ? AND attribute = 'Cleartext-Password'
                            AND id NOT IN (
                                SELECT keep_id FROM (
                                    SELECT MIN(id) as keep_id FROM radcheck
                                    WHERE username = ? AND attribute = 'Cleartext-Password'
                                ) t
                            )
                        `, [row.username, row.username])
                    }
                    console.log(`[MIGRATION] radcheck: ${dupRc.length} username dibersihkan dari entry Cleartext-Password duplikat`)
                }
            } catch (rcCleanErr) {
                console.warn('[MIGRATION] radcheck duplicate cleanup error:', rcCleanErr.message)
            }

            // === RADUSERGROUP NAS_ID BACKFILL ===
            // Isi nas_id yang NULL di radusergroup dari customer_details — cegah leakage antar tenant
            try {
                const [rugBackfill] = await db.query(`
                    UPDATE radusergroup rg
                    JOIN customer_details cd ON cd.username = rg.username AND cd.nas_id IS NOT NULL
                    SET rg.nas_id = cd.nas_id
                    WHERE rg.nas_id IS NULL
                `)
                if (rugBackfill.affectedRows > 0) {
                    console.log(`[MIGRATION] radusergroup: ${rugBackfill.affectedRows} entry nas_id dibackfill dari customer_details`)
                }
            } catch (rugErr) {
                console.warn('[MIGRATION] radusergroup nas_id backfill error:', rugErr.message)
            }

            // === WAITING LIST ===
            const [wlColumns] = await db.query("SHOW COLUMNS FROM waiting_list").catch(() => [[]])
            const wlColNames = wlColumns.map(c => c.Field)
            if (wlColNames.length > 0) {
                if (!wlColNames.includes('kelurahan_kode')) await db.query("ALTER TABLE waiting_list ADD COLUMN kelurahan_kode VARCHAR(20) NULL")
                if (!wlColNames.includes('groupname')) await db.query("ALTER TABLE waiting_list ADD COLUMN groupname VARCHAR(100) NULL")
                if (!wlColNames.includes('sales')) await db.query("ALTER TABLE waiting_list ADD COLUMN sales VARCHAR(100) NULL")
                if (!wlColNames.includes('latitude')) await db.query("ALTER TABLE waiting_list ADD COLUMN latitude DECIMAL(10,7) NULL")
                if (!wlColNames.includes('longitude')) await db.query("ALTER TABLE waiting_list ADD COLUMN longitude DECIMAL(10,7) NULL")
                if (!wlColNames.includes('territory_area_id')) await db.query("ALTER TABLE waiting_list ADD COLUMN territory_area_id INT NULL")
                if (!wlColNames.includes('assigned_to')) await db.query("ALTER TABLE waiting_list ADD COLUMN assigned_to VARCHAR(64) NULL")
                if (!wlColNames.includes('assigned_at')) await db.query("ALTER TABLE waiting_list ADD COLUMN assigned_at TIMESTAMP NULL")
                if (!wlColNames.includes('assigned_by')) await db.query("ALTER TABLE waiting_list ADD COLUMN assigned_by VARCHAR(64) NULL")
            }

            // === WAITING LIST — tambah tenant_id ===
            const [wlTenantCols] = await db.query("SHOW COLUMNS FROM waiting_list").catch(() => [[]])
            const wlTenantColNames = wlTenantCols.map(c => c.Field)
            if (wlTenantColNames.length > 0 && !wlTenantColNames.includes('tenant_id')) {
                await db.query("ALTER TABLE waiting_list ADD COLUMN tenant_id INT NOT NULL DEFAULT 1, ADD INDEX idx_wl_tenant (tenant_id)")
                // Backfill: ambil tenant_id dari system_accounts berdasarkan created_by
                await db.query(`
                    UPDATE waiting_list wl
                    JOIN system_accounts sa ON sa.username = wl.created_by
                    SET wl.tenant_id = sa.tenant_id
                    WHERE sa.tenant_id IS NOT NULL
                `).catch(() => {})
                console.log('[MIGRATION] waiting_list: tenant_id ditambahkan + backfill dari created_by')
            }

            // === WAITING LIST ASSIGNMENTS (multi-teknisi) ===
            await db.query(`CREATE TABLE IF NOT EXISTS waiting_list_assignments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                wl_id INT NOT NULL,
                technician_username VARCHAR(64) NOT NULL,
                assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                assigned_by VARCHAR(64) NOT NULL,
                UNIQUE KEY unique_wl_tech (wl_id, technician_username),
                INDEX idx_tech (technician_username),
                INDEX idx_wl (wl_id)
            )`)

            // === KONFIRMASI SETORAN KOLEKTOR ===
            await db.query(`CREATE TABLE IF NOT EXISTS collector_settlement_confirmations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                collector_id INT NOT NULL,
                collector_username VARCHAR(64) NOT NULL,
                settlement_date DATE NOT NULL,
                confirmed_by VARCHAR(64) NOT NULL,
                confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                notes TEXT NULL,
                UNIQUE KEY unique_settlement (collector_id, settlement_date),
                INDEX idx_date (settlement_date)
            )`)

            // === TASK CABUT ONT ===
            await db.query(`CREATE TABLE IF NOT EXISTS ont_removal_tasks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(64) NOT NULL,
                customer_id VARCHAR(64) NULL,
                fullname VARCHAR(150) NULL,
                address TEXT NULL,
                territory_name VARCHAR(100) NULL,
                latitude DECIMAL(10,7) NULL,
                longitude DECIMAL(10,7) NULL,
                assigned_to VARCHAR(64) NOT NULL,
                assigned_by VARCHAR(64) NOT NULL,
                notes TEXT NULL,
                status ENUM('pending','done','cancelled') DEFAULT 'pending',
                completed_at TIMESTAMP NULL,
                completed_notes TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_assigned_to (assigned_to),
                INDEX idx_status (status)
            )`)

            // Migrasi kolom baru ont_removal_tasks
            const [ontColumns] = await db.query("SHOW COLUMNS FROM ont_removal_tasks").catch(() => [[]])
            const ontColNames = ontColumns.map(c => c.Field)
            if (!ontColNames.includes('cancel_reason')) await db.query("ALTER TABLE ont_removal_tasks ADD COLUMN cancel_reason TEXT NULL")
            if (!ontColNames.includes('cancelled_by')) await db.query("ALTER TABLE ont_removal_tasks ADD COLUMN cancelled_by VARCHAR(64) NULL")
            if (!ontColNames.includes('cancelled_at')) await db.query("ALTER TABLE ont_removal_tasks ADD COLUMN cancelled_at TIMESTAMP NULL")
            if (!ontColNames.includes('tenant_id')) {
                await db.query("ALTER TABLE ont_removal_tasks ADD COLUMN tenant_id INT NOT NULL DEFAULT 1")
                await db.query("UPDATE ont_removal_tasks ort JOIN customer_details cd ON cd.username = ort.username SET ort.tenant_id = cd.tenant_id WHERE cd.tenant_id != 1")
            }

            // Migrasi kolom tenant_id pada ont_removals (hanya jika tabel sudah ada)
            const [ontRemovalsColumns] = await db.query("SHOW COLUMNS FROM ont_removals").catch(() => [[]])
            const ontRemovalsColNames = ontRemovalsColumns.map(c => c.Field)
            if (ontRemovalsColNames.length > 0 && !ontRemovalsColNames.includes('tenant_id')) {
                await db.query("ALTER TABLE ont_removals ADD COLUMN tenant_id INT NOT NULL DEFAULT 1")
                await db.query("UPDATE ont_removals orr JOIN customer_details cd ON cd.username = orr.username SET orr.tenant_id = cd.tenant_id WHERE cd.tenant_id != 1")
            }

            // === LOG PERUBAHAN PAKET ===
            await db.query(`CREATE TABLE IF NOT EXISTS package_change_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(64) NOT NULL,
                old_package VARCHAR(100) NULL,
                new_package VARCHAR(100) NULL,
                old_amount DECIMAL(10,2) NULL,
                new_amount DECIMAL(10,2) NULL,
                invoice_updated TINYINT(1) DEFAULT 0,
                invoice_id INT NULL,
                reason TEXT NULL,
                changed_by VARCHAR(64) NOT NULL,
                changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_pcl_username (username),
                INDEX idx_pcl_changed_at (changed_at)
            )`)

            // === NOTIFIKASI ===
            await db.query(`CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                recipient_type ENUM('admin','collector','customer') NOT NULL,
                recipient_id VARCHAR(64) NOT NULL,
                type VARCHAR(60) NOT NULL,
                title VARCHAR(255) NOT NULL,
                body TEXT,
                data JSON,
                tenant_id INT NULL,
                read_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_notif_recipient (recipient_type, recipient_id, read_at),
                INDEX idx_notif_created (created_at)
            )`);
            // Migrasi: tambah tenant_id jika belum ada (idempotent)
            await db.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS tenant_id INT NULL`).catch(() => {});
            await db.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(64) NOT NULL,
                role VARCHAR(20) NOT NULL,
                endpoint TEXT NOT NULL,
                p256dh TEXT NOT NULL,
                auth_key VARCHAR(255) NOT NULL,
                fcm_token TEXT NULL,
                tenant_id INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_sub (username, endpoint(191))
            )`);
            // Migrasi: tambah tenant_id jika belum ada (idempotent)
            await db.query(`ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS tenant_id INT NULL`).catch(() => {});

            // Migrasi: tambah tenant_id ke payment_promises & package_change_logs (isolasi antar tenant)
            await db.query(`ALTER TABLE payment_promises ADD COLUMN IF NOT EXISTS tenant_id INT NULL`).catch(() => {});
            await db.query(`ALTER TABLE package_change_logs ADD COLUMN IF NOT EXISTS tenant_id INT NULL`).catch(() => {});

            // === CABUT ONT ===
            await db.query(`CREATE TABLE IF NOT EXISTS ont_removals (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(64) NOT NULL,
                customer_id VARCHAR(20),
                fullname VARCHAR(100),
                address TEXT,
                dusun VARCHAR(150),
                collector_id INT NOT NULL,
                collector_name VARCHAR(100),
                notes TEXT,
                removed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                period VARCHAR(7) GENERATED ALWAYS AS (DATE_FORMAT(removed_at, '%Y-%m')) STORED,
                INDEX idx_ont_period (period),
                INDEX idx_ont_collector (collector_id),
                INDEX idx_ont_username (username)
            )`);

            // Tabel rate limiting login portal
            await db.query(`CREATE TABLE IF NOT EXISTS portal_login_attempts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                phone VARCHAR(20) NOT NULL,
                ip VARCHAR(45) NOT NULL,
                attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (phone, attempted_at),
                INDEX (ip, attempted_at)
            )`);
            // Bersihkan attempt lama otomatis (>1 jam)
            await db.query(`DELETE FROM portal_login_attempts WHERE attempted_at < NOW() - INTERVAL 10 MINUTE`);

            // Tabel janji bayar
            await db.query(`CREATE TABLE IF NOT EXISTS payment_promises (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(64) NOT NULL,
                invoice_id INT NULL,
                promise_date DATE NOT NULL,
                notes TEXT,
                status ENUM('active','fulfilled','broken') DEFAULT 'active',
                created_by_id INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (promise_date, status),
                INDEX (username)
            )`);

            // === LAYANAN TAMBAHAN (ADDON) ===
            await db.query(`CREATE TABLE IF NOT EXISTS addon_types (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id INT NOT NULL,
                name VARCHAR(100) NOT NULL,
                description VARCHAR(255) NULL,
                price DECIMAL(10,2) NOT NULL DEFAULT 0,
                is_recurring TINYINT(1) DEFAULT 1,
                is_active TINYINT(1) DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_addon_tenant (tenant_id)
            )`);
            await db.query(`CREATE TABLE IF NOT EXISTS customer_addons (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(64) NOT NULL,
                addon_type_id INT NOT NULL,
                price_override DECIMAL(10,2) NULL,
                start_date DATE NOT NULL,
                end_date DATE NULL,
                notes VARCHAR(255) NULL,
                tenant_id INT NOT NULL,
                created_by_id INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_ca_username (username),
                INDEX idx_ca_tenant (tenant_id),
                INDEX idx_ca_addon_type (addon_type_id)
            )`);
            await db.query(`CREATE TABLE IF NOT EXISTS billing_invoice_addons (
                id INT AUTO_INCREMENT PRIMARY KEY,
                invoice_id INT NOT NULL,
                addon_type_id INT NULL,
                addon_name VARCHAR(100) NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                INDEX idx_bia_invoice (invoice_id)
            )`);
            // Kolom addon_amount di billing_invoices
            const [biCols] = await db.query("SHOW COLUMNS FROM billing_invoices").catch(() => [[]])
            const biColNames = biCols.map(c => c.Field)
            if (!biColNames.includes('addon_amount')) {
                await db.query("ALTER TABLE billing_invoices ADD COLUMN addon_amount DECIMAL(10,2) DEFAULT 0 AFTER discount")
                console.log('[SYNC] Kolom addon_amount ditambahkan ke billing_invoices.')
            }

            // === TERRITORIES — tambah tenant_id ===
            const [terrColumns] = await db.query("SHOW COLUMNS FROM territories").catch(() => [[]])
            const terrColNames = terrColumns.map(c => c.Field)
            if (terrColNames.length > 0 && !terrColNames.includes('tenant_id')) {
                // Hapus UNIQUE(name) global, ganti jadi index biasa (setiap tenant bisa punya nama territory sama)
                try { await db.query("ALTER TABLE territories DROP INDEX name") } catch (_) {}
                await db.query("ALTER TABLE territories ADD COLUMN tenant_id INT NOT NULL DEFAULT 1, ADD INDEX idx_terr_tenant (tenant_id)")
                // Backfill: territory yang sudah ada anggap milik tenant_id=1
                console.log('[MIGRATION] territories: tenant_id ditambahkan (semua data lama → tenant_id=1)')
            }

            // === TERRITORY AREAS — tambah tenant_id ===
            const [taColumns] = await db.query("SHOW COLUMNS FROM territory_areas");
            const taColNames = taColumns.map(c => c.Field);
            if (!taColNames.includes('collector_id')) {
                await db.query("ALTER TABLE territory_areas ADD COLUMN collector_id INT NULL, ADD INDEX idx_ta_collector (collector_id)");
                // Migrate: isi collector_id dari tabel territories
                await db.query(`
                    UPDATE territory_areas ta
                    JOIN territories t ON ta.territory_id = t.id
                    SET ta.collector_id = t.collector_id
                    WHERE t.collector_id IS NOT NULL
                `);
                console.log('[SYNC] territory_areas.collector_id dimigrasikan dari territories.');
            }
            // Tambah kolom provinsi_nama jika belum ada
            if (!taColNames.includes('provinsi_nama')) {
                await db.query("ALTER TABLE territory_areas ADD COLUMN provinsi_nama VARCHAR(100) NULL");
            }
            // Tambah tenant_id jika belum ada
            if (!taColNames.includes('tenant_id')) {
                await db.query("ALTER TABLE territory_areas ADD COLUMN tenant_id INT NOT NULL DEFAULT 1, ADD INDEX idx_ta_tenant (tenant_id)")
                // Backfill: isi tenant_id dari territories.tenant_id
                await db.query(`
                    UPDATE territory_areas ta
                    JOIN territories t ON ta.territory_id = t.id
                    SET ta.tenant_id = t.tenant_id
                    WHERE t.tenant_id IS NOT NULL
                `).catch(() => {})
                console.log('[MIGRATION] territory_areas: tenant_id ditambahkan')
            }
            // Ganti UNIQUE key lama → UNIQUE(kelurahan_kode, dusun_nama) agar 1 dusun = 1 kolektor
            try {
                const [idxRows] = await db.query("SHOW INDEX FROM territory_areas WHERE Key_name = 'uniq_dusun'");
                if (idxRows.length === 0) {
                    // Hapus unique lama dulu (ignore error kalau tidak ada)
                    try { await db.query("ALTER TABLE territory_areas DROP INDEX uniq_territory_kel"); } catch (_) {}
                    await db.query("ALTER TABLE territory_areas ADD UNIQUE KEY uniq_dusun (kelurahan_kode, dusun_nama)");
                    console.log('[SYNC] UNIQUE(kelurahan_kode, dusun_nama) ditambahkan ke territory_areas.');
                }
            } catch (e) { console.warn('[SYNC] Unique key territory_areas:', e.message); }

            // === Tabel installation_logs (audit permanen, tidak terhapus walau pelanggan dihapus) ===
            await db.query(`CREATE TABLE IF NOT EXISTS installation_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(64) NOT NULL,
                customer_id VARCHAR(20),
                fullname VARCHAR(100),
                phone VARCHAR(20),
                address TEXT,
                identity_number VARCHAR(50),
                groupname VARCHAR(64),
                territory_name VARCHAR(150),
                installed_by_id INT NULL,
                installed_by_name VARCHAR(100),
                install_date DATE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_install_date (install_date),
                INDEX idx_installed_by (installed_by_id),
                INDEX idx_username (username)
            )`);
            // Waiting List pemasangan
            await db.query(`CREATE TABLE IF NOT EXISTS waiting_list (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id INT NOT NULL DEFAULT 1,
                fullname VARCHAR(150) NOT NULL,
                phone VARCHAR(20),
                address TEXT,
                identity_number VARCHAR(50),
                ktp_photo MEDIUMTEXT,
                notes TEXT,
                territory_id INT NULL,
                kelurahan_kode VARCHAR(20) NULL,
                groupname VARCHAR(100) NULL,
                status ENUM('waiting','installed','cancelled') DEFAULT 'waiting',
                created_by VARCHAR(64) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                installed_at TIMESTAMP NULL,
                installed_by VARCHAR(64) NULL,
                pppoe_username VARCHAR(64) NULL,
                INDEX idx_status (status),
                INDEX idx_territory (territory_id),
                INDEX idx_wl_tenant (tenant_id)
            )`);
            // Backfill: isi installation_logs dari customer_details yang belum ada
            await db.query(`
                INSERT IGNORE INTO installation_logs
                    (username, customer_id, fullname, phone, address, identity_number, groupname,
                     territory_name, installed_by_id, installed_by_name, install_date, created_at)
                SELECT
                    cd.username,
                    cd.customer_id,
                    cd.fullname,
                    cd.phone,
                    cd.address,
                    cd.identity_number,
                    rug.groupname,
                    COALESCE(ta.dusun_nama, '') as territory_name,
                    cd.created_by_id,
                    COALESCE(sa.fullname, sa.username, 'System') as installed_by_name,
                    DATE(cd.created_at),
                    cd.created_at
                FROM customer_details cd
                LEFT JOIN radusergroup rug ON cd.username = rug.username
                LEFT JOIN territory_areas ta ON cd.territory_id = ta.id
                LEFT JOIN system_accounts sa ON cd.created_by_id = sa.id
                WHERE cd.created_at IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM installation_logs il WHERE il.username = cd.username)
            `);

            // Migrasi pelanggan lama: set PIN default 123456 untuk yang belum punya PIN
            const defaultPinHash = await bcrypt.hash('123456', 10);
            const [migResult] = await db.query(
                `UPDATE customer_details SET pin_hash = ?, pin_is_default = 1 WHERE pin_hash IS NULL`,
                [defaultPinHash]
            );
            if (migResult.affectedRows > 0) {
                console.log(`[SYNC] PIN default diset untuk ${migResult.affectedRows} pelanggan lama.`);
            }

            // === NAS — pastikan nasname UNIQUE (diperlukan ON DUPLICATE KEY UPDATE & FreeRADIUS) ===
            try {
                const [nasIdx] = await db.query("SHOW INDEX FROM nas WHERE Key_name = 'nasname'");
                const isUnique = nasIdx.some(i => i.Non_unique === 0);
                if (!isUnique) {
                    await db.query("DELETE n1 FROM nas n1 INNER JOIN nas n2 WHERE n1.id > n2.id AND n1.nasname = n2.nasname");
                    await db.query("ALTER TABLE nas DROP INDEX nasname, ADD UNIQUE KEY nasname (nasname)");
                    console.log('[MIGRATION] nas.nasname diubah menjadi UNIQUE KEY');
                }
            } catch (e) { console.warn('[MIGRATION] nas UNIQUE:', e.message); }

            // === APP IP POOLS — tambah tenant_id ===
            const [ipPoolCols] = await db.query("SHOW COLUMNS FROM app_ip_pools").catch(() => [[]])
            const ipPoolColNames = ipPoolCols.map(c => c.Field)
            if (ipPoolColNames.length > 0 && !ipPoolColNames.includes('tenant_id')) {
                // Hapus UNIQUE(name) global dulu, ganti dengan UNIQUE(name, tenant_id)
                try { await db.query("ALTER TABLE app_ip_pools DROP INDEX name") } catch (_) {}
                await db.query("ALTER TABLE app_ip_pools ADD COLUMN tenant_id INT NOT NULL DEFAULT 1, ADD INDEX idx_ippool_tenant (tenant_id), ADD UNIQUE KEY uniq_pool_tenant (name, tenant_id)")
                console.log('[MIGRATION] app_ip_pools: tenant_id ditambahkan')
            }

            // === BACKFILL customer_details.tenant_id ===
            // Pelanggan yang diimpor sebelum kolom tenant_id ada masih NULL → backfill dari billing_invoices
            try {
                // Step 1: Ambil dari billing_invoices (per-username, pilih tenant_id terbanyak)
                const [bfResult1] = await db.query(`
                    UPDATE customer_details cd
                    JOIN (
                        SELECT username, tenant_id, COUNT(*) as cnt
                        FROM billing_invoices
                        WHERE tenant_id IS NOT NULL
                        GROUP BY username, tenant_id
                        ORDER BY cnt DESC
                    ) bi ON bi.username = cd.username
                    SET cd.tenant_id = bi.tenant_id
                    WHERE cd.tenant_id IS NULL
                `);
                if (bfResult1.affectedRows > 0) {
                    console.log(`[MIGRATION] customer_details: ${bfResult1.affectedRows} baris dibackfill tenant_id dari billing_invoices`);
                }

                // Step 2: Fallback dari mikrotik_config via nas_id
                const [bfResult2] = await db.query(`
                    UPDATE customer_details cd
                    JOIN mikrotik_config mc ON cd.nas_id = mc.id
                    SET cd.tenant_id = mc.tenant_id
                    WHERE cd.tenant_id IS NULL AND mc.tenant_id IS NOT NULL
                `);
                if (bfResult2.affectedRows > 0) {
                    console.log(`[MIGRATION] customer_details: ${bfResult2.affectedRows} baris dibackfill tenant_id dari mikrotik_config`);
                }
            } catch (bfErr) {
                console.warn('[MIGRATION] Backfill customer_details.tenant_id error:', bfErr.message);
            }

        } catch (e) { console.warn("[SYNC] Migration Warning:", e.message); }

        // 3. Self-Healing logic — bersihkan atribut pool yang tidak relevan
        // Setup ini pakai IP Pool lokal MikroTik via Mikrotik-Group (PPP Profile),
        // bukan Framed-Pool / Pool-Name dari FreeRADIUS. Hapus keduanya jika ada.
        await db.query(`DELETE FROM radgroupreply WHERE attribute IN ('Pool-Name', 'Framed-Pool')`);
        // Hapus Mikrotik-Group yang nilainya mengandung 'pool' (sisa self-healing lama yang salah)
        await db.query(`DELETE FROM radgroupreply WHERE attribute = 'Mikrotik-Group' AND (value LIKE '%pool%' OR value LIKE '%Pool%')`);

        // 4. Seed default billing_settings (INSERT IGNORE so existing values are preserved)
        await db.query(`INSERT IGNORE INTO billing_settings (setting_key, setting_value, description) VALUES
            ('auto_isolate_enabled', '0', 'Aktifkan isolir otomatis saat jatuh tempo'),
            ('default_due_date', '5', 'Tanggal jatuh tempo default (1-28)'),
            ('isolate_hour', '1', 'Jam isolir setelah jatuh tempo (1-6)'),
            ('grace_period_days', '3', 'Hari toleransi setelah jatuh tempo'),
            ('postpaid_grace_days', '7', 'Hari toleransi tambahan untuk pelanggan pascabayar setelah jatuh tempo'),
            ('company_name', 'PMY NET ISP', 'Nama perusahaan untuk invoice'),
            ('company_phone', '', 'Nomor telepon perusahaan'),
            ('company_address', '', 'Alamat HO/Head Office perusahaan'),
            ('company_logo', '', 'Logo perusahaan (base64 atau URL)'),
            ('invoice_prefix', 'INV', 'Prefix nomor invoice'),
            ('currency', 'IDR', 'Mata uang'),
            ('wa_api_url', '', 'URL endpoint API WhatsApp Gateway'),
            ('wa_api_key', '', 'API Key / Token WhatsApp Gateway'),
            ('wa_sender', '', 'Nomor pengirim WhatsApp'),
            ('wa_auto_send', '0', 'Kirim tagihan otomatis via WhatsApp'),
            ('wa_phone_key', 'target', 'Nama field nomor HP di body request WA gateway'),
            ('wa_message_key', 'message', 'Nama field pesan di body request WA gateway'),
            ('wa_auth_header', 'Authorization', 'Nama header auth WA gateway'),
            ('wa_country_code', '62', 'Kode negara (tanpa +) untuk format nomor'),
            ('wa_delay_ms', '3000', 'Jeda antar pesan saat blast (ms)'),
            ('wa_template_tagihan', 'Halo {nama},\n\nTagihan internet *{paket}* Anda untuk periode *{periode}* telah terbit.\n\n💰 *Total: Rp {tagihan}*\n📅 Jatuh tempo: tgl *{jatuh_tempo}*\nNo. Invoice: *{no_invoice}*\n\nSilakan lakukan pembayaran sebelum tanggal jatuh tempo untuk menghindari pemutusan layanan.\n\nTerima kasih 🙏', 'Template pesan WA tagihan'),
            ('pg_app_base_url', 'https://billing.pmynet.id', 'Base URL aplikasi untuk redirect payment gateway'),
            ('transfer_bank_name', '', 'Nama bank untuk transfer manual'),
            ('transfer_account_number', '', 'Nomor rekening transfer manual'),
            ('transfer_account_name', '', 'Nama pemilik rekening transfer manual'),
            ('transfer_bank_2_name', '', 'Nama bank kedua (opsional)'),
            ('transfer_bank_2_number', '', 'Nomor rekening bank kedua (opsional)'),
            ('transfer_bank_2_account', '', 'Nama pemilik rekening bank kedua (opsional)'),
            ('vapid_public_key', '', 'VAPID public key untuk Web Push'),
            ('vapid_private_key', '', 'VAPID private key untuk Web Push')
        `);
        // Fix domain lama jika masih tersimpan di DB
        await db.query(`UPDATE billing_settings SET setting_value = 'https://billing.pmynet.id' WHERE setting_key = 'pg_app_base_url' AND setting_value = 'https://pmyradius.salfa.my.id'`);

        // Auto-generate VAPID keys jika belum ada (disimpan di tenant_id=1 sebagai global)
        if (webpush) {
            const [[vapidPub]] = await db.query("SELECT setting_value FROM billing_settings WHERE setting_key = 'vapid_public_key' AND tenant_id = 1");
            if (!vapidPub?.setting_value) {
                const vapidKeys = webpush.generateVAPIDKeys();
                await db.query("UPDATE billing_settings SET setting_value = ? WHERE setting_key = 'vapid_public_key' AND tenant_id = 1", [vapidKeys.publicKey]);
                await db.query("UPDATE billing_settings SET setting_value = ? WHERE setting_key = 'vapid_private_key' AND tenant_id = 1", [vapidKeys.privateKey]);
                console.log('[PUSH] VAPID keys generated and saved.');
            }
            // Configure web-push
            const [[pub]] = await db.query("SELECT setting_value FROM billing_settings WHERE setting_key = 'vapid_public_key' AND tenant_id = 1");
            const [[priv]] = await db.query("SELECT setting_value FROM billing_settings WHERE setting_key = 'vapid_private_key' AND tenant_id = 1");
            if (pub?.setting_value && priv?.setting_value) {
                webpush.setVapidDetails('mailto:admin@pmynet.id', pub.setting_value, priv.setting_value);
                console.log('[PUSH] VAPID configured.');
            }
        }

        console.log(`[SYNC] billing_settings seed checked.`);

        // === TENANT_ID MIGRATIONS ===
        const tenantTables = [
            'customer_details',
            'billing_invoices',
            'bandwidth_profiles',
            'territories',
            'territory_areas',
            'mikrotik_config',
            'nas',
            'waiting_list',
            'installation_logs',
            'payment_proofs',
            'payment_promises',
            'notifications',
            'app_ip_pools',
            'ont_removals',
            'ont_removal_tasks',
            'package_change_logs',
            'collector_settlement_confirmations',
            'push_subscriptions',
        ];
        for (const tbl of tenantTables) {
            try {
                const [cols] = await db.query(`SHOW COLUMNS FROM \`${tbl}\``);
                const colNames = cols.map(c => c.Field);
                if (!colNames.includes('tenant_id')) {
                    await db.query(`ALTER TABLE \`${tbl}\` ADD COLUMN tenant_id INT NOT NULL DEFAULT 1`);
                    await db.query(`ALTER TABLE \`${tbl}\` ADD INDEX idx_tenant_id (tenant_id)`);
                    console.log(`[MIGRATION] ${tbl}: tenant_id ditambahkan`);
                }
            } catch (e) {
                // Tabel mungkin belum ada, skip
            }
        }
        // billing_settings tidak punya kolom id — tambah setelah setting_key
        try {
            const [bsCols] = await db.query("SHOW COLUMNS FROM billing_settings");
            const bsColNames = bsCols.map(c => c.Field);
            if (!bsColNames.includes('tenant_id')) {
                await db.query("ALTER TABLE billing_settings ADD COLUMN tenant_id INT NOT NULL DEFAULT 1 AFTER setting_key");
                await db.query("ALTER TABLE billing_settings ADD INDEX idx_bs_tenant (tenant_id)");
                console.log(`[MIGRATION] billing_settings: tenant_id ditambahkan`);
            }
        } catch (e) { /* skip */ }
        // billing_settings: ubah PRIMARY KEY menjadi composite (setting_key, tenant_id)
        // agar setiap mitra punya baris settings sendiri
        try {
            const [bsIdx] = await db.query("SHOW INDEX FROM billing_settings WHERE Key_name = 'PRIMARY'");
            const pkCols = bsIdx.map(i => i.Column_name);
            if (!pkCols.includes('tenant_id')) {
                await db.query("ALTER TABLE billing_settings DROP PRIMARY KEY, ADD PRIMARY KEY (setting_key, tenant_id)");
                console.log(`[MIGRATION] billing_settings: PRIMARY KEY diubah ke (setting_key, tenant_id)`);
            }
        } catch (e) { console.log('[MIGRATION] billing_settings PK skip:', e.message); }

        // billing_settings: pastikan setting_value bisa menyimpan base64 logo (TEXT=65KB, upgrade ke MEDIUMTEXT)
        try {
            const [[col]] = await db.query("SHOW COLUMNS FROM billing_settings WHERE Field = 'setting_value'");
            if (col && col.Type === 'text') {
                await db.query("ALTER TABLE billing_settings MODIFY COLUMN setting_value MEDIUMTEXT");
                console.log('[MIGRATION] billing_settings.setting_value diubah ke MEDIUMTEXT');
            }
        } catch (e) { console.log('[MIGRATION] billing_settings MEDIUMTEXT skip:', e.message); }

        // Seed company_logo jika belum ada
        await db.query(`INSERT IGNORE INTO billing_settings (setting_key, tenant_id, setting_value, description) VALUES ('company_logo', 1, '', 'Logo perusahaan (base64 atau URL)')`).catch(() => {});

        console.log(`[SYNC] Pemeliharaan selesai dalam ${Date.now() - syncStart}ms.`);
    } catch (err) {
        console.error(`[SYNC] Error pemeliharaan:`, err.message);
    }
};

// --- AUTHENTICATION ---

// GET Health Status
app.get('/api/health', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT 1');
        const response = {
            status: 'ok',
            version: APP_VERSION,
            time: new Date(),
            db_connected: rows.length > 0
        };
        res.json(response);
    } catch (err) {
        res.status(500).json({ status: 'error', version: APP_VERSION, error: err.message });
    }
});

// --- BANDWIDTH PROFILES ---

// Helper: Sync PPP Profile ke MikroTik router (semua atau filter by IDs)
const syncPPPProfileToRouters = async (profileName, rateLimit, oldProfileName = null, routerIds = null, tenantId = null) => {
    const results = [];
    let routers = [];
    try {
        if (routerIds && routerIds.length > 0) {
            // Hanya sync ke router RADIUS — LOCAL mode sudah punya profile sendiri di MikroTik
            const placeholders = routerIds.map(() => '?').join(',');
            [routers] = await db.query(`SELECT id, host, name FROM mikrotik_config WHERE id IN (${placeholders}) AND auth_mode = 'radius'`, routerIds);
        } else if (tenantId) {
            // Fallback: hanya router RADIUS milik tenant ini
            [routers] = await db.query("SELECT id, host, name FROM mikrotik_config WHERE tenant_id = ? AND auth_mode = 'radius'", [tenantId]);
        } else {
            // Tidak ada tenant context — batalkan, jangan sync ke router semua tenant
            console.warn('[SYNC PPP] tenantId tidak diketahui, sync dibatalkan untuk keamanan multi-tenant');
            return [];
        }
    } catch (e) {
        return [{ router: 'DB', status: 'error', message: e.message }];
    }

    for (const router of routers) {
        let client;
        try {
            // Wrap seluruh operasi per-router dengan timeout 10 detik
            // Ini mencegah hang pada: connect, get, update, add
            const routerResult = await Promise.race([
                (async () => {
                    client = await getMikrotikClient(router.id);
                    const connection = await client.connect();

                    // Ambil semua profile — handle !empty (router kosong)
                    // try-catch biasa tidak cukup karena UNKNOWNREPLY dari EventEmitter
                    let allProfiles = [];
                    try {
                        allProfiles = await Promise.race([
                            connection.menu('/ppp/profile').get(),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('GET_TIMEOUT')), 6000))
                        ]);
                    } catch (e) {
                        if (
                            e.errno === 'UNKNOWNREPLY' ||
                            (e.message || '').includes('empty') ||
                            (e.message || '').includes('unknown reply') ||
                            e.message === 'GET_TIMEOUT'
                        ) {
                            allProfiles = [];
                        } else {
                            throw e;
                        }
                    }

                    // Jika nama profile berubah, rename di router juga
                    if (oldProfileName && oldProfileName !== profileName) {
                        const oldExists = allProfiles.filter(p => p.name === oldProfileName);
                        if (oldExists.length > 0) {
                            await connection.menu('/ppp/profile').update(
                                { name: oldProfileName },
                                { name: profileName, 'rate-limit': rateLimit }
                            );
                            await client.close();
                            return { router: router.name || router.host, host: router.host, status: 'ok', message: 'Profile diupdate (rename)' };
                        }
                    }

                    // Cek apakah profile sudah ada
                    const existing = allProfiles.filter(p => p.name === profileName);
                    if (existing.length > 0) {
                        await connection.menu('/ppp/profile').update(
                            { name: profileName },
                            { 'rate-limit': rateLimit }
                        );
                        await client.close();
                        return { router: router.name || router.host, host: router.host, status: 'ok', message: 'Profile diupdate' };
                    } else {
                        await connection.menu('/ppp/profile').add({ name: profileName, 'rate-limit': rateLimit });
                        await client.close();
                        return { router: router.name || router.host, host: router.host, status: 'ok', message: 'Profile dibuat' };
                    }
                })(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('ROUTER_TIMEOUT')), 10000))
            ]);
            results.push(routerResult);
        } catch (err) {
            if (client) try { await client.close(); } catch (e) { }
            results.push({
                router: router.name || router.host,
                host: router.host,
                status: 'error',
                message: err.message === 'ROUTER_TIMEOUT' ? 'Timeout: router tidak merespons' : err.message
            });
        }
    }
    return results;
};

app.get('/api/profiles', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query('SELECT * FROM bandwidth_profiles WHERE tenant_id = ?', [tenantId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/mikrotik/:nasId/ppp-profiles — Fetch daftar PPP Profile dari router MikroTik
app.get('/api/mikrotik/:nasId/ppp-profiles', authenticateToken, async (req, res) => {
    const nasId = parseInt(req.params.nasId);
    const tenantId = getTenantId(req);
    try {
        const [[router]] = await db.query('SELECT id, name FROM mikrotik_config WHERE id = ? AND tenant_id = ?', [nasId, tenantId]);
        if (!router) return res.status(404).json({ error: 'Router tidak ditemukan' });
        const client = await getMikrotikClient(nasId);
        const conn = await client.connect();
        const profiles = await conn.menu('/ppp/profile').get();
        await client.close().catch(() => {});
        const result = profiles
            .filter(p => p.name && p.name !== 'default')
            .map(p => ({ name: p.name, rateLimit: p['rate-limit'] || '' }));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: `Gagal fetch profil dari router: ${err.message}` });
    }
});

// GET /api/profiles/:id/router-map — Ambil override profil per router untuk satu paket
app.get('/api/profiles/:id/router-map', authenticateToken, async (req, res) => {
    const tenantId = getTenantId(req);
    try {
        const [rows] = await db.query(
            'SELECT nas_id, mikrotik_profile FROM bandwidth_profile_router_map WHERE profile_id = ? AND tenant_id = ?',
            [req.params.id, tenantId]
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/profiles', authenticateToken, async (req, res) => {
    const { name, rate_limit, price, description, ipPool, mikrotik_profile, routerIds, routerOverrides } = req.body;
    const tenantId = getTenantId(req);
    try {
        if (!name || !rate_limit) return res.status(400).json({ error: 'Nama dan Rate Limit wajib diisi.' });

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Save to bandwidth_profiles
            const [result] = await connection.query(
                'INSERT INTO bandwidth_profiles (name, rate_limit, price, description, pool_name, mikrotik_profile, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE rate_limit = ?, price = ?, description = ?, pool_name = ?, mikrotik_profile = ?, tenant_id = ?',
                [name, rate_limit, price || 0, description || '', ipPool || 'main_pool', mikrotik_profile || '', tenantId, rate_limit, price || 0, description || '', ipPool || 'main_pool', mikrotik_profile || '', tenantId]
            );

            // 2. Sync to radgroupreply (Radius source of truth for Rate Limit)
            await connection.query('DELETE FROM radgroupreply WHERE groupname = ? AND attribute = "Mikrotik-Rate-Limit"', [name]);
            await connection.query(
                'INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (?, "Mikrotik-Rate-Limit", "=", ?)',
                [name, rate_limit]
            );

            // 3. Bersihkan Pool-Name / Framed-Pool — IP diassign MikroTik via PPP Profile, bukan RADIUS pool
            await connection.query('DELETE FROM radgroupreply WHERE groupname = ? AND attribute IN ("Pool-Name", "Framed-Pool")', [name]);

            // 4. Sync Mikrotik-Group — wajib ada agar MikroTik tahu PPP Profile yang dipakai
            // Fallback ke nama paket sendiri jika mikrotik_profile tidak diisi
            const finalMikrotikProfile = (mikrotik_profile || '').trim() || name;
            await connection.query('DELETE FROM radgroupreply WHERE groupname = ? AND attribute = "Mikrotik-Group"', [name]);
            await connection.query(
                'INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (?, "Mikrotik-Group", "=", ?)',
                [name, finalMikrotikProfile]
            );

            // 5. Simpan router overrides (profil berbeda per router)
            const profileId = result.insertId || (await connection.query('SELECT id FROM bandwidth_profiles WHERE name = ? AND tenant_id = ?', [name, tenantId]))[0][0]?.id;
            if (profileId) {
                await connection.query('DELETE FROM bandwidth_profile_router_map WHERE profile_id = ? AND tenant_id = ?', [profileId, tenantId]);
                const overrides = Array.isArray(routerOverrides) ? routerOverrides.filter(o => o.nas_id && (o.mikrotik_profile || '').trim()) : [];
                if (overrides.length > 0) {
                    const vals = overrides.map(o => [profileId, o.nas_id, o.mikrotik_profile.trim(), tenantId]);
                    await connection.query('INSERT INTO bandwidth_profile_router_map (profile_id, nas_id, mikrotik_profile, tenant_id) VALUES ?', [vals]);
                }
            }

            await connection.commit();

            // Langsung kirim response — sync ke MikroTik jalan di background
            const finalProfileName = (mikrotik_profile || '').trim() || name;
            res.json({
                message: 'Profil dan aturan Radius berhasil disimpan.',
                id: result.insertId,
                syncResults: [],
                syncBackground: true
            });

            // Background sync (tidak block response)
            syncPPPProfileToRouters(finalProfileName, rate_limit, null, routerIds || null, tenantId)
                .then(results => console.log(`[SYNC DONE] Profile "${finalProfileName}":`, results))
                .catch(err => console.error(`[SYNC ERROR] Profile "${finalProfileName}":`, err.message));
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/profiles/:id', authenticateToken, async (req, res) => {
    const { name, rate_limit, price, description, ipPool, mikrotik_profile, routerIds, routerOverrides } = req.body;
    const { id } = req.params;

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Get current profile name (tenant-isolated)
        const tenantId = getTenantId(req);
        const [rows] = await connection.query('SELECT name FROM bandwidth_profiles WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)', [id, tenantId]);
        if (rows.length === 0) {
            throw new Error('Profil tidak ditemukan');
        }
        const profileName = rows[0].name;

        const newName = (name || '').trim() || profileName;

        // Update bandwidth_profiles (termasuk name jika berubah)
        await connection.query(
            'UPDATE bandwidth_profiles SET name = ?, rate_limit = ?, price = ?, description = ?, pool_name = ?, mikrotik_profile = ? WHERE id = ?',
            [newName, rate_limit, price || 0, description || '', ipPool || 'main_pool', mikrotik_profile || '', id]
        );

        // Jika nama berubah, update referensi di radgroupreply dan radusergroup
        if (newName !== profileName) {
            await connection.query('UPDATE radgroupreply SET groupname = ? WHERE groupname = ?', [newName, profileName]);
            await connection.query('UPDATE radusergroup SET groupname = ? WHERE groupname = ?', [newName, profileName]);
        }

        // Update radgroupreply attributes
        await connection.query('DELETE FROM radgroupreply WHERE groupname = ? AND attribute IN ("Mikrotik-Rate-Limit", "Pool-Name", "Framed-Pool", "Mikrotik-Group")', [newName]);

        if (rate_limit) {
            await connection.query(
                'INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (?, "Mikrotik-Rate-Limit", "=", ?)',
                [newName, rate_limit]
            );
        }

        // Pool-Name / Framed-Pool tidak diinsert — IP diassign MikroTik via PPP Profile

        // Mikrotik-Group — wajib, fallback ke nama paket jika mikrotik_profile tidak diisi
        const finalMikrotikProfile = (mikrotik_profile || '').trim() || newName;
        await connection.query(
            'INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (?, "Mikrotik-Group", "=", ?)',
            [newName, finalMikrotikProfile]
        );

        // Simpan router overrides (profil berbeda per router)
        await connection.query('DELETE FROM bandwidth_profile_router_map WHERE profile_id = ? AND tenant_id = ?', [id, tenantId]);
        const putOverrides = Array.isArray(routerOverrides) ? routerOverrides.filter(o => o.nas_id && (o.mikrotik_profile || '').trim()) : [];
        if (putOverrides.length > 0) {
            const putVals = putOverrides.map(o => [id, o.nas_id, o.mikrotik_profile.trim(), tenantId]);
            await connection.query('INSERT INTO bandwidth_profile_router_map (profile_id, nas_id, mikrotik_profile, tenant_id) VALUES ?', [putVals]);
        }

        await connection.commit();

        // Langsung kirim response — sync ke MikroTik jalan di background
        const finalProfileName = (mikrotik_profile || '').trim() || newName;
        const oldFinalProfile = (mikrotik_profile || '').trim() || profileName;
        res.json({ message: 'Profil berhasil diupdate.', syncResults: [], syncBackground: true });

        // Background sync (tidak block response)
        syncPPPProfileToRouters(finalProfileName, rate_limit, oldFinalProfile !== finalProfileName ? oldFinalProfile : null, routerIds || null, tenantId)
            .then(results => console.log(`[SYNC DONE] Profile "${finalProfileName}":`, results))
            .catch(err => console.error(`[SYNC ERROR] Profile "${finalProfileName}":`, err.message));
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

app.delete('/api/profiles/:id', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query('SELECT name FROM bandwidth_profiles WHERE id = ? AND tenant_id = ?', [req.params.id, tenantId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Profil tidak ditemukan.' });
        const profileName = rows[0].name;
        await db.query('DELETE FROM radgroupreply WHERE groupname = ?', [profileName]);
        await db.query('DELETE FROM bandwidth_profile_router_map WHERE profile_id = ? AND tenant_id = ?', [req.params.id, tenantId]);
        await db.query('DELETE FROM bandwidth_profiles WHERE id = ? AND tenant_id = ?', [req.params.id, tenantId]);
        res.json({ message: 'Profil berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- AUTOMATED BILLING & ISOLATION SERVICE ---

const runAutomatedBillingService = async () => {
    console.log(`[BILLING] Memulai pemeriksaan otomatis jatuh tempo & isolir...`);
    try {
        // 1. Load billing_settings dikelompokkan per tenant agar isolir menggunakan setting masing-masing mitra
        const [settingsRows] = await db.query('SELECT tenant_id, setting_key, setting_value FROM billing_settings');
        const settingsByTenant = {};
        settingsRows.forEach(r => {
            if (!settingsByTenant[r.tenant_id]) settingsByTenant[r.tenant_id] = {};
            settingsByTenant[r.tenant_id][r.setting_key] = r.setting_value;
        });
        // Fallback: settings tenant 1 untuk variabel global (jam, dll.)
        const settings = settingsByTenant[1] || {};

        const today = new Date();
        const localDate = new Date(today.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
        const currentDay = localDate.getDate();
        const currentHour = localDate.getHours(); // 0-23
        const isolateHour = parseInt(settings.isolate_hour || '1', 10);
        const currentPeriod = getLocalPeriod(today);

        // === STEP 1: AUTO-GENERATE INVOICE BULANAN ===
        // Prabayar  → generate invoice bulan BERJALAN (unpaid) jika belum ada
        // Pascabayar → generate invoice bulan KEMARIN (unpaid) jika belum ada
        const prevMonth = new Date(localDate.getFullYear(), localDate.getMonth() - 1, 1);
        const prevPeriod = getLocalPeriod(prevMonth);

        try {
            const [usersToInvoice] = await db.query(`
                SELECT rc.username, COALESCE(bp.price, 0) AS price, rug.groupname AS package_name,
                       COALESCE(cd.discount, 0) AS discount, COALESCE(cd.tenant_id, 1) AS tenant_id,
                       COALESCE(cd.billing_type, 'prepaid') AS billing_type
                FROM radcheck rc
                JOIN radusergroup rug ON rc.username = rug.username
                LEFT JOIN customer_details cd ON rc.username = cd.username
                JOIN bandwidth_profiles bp ON rug.groupname = bp.name AND bp.tenant_id = COALESCE(cd.tenant_id, 1)
                WHERE rc.attribute = 'Cleartext-Password'
                AND (cd.status IS NULL OR cd.status = 'aktif')
                AND (
                    (COALESCE(cd.billing_type, 'prepaid') = 'prepaid'
                        AND NOT EXISTS (SELECT 1 FROM billing_invoices i WHERE i.username = rc.username AND i.period = ?))
                    OR
                    (cd.billing_type = 'postpaid'
                        AND NOT EXISTS (SELECT 1 FROM billing_invoices i WHERE i.username = rc.username AND i.period = ?)
                        AND DATE_FORMAT(cd.created_at, '%Y-%m') != ?)
                )
            `, [currentPeriod, prevPeriod, currentPeriod]);

            if (usersToInvoice.length > 0) {
                let invoiceCount = 0;
                for (const u of usersToInvoice) {
                    const targetPeriod = u.billing_type === 'postpaid' ? prevPeriod : currentPeriod;
                    const periodStart = targetPeriod + '-01';
                    const periodEnd = new Date(
                        u.billing_type === 'postpaid' ? localDate.getFullYear() : localDate.getFullYear(),
                        u.billing_type === 'postpaid' ? localDate.getMonth() - 1 + 1 : localDate.getMonth() + 1,
                        0
                    ).toISOString().slice(0, 10);

                    // Ambil addon recurring aktif periode target
                    const [addons] = await db.query(`
                        SELECT ca.id, ca.addon_type_id, at.name as addon_name,
                               COALESCE(ca.price_override, at.price) as effective_price
                        FROM customer_addons ca
                        JOIN addon_types at ON ca.addon_type_id = at.id
                        WHERE ca.username = ? AND at.is_recurring = 1
                          AND ca.start_date <= ? AND (ca.end_date IS NULL OR ca.end_date >= ?)
                    `, [u.username, periodEnd, periodStart]);

                    const addonTotal = addons.reduce((s, a) => s + parseFloat(a.effective_price), 0);
                    const baseAmt = Math.max(0, u.price - u.discount);
                    const totalAmt = baseAmt + addonTotal;

                    const [ins] = await db.query(
                        'INSERT IGNORE INTO billing_invoices (username, period, package_name, amount, discount, addon_amount, status, tenant_id) VALUES (?, ?, ?, ?, ?, ?, "unpaid", ?)',
                        [u.username, targetPeriod, u.package_name, totalAmt, u.discount, addonTotal, u.tenant_id]
                    );

                    if (ins.insertId && addons.length > 0) {
                        const addonRows = addons.map(a => [ins.insertId, a.addon_type_id, a.addon_name, a.effective_price]);
                        await db.query('INSERT INTO billing_invoice_addons (invoice_id, addon_type_id, addon_name, amount) VALUES ?', [addonRows]);
                    }
                    invoiceCount++;
                }
                console.log(`[BILLING] Auto-generate ${invoiceCount} invoice (prabayar: ${currentPeriod}, pascabayar: ${prevPeriod}).`);
            } else {
                console.log(`[BILLING] Semua user sudah punya invoice untuk periode ini.`);
            }
        } catch (genErr) {
            console.error(`[BILLING] Gagal auto-generate invoice:`, genErr.message);
        }

        // === STEP 2: AUTO-ISOLIR PER TENANT ===
        // Hanya isolir jika sudah melewati jam isolir yang dikonfigurasi (pakai tenant 1 / default)
        if (currentHour < isolateHour) {
            console.log(`[BILLING] Belum saatnya isolir. Jam sekarang: ${currentHour}, jam isolir: ${isolateHour}.`);
            return;
        }

        // Dapatkan semua tenant yang aktif
        const [activeTenants] = await db.query("SELECT id FROM tenants WHERE status = 'aktif'").catch(() => [[{ id: 1 }]]);

        let overdueUsers = [];
        for (const tenant of activeTenants) {
            const ts = settingsByTenant[tenant.id] || settings;
            if (ts.auto_isolate_enabled !== '1') {
                console.log(`[BILLING] Isolir otomatis dinonaktifkan untuk tenant ${tenant.id}.`);
                continue;
            }
            const tenantDueDate = parseInt(ts.default_due_date || '5', 10);
            const tenantGraceDays = parseInt(ts.postpaid_grace_days || '7', 10);
            // Cari pelanggan jatuh tempo milik tenant ini yang belum bayar
            const [tenantOverdue] = await db.query(`
                SELECT d.username, COALESCE(d.due_date_day, ?) AS due_date_day, d.fullname, COALESCE(d.billing_type, 'prepaid') AS billing_type, d.tenant_id, d.nas_id, d.connection_type, d.static_ip, d.is_isolated, mc.auth_mode
                FROM customer_details d
                LEFT JOIN mikrotik_config mc ON mc.id = d.nas_id
                WHERE d.auto_suspend = 1
                AND d.tenant_id = ?
                AND (d.status IS NULL OR d.status = 'aktif')
                AND (
                    (COALESCE(d.billing_type, 'prepaid') = 'prepaid'
                        AND LEAST(COALESCE(d.due_date_day, ?), DAYOFMONTH(LAST_DAY(CURDATE()))) <= ?
                        AND EXISTS (SELECT 1 FROM billing_invoices i WHERE i.username = d.username AND i.period = ? AND i.status = 'unpaid'))
                    OR
                    (d.billing_type = 'postpaid'
                        AND LEAST(COALESCE(d.due_date_day, ?), DAYOFMONTH(LAST_DAY(CURDATE()))) + ? <= ?
                        AND EXISTS (SELECT 1 FROM billing_invoices i WHERE i.username = d.username AND i.period = ? AND i.status = 'unpaid'))
                )
            `, [tenantDueDate, tenant.id, tenantDueDate, currentDay, currentPeriod, tenantDueDate, tenantGraceDays, currentDay, prevPeriod]);
            overdueUsers = overdueUsers.concat(tenantOverdue);
        }

        console.log(`[BILLING] Menemukan ${overdueUsers.length} pelanggan berpotensi nunggak.`);

        for (const user of overdueUsers) {
            const isStatic = user.connection_type === 'static';
            const isHotspot = user.connection_type === 'hotspot';

            if (isStatic) {
                // === STATIC: blokir via firewall + disable queue + set is_isolated ===
                // Cek apakah sudah diisolir agar tidak spam
                if (!user.is_isolated) {
                    await db.query('UPDATE customer_details SET is_isolated = 1 WHERE username = ?', [user.username]);
                    if (user.nas_id && user.static_ip) {
                        manageStaticFirewall(user.nas_id, 'block', user.static_ip).then(ok => {
                            if (ok) console.log(`[BILLING] Isolir otomatis static: ${user.username} IP diblokir di firewall`);
                        }).catch(e => console.error(`[BILLING] Gagal firewall block ${user.username}:`, e.message));
                        manageSimpleQueue(user.nas_id, 'disable', { target: user.static_ip }).catch(() => {});
                    }
                }
                createNotification('customer', user.username, 'isolated',
                    `⚠️ Layanan Diblokir`,
                    `Layanan internet Anda diblokir karena tagihan belum dibayar. Silakan lunasi tagihan untuk mengaktifkan kembali.`,
                    { due_date_day: user.due_date_day }, user.tenant_id
                ).catch(() => {});
            } else if (isHotspot) {
                // === HOTSPOT: block binding + disable queue + set is_isolated ===
                if (!user.is_isolated) {
                    await db.query('UPDATE customer_details SET is_isolated = 1 WHERE username = ?', [user.username]);
                    if (user.nas_id && user.static_ip) {
                        manageHotspotBinding(user.nas_id, 'block', { ip: user.static_ip }).then(ok => {
                            if (ok) console.log(`[BILLING] Isolir otomatis hotspot: ${user.username} binding diblokir`);
                        }).catch(e => console.error(`[BILLING] Gagal hotspot block ${user.username}:`, e.message));
                        manageSimpleQueue(user.nas_id, 'disable', { target: user.static_ip }).catch(() => {});
                    }
                }
                // Notifikasi (tidak perlu cek sudah diisolir — ARP delete idempotent)
                createNotification('customer', user.username, 'isolated',
                    `⚠️ Layanan Diblokir`,
                    `Layanan internet Anda diblokir karena tagihan belum dibayar. Silakan lunasi tagihan untuk mengaktifkan kembali.`,
                    { due_date_day: user.due_date_day }, user.tenant_id
                ).catch(() => {});
            } else {
                // === PPPoE: cek apakah sudah diisolir (biar tidak spam log/api) ===
                const [[isAlreadyReject]] = await db.query(
                    "SELECT COUNT(*) as count FROM radcheck WHERE username = ? AND attribute = 'Auth-Type' AND value = 'Reject'",
                    [user.username]
                );

                if (isAlreadyReject.count === 0) {
                    console.log(`[BILLING] Melakukan isolir otomatis untuk user: ${user.username} (${user.fullname})`);

                    await db.query(
                        "INSERT INTO radcheck (username, attribute, op, value, nas_id) VALUES (?, 'Auth-Type', ':=', 'Reject', ?) ON DUPLICATE KEY UPDATE value = 'Reject'",
                        [user.username, user.nas_id || null]
                    );

                    // Disable PPP Secret di MikroTik (hanya mode local/null — mencegah reconnect)
                    if (user.nas_id && user.auth_mode !== 'radius') {
                        managePppSecret(user.nas_id, 'disable', { username: user.username }).catch(e => {
                            console.error(`[BILLING] Gagal disable PPP secret ${user.username}:`, e.message);
                        });
                    }

                    // Kick user secara asynchronous (di background) agar proses isolir database berjalan serentak & sangat cepat
                    kickMikrotikUser(user.username).catch((err) => {
                        console.error(`[BILLING] Gagal menendang user ${user.username} dari Mikrotik:`, err.message);
                    });

                    // Notifikasi pelanggan: diisolir
                    createNotification('customer', user.username, 'isolated',
                        `⚠️ Layanan Diblokir`,
                        `Layanan internet Anda diblokir karena tagihan belum dibayar. Silakan lunasi tagihan untuk mengaktifkan kembali.`,
                        { due_date_day: user.due_date_day }, user.tenant_id
                    ).catch(() => {});
                }
            }
        }

        // === NOTIFIKASI: 5 hari sebelum jatuh tempo ===
        // Hanya kirim sekali per hari (cek apakah sudah ada notif hari ini)
        const dueSoonDay = currentDay + 5;
        const [dueSoonUsers] = await db.query(`
            SELECT d.username, d.fullname, d.due_date_day, d.tenant_id
            FROM customer_details d
            WHERE (d.status IS NULL OR d.status = 'aktif')
            AND d.due_date_day = ?
            AND NOT EXISTS (
                SELECT 1 FROM billing_invoices i
                WHERE i.username = d.username AND i.period = ? AND i.status = 'paid'
            )
            AND NOT EXISTS (
                SELECT 1 FROM notifications n
                WHERE n.recipient_id = d.username
                AND n.type = 'due_soon'
                AND DATE(n.created_at) = CURDATE()
            )
        `, [dueSoonDay, currentPeriod]);

        for (const user of dueSoonUsers) {
            createNotification('customer', user.username, 'due_soon',
                `🔔 Tagihan Jatuh Tempo 5 Hari Lagi`,
                `Tagihan internet Anda akan jatuh tempo pada tanggal ${user.due_date_day}. Segera lakukan pembayaran agar layanan tetap aktif.`,
                { due_date_day: user.due_date_day }, user.tenant_id
            ).catch(() => {});
        }
        if (dueSoonUsers.length > 0) {
            console.log(`[BILLING] ${dueSoonUsers.length} notifikasi due-soon dikirim.`);
        }

    } catch (err) {
        console.error(`[BILLING ERROR] Gagal menjalankan service otomatis:`, err.message);
    }
};

// Jalankan setiap 15 menit (lebih presisi untuk jam isolir)
setInterval(runAutomatedBillingService, 15 * 60 * 1000);
// Jalankan saat startup (setelah delay agar DB siap)
setTimeout(runAutomatedBillingService, 10000);

// POST Login
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { username: rawUsername, password } = req.body;
    try {
        let tenantId = 1; // default: ISP pusat
        let username = rawUsername?.trim();

        // Format username@KODE → parse kode mitra otomatis
        if (username?.includes('@')) {
            const [uname, kode] = username.split('@');
            username = uname.trim();
            const kodeUpper = kode?.trim().toUpperCase();
            if (!kodeUpper) return res.status(401).json({ error: 'Format login tidak valid. Gunakan: username@KODE' });
            const [[tenant]] = await db.query(
                "SELECT id FROM tenants WHERE kode = ? AND status = 'aktif'",
                [kodeUpper]
            );
            if (!tenant) return res.status(401).json({ error: 'Kode mitra tidak ditemukan atau tidak aktif.' });
            tenantId = tenant.id;
        }

        // Cari user berdasarkan (username, tenant_id)
        const [rows] = await db.query(
            'SELECT * FROM system_accounts WHERE username = ? AND tenant_id = ?',
            [username, tenantId]
        );
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Username atau kode mitra tidak valid.' });
        }

        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Password salah.' });
        }

        // Ambil kode mitra untuk ditampilkan di frontend (suffix @KODE)
        const [[tenantRow]] = await db.query('SELECT kode FROM tenants WHERE id = ?', [user.tenant_id]);
        const tenantKode = tenantRow?.kode || null;

        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                role: user.role,
                fullname: user.fullname,
                tenant_id: user.tenant_id,
                tenant_kode: tenantKode,
                is_super_admin: user.is_super_admin === 1
            },
            JWT_SECRET,
            { expiresIn: user.role === 'admin' ? '24h' : '90d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                fullname: user.fullname,
                tenant_id: user.tenant_id,
                tenant_kode: tenantKode,
                is_super_admin: user.is_super_admin === 1
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- TERRITORY MANAGEMENT ---

// GET All Territories
app.get('/api/territories', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query(`
            SELECT t.*,
                sa.fullname as collector_name,
                sa.username as collector_username,
                (SELECT COUNT(*) FROM customer_details cd WHERE cd.territory_id = t.id AND cd.tenant_id = ?) as user_count
            FROM territories t
            LEFT JOIN system_accounts sa ON t.collector_id = sa.id AND sa.tenant_id = ?
            WHERE t.tenant_id = ?
            ORDER BY t.name ASC
        `, [tenantId, tenantId, tenantId]);
        // Sertakan daftar kelurahan per territory
        const [areas] = await db.query('SELECT * FROM territory_areas WHERE tenant_id = ? ORDER BY kelurahan_nama ASC', [tenantId]);
        const result = rows.map(t => ({
            ...t,
            areas: areas.filter(a => a.territory_id === t.id)
        }));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET territory by kelurahan_kode (untuk auto-assign di PSB)
// Sekarang pakai collector_id langsung dari territory_areas
app.get('/api/territories/by-kelurahan/:kode', authenticateToken, async (req, res) => {
    const tenantId = getTenantId(req);
    try {
        const [rows] = await db.query(`
            SELECT
                ta.id as area_id,
                ta.id,
                ta.dusun_nama,
                ta.collector_id,
                ta.territory_id,
                sa.fullname as collector_name,
                sa.id as collector_sa_id,
                t.name
            FROM territory_areas ta
            LEFT JOIN system_accounts sa ON ta.collector_id = sa.id
            LEFT JOIN territories t ON ta.territory_id = t.id
            WHERE ta.kelurahan_kode = ? AND ta.dusun_nama != '' AND ta.tenant_id = ?
            ORDER BY ta.dusun_nama ASC
        `, [req.params.kode, tenantId]);
        if (rows.length === 0) return res.json(null);
        if (rows.length === 1) return res.json({ single: true, territory: rows[0] });
        res.json({ single: false, options: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET daftar dusun yang sudah pernah diinput untuk kelurahan tertentu
app.get('/api/territories/dusun/:kode', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query(
            `SELECT DISTINCT dusun_nama FROM territory_areas WHERE kelurahan_kode = ? AND dusun_nama != '' AND tenant_id = ? ORDER BY dusun_nama ASC`,
            [req.params.kode, tenantId]
        );
        res.json(rows.map(r => r.dusun_nama));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST Create Territory (Admin only)
app.post('/api/territories', authenticateToken, isAdmin, async (req, res) => {
    const { name, description, collector_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Nama wilayah wajib diisi.' });
    try {
        const tenantId = getTenantId(req);
        await db.query(
            'INSERT INTO territories (name, description, collector_id, tenant_id) VALUES (?, ?, ?, ?)',
            [name, description || null, collector_id || null, tenantId]
        );
        res.status(201).json({ message: `Wilayah "${name}" berhasil dibuat.` });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Nama wilayah sudah ada.' });
        res.status(500).json({ error: err.message });
    }
});

// PUT Update Territory (Admin only)
app.put('/api/territories/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, description, collector_id } = req.body;
    try {
        const tenantId = getTenantId(req);
        await db.query(
            'UPDATE territories SET name = ?, description = ?, collector_id = ? WHERE id = ? AND tenant_id = ?',
            [name, description || null, collector_id || null, id, tenantId]
        );
        res.json({ message: 'Wilayah berhasil diperbarui.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE Territory (Admin only)
app.delete('/api/territories/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const tenantId = getTenantId(req);
        await db.query('DELETE FROM territories WHERE id = ? AND tenant_id = ?', [id, tenantId]);
        res.json({ message: 'Wilayah berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST Tambah kelurahan ke territory
app.post('/api/territories/:id/areas', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { kelurahan_kode, kelurahan_nama, kecamatan_nama, kabupaten_nama, dusun_nama } = req.body;
    if (!kelurahan_kode || !kelurahan_nama) return res.status(400).json({ error: 'Kode dan nama kelurahan wajib diisi.' });
    const tenantId = getTenantId(req);
    try {
        await db.query(
            'INSERT IGNORE INTO territory_areas (territory_id, kelurahan_kode, kelurahan_nama, kecamatan_nama, kabupaten_nama, dusun_nama, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, kelurahan_kode, kelurahan_nama, kecamatan_nama || null, kabupaten_nama || null, dusun_nama?.trim() || '', tenantId]
        );
        res.status(201).json({ message: 'Area berhasil ditambahkan.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE Hapus kelurahan dari territory (by area id)
app.delete('/api/territories/:id/areas/:areaId', authenticateToken, isAdmin, async (req, res) => {
    const { id, areaId } = req.params;
    const tenantId = getTenantId(req);
    try {
        const [result] = await db.query('DELETE FROM territory_areas WHERE id = ? AND territory_id = ? AND tenant_id = ?', [areaId, id, tenantId]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Area tidak ditemukan.' });
        res.json({ message: 'Area berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// COLLECTOR AREAS — sistem baru: kolektor → dusun langsung
// ============================================================

// GET semua dusun per kolektor (untuk Manajemen Wilayah)
app.get('/api/collector-areas', authenticateToken, async (req, res) => {
    const tenantId = getTenantId(req);
    try {
        const [rows] = await db.query(`
            SELECT ta.*, sa.fullname as collector_name, sa.username as collector_username
            FROM territory_areas ta
            LEFT JOIN system_accounts sa ON ta.collector_id = sa.id
            WHERE ta.dusun_nama != '' AND ta.tenant_id = ?
            ORDER BY ta.collector_id ASC, ta.dusun_nama ASC
        `, [tenantId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST assign dusun ke kolektor
app.post('/api/collector-areas', authenticateToken, isAdmin, async (req, res) => {
    const { collector_id, kelurahan_kode, kelurahan_nama, kecamatan_nama, kabupaten_nama, provinsi_nama, dusun_nama } = req.body;
    if (!collector_id) return res.status(400).json({ error: 'collector_id wajib diisi.' });
    if (!kelurahan_kode || !kelurahan_nama) return res.status(400).json({ error: 'Kelurahan wajib diisi.' });
    if (!dusun_nama?.trim()) return res.status(400).json({ error: 'Nama dusun/kampung wajib diisi.' });

    try {
        const tenantId = getTenantId(req);
        // Cek apakah dusun ini sudah diassign ke kolektor lain (dalam tenant yang sama)
        const [existing] = await db.query(
            'SELECT ta.id, ta.collector_id, sa.fullname as collector_name FROM territory_areas ta LEFT JOIN system_accounts sa ON ta.collector_id = sa.id WHERE ta.kelurahan_kode = ? AND ta.dusun_nama = ? AND ta.tenant_id = ?',
            [kelurahan_kode, dusun_nama.trim(), tenantId]
        );
        if (existing.length > 0) {
            const other = existing[0];
            if (String(other.collector_id || '') !== String(collector_id)) {
                return res.status(409).json({ error: `Dusun "${dusun_nama}" sudah diassign ke kolektor ${other.collector_name || 'lain'}. Hapus dulu dari sana.` });
            }
            // Sudah assign ke kolektor yang sama — OK (idempotent)
            return res.json({ message: 'Dusun sudah terdaftar.', area: other });
        }

        // Auto-cari/buat territory untuk kolektor ini (1 kolektor = 1 territory internal per tenant)
        let [[territory]] = await db.query('SELECT id FROM territories WHERE collector_id = ? AND tenant_id = ? LIMIT 1', [collector_id, tenantId]);
        if (!territory) {
            // Buat territory baru otomatis dengan nama collector
            const [[collector]] = await db.query('SELECT fullname, username FROM system_accounts WHERE id = ?', [collector_id]);
            const tName = collector?.fullname || collector?.username || `Kolektor-${collector_id}`;
            await db.query('INSERT INTO territories (name, collector_id, tenant_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE collector_id = ?', [tName, collector_id, tenantId, collector_id]);
            [[territory]] = await db.query('SELECT id FROM territories WHERE collector_id = ? AND tenant_id = ? LIMIT 1', [collector_id, tenantId]);
        }

        const [result] = await db.query(
            'INSERT INTO territory_areas (territory_id, collector_id, kelurahan_kode, kelurahan_nama, kecamatan_nama, kabupaten_nama, provinsi_nama, dusun_nama, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [territory.id, collector_id, kelurahan_kode, kelurahan_nama, kecamatan_nama || null, kabupaten_nama || null, provinsi_nama || null, dusun_nama.trim(), tenantId]
        );
        res.status(201).json({ message: `Dusun "${dusun_nama}" berhasil diassign.`, id: result.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: `Dusun "${dusun_nama}" sudah terdaftar.` });
        res.status(500).json({ error: err.message });
    }
});

// DELETE hapus dusun dari kolektor
app.delete('/api/collector-areas/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const [result] = await db.query('DELETE FROM territory_areas WHERE id = ? AND tenant_id = ?', [req.params.id, tenantId]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Dusun tidak ditemukan.' });
        res.json({ message: 'Dusun berhasil dihapus dari wilayah kolektor.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET kode mitra untuk session yang sedang login (tanpa perlu re-login)
app.get('/api/tenant/kode', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const [[row]] = await db.query('SELECT kode FROM tenants WHERE id = ?', [tenantId]);
        res.json({ kode: row?.kode || null });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- SYSTEM USER MANAGEMENT (Superadmin Only) ---


// GET List all system staff
app.get('/api/system/users', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'noc') {
        return res.status(403).json({ error: 'Akses ditolak.' });
    }
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query(
            'SELECT id, username, role, fullname, created_at FROM system_accounts WHERE tenant_id = ? ORDER BY id DESC',
            [tenantId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST Create new staff
app.post('/api/system/users', authenticateToken, isAdmin, async (req, res) => {
    const { username, password, role, fullname } = req.body;
    try {
        if (!username || !password || !role) {
            return res.status(400).json({ error: 'Username, password, dan role wajib diisi.' });
        }
        const tenantId = getTenantId(req);
        const hashedPassword = bcrypt.hashSync(password, 10);
        await db.query(
            'INSERT INTO system_accounts (username, password, role, fullname, tenant_id) VALUES (?, ?, ?, ?, ?)',
            [username, hashedPassword, role, fullname || username, tenantId]
        );
        res.status(201).json({ message: 'User berhasil dibuat.' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Username sudah digunakan.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// PUT Update staff (Profile / Password Reset)
app.put('/api/system/users/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { username, role, fullname, new_password } = req.body;
    try {
        const tenantId = getTenantId(req);
        let updateQuery = 'UPDATE system_accounts SET username = ?, role = ?, fullname = ?';
        let params = [username, role, fullname];

        if (new_password && new_password.trim() !== '') {
            const hashedPassword = bcrypt.hashSync(new_password, 10);
            updateQuery += ', password = ?';
            params.push(hashedPassword);
        }

        updateQuery += ' WHERE id = ? AND tenant_id = ?';
        params.push(id, tenantId);

        await db.query(updateQuery, params);
        res.json({ message: 'User berhasil diupdate.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE Staff
app.delete('/api/system/users/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ error: 'Tidak dapat menghapus akun sendiri.' });
        }
        const tenantId = getTenantId(req);
        await db.query('DELETE FROM system_accounts WHERE id = ? AND tenant_id = ?', [id, tenantId]);
        res.json({ message: 'User berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// GET Current User (Verify Token)
app.get('/api/auth/me', authenticateToken, (req, res) => {
    res.json(req.user);
});

// ── MikroTik Connection Pool ─────────────────────────────────────────────────
// Satu koneksi persisten per router (nasId). close() dari caller adalah no-op —
// koneksi tetap di pool dan dipakai ulang. Ini mengurangi beban router spek rendah
// yang tidak tahan banyak sesi API bersamaan.
const _mtPool     = new Map(); // nasId → { client, conn, configHash, lastUsedAt }
const _mtInitLock = new Map(); // nasId → Promise — cegah race condition saat init

const _mtConnect = async (config) => {
    const client = new RouterOSClient({
        host: config.host,
        user: config.user,
        password: config.pass || '',
        port: parseInt(config.port || '8728'),
        timeout: 10,
    });
    const conn = await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => {
            try { client.close(); } catch {}
            reject(new Error('Timed out after 10 seconds'));
        }, 10000))
    ]);
    return { client, conn };
};

// Bersihkan ghost session billing-pmy yang tertinggal dari restart sebelumnya
const _cleanupGhostSessions = async (conn, billingUser) => {
    try {
        const activeUsers = await Promise.race([
            conn.menu('/user/active').get(),
            new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 3000))
        ]);
        const ghosts = activeUsers.filter(u => u.name === billingUser && u['.id']);
        for (const g of ghosts) {
            try { await conn.menu('/user/active').remove(g['.id']); } catch {}
        }
        if (ghosts.length > 0) console.log(`[MT-POOL] Cleanup ${ghosts.length} ghost session(s) untuk user "${billingUser}"`);
    } catch {}
};

// Wrapper yang meniru interface RouterOSClient tapi pakai koneksi dari pool.
// close() sengaja dibuat no-op agar koneksi tidak ditutup setelah tiap operasi.
function _makeMtWrapper(nasId, entry) {
    return {
        connect: async () => { entry.lastUsedAt = Date.now(); return entry.conn; },
        close:   async () => { entry.lastUsedAt = Date.now(); }, // no-op — koneksi tetap di pool
        forceClose: async () => {
            try { await entry.client.close(); } catch {}
            _mtPool.delete(nasId);
        },
    };
}

// Cleanup: tutup koneksi yang sudah idle > 5 menit
setInterval(async () => {
    const now = Date.now();
    for (const [nasId, entry] of _mtPool.entries()) {
        if (now - entry.lastUsedAt > 300000) {
            console.log(`[MT-POOL] Koneksi idle NAS ${nasId} ditutup`);
            try { await entry.client.close(); } catch {}
            _mtPool.delete(nasId);
        }
    }
}, 60000);

const getMikrotikClient = async (id = null) => {
    let query = 'SELECT * FROM mikrotik_config ORDER BY id DESC LIMIT 1';
    let params = [];
    if (id) { query = 'SELECT * FROM mikrotik_config WHERE id = ?'; params = [id]; }

    const [rows] = await db.query(query, params);
    const config = rows[0];
    if (!config) throw new Error('Konfigurasi MikroTik tidak ditemukan');

    const nasId = config.id;
    const configHash = `${config.host}:${config.port}:${config.user}`;

    // Tunggu jika ada proses inisialisasi koneksi yang sedang berjalan untuk NAS ini
    if (_mtInitLock.has(nasId)) await _mtInitLock.get(nasId);

    const existing = _mtPool.get(nasId);
    if (existing && existing.configHash === configHash) {
        // Cek apakah koneksi masih hidup (hanya jika idle > 30 detik)
        const idleSec = (Date.now() - existing.lastUsedAt) / 1000;
        if (idleSec > 30) {
            try {
                await Promise.race([
                    existing.conn.menu('/system/identity').getOnly(),
                    new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 2000))
                ]);
            } catch {
                console.log(`[MT-POOL] Koneksi NAS ${nasId} mati, reconnect...`);
                try { await existing.client.close(); } catch {}
                _mtPool.delete(nasId);
                let resolveRecon;
                const reconLock = new Promise(r => { resolveRecon = r; });
                _mtInitLock.set(nasId, reconLock);
                try {
                    const { client, conn } = await _mtConnect(config);
                    await _cleanupGhostSessions(conn, config.user);
                    _mtPool.set(nasId, { client, conn, configHash, lastUsedAt: Date.now() });
                    console.log(`[MT-POOL] Reconnect NAS ${nasId} (${config.host}) berhasil`);
                } finally {
                    _mtInitLock.delete(nasId);
                    resolveRecon();
                }
                return _makeMtWrapper(nasId, _mtPool.get(nasId));
            }
        }
        existing.lastUsedAt = Date.now();
        return _makeMtWrapper(nasId, existing);
    }

    // Tutup koneksi lama jika config berubah
    if (existing) {
        try { await existing.client.close(); } catch {}
        _mtPool.delete(nasId);
    }

    // Buat koneksi baru — pasang lock agar caller lain menunggu
    let resolveInit;
    const initLock = new Promise(r => { resolveInit = r; });
    _mtInitLock.set(nasId, initLock);
    try {
        console.log(`[MT-POOL] Koneksi baru NAS ${nasId} (${config.host}:${config.port})`);
        const { client, conn } = await _mtConnect(config);
        await _cleanupGhostSessions(conn, config.user);
        const entry = { client, conn, configHash, lastUsedAt: Date.now() };
        _mtPool.set(nasId, entry);
        return _makeMtWrapper(nasId, entry);
    } finally {
        _mtInitLock.delete(nasId);
        resolveInit();
    }
};

// Helper: Kelola Simple Queue MikroTik untuk pelanggan static
// action: 'create' | 'delete' | 'enable' | 'disable' | 'update'
const manageSimpleQueue = async (nasId, action, params = {}) => {
    let client;
    try {
        client = await getMikrotikClient(nasId);
        const conn = await client.connect();
        const menu = conn.menu('/queue/simple');

        if (action === 'create') {
            const { name, target, maxLimit, comment } = params;
            await menu.add({
                name,
                target: `${target}/32`,
                'max-limit': maxLimit || '10M/10M',
                ...(comment ? { comment } : {})
            });
            console.log(`[QUEUE] Created queue "${name}" for ${target}`);
        } else {
            // Untuk delete/enable/disable/update — cari queue berdasarkan target IP
            const { target, maxLimit, name } = params;
            const queues = await menu.get();
            const match = queues.find(q => q.target && (q.target === target || q.target === `${target}/32` || q.target.startsWith(target)));
            if (!match) {
                console.warn(`[QUEUE] Queue dengan target ${target} tidak ditemukan di router`);
                return false;
            }
            const qId = match['.id'] || match.id;
            if (action === 'delete') {
                await menu.remove(qId);
                console.log(`[QUEUE] Deleted queue for ${target}`);
            } else if (action === 'disable') {
                await menu.where('.id', qId).update({ disabled: 'yes' });
                console.log(`[QUEUE] Disabled queue for ${target}`);
            } else if (action === 'enable') {
                await menu.where('.id', qId).update({ disabled: 'no' });
                console.log(`[QUEUE] Enabled queue for ${target}`);
            } else if (action === 'update') {
                const upd = {};
                if (maxLimit) upd['max-limit'] = maxLimit;
                if (name) upd['name'] = name;
                await menu.where('.id', qId).update(upd);
                console.log(`[QUEUE] Updated queue for ${target}`);
            }
        }
        await client.close();
        return true;
    } catch (err) {
        console.error(`[QUEUE] ${action} error:`, err.message);
        if (client) try { await client.close() } catch {}
        return false;
    }
};

// Helper: Kelola Static ARP entry di MikroTik untuk pelanggan Static IP
// action: 'create' | 'delete'
// params: { ip, mac, bridgeInterface, comment }
const manageStaticArp = async (nasId, action, params = {}) => {
    let client;
    try {
        client = await getMikrotikClient(nasId);
        const conn = await client.connect();
        const menu = conn.menu('/ip/arp');
        const { ip, mac, bridgeInterface, comment } = params;

        const allArp = await menu.get();
        const existing = allArp.find(a => a.address === ip && a.type === 'static');

        if (action === 'create') {
            if (existing) {
                const id = existing['.id'] || existing.id;
                const upd = { disabled: 'no' };
                if (mac) upd['mac-address'] = mac;
                if (comment) upd.comment = comment;
                await menu.where('.id', id).update(upd);
                console.log(`[ARP] Updated static ARP for ${ip}`);
            } else {
                const entry = { address: ip, type: 'static', disabled: 'no' };
                if (mac) entry['mac-address'] = mac;
                if (bridgeInterface) entry.interface = bridgeInterface;
                if (comment) entry.comment = comment;
                await menu.add(entry);
                console.log(`[ARP] Created static ARP for ${ip}`);
            }
        } else if (action === 'delete') {
            if (!existing) {
                console.warn(`[ARP] Static ARP for ${ip} tidak ditemukan, lewati delete`);
                await client.close();
                return true;
            }
            const id = existing['.id'] || existing.id;
            await menu.remove(id);
            console.log(`[ARP] Deleted static ARP for ${ip}`);
        }

        await client.close();
        return true;
    } catch (err) {
        console.error(`[ARP] ${action} error for "${params.ip}":`, err.message);
        if (client) try { await client.close() } catch {}
        return false;
    }
};

// Helper: Kelola firewall address-list untuk isolir Static IP
// action: 'block' → tambah IP ke PMYNET_ISOLIR, 'unblock' → hapus dari list
const STATIC_ISOLIR_LIST = 'PMYNET_ISOLIR';
const manageStaticFirewall = async (nasId, action, ip) => {
    let client;
    try {
        client = await getMikrotikClient(nasId);
        const conn = await client.connect();

        // Auto-create firewall rules jika belum ada (tidak perlu setup manual oleh mitra)
        const filterRules = await conn.menu('/ip/firewall/filter').get();
        const hasSrcRule = filterRules.some(r =>
            r.comment === 'pmyhome-isolir-static' && r['src-address-list'] === STATIC_ISOLIR_LIST
        );
        const hasDstRule = filterRules.some(r =>
            r.comment === 'pmyhome-isolir-static' && r['dst-address-list'] === STATIC_ISOLIR_LIST
        );
        if (!hasSrcRule) {
            await conn.menu('/ip/firewall/filter').add({
                chain: 'forward',
                'src-address-list': STATIC_ISOLIR_LIST,
                action: 'drop',
                comment: 'pmyhome-isolir-static',
                'place-before': '0'
            });
            console.log(`[FIREWALL] Auto-created src drop rule for ${STATIC_ISOLIR_LIST} on NAS ${nasId}`);
        }
        if (!hasDstRule) {
            await conn.menu('/ip/firewall/filter').add({
                chain: 'forward',
                'dst-address-list': STATIC_ISOLIR_LIST,
                action: 'drop',
                comment: 'pmyhome-isolir-static',
                'place-before': '0'
            });
            console.log(`[FIREWALL] Auto-created dst drop rule for ${STATIC_ISOLIR_LIST} on NAS ${nasId}`);
        }

        // Kelola address-list
        const menu = conn.menu('/ip/firewall/address-list');
        if (action === 'block') {
            const entries = await menu.get();
            const exists = entries.find(e => e.list === STATIC_ISOLIR_LIST && e.address === ip);
            if (!exists) {
                await menu.add({ list: STATIC_ISOLIR_LIST, address: ip, comment: 'pmyhome-isolir' });
                console.log(`[FIREWALL] Blocked static IP ${ip} (added to ${STATIC_ISOLIR_LIST})`);
            }
        } else if (action === 'unblock') {
            const entries = await menu.get();
            const entry = entries.find(e => e.list === STATIC_ISOLIR_LIST && e.address === ip);
            if (entry) {
                await menu.remove(entry.id);
                console.log(`[FIREWALL] Unblocked static IP ${ip} (removed from ${STATIC_ISOLIR_LIST})`);
            }
        }

        await client.close();
        return true;
    } catch (err) {
        console.error(`[FIREWALL] ${action} error for ${ip}:`, err.message);
        if (client) try { await client.close() } catch {}
        return false;
    }
};

// Helper: Kelola Hotspot IP Binding untuk pelanggan Static IP via Hotspot
// action: 'bypass' → buat/set type=bypassed | 'block' → set type=blocked | 'remove' → hapus
// params: { ip, mac, comment }
const manageHotspotBinding = async (nasId, action, params = {}) => {
    let client;
    try {
        client = await getMikrotikClient(nasId);
        const conn = await client.connect();
        const menu = conn.menu('/ip/hotspot/ip-binding');
        const { ip, mac, comment } = params;

        // Cari binding yang sudah ada berdasarkan IP
        const all = await menu.get();
        const existing = all.find(b => b.address === ip);

        if (action === 'bypass') {
            if (existing) {
                const id = existing['.id'] || existing.id;
                const upd = { type: 'bypassed' };
                if (mac) upd['mac-address'] = mac;
                await menu.where('.id', id).update(upd);
                console.log(`[HOTSPOT] Updated binding ${ip} → bypassed`);
            } else {
                const entry = { address: ip, type: 'bypassed' };
                if (mac) entry['mac-address'] = mac;
                if (comment) entry.comment = comment;
                await menu.add(entry);
                console.log(`[HOTSPOT] Created binding ${ip} → bypassed`);
            }
        } else if (action === 'block') {
            if (existing) {
                const id = existing['.id'] || existing.id;
                await menu.where('.id', id).update({ type: 'blocked' });
                console.log(`[HOTSPOT] Blocked binding ${ip}`);
            } else {
                // Buat baru dengan type blocked jika belum ada
                const entry = { address: ip, type: 'blocked' };
                if (mac) entry['mac-address'] = mac;
                if (comment) entry.comment = comment;
                await menu.add(entry);
                console.log(`[HOTSPOT] Created blocked binding ${ip}`);
            }
        } else if (action === 'remove') {
            if (existing) {
                const id = existing['.id'] || existing.id;
                await menu.remove(id);
                console.log(`[HOTSPOT] Removed binding ${ip}`);
            }
        }

        await client.close();
        return true;
    } catch (err) {
        console.error(`[HOTSPOT] ${action} error for "${params.ip}":`, err.message);
        if (client) try { await client.close() } catch {}
        return false;
    }
};

// Helper: Dapatkan nama profile MikroTik dari groupname
// Prioritas: override per-router → mikrotik_profile default → name paket
const getMikrotikProfile = async (groupname, nasId = null) => {
    if (!groupname) return null;
    // Cek override per-router dulu (jika nasId diisi)
    if (nasId) {
        const [[override]] = await db.query(
            `SELECT bprm.mikrotik_profile FROM bandwidth_profile_router_map bprm
             JOIN bandwidth_profiles bp ON bp.id = bprm.profile_id
             WHERE bp.name = ? AND bprm.nas_id = ?`,
            [groupname, nasId]
        ).catch(() => [[]]);
        if (override?.mikrotik_profile) return override.mikrotik_profile;
    }
    // Fallback ke default mikrotik_profile atau nama paket
    const [[profile]] = await db.query(
        'SELECT name, mikrotik_profile FROM bandwidth_profiles WHERE name = ?',
        [groupname]
    );
    if (!profile) return groupname;
    return profile.mikrotik_profile || profile.name;
};

// Helper: Kelola PPP Secret MikroTik untuk pelanggan PPPoE
// action: 'create' | 'update' | 'delete' | 'enable' | 'disable'
// params: { username, password, profile }
const managePppSecret = async (nasId, action, params = {}) => {
    let client;
    try {
        client = await getMikrotikClient(nasId);
        const conn = await client.connect();
        const menu = conn.menu('/ppp/secret');

        const { username, password, profile, disabled: createDisabled } = params;
        const disabledVal = createDisabled ? 'yes' : 'no';

        // Cari secret berdasarkan name
        const allSecrets = await menu.get();
        const existing = allSecrets.find(s => s.name === username);

        if (action === 'create') {
            if (existing) {
                // Sudah ada → update saja (idempotent)
                const id = existing['.id'] || existing.id;
                const upd = { disabled: disabledVal, service: 'pppoe' };
                if (password !== undefined) upd.password = password;
                if (profile) upd.profile = profile;
                await menu.where('.id', id).update(upd);
                console.log(`[PPP_SECRET] Updated existing secret for "${username}" (disabled=${disabledVal})`);
            } else {
                const entry = { name: username, password: password || '', service: 'pppoe', disabled: disabledVal };
                if (profile) entry.profile = profile;
                await menu.add(entry);
                console.log(`[PPP_SECRET] Created secret for "${username}" (disabled=${disabledVal})`);
            }
        } else if (action === 'rename') {
            // Rename in-place: set name=newUsername [find name=username]
            // Lebih aman dari delete+create karena tidak ada jeda secret tidak ada
            const { newUsername: renamedTo } = params;
            if (!existing) {
                console.warn(`[PPP_SECRET] Secret "${username}" tidak ditemukan untuk rename, fallback ke create`);
                const entry = { name: renamedTo, password: password || '', service: 'pppoe', disabled: 'no' };
                if (profile) entry.profile = profile;
                await menu.add(entry);
            } else {
                const id = existing['.id'] || existing.id;
                const upd = { name: renamedTo };
                if (password !== undefined) upd.password = password;
                if (profile) upd.profile = profile;
                await menu.where('.id', id).update(upd);
                console.log(`[PPP_SECRET] Renamed secret "${username}" → "${renamedTo}"`);
            }
        } else if (action === 'delete') {
            if (!existing) {
                console.warn(`[PPP_SECRET] Secret "${username}" tidak ditemukan, lewati delete`);
                await client.close();
                return true; // dianggap sukses — sudah tidak ada
            }
            const id = existing['.id'] || existing.id;
            await menu.remove(id);
            console.log(`[PPP_SECRET] Deleted secret for "${username}"`);
        } else {
            // update / enable / disable
            if (!existing) {
                console.warn(`[PPP_SECRET] Secret "${username}" tidak ditemukan untuk action "${action}"`);
                await client.close();
                return false;
            }
            const id = existing['.id'] || existing.id;
            if (action === 'disable') {
                await menu.where('.id', id).update({ disabled: 'yes' });
                console.log(`[PPP_SECRET] Disabled secret for "${username}"`);
            } else if (action === 'enable') {
                await menu.where('.id', id).update({ disabled: 'no' });
                console.log(`[PPP_SECRET] Enabled secret for "${username}"`);
            } else if (action === 'update') {
                const upd = {};
                if (password !== undefined) upd.password = password;
                if (profile) upd.profile = profile;
                if (Object.keys(upd).length > 0) {
                    await menu.where('.id', id).update(upd);
                    console.log(`[PPP_SECRET] Updated secret for "${username}"`);
                }
            }
        }

        await client.close();
        return true;
    } catch (err) {
        console.error(`[PPP_SECRET] ${action} error for "${params.username}":`, err.message);
        if (client) try { await client.close() } catch {}
        return false;
    }
};

// Helper: enable PPP secret saat pelanggan bayar (full local auth)
// Lookup nas_id dari customer_details, lalu enable secret-nya
// tenantId opsional — jika diisi, query scoped ke tenant tersebut (penting jika username sama di mitra berbeda)
const reactivateLocalAuth = async (username, tenantId = null) => {
    try {
        const tenantFilter = tenantId ? ' AND (cd.tenant_id = ? OR cd.tenant_id IS NULL)' : '';
        const queryParams = tenantId ? [username, tenantId] : [username];
        const [[cd]] = await db.query(
            `SELECT cd.nas_id, cd.connection_type, cd.static_ip, cd.mac_address, mc.auth_mode FROM customer_details cd LEFT JOIN mikrotik_config mc ON mc.id = cd.nas_id WHERE cd.username = ?${tenantFilter}`,
            queryParams
        );
        if (!cd?.nas_id) return;

        if (cd.connection_type === 'static') {
            // Static: hapus firewall block, enable queue, re-create ARP jika ada MAC
            if (cd.static_ip) {
                await manageStaticFirewall(cd.nas_id, 'unblock', cd.static_ip);
                await manageSimpleQueue(cd.nas_id, 'enable', { target: cd.static_ip });
                if (cd.mac_address) {
                    await manageStaticArp(cd.nas_id, 'create', { ip: cd.static_ip, mac: cd.mac_address, comment: username });
                }
                // Reset flag isolated agar badge UI kembali AKTIF
                await db.query('UPDATE customer_details SET is_isolated = 0 WHERE username = ?', [username]);
                console.log(`[LOCAL_AUTH] Static IP unblocked + queue enabled for "${username}" setelah bayar`);
            }
        } else if (cd.connection_type === 'hotspot') {
            // Hotspot: bypass binding kembali + enable queue
            if (cd.static_ip) {
                await manageHotspotBinding(cd.nas_id, 'bypass', { ip: cd.static_ip, mac: cd.mac_address || undefined });
                await manageSimpleQueue(cd.nas_id, 'enable', { target: cd.static_ip });
                await db.query('UPDATE customer_details SET is_isolated = 0 WHERE username = ?', [username]);
                console.log(`[LOCAL_AUTH] Hotspot binding bypassed + queue enabled for "${username}" setelah bayar`);
            }
        } else {
            // Hapus Auth-Type=Reject dari radcheck (cleanup legacy data dari suspend)
            await db.query(
                "DELETE FROM radcheck WHERE username = ? AND attribute = 'Auth-Type' AND value = 'Reject'",
                [username]
            );
            if (cd.auth_mode !== 'radius') {
                await managePppSecret(cd.nas_id, 'enable', { username });
                console.log(`[LOCAL_AUTH] PPP secret enabled for "${username}" setelah bayar`);
            } else {
                console.log(`[LOCAL_AUTH] RADIUS mode — skip enable PPP secret for "${username}" setelah bayar`);
            }
        }
    } catch (e) {
        console.error(`[LOCAL_AUTH] Gagal reaktivasi untuk "${username}":`, e.message);
    }
};

// ============================================================
// POLLING ONLINE DETECTION — Full Local Auth
// Polling /ppp/active dari semua router, simpan ke ppp_active_cache
// Interval default: 2 menit. Menggantikan radacct untuk deteksi online.
// ============================================================
const pollPppActiveAll = async () => {
    try {
        const [routers] = await db.query('SELECT id, tenant_id, host, name FROM mikrotik_config');
        if (!routers.length) return;

        for (const router of routers) {
            let client;
            try {
                client = await getMikrotikClient(router.id);
                const conn = await client.connect();
                const actives = await conn.menu('/ppp/active').get();

                // Kumpulkan username yang aktif di router ini
                const activeUsernames = new Set();

                for (const s of actives) {
                    const uname = s.name || s.user || '';
                    if (!uname) continue;
                    activeUsernames.add(uname.toLowerCase());

                    // Parse uptime MikroTik (e.g. "1d2h3m4s") ke session_start approx
                    let sessionStart = null;
                    if (s.uptime) {
                        const match = s.uptime.match(/(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
                        if (match) {
                            const weeks = parseInt(match[1] || 0);
                            const days  = parseInt(match[2] || 0);
                            const hours = parseInt(match[3] || 0);
                            const mins  = parseInt(match[4] || 0);
                            const secs  = parseInt(match[5] || 0);
                            const totalSecs = weeks*604800 + days*86400 + hours*3600 + mins*60 + secs;
                            sessionStart = new Date(Date.now() - totalSecs * 1000);
                        }
                    }

                    await db.query(
                        `INSERT INTO ppp_active_cache (username, nas_id, tenant_id, framed_ip, mac_address, session_uptime, session_start)
                         VALUES (?, ?, ?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE
                             tenant_id = VALUES(tenant_id),
                             framed_ip = VALUES(framed_ip),
                             mac_address = VALUES(mac_address),
                             session_uptime = VALUES(session_uptime),
                             session_start = COALESCE(session_start, VALUES(session_start)),
                             updated_at = CURRENT_TIMESTAMP`,
                        [
                            uname,
                            router.id,
                            router.tenant_id,
                            s['address'] || s['local-address'] || null,
                            s['caller-id'] || null,
                            s.uptime || null,
                            sessionStart
                        ]
                    );
                }

                // === Deteksi online untuk pelanggan Static IP via ARP table ===
                try {
                    const [staticUsers] = await db.query(
                        `SELECT username, static_ip, tenant_id FROM customer_details
                         WHERE nas_id = ? AND connection_type = 'static' AND static_ip IS NOT NULL
                         AND (status IS NULL OR status = 'aktif')`,
                        [router.id]
                    );

                    if (staticUsers.length > 0) {
                        // Ambil ARP table dari MikroTik
                        const arpEntries = await conn.menu('/ip/arp').get();
                        const arpIps = new Set(arpEntries.map(e => e.address).filter(Boolean));

                        // Ambil daftar IP yang sedang diisolir (ada di PMYNET_ISOLIR)
                        let isolirIps = new Set();
                        try {
                            const addrList = await conn.menu('/ip/firewall/address-list').get();
                            addrList.filter(e => e.list === STATIC_ISOLIR_LIST).forEach(e => {
                                if (e.address) isolirIps.add(e.address);
                            });
                        } catch {}

                        for (const su of staticUsers) {
                            const ip = su.static_ip;
                            if (isolirIps.has(ip)) {
                                // IP sedang diisolir → jangan masukkan ke cache (offline)
                                await db.query(
                                    'DELETE FROM ppp_active_cache WHERE username = ? AND nas_id = ?',
                                    [su.username, router.id]
                                );
                            } else if (arpIps.has(ip)) {
                                // IP ada di ARP table dan tidak diisolir → online
                                activeUsernames.add(su.username.toLowerCase());
                                await db.query(
                                    `INSERT INTO ppp_active_cache (username, nas_id, tenant_id, framed_ip)
                                     VALUES (?, ?, ?, ?)
                                     ON DUPLICATE KEY UPDATE
                                         tenant_id = VALUES(tenant_id),
                                         framed_ip = VALUES(framed_ip),
                                         updated_at = CURRENT_TIMESTAMP`,
                                    [su.username, router.id, su.tenant_id, ip]
                                );
                            } else {
                                // IP tidak ada di ARP → offline
                                await db.query(
                                    'DELETE FROM ppp_active_cache WHERE username = ? AND nas_id = ?',
                                    [su.username, router.id]
                                );
                            }
                        }
                    }
                } catch (arpErr) {
                    console.warn(`[POLL] Gagal cek ARP static router ${router.name || router.host}:`, arpErr.message);
                }

                // Hapus entry cache yang sudah tidak aktif di router ini
                if (activeUsernames.size > 0) {
                    const [cached] = await db.query('SELECT username FROM ppp_active_cache WHERE nas_id = ?', [router.id]);
                    for (const row of cached) {
                        if (!activeUsernames.has(row.username.toLowerCase())) {
                            await db.query('DELETE FROM ppp_active_cache WHERE username = ? AND nas_id = ?', [row.username, router.id]);
                        }
                    }
                } else {
                    // Tidak ada yang aktif → hapus semua cache router ini (kecuali static yang sudah ditangani)
                    await db.query(
                        `DELETE FROM ppp_active_cache WHERE nas_id = ? AND username NOT IN (
                            SELECT username FROM customer_details WHERE nas_id = ? AND connection_type = 'static'
                        )`,
                        [router.id, router.id]
                    );
                }

                await client.close();
            } catch (e) {
                console.warn(`[POLL] Router ${router.name || router.host} tidak responsif:`, e.message);
                if (client) try { await client.close(); } catch {}
                // Jangan hapus cache jika router tidak responsif — biarkan data lama
            }
        }
        // Bersihkan cache stale: entry yang tidak diupdate > 10 menit
        // Mengatasi kasus router dengan IP salah / offline lama → cache tidak ter-refresh → user salah keliatan online
        await db.query("DELETE FROM ppp_active_cache WHERE updated_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)");
    } catch (e) {
        console.error('[POLL] pollPppActiveAll error:', e.message);
    }
};

// Jalankan polling setiap 2 menit
const PPP_POLL_INTERVAL_MS = 2 * 60 * 1000;
const startPppPolling = () => {
    pollPppActiveAll(); // langsung run sekali saat startup
    setInterval(pollPppActiveAll, PPP_POLL_INTERVAL_MS);
    console.log(`[POLL] PPP active polling dimulai (interval: ${PPP_POLL_INTERVAL_MS / 1000}s)`);
};

// Helper: Kirim RADIUS Disconnect-Request (PoD) ke NAS via radclient
// Lebih andal dari RouterOS API karena pakai jalur RADIUS yang sudah terbukti jalan
const sendPoD = async (username) => {
    try {
        // Gunakan LOWER() agar cocok meski case berbeda (DB: 'David', radacct: 'david')
        // Ambil juga username & framedipaddress persis dari radacct untuk dikirim ke MikroTik
        const [sessions] = await db.query(
            `SELECT DISTINCT nasipaddress, username AS actual_username, framedipaddress
             FROM radacct
             WHERE LOWER(username) = LOWER(?) AND (acctstoptime IS NULL OR acctstoptime = 0)
             ORDER BY acctstarttime DESC`,
            [username]
        );
        if (sessions.length === 0) {
            console.log(`[POD] Tidak ada sesi aktif untuk ${username}`);
            return 0;
        }
        const secret = process.env.RADIUS_SECRET || 'Mynet@2026';
        const radclientPath = process.env.RADCLIENT_PATH || '/usr/bin/radclient';
        const podPort = process.env.RADIUS_POD_PORT || '3799';
        let sent = 0;
        for (const session of sessions) {
            const nasIp = session.nasipaddress;
            // Pakai username PERSIS dari radacct (bukan dari URL param yang mungkin beda case)
            const safeUsername = (session.actual_username || username).replace(/[^a-zA-Z0-9._@\-]/g, '');
            // Sertakan Framed-IP-Address jika ada — MikroTik lebih mudah match sesinya
            const ipAttr = session.framedipaddress && session.framedipaddress !== '0.0.0.0'
                ? `\nFramed-IP-Address = ${session.framedipaddress}` : '';
            const cmd = `printf 'User-Name = %s${ipAttr}' "${safeUsername}" | ${radclientPath} -t 3 -r 2 ${nasIp}:${podPort} disconnect "${secret}"`;
            exec(cmd, (err, stdout) => {
                if (err) console.error(`[POD] Gagal kirim ke ${nasIp}:${podPort} untuk ${safeUsername}:`, err.message);
                else console.log(`[POD] Disconnect-Request terkirim ke ${nasIp}:${podPort} untuk ${safeUsername} (IP: ${session.framedipaddress || '-'})`);
            });
            sent++;
        }
        return sent;
    } catch (e) {
        console.error('[POD] Error:', e.message);
        return 0;
    }
};

// SYNC REALTIME - Check if users are actually online on MikroTik
/// Helper: restart FreeRADIUS container via Docker API (background, no-await)
// Dipanggil otomatis setelah tambah/edit/hapus router agar NAS baru langsung dikenali
const reloadFreeradius = () => {
    const req = http.request({
        socketPath: '/var/run/docker.sock',
        path: '/containers/pmyhome-freeradius/restart',
        method: 'POST',
    }, (res) => {
        console.log(`[FREERADIUS] Container restarted, HTTP status: ${res.statusCode}`);
    });
    req.on('error', (e) => console.warn('[FREERADIUS] Auto-restart failed (Docker socket?):', e.message));
    req.end();
};

// Helper Function: Kick User directly via MikroTik API (100% Reliable Fix for Disconnect)
const kickMikrotikUser = async (username, preferNasId = null, tenantId = null) => {
    let kickedCount = 0;
    try {
        // Auto-lookup tenant_id dari customer_details jika tidak disediakan
        // Ini memastikan kick hanya terjadi di router milik tenant pelanggan tersebut
        let resolvedTenantId = tenantId;
        if (!resolvedTenantId) {
            const [[custInfo]] = await db.query('SELECT tenant_id, nas_id FROM customer_details WHERE username = ?', [username]);
            if (custInfo) {
                resolvedTenantId = custInfo.tenant_id;
                if (!preferNasId && custInfo.nas_id) preferNasId = custInfo.nas_id;
            }
        }

        let routers = [];
        if (preferNasId) {
            const [specific] = await db.query('SELECT id, host, name FROM mikrotik_config WHERE id = ?', [preferNasId]);
            if (specific.length > 0) routers = specific;
        }
        if (routers.length === 0 && resolvedTenantId) {
            // Fallback: coba semua router milik tenant pelanggan ini saja
            const [all] = await db.query('SELECT id, host, name FROM mikrotik_config WHERE tenant_id = ?', [resolvedTenantId]);
            routers = all;
        }
        if (routers.length === 0) {
            // tenant_id tidak diketahui dan tidak ada router spesifik — batalkan, jangan akses router tenant lain
            console.warn(`[KICK] ${username}: tenant_id tidak diketahui, skip kick untuk keamanan multi-tenant`);
            return 0;
        }

        const lowerUsername = username.toLowerCase();

        for (const router of routers) {
            let client;
            try {
                client = await getMikrotikClient(router.id);
                const connection = await client.connect();

                // Kick sesi PPPoE aktif (case-insensitive match)
                // CATATAN: routeros-client mengkonversi '.id' → 'id' (tanpa titik) saat parsing response
                try {
                    const pppActive = await connection.menu('/ppp/active').get();
                    const sessions = pppActive.filter(s => (s.name || '').toLowerCase() === lowerUsername);
                    for (const session of sessions) {
                        await connection.menu('/ppp/active').remove(session.id);
                        kickedCount++;
                        console.log(`[KICK API] User ${username} ditendang dari PPPoE di router ${router.host}`);
                    }
                } catch (e) { console.error(`[KICK API] Error PPPoE on ${router.host}:`, e.message); }

                // Kick sesi Hotspot aktif (case-insensitive match)
                try {
                    const hsActive = await connection.menu('/ip/hotspot/active').get();
                    const sessions = hsActive.filter(s => (s.user || '').toLowerCase() === lowerUsername);
                    for (const session of sessions) {
                        await connection.menu('/ip/hotspot/active').remove(session.id);
                        kickedCount++;
                        console.log(`[KICK API] User ${username} ditendang dari Hotspot di router ${router.host}`);
                    }
                } catch (e) { console.error(`[KICK API] Error Hotspot on ${router.host}:`, e.message); }

                await client.close();
            } catch (err) {
                if (client) try { await client.close(); } catch (e) { }
                console.error(`[KICK API] Gagal menghubungi router ${router.name} (${router.host}): ${err.message}`);
            }
        }
    } catch (dbErr) {
        console.error('[KICK API] DB Error:', dbErr.message);
    }
    return kickedCount;
};

const syncRealtimeOnlineUsers = async () => {
    console.log(`[${new Date().toISOString()}] Menjalankan sinkronisasi real-time online users...`);
    try {
        // 1. Dapatkan daftar semua Router MikroTik
        const [routers] = await db.query('SELECT id, host, name FROM mikrotik_config');
        if (routers.length === 0) return;

        let allActiveUsernames = new Set();    // semua user di /ppp/active
        let radiusActiveUsernames = new Set(); // hanya user yang konek via RADIUS (R flag)
        let reachableRouters = 0;

        // 2. Ambil data /ppp/active dari setiap router yang aktif
        for (const router of routers) {
            let client;
            try {
                client = await getMikrotikClient(router.id);
                const connection = await client.connect();
                const active = await connection.menu('/ppp/active').get();
                active.forEach(user => {
                    // Simpan lowercase agar perbandingan case-insensitive
                    if (user.name) {
                        allActiveUsernames.add(user.name.toLowerCase());
                        // Hanya tambahkan ke radiusActiveUsernames jika konek via RADIUS
                        // (field 'radius' = 'true'/'yes' di MikroTik API)
                        if (user.radius === true || user.radius === 'true' || user.radius === 'yes') {
                            radiusActiveUsernames.add(user.name.toLowerCase());
                        }
                    }
                });
                reachableRouters++;
                await client.close();
            } catch (err) {
                console.error(`[SYNC] Gagal menghubungi router ${router.name} (${router.host}):`, err.message);
                if (client) try { await client.close(); } catch (e) { }
            }
        }

        // 3. Jika tidak ada router yang bisa dihubungi, jangan bersihkan apa pun (safety first)
        if (reachableRouters === 0) return;

        // 4. Dapatkan daftar user yang tercatat Online di RADIUS
        const [onlineRadius] = await db.query('SELECT DISTINCT username FROM radacct WHERE acctstoptime IS NULL');

        // 5. Cross-check: Jika ada di RADIUS tapi tidak ada di MikroTik mana pun -> Tutup Sesi
        let closedCount = 0;
        for (const user of onlineRadius) {
            if (!allActiveUsernames.has(user.username.toLowerCase())) {
                await db.query(
                    "UPDATE radacct SET acctstoptime = NOW(), acctterminatecause = 'Sync-Auto-Clean' WHERE username = ? AND (acctstoptime IS NULL OR acctstoptime = 0)",
                    [user.username]
                );
                closedCount++;
            }
        }
        if (closedCount > 0) {
            console.log(`[SYNC] Sinkronisasi selesai: ${closedCount} sesi 'nyangkut' berhasil ditutup secara otomatis.`);
        }

        // 6. Reverse-check: User konek via RADIUS di MikroTik tapi sesinya salah ditutup -> Pulihkan
        // Hanya restore untuk koneksi RADIUS (R flag), bukan koneksi lokal (L flag)
        // Jangan restore sesi yang ditutup karena stale (RADIUS di-disable) — hindari loop step6↔step7
        let restoredCount = 0;
        for (const activeUsername of radiusActiveUsernames) {
            // Cek apakah user ini TIDAK punya sesi terbuka di radacct
            const [[openSession]] = await db.query(
                'SELECT radacctid FROM radacct WHERE LOWER(username) = ? AND acctstoptime IS NULL LIMIT 1',
                [activeUsername]
            );
            if (!openSession) {
                // Ambil sesi terakhir yang ditutup dalam 10 menit terakhir
                // (bukan 24 jam — window sempit agar hanya catch false-positive dari sync sebelumnya)
                // Jangan restore sesi yang ditutup karena stale atau admin force-close
                const [[closedSession]] = await db.query(
                    `SELECT radacctid FROM radacct
                     WHERE LOWER(username) = ?
                     AND acctstoptime IS NOT NULL
                     AND acctstoptime > DATE_SUB(NOW(), INTERVAL 10 MINUTE)
                     AND acctterminatecause NOT IN ('Stale-No-Update', 'Admin-Force-Close', 'Admin-Reset')
                     ORDER BY acctstoptime DESC LIMIT 1`,
                    [activeUsername]
                );
                if (closedSession) {
                    await db.query(
                        "UPDATE radacct SET acctstoptime = NULL, acctterminatecause = 'Sync-Restored' WHERE radacctid = ?",
                        [closedSession.radacctid]
                    );
                    restoredCount++;
                    console.log(`[SYNC] Sesi ${activeUsername} dipulihkan (konek via RADIUS di MikroTik tapi tercatat offline).`);
                }
            }
        }
        if (restoredCount > 0) {
            console.log(`[SYNC] ${restoredCount} sesi berhasil dipulihkan.`);
        }

        // 7. Fallback: tutup sesi yang tidak dapat accounting-update > 1 jam
        // Terjadi saat RADIUS di-disable di MikroTik → session PPPoE tetap hidup di router
        // tapi tidak ada interim-accounting → radacct tidak ter-update → sesi nyangkut
        // Aman: session aktif selalu dapat update tiap 5-10 menit, tidak akan kena threshold ini
        const [staleResult] = await db.query(`
            UPDATE radacct
            SET acctstoptime = NOW(), acctterminatecause = 'Stale-No-Update'
            WHERE acctstoptime IS NULL
            AND acctupdatetime < NOW() - INTERVAL 1 HOUR
        `);
        if (staleResult.affectedRows > 0) {
            console.log(`[SYNC] ${staleResult.affectedRows} sesi stale (>8j tanpa update) berhasil ditutup.`);
        }

    } catch (err) {
        console.error('[SYNC] Terjadi kesalahan fatal saat sinkronisasi:', err.message);
    }
};

// ─── WHATSAPP GATEWAY HELPER ────────────────────────────────────────────────

const formatPhone = (phone, countryCode = '62') => {
    let p = String(phone || '').replace(/[\s\-().+]/g, '');
    if (p.startsWith('0')) p = countryCode + p.slice(1);
    else if (!p.startsWith(countryCode)) p = countryCode + p;
    return p;
};

const renderTemplate = (tpl, vars) =>
    tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));

const sendWaMessage = async (phone, message, s) => {
    if (!s.wa_api_url || !s.wa_api_key) throw new Error('WA gateway belum dikonfigurasi');
    const formatted = formatPhone(phone, s.wa_country_code || '62');
    const body = {
        [s.wa_phone_key || 'target']: formatted,
        [s.wa_message_key || 'message']: message,
    };
    if (s.wa_sender) body.sender = s.wa_sender;
    const res = await fetch(s.wa_api_url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            [s.wa_auth_header || 'Authorization']: s.wa_api_key,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => res.status);
        throw new Error(`Gateway error ${res.status}: ${txt}`);
    }
    return res.json().catch(() => ({ ok: true }));
};

// POST /api/wa/test — kirim pesan test ke satu nomor
app.post('/api/wa/test', authenticateToken, isAdmin, async (req, res) => {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'phone dan message wajib diisi' });
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query('SELECT setting_key, setting_value FROM billing_settings WHERE tenant_id = ?', [tenantId]);
        const s = Object.fromEntries(rows.map(r => [r.setting_key, r.setting_value]));
        const result = await sendWaMessage(phone, message, s);
        res.json({ ok: true, result });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/wa/blast/preview — ambil daftar penerima sebelum blast
app.get('/api/wa/blast/preview', authenticateToken, isAdmin, async (req, res) => {
    const { period, territory_id, groupname } = req.query;
    if (!period) return res.status(400).json({ error: 'period wajib diisi' });
    try {
        const tenantId = getTenantId(req);
        let query = `
            SELECT bi.id, bi.username, bi.amount, bi.period, bi.status,
                   cd.fullname, cd.phone, cd.due_date_day,
                   bi.package_name as paket
            FROM billing_invoices bi
            JOIN customer_details cd ON bi.username = cd.username
            WHERE bi.period = ? AND bi.status = 'unpaid' AND cd.tenant_id = ? AND cd.phone IS NOT NULL AND cd.phone != ''
        `;
        const params = [period, tenantId];
        if (territory_id) { query += ' AND cd.territory_id = ?'; params.push(territory_id); }
        if (groupname)     { query += ' AND bi.package_name = ?'; params.push(groupname); }
        query += ' ORDER BY cd.fullname';
        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/wa/blast — kirim WA massal (SSE untuk progress real-time)
app.post('/api/wa/blast', authenticateToken, isAdmin, async (req, res) => {
    const { period, territory_id, groupname, template, invoice_ids } = req.body;
    if (!period || !template) return res.status(400).json({ error: 'period dan template wajib diisi' });
    try {
        const tenantId = getTenantId(req);

        // Load settings
        const [sRows] = await db.query('SELECT setting_key, setting_value FROM billing_settings WHERE tenant_id = ?', [tenantId]);
        const s = Object.fromEntries(sRows.map(r => [r.setting_key, r.setting_value]));
        if (!s.wa_api_url || !s.wa_api_key) return res.status(400).json({ error: 'WA gateway belum dikonfigurasi' });

        // Ambil penerima
        let query = `
            SELECT bi.id, bi.username, bi.amount, bi.period,
                   cd.fullname, cd.phone, cd.due_date_day,
                   bi.package_name as paket
            FROM billing_invoices bi
            JOIN customer_details cd ON bi.username = cd.username
            WHERE bi.period = ? AND bi.status = 'unpaid' AND cd.tenant_id = ? AND cd.phone IS NOT NULL AND cd.phone != ''
        `;
        const params = [period, tenantId];
        if (invoice_ids?.length) { query += ` AND bi.id IN (${invoice_ids.map(() => '?').join(',')})`;  params.push(...invoice_ids); }
        else {
            if (territory_id) { query += ' AND cd.territory_id = ?'; params.push(territory_id); }
            if (groupname)    { query += ' AND bi.package_name = ?'; params.push(groupname); }
        }
        const [recipients] = await db.query(query, params);
        if (!recipients.length) return res.status(400).json({ error: 'Tidak ada penerima yang ditemukan' });

        const delayMs = parseInt(s.wa_delay_ms || '3000');
        const appUrl = s.pg_app_base_url || '';

        // SSE setup
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });

        const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
        send({ type: 'start', total: recipients.length });

        let sent = 0, failed = 0;
        for (const r of recipients) {
            const vars = {
                nama: r.fullname || r.username,
                tagihan: Number(r.amount).toLocaleString('id-ID'),
                periode: r.period,
                jatuh_tempo: r.due_date_day || '-',
                paket: r.paket || '-',
                no_invoice: `#INV-${String(r.id).padStart(5, '0')}`,
                link_bayar: appUrl ? `${appUrl}/bayar?inv=${r.id}` : '-',
            };
            const msg = renderTemplate(template, vars);
            try {
                await sendWaMessage(r.phone, msg, s);
                sent++;
                send({ type: 'progress', sent, failed, total: recipients.length, username: r.username, phone: r.phone, status: 'ok' });
            } catch (err) {
                failed++;
                send({ type: 'progress', sent, failed, total: recipients.length, username: r.username, phone: r.phone, status: 'error', error: err.message });
            }
            if (sent + failed < recipients.length) await new Promise(r => setTimeout(r, delayMs));
        }
        send({ type: 'done', sent, failed, total: recipients.length });
        res.end();
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- PIUTANG (tagihan postpaid yang belum dibayar) ---
app.get('/api/billing/piutang', authenticateToken, isAdmin, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const today = new Date();
        const todayDay = today.getDate();
        const currentPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

        const [rows] = await db.query(`
            SELECT
                i.id, i.username, i.period, i.amount, i.created_at,
                cd.fullname, cd.phone, cd.due_date_day,
                DATEDIFF(NOW(), STR_TO_DATE(CONCAT(i.period, '-', LPAD(COALESCE(cd.due_date_day,5), 2,'0')), '%Y-%m-%d')) AS days_overdue,
                i.package_name as groupname
            FROM billing_invoices i
            JOIN customer_details cd ON cd.username = i.username AND cd.tenant_id = i.tenant_id
            WHERE i.status = 'unpaid'
            AND i.tenant_id = ?
            AND cd.billing_type = 'postpaid'
            ORDER BY days_overdue DESC, i.username
        `, [tenantId]);

        // Hitung total piutang dan kelompokkan aging
        const total = rows.reduce((s, r) => s + parseFloat(r.amount), 0);
        const aging = {
            current:  rows.filter(r => r.days_overdue <= 0),
            days_30:  rows.filter(r => r.days_overdue > 0 && r.days_overdue <= 30),
            days_60:  rows.filter(r => r.days_overdue > 30 && r.days_overdue <= 60),
            over_60:  rows.filter(r => r.days_overdue > 60),
        };

        res.json({ rows, total, aging_summary: {
            current: { count: aging.current.length, amount: aging.current.reduce((s,r)=>s+parseFloat(r.amount),0) },
            days_30: { count: aging.days_30.length, amount: aging.days_30.reduce((s,r)=>s+parseFloat(r.amount),0) },
            days_60: { count: aging.days_60.length, amount: aging.days_60.reduce((s,r)=>s+parseFloat(r.amount),0) },
            over_60: { count: aging.over_60.length, amount: aging.over_60.reduce((s,r)=>s+parseFloat(r.amount),0) },
        }});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- BILLING SETTINGS ---

app.get('/api/billing/settings', authenticateToken, isAdmin, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        let [rows] = await db.query('SELECT setting_key, setting_value FROM billing_settings WHERE tenant_id = ?', [tenantId]);

        // Lazy seed: jika mitra belum punya settings, copy default dari tenant_id=1
        if (rows.length === 0 && tenantId !== 1) {
            await db.query(
                `INSERT IGNORE INTO billing_settings (setting_key, tenant_id, setting_value, description)
                 SELECT setting_key, ?, setting_value, description FROM billing_settings WHERE tenant_id = 1`,
                [tenantId]
            );
            [rows] = await db.query('SELECT setting_key, setting_value FROM billing_settings WHERE tenant_id = ?', [tenantId]);
        }

        const settings = {};
        rows.forEach(r => settings[r.setting_key] = r.setting_value);
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/billing/settings', authenticateToken, isAdmin, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const updates = req.body;
        // Field yang hanya boleh diubah oleh super admin — skip saja jika bukan SA (jangan reject)
        const SUPER_ADMIN_ONLY_KEYS = ['company_name', 'company_logo', 'company_address', 'company_phone'];
        const allEntries = Object.entries(updates);
        const entries = req.user?.is_super_admin
            ? allEntries
            : allEntries.filter(([key]) => !SUPER_ADMIN_ONLY_KEYS.includes(key));
        if (entries.length === 0) return res.status(400).json({ error: 'No settings provided' });

        for (const [key, value] of entries) {
            await db.query(
                'INSERT INTO billing_settings (setting_key, tenant_id, setting_value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
                [key, tenantId, value, value]
            );
        }
        res.json({ message: 'Pengaturan berhasil disimpan' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Bulk update auto_suspend semua pelanggan aktif
app.post('/api/billing/apply-auto-suspend', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { auto_suspend } = req.body;
        const val = auto_suspend ? 1 : 0;
        const tenantId = getTenantId(req);
        const [result] = await db.query(
            `UPDATE customer_details SET auto_suspend = ? WHERE (status = 'aktif' OR status IS NULL) AND tenant_id = ?`,
            [val, tenantId]
        );
        res.json({ message: `Auto-isolir ${val ? 'diaktifkan' : 'dinonaktifkan'} untuk ${result.affectedRows} pelanggan aktif.`, affected: result.affectedRows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Bulk update due_date_day semua pelanggan aktif
app.post('/api/billing/apply-due-date', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { due_date_day } = req.body;
        const day = parseInt(due_date_day, 10);
        if (!day || day < 1 || day > 31) return res.status(400).json({ error: 'Tanggal tidak valid (1-31)' });
        const tenantId = getTenantId(req);
        const [result] = await db.query(
            `UPDATE customer_details SET due_date_day = ? WHERE (status = 'aktif' OR status IS NULL) AND tenant_id = ?`,
            [day, tenantId]
        );
        res.json({ message: `Jatuh tempo ${result.affectedRows} pelanggan aktif diupdate ke tanggal ${day}.`, affected: result.affectedRows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET Dashboard Stats
app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        let totalQuery = 'SELECT COUNT(DISTINCT cd.username) as total_users FROM customer_details cd WHERE (cd.status IS NULL OR cd.status = "aktif") AND cd.tenant_id = ?';
        let onlineQuery = 'SELECT COUNT(DISTINCT p.username) as online_users FROM ppp_active_cache p JOIN customer_details cd ON p.username = cd.username AND p.tenant_id = cd.tenant_id WHERE (cd.status IS NULL OR cd.status = "aktif") AND cd.tenant_id = ?';

        let revenueQuery = `
            SELECT SUM(p.price) as total_revenue
            FROM radusergroup rug
            JOIN bandwidth_profiles p ON rug.groupname = p.name AND p.tenant_id = ?
            JOIN customer_details cd ON rug.username = cd.username
            WHERE (cd.status IS NULL OR cd.status = 'aktif')
            AND cd.tenant_id = ?
            AND (cd.created_at IS NULL OR DATE_FORMAT(cd.created_at, '%Y-%m') != DATE_FORMAT(NOW(), '%Y-%m'))
        `;

        let newRevenueQuery = `
            SELECT SUM(p.price) as new_revenue
            FROM radusergroup rug
            JOIN bandwidth_profiles p ON rug.groupname = p.name AND p.tenant_id = ?
            JOIN customer_details cd ON rug.username = cd.username
            WHERE (cd.status IS NULL OR cd.status = 'aktif')
            AND cd.tenant_id = ?
            AND DATE_FORMAT(cd.created_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')
        `;

        const params = [tenantId];
        const revenueParams = [tenantId, tenantId];
        const newRevenueParams = [tenantId, tenantId];
        if (req.user.role === 'collector') {
            const collectorFilter = ' AND cd.territory_id IN (SELECT id FROM territories WHERE collector_id = ? AND tenant_id = ?)';
            totalQuery += collectorFilter;
            onlineQuery += collectorFilter;
            revenueQuery += collectorFilter;
            newRevenueQuery += collectorFilter;
            params.push(req.user.id, tenantId);
            revenueParams.push(req.user.id, tenantId);
            newRevenueParams.push(req.user.id, tenantId);
        }

        const [[{ total_users }]] = await db.query(totalQuery, params);
        const [[{ online_users }]] = await db.query(onlineQuery, params);
        const [[{ total_revenue }]] = await db.query(revenueQuery, revenueParams);
        const [[{ new_revenue }]] = await db.query(newRevenueQuery, newRevenueParams);

        res.json({
            total_users: total_users || 0,
            online_users: online_users || 0,
            total_revenue: total_revenue || 0,
            new_revenue: new_revenue || 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET Weekly new user growth for current month
app.get('/api/stats/weekly-growth', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const monthStr = `${year}-${String(month).padStart(2, '0')}`;

        const [rows] = await db.query(`
            SELECT
                CEIL(DAY(cd.created_at) / 7) AS week,
                COUNT(*) AS new_users
            FROM customer_details cd
            WHERE DATE_FORMAT(cd.created_at, '%Y-%m') = ?
            AND (cd.status IS NULL OR cd.status != 'berhenti')
            AND cd.tenant_id = ?
            GROUP BY week
            ORDER BY week
        `, [monthStr, tenantId]);

        // Pastikan selalu 4 minggu
        const result = [1, 2, 3, 4].map(w => ({
            name: `Minggu ${w}`,
            new: rows.find(r => parseInt(r.week) === w)?.new_users || 0
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET Online Users Detailed list
app.get('/api/stats/online-users', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const query = `
            SELECT
                r.acctsessionid,
                r.username,
                r.framedipaddress as ip_address,
                r.acctstarttime as login_time,
                TIMESTAMPDIFF(SECOND, r.acctstarttime, NOW()) as duration,
                r.acctinputoctets as upload_bytes,
                r.acctoutputoctets as download_bytes,
                r.callingstationid as mac_address,
                r.nasipaddress as router_ip
            FROM radacct r
            JOIN customer_details cd ON r.username = cd.username
            WHERE r.acctstoptime IS NULL
            AND cd.tenant_id = ?
            ORDER BY r.acctstarttime DESC
            LIMIT 100
        `;
        const [rows] = await db.query(query, [tenantId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// GET Offline/Recent Sessions (Finite history)
app.get('/api/stats/offline-sessions', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const query = `
            SELECT
                r.acctsessionid,
                r.username,
                r.framedipaddress as ip_address,
                r.acctstarttime as login_time,
                r.acctstoptime as logout_time,
                r.acctsessiontime as duration,
                r.acctinputoctets as upload_bytes,
                r.acctoutputoctets as download_bytes,
                r.callingstationid as mac_address,
                r.nasipaddress as router_ip
            FROM radacct r
            JOIN customer_details cd ON r.username = cd.username
            WHERE r.acctstoptime IS NOT NULL
            AND cd.tenant_id = ?
            ORDER BY r.acctstoptime DESC
            LIMIT 100
        `;
        const [rows] = await db.query(query, [tenantId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CLEAN STALE SESSIONS (Bersihkan Data)
app.post('/api/sessions/sync', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        // Tutup sesi stale — hanya untuk pelanggan tenant ini
        const query = `UPDATE radacct ra
            JOIN customer_details cd ON ra.username = cd.username
            SET ra.acctstoptime = NOW(), ra.acctterminatecause = 'Sync-Admin-Clean'
            WHERE ra.acctstoptime IS NULL AND cd.tenant_id = ? AND (
                (ra.acctupdatetime IS NOT NULL AND ra.acctupdatetime < DATE_SUB(NOW(), INTERVAL 30 MINUTE))
                OR (ra.acctupdatetime IS NULL AND ra.acctstarttime < DATE_SUB(NOW(), INTERVAL 30 MINUTE))
            )`;
        const [result] = await db.query(query, [tenantId]);
        res.json({ message: `${result.affectedRows} sesi stale berhasil dibersihkan.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE Specific Sessions (Hapus Session)
app.post('/api/sessions/delete', authenticateToken, isAdminOrNoc, async (req, res) => {
    const { sessionIds } = req.body; // array of acctsessionid
    if (!sessionIds || !Array.isArray(sessionIds)) return res.status(400).json({ error: 'sessionIds array is required' });
    if (sessionIds.length === 0) return res.status(400).json({ error: 'sessionIds array cannot be empty' });
    try {
        const tenantId = getTenantId(req);
        // Hanya hapus sesi milik pelanggan tenant ini
        const [result] = await db.query(
            `DELETE ra FROM radacct ra
             JOIN customer_details cd ON ra.username = cd.username
             WHERE ra.acctsessionid IN (?) AND cd.tenant_id = ?`,
            [sessionIds, tenantId]
        );
        res.json({ message: `${result.affectedRows} record sesi berhasil dihapus.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// TERMINATE SESSION (Kick User)
app.post('/api/sessions/terminate/:username', authenticateToken, async (req, res) => {
    const { username } = req.params;
    try {
        const tenantId = getTenantId(req);
        if (!await verifyTenantUser(username, tenantId)) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
        // 1. Find active sessions for this user
        const [sessions] = await db.query(
            "SELECT nasipaddress, acctsessionid FROM radacct WHERE username = ? AND acctstoptime IS NULL",
            [username]
        );

        if (sessions.length === 0) {
            return res.status(404).json({ error: 'Sesi aktif tidak ditemukan untuk user ini.' });
        }

        // 2. Send Disconnect-Request (PoD) to NAS (MikroTik) via radclient (Fallback)
        for (const session of sessions) {
            const nasIp = session.nasipaddress;
            const secret = process.env.RADIUS_SECRET || 'Mynet@2026';
            const radclientPath = process.env.RADCLIENT_PATH || '/usr/bin/radclient';

            // MikroTik standard CoA/PoD port is 1700
            const cmd = `echo "User-Name = ${username}" | ${radclientPath} -x ${nasIp}:1700 disconnect "${secret}"`;
            exec(cmd, (err) => {
                if (err) console.error(`Failed to send PoD to ${nasIp}:`, err.message);
            });
        }

        // 3. Kick directly from MikroTik API (100% Reliable Fix)
        const kickedSessions = await kickMikrotikUser(username);

        // 4. Manually update radacct table to close the session locally
        // This ensures the dashboard UI updates immediately even if NAS takes time to respond
        await db.query(
            "UPDATE radacct SET acctstoptime = NOW(), acctterminatecause = 'Admin-Reset' WHERE username = ? AND (acctstoptime IS NULL OR acctstoptime = 0)",
            [username]
        );

        res.json({ message: `Sesi ${username} berhasil diputuskan (${kickedSessions} sesi aktif dihapus langsung dari Router).` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- CUSTOMERS (PELANGGAN) ---

// SUSPEND/ISOLIR USER (with PoD)
app.post('/api/users/:username/suspend', authenticateToken, isAdminOrNoc, async (req, res) => {
    const { username } = req.params;
    try {
        const tenantId = getTenantId(req);
        if (!await verifyTenantUser(username, tenantId)) {
            return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
        }
        // 0. Ambil data pelanggan
        const [[detail]] = await db.query(
            'SELECT d.nas_id, d.connection_type, d.static_ip, m.host AS nas_host, m.radius_secret AS nas_secret, m.auth_mode FROM customer_details d LEFT JOIN mikrotik_config m ON d.nas_id = m.id WHERE d.username = ? AND d.tenant_id = ?',
            [username, tenantId]
        );

        // === STATIC: blokir via firewall + disable Simple Queue (+ hapus ARP jika ada) ===
        if (detail?.connection_type === 'static') {
            // Hapus dari cache online agar status langsung OFFLINE di UI
            await db.query('DELETE FROM ppp_active_cache WHERE username = ?', [username]);
            // Tandai isolated di DB agar badge UI menampilkan ISOLIR
            await db.query('UPDATE customer_details SET is_isolated = 1 WHERE username = ?', [username]);

            if (detail.nas_id && detail.static_ip) {
                // Firewall block — cara utama isolir (bekerja dengan/tanpa MAC binding)
                manageStaticFirewall(detail.nas_id, 'block', detail.static_ip).catch(e =>
                    console.error(`[SUSPEND STATIC] Firewall block gagal:`, e.message)
                );
                // Disable Simple Queue (hapus bandwidth limit sementara)
                manageSimpleQueue(detail.nas_id, 'disable', { target: detail.static_ip }).catch(() => {});
                // Hapus static ARP jika ada (opsional, untuk MAC-bound users)
                if (detail.mac_address) {
                    manageStaticArp(detail.nas_id, 'delete', { ip: detail.static_ip }).catch(() => {});
                }
            }
            return res.json({
                message: `User ${username} berhasil diisolir.`,
                note: 'IP diblokir di firewall MikroTik dan Simple Queue dinonaktifkan.'
            });
        }

        // === HOTSPOT: ubah binding ke blocked + disable Simple Queue ===
        if (detail?.connection_type === 'hotspot') {
            await db.query('DELETE FROM ppp_active_cache WHERE username = ?', [username]);
            await db.query('UPDATE customer_details SET is_isolated = 1 WHERE username = ?', [username]);

            if (detail.nas_id && detail.static_ip) {
                manageHotspotBinding(detail.nas_id, 'block', { ip: detail.static_ip }).catch(e =>
                    console.error(`[SUSPEND HOTSPOT] Block binding gagal:`, e.message)
                );
                manageSimpleQueue(detail.nas_id, 'disable', { target: detail.static_ip }).catch(() => {});
            }
            return res.json({
                message: `User ${username} berhasil diisolir.`,
                note: 'Hotspot IP Binding diblokir dan Simple Queue dinonaktifkan.'
            });
        }

        // === PPPoE: flow lama ===
        const [activeSessions] = await db.query(
            "SELECT DISTINCT nasipaddress, username AS actual_username FROM radacct WHERE LOWER(username) = LOWER(?) AND (acctstoptime IS NULL OR acctstoptime = 0) LIMIT 5",
            [username]
        );

        // 1. Tandai reject di radcheck — blokir autentikasi baru, scoped by nas_id
        await db.query(
            "INSERT INTO radcheck (username, attribute, op, value, nas_id) VALUES (?, 'Auth-Type', ':=', 'Reject', ?) ON DUPLICATE KEY UPDATE value = 'Reject'",
            [username, detail?.nas_id || null]
        );

        // 2. Kirim PoD SEBELUM menutup radacct (pakai data sesi yang sudah diambil di atas)
        const secret = detail?.nas_secret || process.env.RADIUS_SECRET || 'Mynet@2026';
        const radclientPath = process.env.RADCLIENT_PATH || '/usr/bin/radclient';
        const podPort = process.env.RADIUS_POD_PORT || '3799';
        const safeUser = username.replace(/[^a-zA-Z0-9._@\-]/g, '');

        // Kumpulkan semua IP NAS: dari radacct + dari customer_details.nas_id (deduplikasi)
        const podTargets = new Set();
        for (const s of activeSessions) {
            if (s.nasipaddress) podTargets.add(s.nasipaddress);
        }
        if (detail?.nas_host) podTargets.add(detail.nas_host);

        for (const nasIp of podTargets) {
            const cmd = `echo "User-Name = ${safeUser}" | ${radclientPath} -t 3 -r 2 ${nasIp}:${podPort} disconnect "${secret}"`;
            exec(cmd, (err, stdout) => {
                if (err) console.error(`[SUSPEND POD] ${nasIp}:${podPort} gagal untuk ${safeUser}:`, err.message);
                else console.log(`[SUSPEND POD] Disconnect-Request terkirim ke ${nasIp}:${podPort} untuk ${safeUser}`);
            });
        }

        // 3. Tutup sesi di DB agar UI langsung update
        await db.query(
            "UPDATE radacct SET acctstoptime = NOW(), acctterminatecause = 'Admin-Reset' WHERE LOWER(username) = LOWER(?) AND (acctstoptime IS NULL OR acctstoptime = 0)",
            [username]
        );

        // 4. Kick via RouterOS API — fire-and-forget (tidak block response UI)
        kickMikrotikUser(username).then(n => {
            console.log(`[SUSPEND] ${username}: RouterOS API kick = ${n} sesi`);
        }).catch(e => {
            console.error(`[SUSPEND] RouterOS kick gagal:`, e.message);
        });

        // 5. Disable PPP Secret di MikroTik (hanya mode local/null, fire-and-forget)
        if (detail?.nas_id && detail?.auth_mode !== 'radius') {
            managePppSecret(detail.nas_id, 'disable', { username }).catch(e => {
                console.error(`[SUSPEND] Disable PPP secret gagal untuk ${username}:`, e.message);
            });
        }

        res.json({
            message: `User ${username} berhasil diisolir.`,
            pod_sent: podTargets.size,
            note: podTargets.size > 0 ? 'PoD terkirim. Sesi akan putus dalam beberapa detik.' : 'Radcheck sudah diset Reject.'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ACTIVATE/BUKA ISOLIR USER
app.post('/api/users/:username/activate', authenticateToken, isAdminOrNoc, async (req, res) => {
    const { username } = req.params;
    try {
        const tenantId = getTenantId(req);
        if (!await verifyTenantUser(username, tenantId)) {
            return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
        }

        // Ambil data pelanggan (termasuk mac_address untuk ARP)
        const [[detail]] = await db.query(
            'SELECT d.nas_id, d.connection_type, d.static_ip, d.mac_address, m.host, m.radius_secret AS nas_secret, m.auth_mode FROM customer_details d LEFT JOIN mikrotik_config m ON d.nas_id = m.id WHERE d.username = ? AND d.tenant_id = ?',
            [username, tenantId]
        );

        // === STATIC: hapus firewall block + enable Simple Queue (+ re-create ARP jika ada MAC) ===
        if (detail?.connection_type === 'static') {
            // Reset flag isolated di DB agar badge UI kembali AKTIF
            await db.query('UPDATE customer_details SET is_isolated = 0 WHERE username = ?', [username]);

            if (detail.nas_id && detail.static_ip) {
                // Hapus firewall block — cara utama buka isolir
                manageStaticFirewall(detail.nas_id, 'unblock', detail.static_ip).catch(e =>
                    console.error(`[ACTIVATE STATIC] Firewall unblock gagal:`, e.message)
                );
                // Enable Simple Queue
                manageSimpleQueue(detail.nas_id, 'enable', { target: detail.static_ip }).catch(e =>
                    console.error(`[ACTIVATE STATIC] queue enable gagal:`, e.message)
                );
                // Re-create static ARP jika MAC tersedia
                if (detail.mac_address) {
                    manageStaticArp(detail.nas_id, 'create', { ip: detail.static_ip, mac: detail.mac_address, comment: username }).catch(() => {});
                }
            }
            return res.json({
                message: `User ${username} berhasil diaktifkan kembali.`,
                note: 'Static ARP di-restore dan Simple Queue diaktifkan di MikroTik.'
            });
        }

        // === HOTSPOT: kembalikan binding ke bypassed + enable Simple Queue ===
        if (detail?.connection_type === 'hotspot') {
            await db.query('UPDATE customer_details SET is_isolated = 0 WHERE username = ?', [username]);

            if (detail.nas_id && detail.static_ip) {
                manageHotspotBinding(detail.nas_id, 'bypass', { ip: detail.static_ip, mac: detail.mac_address || undefined }).catch(e =>
                    console.error(`[ACTIVATE HOTSPOT] Bypass binding gagal:`, e.message)
                );
                manageSimpleQueue(detail.nas_id, 'enable', { target: detail.static_ip }).catch(e =>
                    console.error(`[ACTIVATE HOTSPOT] Queue enable gagal:`, e.message)
                );
            }
            return res.json({
                message: `User ${username} berhasil diaktifkan kembali.`,
                note: 'Hotspot IP Binding dikembalikan ke bypassed dan Simple Queue diaktifkan.'
            });
        }

        // === PPPoE: flow lama ===
        // 1. Hapus Auth-Type Reject
        await db.query(
            "DELETE FROM radcheck WHERE username = ? AND attribute = 'Auth-Type' AND value = 'Reject'",
            [username]
        );

        // 2. Enable PPP Secret di MikroTik (hanya mode local/null, fire-and-forget)
        if (detail?.nas_id && detail?.auth_mode !== 'radius') {
            managePppSecret(detail.nas_id, 'enable', { username }).catch(e => {
                console.error(`[ACTIVATE] Enable PPP secret gagal untuk ${username}:`, e.message);
            });
        }

        // 3. Kick + PoD — fire-and-forget (tidak block response UI)
        kickMikrotikUser(username).then(n => {
            console.log(`[ACTIVATE] RouterOS API kick ${username} = ${n} sesi`);
        }).catch(e => {
            console.error(`[ACTIVATE] RouterOS kick gagal:`, e.message);
        });

        if (detail?.host) {
            const secret = detail?.nas_secret || process.env.RADIUS_SECRET || 'Mynet@2026';
            const radclientPath = process.env.RADCLIENT_PATH || '/usr/bin/radclient';
            const podPort = process.env.RADIUS_POD_PORT || '3799';
            const safeUser = username.replace(/[^a-zA-Z0-9._@\-]/g, '');
            const cmd = `echo "User-Name = ${safeUser}" | ${radclientPath} -t 3 -r 2 ${detail.host}:${podPort} disconnect "${secret}"`;
            exec(cmd, (err) => {
                if (err) console.error(`[ACTIVATE POD] ${detail.host}:${podPort} gagal untuk ${safeUser}:`, err.message);
                else console.log(`[ACTIVATE POD] Disconnect-Request terkirim ke ${detail.host}:${podPort} untuk ${safeUser}`);
            });
        } else {
            console.warn(`[ACTIVATE] nas_id tidak ditemukan untuk ${username}, PoD tidak dikirim.`);
        }

        res.json({
            message: `User ${username} berhasil diaktifkan kembali.`,
            note: 'Reject dihapus. Pelanggan akan reconnect otomatis dalam beberapa detik.'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── STATUS BERHENTI / REAKTIVASI ─────────────────────────────────────────────

// POST /api/users/:username/stop — set pelanggan ke status berhenti
app.post('/api/users/:username/stop', authenticateToken, isAdmin, async (req, res) => {
    const { username } = req.params;
    const connection = await db.getConnection();
    try {
        const tenantId = getTenantId(req);
        if (!await verifyTenantUser(username, tenantId)) {
            connection.release();
            return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
        }
        await connection.beginTransaction();
        // Set status berhenti + catat tanggal berhenti
        await connection.query(
            "UPDATE customer_details SET status = 'berhenti', stopped_at = NOW() WHERE username = ?",
            [username]
        );
        // Ambil nas_id agar reject hanya berlaku di NAS pelanggan ini
        const [[cdStop]] = await connection.query('SELECT nas_id FROM customer_details WHERE username = ?', [username]);
        // Isolir otomatis di RADIUS — scoped by nas_id
        await connection.query(
            "INSERT INTO radcheck (username, attribute, op, value, nas_id) VALUES (?, 'Auth-Type', ':=', 'Reject', ?) ON DUPLICATE KEY UPDATE value = 'Reject'",
            [username, cdStop?.nas_id || null]
        );
        await connection.commit();
        res.json({ message: `Pelanggan ${username} telah dihentikan.` });
        // Kick session aktif via RouterOS API
        kickMikrotikUser(username).catch(e => console.error(`[STOP] RouterOS error:`, e.message));
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// POST /api/users/:username/reactivate — reaktivasi pelanggan berhenti
app.post('/api/users/:username/reactivate', authenticateToken, isAdmin, async (req, res) => {
    const { username } = req.params;
    const connection = await db.getConnection();
    try {
        const tenantId = getTenantId(req);
        if (!await verifyTenantUser(username, tenantId)) {
            connection.release();
            return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
        }
        await connection.beginTransaction();
        // Set status aktif + hapus stopped_at
        await connection.query(
            "UPDATE customer_details SET status = 'aktif', stopped_at = NULL WHERE username = ?",
            [username]
        );
        // Buka isolir
        await connection.query(
            "DELETE FROM radcheck WHERE username = ? AND attribute = 'Auth-Type' AND value = 'Reject'",
            [username]
        );
        await connection.commit();
        res.json({ message: `Pelanggan ${username} berhasil diaktifkan kembali.` });
        kickMikrotikUser(username).catch(e => console.error(`[REACTIVATE] RouterOS error:`, e.message));
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// ── JANJI BAYAR ──────────────────────────────────────────────────────────────

// POST /api/users/:username/promise — buat janji bayar (otomatis buka isolir)
app.post('/api/users/:username/promise', authenticateToken, async (req, res) => {
    const { username } = req.params;
    const { promise_date, notes, invoice_id } = req.body;
    if (!promise_date) return res.status(400).json({ error: 'Tanggal janji wajib diisi.' });
    if (new Date(promise_date) <= new Date()) return res.status(400).json({ error: 'Tanggal janji harus di masa depan.' });
    try {
        const tenantId = getTenantId(req);
        if (!await verifyTenantUser(username, tenantId)) {
            return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
        }
        // Pastikan tidak ada janji aktif lain
        const [existing] = await db.query(
            `SELECT id FROM payment_promises WHERE username = ? AND status = 'active'`, [username]
        );
        if (existing.length > 0) return res.status(400).json({ error: 'Pelanggan sudah memiliki janji bayar aktif. Batalkan dulu sebelum membuat yang baru.' });

        await db.query(
            `INSERT INTO payment_promises (username, invoice_id, promise_date, notes, created_by_id, tenant_id) VALUES (?, ?, ?, ?, ?, ?)`,
            [username, invoice_id || null, promise_date, notes || null, req.user.id || null, tenantId]
        );

        // Buka isolir otomatis
        await db.query(
            "DELETE FROM radcheck WHERE username = ? AND attribute = 'Auth-Type' AND value = 'Reject'",
            [username]
        );
        console.log(`[PROMISE] Janji bayar dibuat untuk ${username} hingga ${promise_date} oleh ${req.user.username}`);
        res.json({ message: `Janji bayar dibuat. Akses ${username} dibuka hingga ${promise_date}.` });

        // Kick background
        kickMikrotikUser(username).catch(e => console.error(`[PROMISE] RouterOS error:`, e.message));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/users/:username/promise — batalkan janji aktif (re-isolir)
app.delete('/api/users/:username/promise', authenticateToken, async (req, res) => {
    const { username } = req.params;
    try {
        const tenantId = getTenantId(req);
        if (!await verifyTenantUser(username, tenantId)) {
            return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
        }
        const [rows] = await db.query(
            `SELECT id FROM payment_promises WHERE username = ? AND status = 'active'`, [username]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Tidak ada janji aktif.' });

        await db.query(`UPDATE payment_promises SET status = 'broken' WHERE id = ?`, [rows[0].id]);
        const [[cdPromise]] = await db.query('SELECT nas_id FROM customer_details WHERE username = ?', [username]);
        await db.query(
            "INSERT INTO radcheck (username, attribute, op, value, nas_id) VALUES (?, 'Auth-Type', ':=', 'Reject', ?) ON DUPLICATE KEY UPDATE value = 'Reject'",
            [username, cdPromise?.nas_id || null]
        );
        console.log(`[PROMISE] Janji dibatalkan untuk ${username} oleh ${req.user.username}`);
        res.json({ message: `Janji bayar dibatalkan. ${username} diisolir kembali.` });

        kickMikrotikUser(username).catch(e => console.error(`[PROMISE] RouterOS kick error:`, e.message));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/users/:username/promise — ambil janji aktif
// GET /api/users/promises/active — semua janji aktif sekaligus (bulk, 1 request)
app.get('/api/users/promises/active', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query(
            `SELECT pp.*, sa.fullname as created_by_name
             FROM payment_promises pp
             LEFT JOIN system_accounts sa ON pp.created_by_id = sa.id
             JOIN customer_details cd ON pp.username = cd.username
             WHERE pp.status = 'active' AND cd.tenant_id = ?`,
            [tenantId]
        );
        // Return sebagai map: { username: promiseData }
        const map = {};
        rows.forEach(r => { map[r.username] = r; });
        res.json(map);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users/:username/promise', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!await verifyTenantUser(req.params.username, tenantId)) {
            return res.json(null);
        }
        const [rows] = await db.query(
            `SELECT pp.*, sa.fullname as created_by_name
             FROM payment_promises pp
             LEFT JOIN system_accounts sa ON pp.created_by_id = sa.id
             WHERE pp.username = ? AND pp.status = 'active'
             LIMIT 1`,
            [req.params.username]
        );
        res.json(rows[0] || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/portal/promise — janji aktif untuk pelanggan yang login
app.get('/api/portal/promise', authenticateToken, isCustomer, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, promise_date, notes, status, created_at
             FROM payment_promises WHERE username = ? AND status = 'active' LIMIT 1`,
            [req.user.username]
        );
        res.json(rows[0] || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── CRON: cek janji kadaluarsa setiap tengah malam ───────────────────────────
async function checkExpiredPromises() {
    const start = Date.now();
    console.log(`[PROMISE CRON] Memeriksa janji bayar kadaluarsa...`);
    try {
        // Ambil semua janji aktif yang tanggalnya sudah lewat
        const [expired] = await db.query(
            `SELECT pp.*, bi.status as inv_status
             FROM payment_promises pp
             LEFT JOIN billing_invoices bi ON pp.invoice_id = bi.id
             WHERE pp.status = 'active' AND pp.promise_date < CURDATE()`
        );

        let broken = 0, fulfilled = 0;
        for (const p of expired) {
            // Cek apakah semua invoice pelanggan ini sudah lunas
            const [unpaid] = await db.query(
                `SELECT COUNT(*) as cnt FROM billing_invoices WHERE username = ? AND status = 'unpaid'`,
                [p.username]
            );
            if (unpaid[0].cnt === 0) {
                // Semua sudah lunas — mark fulfilled
                await db.query(`UPDATE payment_promises SET status = 'fulfilled' WHERE id = ?`, [p.id]);
                fulfilled++;
            } else {
                // Masih ada tunggakan — re-isolir
                await db.query(`UPDATE payment_promises SET status = 'broken' WHERE id = ?`, [p.id]);
                const [[cdProm]] = await db.query('SELECT nas_id FROM customer_details WHERE username = ?', [p.username]);
                await db.query(
                    "INSERT INTO radcheck (username, attribute, op, value, nas_id) VALUES (?, 'Auth-Type', ':=', 'Reject', ?) ON DUPLICATE KEY UPDATE value = 'Reject'",
                    [p.username, cdProm?.nas_id || null]
                );
                console.log(`[PROMISE CRON] ${p.username} diisolir kembali (janji kadaluarsa ${p.promise_date})`);
                kickMikrotikUser(p.username).catch(() => {});
                broken++;
            }
        }
        console.log(`[PROMISE CRON] Selesai dalam ${Date.now() - start}ms — broken: ${broken}, fulfilled: ${fulfilled}`);
    } catch (err) {
        console.error(`[PROMISE CRON] Error:`, err.message);
    }
}

// Helper: tandai janji fulfilled jika semua invoice sudah lunas
async function checkFulfillPromise(username) {
    try {
        const [active] = await db.query(
            `SELECT id FROM payment_promises WHERE username = ? AND status = 'active' LIMIT 1`, [username]
        );
        if (active.length === 0) return;
        const [unpaid] = await db.query(
            `SELECT COUNT(*) as cnt FROM billing_invoices WHERE username = ? AND status = 'unpaid'`, [username]
        );
        if (unpaid[0].cnt === 0) {
            await db.query(`UPDATE payment_promises SET status = 'fulfilled' WHERE id = ?`, [active[0].id]);
            console.log(`[PROMISE] Janji fulfilled untuk ${username} — semua invoice lunas`);
        }
    } catch (e) { console.error(`[PROMISE] checkFulfill error:`, e.message); }
}

// Jadwalkan cek tengah malam
function scheduleMidnightCheck() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 30, 0); // 00:00:30 hari berikutnya
    const msUntilMidnight = midnight - now;
    setTimeout(() => {
        checkExpiredPromises();
        setInterval(checkExpiredPromises, 24 * 60 * 60 * 1000); // setiap 24 jam
    }, msUntilMidnight);
    console.log(`[PROMISE CRON] Dijadwalkan pada tengah malam (${Math.round(msUntilMidnight/1000/60)} menit lagi)`);
}
scheduleMidnightCheck();

// =============================================
// NOTIFICATION HELPERS
// =============================================

/**
 * Simpan notifikasi ke DB dan kirim push notification ke semua subscription aktif.
 * @param {string} recipientType - 'admin' | 'collector' | 'customer'
 * @param {string} recipientId   - username penerima (atau 'all_admins' untuk semua admin)
 * @param {string} type          - jenis notifikasi, e.g. 'payment_received'
 * @param {string} title         - judul notifikasi
 * @param {string} body          - isi notifikasi
 * @param {object} data          - data tambahan (JSON)
 */
const createNotification = async (recipientType, recipientId, type, title, body, data = {}, tenantId = null) => {
    try {
        let recipients = [];

        if (recipientId === 'all_admins') {
            const q = tenantId
                ? "SELECT username FROM system_accounts WHERE role = 'admin' AND tenant_id = ?"
                : "SELECT username FROM system_accounts WHERE role = 'admin'";
            const [admins] = await db.query(q, tenantId ? [tenantId] : []);
            recipients = admins.map(a => a.username);
        } else if (recipientId === 'all_nocs') {
            const q = tenantId
                ? "SELECT username FROM system_accounts WHERE role = 'noc' AND tenant_id = ?"
                : "SELECT username FROM system_accounts WHERE role = 'noc'";
            const [nocs] = await db.query(q, tenantId ? [tenantId] : []);
            recipients = nocs.map(n => n.username);
        } else {
            recipients = [recipientId];
        }

        for (const rid of recipients) {
            // Simpan ke DB — sertakan tenant_id untuk isolasi antar mitra
            await db.query(
                'INSERT INTO notifications (recipient_type, recipient_id, type, title, body, data, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [recipientType, rid, type, title, body, JSON.stringify(data), tenantId || null]
            );

            // Kirim browser push — sertakan tenantId agar tidak bocor ke mitra lain
            await sendPushToUser(rid, recipientType, { title, body, data: { type, ...data } }, tenantId);
        }
    } catch (err) {
        console.error('[NOTIF] createNotification error:', err.message);
    }
};

/**
 * Kirim FCM push notification ke semua FCM token aktif milik user.
 * tenantId dipakai untuk memastikan hanya subscription milik tenant yang benar yang menerima.
 */
const sendFCMToUser = async (username, payload, tenantId = null) => {
    if (!firebaseAdmin) return;
    try {
        const [rows] = await db.query(
            `SELECT fcm_token FROM push_subscriptions WHERE username = ? AND fcm_token IS NOT NULL AND fcm_token != ''${tenantId ? ' AND tenant_id = ?' : ''}`,
            tenantId ? [username, tenantId] : [username]
        );
        for (const row of rows) {
            try {
                await firebaseAdmin.messaging().send({
                    token: row.fcm_token,
                    notification: {
                        title: payload.title,
                        body: payload.body,
                    },
                    data: Object.fromEntries(
                        Object.entries(payload.data || {}).map(([k, v]) => [k, String(v)])
                    ),
                    android: {
                        priority: 'high',
                        notification: { sound: 'default', channelId: 'high_importance_channel' }
                    },
                });
                console.log('[FCM] Sent to', username);
            } catch (fcmErr) {
                const invalidCodes = ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'];
                if (invalidCodes.some(c => fcmErr.code === c)) {
                    await db.query('UPDATE push_subscriptions SET fcm_token = NULL WHERE fcm_token = ?', [row.fcm_token]);
                    console.log('[FCM] Removed invalid token for', username);
                } else {
                    console.error('[FCM] Send error for', username, fcmErr.message);
                }
            }
        }
    } catch (err) {
        console.error('[FCM] sendFCMToUser error:', err.message);
    }
};

/**
 * Kirim Web Push ke semua subscription aktif milik user tertentu.
 * tenantId dipakai untuk isolasi notifikasi antar mitra.
 */
const sendPushToUser = async (username, role, payload, tenantId = null) => {
    // Kirim FCM (mobile) paralel dengan Web Push
    sendFCMToUser(username, payload, tenantId).catch(() => {});

    if (!webpush) return;
    try {
        const [subs] = await db.query(
            `SELECT endpoint, p256dh, auth_key FROM push_subscriptions WHERE username = ? AND endpoint NOT LIKE 'fcm:%'${tenantId ? ' AND tenant_id = ?' : ''}`,
            tenantId ? [username, tenantId] : [username]
        );
        for (const sub of subs) {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
                    JSON.stringify(payload)
                );
            } catch (pushErr) {
                if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
                    await db.query('DELETE FROM push_subscriptions WHERE endpoint = ?', [sub.endpoint]);
                    console.log('[PUSH] Removed expired subscription for', username);
                }
            }
        }
    } catch (err) {
        console.error('[PUSH] sendPushToUser error:', err.message);
    }
};

// =============================================
// NOTIFICATION ENDPOINTS
// =============================================

// GET /api/notifications — ambil notifikasi untuk admin/collector yang login
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const role = req.user.role;
        const username = req.user.username;
        if (!['admin','collector','technician','noc'].includes(role)) {
            return res.status(403).json({ error: 'Akses ditolak' });
        }
        const recipientType = ['admin','noc'].includes(role) ? 'admin' : 'collector';
        const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
        const offset = parseInt(req.query.offset) || 0;
        const unreadOnly = req.query.unread === '1';

        const notifTenantId = getTenantId(req);
        let sql = `SELECT id, type, title, body, data, read_at, created_at
                   FROM notifications
                   WHERE recipient_type = ? AND recipient_id = ?
                   AND tenant_id = ?`;
        const params = [recipientType, username, notifTenantId];
        if (unreadOnly) { sql += ` AND read_at IS NULL`; }
        sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const [rows] = await db.query(sql, params);

        // Total unread count
        const [[{ unread }]] = await db.query(
            `SELECT COUNT(*) as unread FROM notifications WHERE recipient_type = ? AND recipient_id = ? AND tenant_id = ? AND read_at IS NULL`,
            [recipientType, username, notifTenantId]
        );
        res.json({ notifications: rows, unread });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/notifications/:id/read
app.post('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        await db.query(
            'UPDATE notifications SET read_at = NOW() WHERE id = ? AND recipient_id = ? AND tenant_id = ?',
            [req.params.id, req.user.username, getTenantId(req)]
        );
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/notifications/read-all
app.post('/api/notifications/read-all', authenticateToken, async (req, res) => {
    try {
        const recipientType = ['admin','noc'].includes(req.user.role) ? 'admin' : 'collector';
        const notifTenantId = getTenantId(req);
        await db.query(
            'UPDATE notifications SET read_at = NOW() WHERE recipient_type = ? AND recipient_id = ? AND tenant_id = ? AND read_at IS NULL',
            [recipientType, req.user.username, notifTenantId]
        );
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/notifications/vapid-key — public key untuk frontend subscribe
app.get('/api/notifications/vapid-key', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const [[row]] = await db.query("SELECT setting_value FROM billing_settings WHERE setting_key = 'vapid_public_key' AND tenant_id = ?", [tenantId]);
        res.json({ vapidPublicKey: row?.setting_value || null });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/push/subscribe — simpan subscription dari browser
app.post('/api/push/subscribe', authenticateToken, async (req, res) => {
    const { endpoint, keys, fcmToken } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ error: 'Data subscription tidak lengkap' });
    }
    try {
        const tenantId = getTenantId(req);
        await db.query(
            `INSERT INTO push_subscriptions (username, role, endpoint, p256dh, auth_key, fcm_token, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth_key = VALUES(auth_key), fcm_token = VALUES(fcm_token), tenant_id = VALUES(tenant_id)`,
            [req.user.username, req.user.role, endpoint, keys.p256dh, keys.auth, fcmToken || null, tenantId]
        );
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/push/subscribe — hapus subscription
app.delete('/api/push/subscribe', authenticateToken, async (req, res) => {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'endpoint diperlukan' });
    try {
        await db.query('DELETE FROM push_subscriptions WHERE username = ? AND endpoint = ?', [req.user.username, endpoint]);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/push/fcm-token — simpan FCM token untuk mobile app
app.post('/api/push/fcm-token', authenticateToken, async (req, res) => {
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ error: 'fcmToken diperlukan' });
    try {
        const tenantId = getTenantId(req);
        await db.query(
            `INSERT INTO push_subscriptions (username, role, endpoint, p256dh, auth_key, fcm_token, tenant_id)
             VALUES (?, ?, ?, '', '', ?, ?)
             ON DUPLICATE KEY UPDATE fcm_token = VALUES(fcm_token), tenant_id = VALUES(tenant_id)`,
            [req.user.username, req.user.role, 'fcm:' + req.user.username, fcmToken, tenantId]
        );
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// === Portal (Customer) Notification Endpoints ===

// GET /api/portal/notifications
app.get('/api/portal/notifications', authenticateToken, isCustomer, async (req, res) => {
    try {
        const tenantId = req.user.tenant_id || null;
        const [rows] = await db.query(
            `SELECT id, type, title, body, data, read_at, created_at
             FROM notifications
             WHERE recipient_type = 'customer' AND recipient_id = ? AND tenant_id = ?
             ORDER BY created_at DESC LIMIT 30`,
            [req.user.username, tenantId]
        );
        const unread = rows.filter(r => !r.read_at).length;
        res.json({ notifications: rows, unread });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/portal/notifications/:id/read
app.post('/api/portal/notifications/:id/read', authenticateToken, isCustomer, async (req, res) => {
    try {
        const tenantId = req.user.tenant_id || null;
        await db.query(
            "UPDATE notifications SET read_at = NOW() WHERE id = ? AND recipient_id = ? AND recipient_type = 'customer' AND tenant_id = ?",
            [req.params.id, req.user.username, tenantId]
        );
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/portal/notifications/read-all
app.post('/api/portal/notifications/read-all', authenticateToken, isCustomer, async (req, res) => {
    try {
        const tenantId = req.user.tenant_id || null;
        await db.query(
            "UPDATE notifications SET read_at = NOW() WHERE recipient_type = 'customer' AND recipient_id = ? AND tenant_id = ? AND read_at IS NULL",
            [req.user.username, tenantId]
        );
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/portal/push/subscribe
app.post('/api/portal/push/subscribe', authenticateToken, isCustomer, async (req, res) => {
    const { endpoint, keys, fcmToken } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ error: 'Data tidak lengkap' });
    try {
        const [[cd]] = await db.query('SELECT tenant_id FROM customer_details WHERE username = ?', [req.user.username]);
        const tenantId = cd?.tenant_id || null;
        await db.query(
            `INSERT INTO push_subscriptions (username, role, endpoint, p256dh, auth_key, fcm_token, tenant_id)
             VALUES (?, 'customer', ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth_key = VALUES(auth_key), fcm_token = VALUES(fcm_token), tenant_id = VALUES(tenant_id)`,
            [req.user.username, endpoint, keys.p256dh, keys.auth, fcmToken || null, tenantId]
        );
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/portal/push/fcm-token
app.post('/api/portal/push/fcm-token', authenticateToken, isCustomer, async (req, res) => {
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ error: 'fcmToken diperlukan' });
    try {
        const [[cd]] = await db.query('SELECT tenant_id FROM customer_details WHERE username = ?', [req.user.username]);
        const tenantId = cd?.tenant_id || null;
        await db.query(
            `INSERT INTO push_subscriptions (username, role, endpoint, p256dh, auth_key, fcm_token, tenant_id)
             VALUES (?, 'customer', ?, '', '', ?, ?)
             ON DUPLICATE KEY UPDATE fcm_token = VALUES(fcm_token), tenant_id = VALUES(tenant_id)`,
            [req.user.username, 'fcm:' + req.user.username, fcmToken, tenantId]
        );
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/portal/logout — hapus FCM token saat logout agar tidak salah kirim notif
app.post('/api/portal/logout', authenticateToken, isCustomer, async (req, res) => {
    try {
        await db.query(
            `UPDATE push_subscriptions SET fcm_token = NULL WHERE username = ? AND role = 'customer'`,
            [req.user.username]
        );
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET Detailed User Info + History
app.get('/api/users/:username/detail', authenticateToken, async (req, res) => {
    const { username } = req.params;
    try {
        const tenantId = getTenantId(req);
        // 1. Get Customer Info + Creator
        const [customer] = await db.query(`
            SELECT d.*, a.fullname as creator_name, p.name as package_name, p.price as package_price, t.name as territory_name
            FROM customer_details d
            LEFT JOIN system_accounts a ON d.created_by_id = a.id
            LEFT JOIN (
                SELECT username, MAX(groupname) as groupname
                FROM radusergroup
                WHERE nas_id IS NULL OR nas_id IN (SELECT id FROM mikrotik_config WHERE tenant_id = ?)
                GROUP BY username
            ) g ON d.username = g.username
            LEFT JOIN bandwidth_profiles p ON g.groupname = p.name AND p.tenant_id = d.tenant_id
            LEFT JOIN territories t ON d.territory_id = t.id
            WHERE d.username = ? AND d.tenant_id = ?
        `, [tenantId, username, tenantId]);

        if (customer.length === 0) {
            return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
        }

        // 2. Get Payment History + Payer — filter tenant agar tidak bocor lintas mitra
        const [history] = await db.query(`
            SELECT i.*, a.fullname as payer_name,
                   COALESCE(bp.price, 0) AS package_price
            FROM billing_invoices i
            LEFT JOIN system_accounts a ON i.paid_by_id = a.id
            LEFT JOIN bandwidth_profiles bp ON bp.name = i.package_name AND bp.tenant_id = ?
            WHERE i.username = ? AND i.tenant_id = ?
            ORDER BY i.period DESC, i.created_at DESC
        `, [tenantId, username, tenantId]);

        // 2b. Fetch addon line items untuk semua invoice sekaligus
        const invoiceIds = history.map(h => h.id);
        let addonsByInvoice = {};
        if (invoiceIds.length > 0) {
            const [addonRows] = await db.query(
                `SELECT invoice_id, addon_name, amount FROM billing_invoice_addons WHERE invoice_id IN (?)`,
                [invoiceIds]
            );
            addonRows.forEach(row => {
                if (!addonsByInvoice[row.invoice_id]) addonsByInvoice[row.invoice_id] = [];
                addonsByInvoice[row.invoice_id].push({ name: row.addon_name, amount: parseFloat(row.amount) });
            });
        }
        const historyWithAddons = history.map(inv => ({
            ...inv,
            addons: addonsByInvoice[inv.id] || []
        }));

        // 3. Get Package Change Logs
        const [packageLogs] = await db.query(`
            SELECT * FROM package_change_logs
            WHERE username = ? AND (tenant_id = ? OR tenant_id IS NULL)
            ORDER BY changed_at DESC
            LIMIT 50
        `, [username, tenantId]);

        res.json({
            info: customer[0],
            history: historyWithAddons,
            package_logs: packageLogs
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET All Users (Extended with Details)
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);

        const query = `
            SELECT
                d.username,
                c.value as password,
                g.groupname,
                d.customer_id,
                d.fullname,
                d.phone,
                d.address,
                d.identity_number,
                d.due_date_day,
                d.auto_suspend,
                d.nas_id,
                d.pop,
                d.odp,
                d.territory_id,
                d.territory_area_id,
                d.latitude,
                d.longitude,
                d.status,
                d.stopped_at,
                d.billing_type,
                d.connection_type,
                t.name as territory_name,
                COALESCE(ta.dusun_nama, ta_single.dusun_nama) as territory_dusun,
                d.created_by_id,
                d.discount,
                d.discount_note,
                sa.fullname as creator_name,
                CASE WHEN d.connection_type = 'static' THEN d.is_isolated ELSE EXISTS (SELECT 1 FROM radcheck rc_susp WHERE rc_susp.username = d.username AND rc_susp.attribute = 'Auth-Type' AND rc_susp.value = 'Reject') END as is_suspended,
                EXISTS (SELECT 1 FROM ppp_active_cache pac WHERE pac.username = d.username AND pac.tenant_id = d.tenant_id) as is_online,
                EXISTS (SELECT 1 FROM billing_invoices bi WHERE bi.username = d.username AND bi.period = DATE_FORMAT(NOW(), '%Y-%m') AND bi.status = 'paid') as is_paid,
                EXISTS (SELECT 1 FROM ont_removal_tasks ont WHERE ont.username = d.username AND ont.status = 'pending') as has_ont_task,
                COALESCE(d.static_ip, rr.value) as static_ip,
                d.created_at,
                d.original_install_date,
                il.install_date
            FROM customer_details d
            LEFT JOIN (
                SELECT username, MAX(value) as value
                FROM radcheck
                WHERE attribute = 'Cleartext-Password'
                GROUP BY username
            ) c ON c.username = d.username
            LEFT JOIN (
                SELECT username, MAX(groupname) as groupname
                FROM radusergroup
                WHERE nas_id IS NULL OR nas_id IN (SELECT id FROM mikrotik_config WHERE tenant_id = ?)
                GROUP BY username
            ) g ON d.username = g.username
            LEFT JOIN territories t ON d.territory_id = t.id AND t.tenant_id = ?
            LEFT JOIN territory_areas ta ON d.territory_area_id = ta.id
            LEFT JOIN (
                SELECT territory_id, MIN(dusun_nama) as dusun_nama
                FROM territory_areas
                WHERE dusun_nama IS NOT NULL AND dusun_nama != ''
                GROUP BY territory_id
                HAVING COUNT(*) = 1
            ) ta_single ON ta_single.territory_id = d.territory_id AND ta.id IS NULL
            LEFT JOIN system_accounts sa ON d.created_by_id = sa.id AND sa.tenant_id = ?
            LEFT JOIN (
                SELECT username, MIN(install_date) as install_date
                FROM installation_logs
                WHERE tenant_id = ?
                GROUP BY username
            ) il ON d.username = il.username
            LEFT JOIN (
                SELECT username, MAX(value) as value
                FROM radreply
                WHERE attribute = 'Framed-IP-Address'
                GROUP BY username
            ) rr ON d.username = rr.username
            WHERE d.tenant_id = ?
            ORDER BY d.created_at DESC, d.username ASC
        `;
        let finalQuery = query;
        const params = [tenantId, tenantId, tenantId, tenantId, tenantId]; // +1 untuk radusergroup subquery WHERE tenant_id

        if (req.user.role === 'collector') {
            finalQuery = query.replace(
                'WHERE d.tenant_id',
                `WHERE (
                    t.collector_id = ?
                    OR d.territory_id IN (SELECT DISTINCT territory_id FROM territory_areas WHERE collector_id = ? AND tenant_id = ?)
                ) AND d.tenant_id`
            );
            params.push(req.user.id, req.user.id, tenantId);
        }

        // Hitung jumlah pelanggan berhenti
        const [[{ stopped_count }]] = await db.query(
            'SELECT COUNT(*) as stopped_count FROM customer_details WHERE status = "berhenti" AND tenant_id = ?',
            [tenantId]
        );

        const [rows] = await db.query(finalQuery, params);
        // Sembunyikan password PPPoE untuk role selain admin — hanya admin yang boleh lihat
        const isAdminRole = req.user.role === 'admin' || req.user.is_super_admin;
        const users = isAdminRole ? rows : rows.map(r => ({ ...r, password: null }));
        res.json({ users, stopped_count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper: normalisasi nomor HP Indonesia → selalu simpan format 08xxx
const normalizePhone = (phone) => {
    if (!phone) return phone;
    const p = String(phone).trim().replace(/[\s\-().]/g, '');
    if (p.startsWith('+628')) return '0' + p.slice(2);   // +628xx → 08xx
    if (p.startsWith('628'))  return '0' + p.slice(2);   // 628xx  → 08xx
    return p;
};

// Helper function to generate next Customer ID per tenant.
// Sequence per-tenant — CPID-0001 bisa ada di banyak mitra (dibedakan oleh tenant_id).
// Gunakan koneksi TERPISAH yang auto-commit agar sequence tidak di-rollback jika transaksi gagal.
const generateCustomerID = async (tenantId) => {
    const seqConn = await db.getConnection();
    try {
        await seqConn.beginTransaction();
        // Insert row untuk tenant ini jika belum ada, lalu increment
        await seqConn.query(
            'INSERT INTO cpid_sequence (tenant_id, `last_value`) VALUES (?, 1) ON DUPLICATE KEY UPDATE `last_value` = `last_value` + 1',
            [tenantId]
        );
        const [[row]] = await seqConn.query('SELECT `last_value` FROM cpid_sequence WHERE tenant_id = ?', [tenantId]);
        await seqConn.commit();
        const nextNumber = row.last_value;
        const minDigits = nextNumber < 10000 ? 4 : String(nextNumber).length;
        return `CPID-${String(nextNumber).padStart(minDigits, '0')}`;
    } catch (err) {
        await seqConn.rollback();
        throw err;
    } finally {
        seqConn.release();
    }
};

// POST Create User
app.post('/api/users', authenticateToken, async (req, res) => {
    let username = req.body.username;
    const { password, groupname, staticIp, fullname, address, identity_number, due_date_day, nas_id, pop, odp, territory_id, territory_area_id, install_date, ktp_photo, latitude, longitude } = req.body;
    const macAddress = req.body.macAddress || req.body.mac_address || null;
    const discount = parseInt(req.body.discount || '0', 10) || 0;
    const discount_note = req.body.discount_note || null;
    const phone = normalizePhone(req.body.phone);
    const tenantId = getTenantId(req);
    const connectionType = ['static','hotspot'].includes(req.body.connection_type) ? req.body.connection_type : 'pppoe';
    const isStatic = connectionType === 'static';
    const isHotspot = connectionType === 'hotspot';

    if (!isStatic && !isHotspot && (!username || !password)) {
        return res.status(400).json({ error: 'Username dan password wajib diisi untuk pelanggan PPPoE' });
    }
    if ((isStatic || isHotspot) && !staticIp) {
        return res.status(400).json({ error: 'IP Address wajib diisi untuk pelanggan Static/Hotspot' });
    }
    if (!username) {
        return res.status(400).json({ error: 'Username wajib diisi' });
    }
    username = username.trim();

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Cek username duplikat di customer_details
        // Username boleh sama antar mitra JIKA NAS (router) berbeda — RADIUS membedakan via NAS-IP-Address
        const [[cdExist]] = await connection.query(
            "SELECT username, fullname, tenant_id, nas_id FROM customer_details WHERE username = ?", [username]);
        if (cdExist?.username) {
            const nasSama = !nas_id || !cdExist.nas_id || Number(cdExist.nas_id) === Number(nas_id);
            if (nasSama) {
                // NAS sama atau salah satu tidak punya NAS → blokir (RADIUS akan konflik)
                if (cdExist.tenant_id === tenantId) {
                    throw new Error(`Username "${username}" sudah terdaftar atas nama ${cdExist.fullname}.`);
                } else {
                    throw new Error(`Username "${username}" sudah digunakan di NAS yang sama. Gunakan username yang berbeda.`);
                }
            }
            // NAS berbeda → izinkan, RADIUS membedakan via NAS-IP-Address
            console.log(`[PSB] Username "${username}" ada di NAS ${cdExist.nas_id} (tenant ${cdExist.tenant_id}), registrasi baru di NAS ${nas_id} (tenant ${tenantId}) — diizinkan multi-NAS`);
        }

        if (!isStatic) {
            // Cek orphan di radcheck: username ada di radcheck tapi TIDAK ada customer_details untuk NAS yang sama
            const [existing] = await connection.query(
                "SELECT rc.username FROM radcheck rc " +
                "LEFT JOIN customer_details cd ON cd.username = rc.username " +
                "WHERE rc.username = ? AND rc.attribute = 'Cleartext-Password' " +
                "AND (cd.username IS NULL OR (cd.nas_id IS NOT NULL AND cd.nas_id = ?))",
                [username, nas_id || 0]
            );
            if (existing.length > 0) {
                const [[cdCheck]] = await connection.query(
                    "SELECT username, fullname, tenant_id, nas_id FROM customer_details WHERE username = ? AND (nas_id = ? OR nas_id IS NULL)",
                    [username, nas_id || 0]);
                if (!cdCheck) {
                    // True orphan (ada di radcheck tapi tidak ada di customer_details untuk NAS ini) → bersihkan
                    console.log(`[PSB] Username "${username}" orphaned untuk NAS ${nas_id}, otomatis dibersihkan sebelum registrasi baru`);
                    // Hapus hanya entri radcheck untuk NAS ini (jika ada entri NAS lain, biarkan)
                    if (!cdExist) {
                        // Tidak ada customer sama sekali → hapus semua
                        await connection.query('DELETE FROM radcheck WHERE username = ?', [username]);
                        await connection.query('DELETE FROM radreply WHERE username = ?', [username]);
                        await connection.query('DELETE FROM radusergroup WHERE username = ?', [username]);
                        await connection.query('DELETE FROM customer_details WHERE username = ?', [username]);
                        await connection.query('DELETE FROM invoices WHERE username = ?', [username]);
                    }
                } else {
                    // Ada customer di NAS yang sama → blokir
                    if (cdCheck.tenant_id === tenantId) {
                        throw new Error(`Username "${username}" sudah terdaftar atas nama ${cdCheck.fullname}. Gunakan username yang berbeda.`);
                    } else {
                        throw new Error(`Username "${username}" sudah digunakan di NAS yang sama. Gunakan username yang berbeda.`);
                    }
                }
            }
        }

        // 1a. Check if NIK already exists (scoped to tenant to avoid leaking data antar mitra)
        if (identity_number) {
            const [existingNik] = await connection.query("SELECT username, fullname FROM customer_details WHERE identity_number = ? AND tenant_id = ?", [identity_number, tenantId]);
            if (existingNik.length > 0) {
                throw new Error(`Nomor KTP (NIK) sudah terdaftar atas nama ${existingNik[0].fullname}`);
            }
        }

        // 1b. Cleanup orphaned entries
        if (!isStatic) {
            await connection.query('DELETE FROM radcheck WHERE username = ? AND attribute != \'Cleartext-Password\'', [username]);
            await connection.query('DELETE FROM radreply WHERE username = ?', [username]);
            await connection.query('DELETE FROM radusergroup WHERE username = ?', [username]);
        }
        await connection.query('DELETE FROM customer_details WHERE username = ?', [username]);

        // 1c. Generate Customer ID
        const customerID = await generateCustomerID(tenantId);

        if (!isStatic) {
            // 2. Insert into radcheck (Auth) — PPPoE only
            await connection.query(
                'INSERT INTO radcheck (username, attribute, op, value, nas_id) VALUES (?, "Cleartext-Password", ":=", ?, ?)',
                [username, password, nas_id || null]
            );

            // 3. Insert into radreply (Static IP for PPPoE)
            if (staticIp) {
                await connection.query(
                    'INSERT INTO radreply (username, attribute, op, value, nas_id) VALUES (?, "Framed-IP-Address", "=", ?, ?)',
                    [username, staticIp, nas_id || null]
                );
            }
        }

        // 4. Insert into radusergroup (PPPoE & Static — untuk tracking paket & bandwidth)
        if (groupname) {
            await connection.query(
                'INSERT INTO radusergroup (username, groupname, priority, nas_id) VALUES (?, ?, 1, ?)',
                [username, groupname, nas_id || null]
            );
        }

        // 5. Insert into customer_details (NEW)
        const defaultPinHash = await bcrypt.hash('123456', 10);
        // Use install_date as created_at for migrated customers (so they don't count as new this month)
        const installDateVal = install_date ? new Date(install_date) : null;
        const isValidInstallDate = installDateVal && !isNaN(installDateVal.getTime());
        const billingType = req.body.billing_type === 'postpaid' ? 'postpaid' : 'prepaid';
        if (isValidInstallDate) {
            await connection.query(
                'INSERT INTO customer_details (username, customer_id, fullname, phone, address, identity_number, due_date_day, nas_id, pop, odp, static_ip, mac_address, territory_id, territory_area_id, created_by_id, pin_hash, pin_is_default, ktp_photo, latitude, longitude, created_at, tenant_id, connection_type, discount, discount_note, billing_type, original_install_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [username, customerID, fullname || '', phone || '', address || '', identity_number || '', due_date_day || '5', nas_id || null, pop || '', odp || '', staticIp || null, macAddress || null, territory_id || null, territory_area_id || null, req.user.id || null, defaultPinHash, ktp_photo || null, latitude || null, longitude || null, installDateVal, tenantId, connectionType, discount, discount_note, billingType, installDateVal]
            );
        } else {
            await connection.query(
                'INSERT INTO customer_details (username, customer_id, fullname, phone, address, identity_number, due_date_day, nas_id, pop, odp, static_ip, mac_address, territory_id, territory_area_id, created_by_id, pin_hash, pin_is_default, ktp_photo, latitude, longitude, tenant_id, connection_type, discount, discount_note, billing_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)',
                [username, customerID, fullname || '', phone || '', address || '', identity_number || '', due_date_day || '5', nas_id || null, pop || '', odp || '', staticIp || null, macAddress || null, territory_id || null, territory_area_id || null, req.user.id || null, defaultPinHash, ktp_photo || null, latitude || null, longitude || null, tenantId, connectionType, discount, discount_note, billingType]
            );
        }

        // 6. Auto-Invoice (Paid Baseline for current month)
        // Selalu buat invoice bulan ini sebagai paid agar tidak kena cron auto-suspend.
        // Untuk migrasi: created_at di customer_details sudah diset ke tanggal lama
        // sehingga tidak dihitung sebagai revenue baru — tapi tetap perlu invoice paid
        // supaya cron tidak isolir mereka.
        const currentPeriod = getLocalPeriod();
        const installPeriod = isValidInstallDate ? getLocalPeriod(installDateVal) : currentPeriod;
        const isMigration = isValidInstallDate && installPeriod !== currentPeriod;

        let price = 0;
        if (groupname) {
            const [profiles] = await connection.query('SELECT price FROM bandwidth_profiles WHERE name = ?', [groupname]);
            if (profiles.length > 0) {
                price = profiles[0].price;
            }
        }

        const invoiceAmount = Math.max(0, price - discount);

        const psbTenantId = getTenantId(req);
        if (isMigration) {
            // Migrasi: buat invoice unpaid bulan ini agar tidak langsung kena isolir
            const [existingInvoice] = await connection.query(
                'SELECT id FROM billing_invoices WHERE username = ? AND period = ?',
                [username, currentPeriod]
            );
            if (existingInvoice.length === 0) {
                await connection.query(
                    'INSERT INTO billing_invoices (username, period, package_name, amount, discount, status, tenant_id) VALUES (?, ?, ?, ?, ?, "unpaid", ?)',
                    [username, currentPeriod, groupname || null, invoiceAmount, discount, psbTenantId]
                );
            }
        } else if (billingType === 'prepaid') {
            // Prabayar: invoice bulan ini langsung PAID → masuk omzet
            const [existingInvoice] = await connection.query(
                'SELECT id FROM billing_invoices WHERE username = ? AND period = ?',
                [username, currentPeriod]
            );
            if (existingInvoice.length === 0) {
                await connection.query(
                    'INSERT INTO billing_invoices (username, period, package_name, amount, discount, status, payment_method, paid_at, tenant_id) VALUES (?, ?, ?, ?, ?, "paid", "cash", NOW(), ?)',
                    [username, currentPeriod, groupname || null, invoiceAmount, discount, psbTenantId]
                );
            }
        } else {
            // Pascabayar: tidak generate invoice saat PSB.
            // Cron bulan depan akan generate invoice bulan ini (tagihan atas pemakaian bulan ini).
        }

        // 7. Insert installation log (audit permanen)
        const installLogDate = isValidInstallDate ? getLocalDate(installDateVal) : getLocalDate();
        const [staffRow] = await connection.query('SELECT fullname, username FROM system_accounts WHERE id = ?', [req.user.id]);
        const installerName = staffRow[0]?.fullname || staffRow[0]?.username || 'Unknown';
        let territoryName = '';
        if (territory_area_id) {
            const [taRow] = await connection.query('SELECT dusun_nama FROM territory_areas WHERE id = ?', [territory_area_id]);
            territoryName = taRow[0]?.dusun_nama || '';
        }
        if (!territoryName && territory_id) {
            const [tRow] = await connection.query('SELECT name FROM territories WHERE id = ?', [territory_id]);
            territoryName = tRow[0]?.name || '';
        }
        await connection.query(
            `INSERT INTO installation_logs (username, customer_id, fullname, phone, address, identity_number,
             groupname, territory_name, installed_by_id, installed_by_name, install_date, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [username, customerID, fullname || '', phone || '', address || '', identity_number || '',
             groupname || '', territoryName, req.user.id, installerName, installLogDate, getTenantId(req)]
        );

        // 7b. Assign PSB addons jika ada
        const psb_addons = req.body.psb_addons;
        if (Array.isArray(psb_addons) && psb_addons.length > 0) {
            const startDate = installLogDate;
            for (const addon of psb_addons) {
                if (!addon.addon_type_id) continue;
                await connection.query(
                    'INSERT INTO customer_addons (username, addon_type_id, price_override, start_date, tenant_id, created_by_id) VALUES (?, ?, ?, ?, ?, ?)',
                    [username, addon.addon_type_id, addon.price_override ?? null, startDate, getTenantId(req), req.user.id]
                );
            }
        }

        await connection.commit();
        const autoInvoiceStatus = isMigration ? 'migration_unpaid' : billingType === 'prepaid' ? 'prepaid_paid' : 'postpaid_next_month';
        res.status(201).json({ message: 'Pelanggan berhasil ditambahkan', username, customer_id: customerID, connection_type: connectionType, auto_invoice: autoInvoiceStatus, is_migration: isMigration });

        // 8. Buat Simple Queue + MikroTik entries untuk pelanggan Static / Hotspot (background)
        if ((isStatic || isHotspot) && nas_id && staticIp) {
            try {
                let rateLimit = '10M/10M';
                if (groupname) {
                    const [[bp]] = await db.query('SELECT rate_limit FROM bandwidth_profiles WHERE name = ?', [groupname]);
                    if (bp?.rate_limit) rateLimit = bp.rate_limit;
                }
                await manageSimpleQueue(nas_id, 'create', {
                    name: fullname || username,
                    target: staticIp,
                    maxLimit: rateLimit,
                    comment: `${customerID} | ${username}`
                });
                console.log(`[QUEUE] Created simple queue for ${username} (${staticIp}) on NAS ${nas_id}`);
            } catch (qErr) {
                console.error(`[QUEUE] Failed to create simple queue for ${username}:`, qErr.message);
            }
            // Hotspot IP Binding — bypass agar pelanggan bisa akses internet
            if (isHotspot) {
                manageHotspotBinding(nas_id, 'bypass', {
                    ip: staticIp,
                    mac: macAddress || undefined,
                    comment: `${customerID} | ${username}`
                }).catch(hErr => {
                    console.error(`[HOTSPOT] Failed to create binding for ${username}:`, hErr.message);
                });
            }
            // Buat static ARP entry (jika MAC address tersedia)
            if (macAddress) {
                manageStaticArp(nas_id, 'create', {
                    ip: staticIp,
                    mac: macAddress,
                    comment: `${customerID} | ${username}`
                }).catch(arpErr => {
                    console.error(`[ARP] Failed to create static ARP for ${username}:`, arpErr.message);
                });
            }
        }

        // 9. Buat PPP Secret di MikroTik untuk pelanggan PPPoE (fire-and-forget, best-effort)
        // Mode local/null → selalu buat secret (enabled).
        // Mode radius     → hanya buat jika admin centang checkbox "Buat PPP Secret" (create_ppp_secret=true), dibuat disabled.
        const wantPppSecret = req.body.create_ppp_secret === true || req.body.create_ppp_secret === 'true';
        if (!isStatic && !isHotspot && nas_id) {
            db.query('SELECT auth_mode FROM mikrotik_config WHERE id = ?', [nas_id]).then(([[mc]]) => {
                const routerAuthMode = mc?.auth_mode || null;
                const isRadiusRouter = routerAuthMode === 'radius';
                // RADIUS mode: buat hanya jika admin minta (checkbox dicentang)
                if (isRadiusRouter && !wantPppSecret) {
                    console.log(`[PPP_SECRET] Skip create secret for "${username}" — router mode RADIUS, checkbox tidak dicentang`);
                    return;
                }
                const createDisabled = isRadiusRouter; // RADIUS → disabled, Local/null → enabled
                getMikrotikProfile(groupname, nas_id).then(mtProfile =>
                    managePppSecret(nas_id, 'create', { username, password, profile: mtProfile, disabled: createDisabled })
                ).then(() => {
                    console.log(`[PPP_SECRET] Created secret for "${username}" (disabled=${createDisabled}, mode=${routerAuthMode || 'local'})`);
                }).catch(sErr => {
                    console.error(`[PPP_SECRET] Failed to create secret for ${username}:`, sErr.message);
                });
            }).catch(() => {
                // Fallback: buat enabled jika tidak bisa cek auth_mode
                getMikrotikProfile(groupname, nas_id).then(mtProfile =>
                    managePppSecret(nas_id, 'create', { username, password, profile: mtProfile })
                ).catch(sErr => {
                    console.error(`[PPP_SECRET] Failed to create secret for ${username}:`, sErr.message);
                });
            });
        }

        // Notifikasi kolektor jika pelanggan di-assign ke wilayahnya (background)
        if (territory_area_id) {
            try {
                const [[area]] = await db.query(
                    'SELECT dusun_nama, collector_id FROM territory_areas WHERE id = ?',
                    [territory_area_id]
                );
                if (area?.collector_id) {
                    const [[collector]] = await db.query(
                        'SELECT username FROM system_accounts WHERE id = ?',
                        [area.collector_id]
                    );
                    if (collector?.username) {
                        const installerLabel = req.user.fullname || req.user.username;
                        createNotification('collector', collector.username, 'new_customer_assigned',
                            `👤 Pelanggan Baru di Wilayahmu`,
                            `${fullname || username} (${customerID}) ditambahkan di ${area.dusun_nama} oleh ${installerLabel}`,
                            { customer_username: username, customer_id: customerID, dusun: area.dusun_nama }, tenantId
                        ).catch(() => {});
                    }
                }
            } catch (_) {}
        }
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// POST Bulk Import Users
app.post('/api/users/import', authenticateToken, isAdmin, async (req, res) => {
    const { users } = req.body; // Expect array of user objects
    if (!users || !Array.isArray(users)) {
        return res.status(400).json({ error: 'Data users (array) diperlukan' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Get profiles for price lookup (scoped ke tenant)
        const tenantIdImport = getTenantId(req);
        const [profiles] = await connection.query('SELECT name, price FROM bandwidth_profiles WHERE tenant_id = ?', [tenantIdImport]);
        const profilePrices = {};
        profiles.forEach(p => profilePrices[p.name] = p.price);

        // 1b. Build dusun lookup: dusun_nama (lowercase) → { id, territory_id }
        // Memungkinkan kolom CSV pakai nama dusun, tidak perlu ID manual
        const [allAreas] = await connection.query('SELECT id, territory_id, dusun_nama FROM territory_areas WHERE tenant_id = ?', [tenantIdImport]);
        const dusunLookup = {};
        allAreas.forEach(a => {
            if (a.dusun_nama) dusunLookup[a.dusun_nama.toLowerCase().trim()] = a;
        });
        const dusunKeysAvailable = Object.keys(dusunLookup);

        // 1c. Build NAS/router lookup: nama/host → id
        // Memungkinkan kolom CSV pakai nama router (misal "Router Utama" atau "192.168.1.1"), tidak perlu ID
        const [allNas] = await connection.query('SELECT id, name, host FROM mikrotik_config WHERE tenant_id = ?', [tenantIdImport]);
        const nasLookup = {};
        allNas.forEach(n => {
            if (n.name) nasLookup[n.name.toLowerCase().trim()] = n.id;
            if (n.host) nasLookup[n.host.toLowerCase().trim()] = n.id;
        });

        const currentPeriod = getLocalPeriod(); // YYYY-MM
        let successCount = 0;
        let updatedCount = 0;
        const bulkDefaultPinHash = await bcrypt.hash('123456', 10);

        const errors = [];
        const debugDusun = []; // untuk debug assignment dusun
        const debugImport = []; // untuk debug status tiap user saat import

        // Parse install_date — support YYYY-MM-DD, DD-Mon-YY, DD-Mon-YYYY (bulan Indonesia/Inggris)
        const parseInstallDate = (raw) => {
            if (!raw) return null;
            const s = String(raw).trim();
            if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s);
            const idMonths = { jan:0,feb:1,mar:2,apr:3,mei:4,jun:5,jul:6,agu:7,agt:7,sep:8,okt:9,nov:10,des:11,
                               may:4,aug:7,oct:9,dec:11 };
            const m = s.match(/^(\d{1,2})[-\/]([a-zA-Z]{2,4})[-\/](\d{2,4})$/);
            if (m) {
                const day = parseInt(m[1]);
                const mon = idMonths[m[2].toLowerCase()];
                let year = parseInt(m[3]);
                if (year < 100) year += 2000;
                if (mon === undefined) return null;
                return new Date(year, mon, day);
            }
            return new Date(s);
        };

        for (const user of users) {
            let username = user.username;
            const { password, groupname, fullname, address,
                    due_date_day, identity_number,
                    nas_id, pop, odp, install_date, latitude, longitude } = user;
            const staticIp = user.static_ip || user.staticIp || null;
            const macAddress = user.mac_address || user.macAddress || null;
            // Auto-detect connection_type:
            // 1. Jika kolom connection_type diisi 'static' → static
            // 2. Jika connection_type kosong/tidak ada + ada static_ip + tidak ada password → auto static
            // 3. Jika connection_type kosong/tidak ada + ada static_ip + ada password → warning, tetap pppoe
            // 4. Lainnya → pppoe
            let importConnectionType;
            if (user.connection_type === 'static' || user.connection_type === 'hotspot') {
                importConnectionType = user.connection_type;
            } else if (!user.connection_type && staticIp && !password) {
                // Auto-detect: tidak ada connection_type, ada static_ip, tidak ada password → pasti static
                importConnectionType = 'static';
                errors.push(`${username}: auto-detect sebagai tipe static (connection_type kosong, ada static_ip, tidak ada password) — disarankan isi kolom connection_type="static" di template`);
            } else {
                importConnectionType = 'pppoe';
            }
            const isStaticImport = importConnectionType === 'static';
            const isHotspotImport = importConnectionType === 'hotspot';
            const userDiscount = parseInt(user.discount || '0', 10) || 0;
            const userDiscountNote = user.discount_note || null;
            const billingType = ['prepaid', 'postpaid'].includes(user.billing_type) ? user.billing_type : 'prepaid';

            // Resolve territory: bisa pakai territory_area_id (angka) atau dusun_nama (teks)
            let territory_area_id = user.territory_area_id ? parseInt(user.territory_area_id) : null;
            let territory_id = user.territory_id ? parseInt(user.territory_id) : null;
            if (!territory_area_id && user.dusun) {
                const found = dusunLookup[user.dusun.toLowerCase().trim()];
                if (found) {
                    territory_area_id = found.id;
                    territory_id = found.territory_id;
                    debugDusun.push(`${username}: dusun "${user.dusun}" → area_id=${found.id}, territory_id=${found.territory_id}`);
                } else {
                    debugDusun.push(`${username}: dusun "${user.dusun}" TIDAK DITEMUKAN. Tersedia: [${dusunKeysAvailable.join(', ')}]`);
                }
            } else if (!territory_area_id && !user.dusun) {
                debugDusun.push(`${username}: kolom dusun kosong/tidak ada di CSV`);
            }
            // Resolve nas_id: bisa pakai angka ID, nama router, atau IP host
            let resolvedNasId = nas_id ? parseInt(nas_id) : null;
            if (!resolvedNasId && user.nas_name) {
                resolvedNasId = nasLookup[user.nas_name.toLowerCase().trim()] || null;
            }
            if (!resolvedNasId && nas_id && isNaN(parseInt(nas_id))) {
                // nas_id diisi teks (nama/IP) bukan angka
                resolvedNasId = nasLookup[nas_id.toLowerCase().trim()] || null;
            }

            const phone = normalizePhone(user.phone);
            // Hard required: username wajib; PPPoE juga butuh password; Static butuh static_ip
            if (!username) {
                errors.push(`(tanpa username): dilewati — kolom username kosong`);
                continue;
            }
            if (!isStaticImport && !password) {
                errors.push(`${username}: dilewati — password kosong (PPPoE wajib isi password)`);
                continue;
            }
            if (isStaticImport && !staticIp) {
                errors.push(`${username}: dilewati — static_ip kosong (tipe static wajib isi IP address)`);
                continue;
            }
            username = username.trim();
            // Soft warning: groupname kosong = tetap diimpor, tapi tidak ada paket
            if (!groupname) {
                errors.push(`${username}: diimpor tanpa paket — kolom groupname kosong, assign paket manual setelah ini`);
            }

            // Check if exists — cek customer_details langsung (bukan via JOIN radcheck, agar tidak gagal
            // jika radcheck entry hilang/kosong tapi customer_details sudah ada)
            // tenant_id IS NULL = data lama sebelum multi-tenant, dianggap milik tenant ini
            const [existingOwner] = await connection.query(
                "SELECT username, tenant_id, nas_id FROM customer_details WHERE username = ? AND (tenant_id = ? OR tenant_id IS NULL)",
                [username, tenantIdImport]
            );
            // Cek apakah username sudah dipakai tenant LAIN (bukan NULL) dengan NAS yang sama
            // (NAS berbeda → boleh, RADIUS bedakan via NAS-IP-Address)
            const [existingOther] = await connection.query(
                "SELECT tenant_id, nas_id FROM customer_details WHERE username = ? AND tenant_id IS NOT NULL AND tenant_id != ?",
                [username, tenantIdImport]
            );
            if (existingOther.length > 0) {
                const nasSama = !resolvedNasId || !existingOther[0].nas_id || Number(existingOther[0].nas_id) === Number(resolvedNasId);
                if (nasSama) {
                    errors.push(`${username}: dilewati — username sudah dipakai tenant lain dengan NAS yang sama`);
                    continue;
                }
                // NAS berbeda → lanjutkan sebagai data baru
            }
            debugImport.push(`${username}: existingOwner=${existingOwner.length}, existingOther=${existingOther.length}, groupname="${groupname||''}", resolvedNasId=${resolvedNasId||null}`);
            if (existingOwner.length > 0) {
                // Build dynamic UPDATE — hanya update kolom yang ada nilainya di CSV, wajib filter tenant_id
                const updateFields = [];
                const updateVals = [];
                if (due_date_day)      { updateFields.push('due_date_day = ?');      updateVals.push(due_date_day); }
                if (resolvedNasId)     { updateFields.push('nas_id = ?');            updateVals.push(resolvedNasId); }
                if (pop !== undefined && pop !== '') { updateFields.push('pop = ?'); updateVals.push(pop); }
                if (odp !== undefined && odp !== '') { updateFields.push('odp = ?'); updateVals.push(odp); }
                if (staticIp)          { updateFields.push('static_ip = ?');         updateVals.push(staticIp); }
                if (importConnectionType) { updateFields.push('connection_type = ?'); updateVals.push(importConnectionType); }
                if (user.phone)        { updateFields.push('phone = ?');             updateVals.push(normalizePhone(user.phone)); }
                if (fullname)          { updateFields.push('fullname = ?');          updateVals.push(fullname); }
                if (address)           { updateFields.push('address = ?');           updateVals.push(address); }
                if (territory_area_id) { updateFields.push('territory_area_id = ?'); updateVals.push(territory_area_id); }
                if (territory_id)      { updateFields.push('territory_id = ?');      updateVals.push(territory_id); }
                if (user.billing_type) { updateFields.push('billing_type = ?');      updateVals.push(billingType); }
                if (install_date) {
                    const parsedDate = parseInstallDate(install_date);
                    if (parsedDate && !isNaN(parsedDate.getTime())) {
                        updateFields.push('created_at = ?');
                        updateVals.push(parsedDate);
                    }
                }

                // Selalu update tenant_id supaya user lama (tenant_id NULL) ikut ter-normalisasi
                updateFields.push('tenant_id = ?');
                updateVals.push(tenantIdImport);

                await connection.query(
                    `UPDATE customer_details SET ${updateFields.join(', ')} WHERE username = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
                    [...updateVals, username, tenantIdImport]
                );
                // Update groupname jika diisi — scoped by nas_id supaya tidak affect tenant lain
                if (groupname) {
                    await connection.query('DELETE FROM radusergroup WHERE username = ? AND (nas_id = ? OR (nas_id IS NULL AND ? IS NULL))', [username, resolvedNasId || null, resolvedNasId || null]);
                    await connection.query('INSERT INTO radusergroup (username, groupname, priority, nas_id) VALUES (?, ?, 1, ?)', [username, groupname, resolvedNasId || null]);
                }
                // Update static IP di radreply jika diisi
                if (staticIp) {
                    await connection.query(
                        'INSERT INTO radreply (username, attribute, op, value, nas_id) VALUES (?, "Framed-IP-Address", "=", ?, ?) ON DUPLICATE KEY UPDATE value = ?',
                        [username, staticIp, resolvedNasId || null, staticIp]
                    );
                }
                updatedCount++;
                continue;
            }

            // Check NIK duplikat (hanya jika NIK diisi) — scoped ke tenant agar tidak bocor antar mitra
            let effectiveNik = identity_number || '';
            if (effectiveNik.trim()) {
                const [nikConflict] = await connection.query(
                    'SELECT username, fullname FROM customer_details WHERE identity_number = ? AND tenant_id = ?',
                    [effectiveNik.trim(), tenantIdImport]
                );
                if (nikConflict.length > 0) {
                    errors.push(`${username}: NIK ${effectiveNik} sudah dipakai oleh ${nikConflict[0].fullname} (${nikConflict[0].username}) — NIK dikosongkan, perbaiki manual`);
                    effectiveNik = '';
                }
            }

            // Parse install_date for migration
            const installDateVal = parseInstallDate(install_date);
            const isValidInstallDate = installDateVal && !isNaN(installDateVal.getTime());
            const installPeriod = isValidInstallDate ? getLocalPeriod(installDateVal) : currentPeriod;
            const isMigration = isValidInstallDate && installPeriod !== currentPeriod;

            // Generate ID
            const customerID = await generateCustomerID(tenantIdImport);

            // Insert Radius — hanya untuk PPPoE (static tidak pakai RADIUS)
            if (!isStaticImport) {
                // Cek dulu apakah radcheck sudah ada (cegah duplikat jika import diulang)
                const [[existingRc]] = await connection.query(
                    "SELECT id FROM radcheck WHERE username = ? AND attribute = 'Cleartext-Password' LIMIT 1",
                    [username]
                );
                if (existingRc) {
                    // Update password saja — jangan buat entry baru
                    await connection.query("UPDATE radcheck SET value = ?, nas_id = ? WHERE username = ? AND attribute = 'Cleartext-Password'", [password, resolvedNasId || null, username]);
                } else {
                    await connection.query('INSERT INTO radcheck (username, attribute, op, value, nas_id) VALUES (?, "Cleartext-Password", ":=", ?, ?)', [username, password, resolvedNasId || null]);
                }
                if (staticIp) {
                    // PPPoE dengan Framed-IP (opsional)
                    await connection.query('INSERT INTO radreply (username, attribute, op, value, nas_id) VALUES (?, "Framed-IP-Address", "=", ?, ?) ON DUPLICATE KEY UPDATE value = ?', [username, staticIp, resolvedNasId || null, staticIp]);
                }
                if (groupname) {
                    await connection.query('INSERT INTO radusergroup (username, groupname, priority, nas_id) VALUES (?, ?, 1, ?)', [username, groupname, resolvedNasId || null]);
                }
            } else {
                // Static: hanya insert radusergroup (untuk bandwidth profile tracking), tidak ada radcheck
                if (groupname) {
                    await connection.query('INSERT INTO radusergroup (username, groupname, priority, nas_id) VALUES (?, ?, 1, ?)', [username, groupname, resolvedNasId || null]);
                }
            }

            // Insert Details — pakai install_date sebagai created_at kalau ada
            const effectiveDueDateDay = due_date_day || (isValidInstallDate ? installDateVal.getDate() : '5');
            if (isValidInstallDate) {
                await connection.query(
                    'INSERT INTO customer_details (username, customer_id, fullname, phone, address, identity_number, due_date_day, static_ip, mac_address, nas_id, pop, odp, territory_id, territory_area_id, created_by_id, pin_hash, pin_is_default, latitude, longitude, created_at, tenant_id, connection_type, discount, discount_note, billing_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [username, customerID, fullname || '', phone || '', address || '', effectiveNik, effectiveDueDateDay, staticIp || null, macAddress || null, resolvedNasId || null, pop || '', odp || '', territory_id || null, territory_area_id || null, req.user.id || null, bulkDefaultPinHash, latitude || null, longitude || null, installDateVal, tenantIdImport, importConnectionType, userDiscount, userDiscountNote, billingType]
                );
            } else {
                await connection.query(
                    'INSERT INTO customer_details (username, customer_id, fullname, phone, address, identity_number, due_date_day, static_ip, mac_address, nas_id, pop, odp, territory_id, territory_area_id, created_by_id, pin_hash, pin_is_default, latitude, longitude, tenant_id, connection_type, discount, discount_note, billing_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)',
                    [username, customerID, fullname || '', phone || '', address || '', effectiveNik, effectiveDueDateDay, staticIp || null, macAddress || null, resolvedNasId || null, pop || '', odp || '', territory_id || null, territory_area_id || null, req.user.id || null, bulkDefaultPinHash, latitude || null, longitude || null, tenantIdImport, importConnectionType, userDiscount, userDiscountNote, billingType]
                );
            }

            // Model billing:
            // - Migrasi (install_date = bulan lalu): selalu UNPAID bulan ini (terlepas prepaid/postpaid)
            // - PSB bulan ini + prepaid: PAID bulan ini (bayar di awal)
            // - PSB bulan ini + postpaid: tidak generate invoice → cron bulan depan yang generate
            const price = profilePrices[groupname] || 0;
            const invoiceAmount = Math.max(0, price - userDiscount);
            if (isMigration) {
                // Migrasi: belum bayar di sistem baru → UNPAID bulan ini
                const [existInv] = await connection.query('SELECT id FROM billing_invoices WHERE username = ? AND period = ?', [username, currentPeriod]);
                if (existInv.length === 0) {
                    await connection.query(
                        'INSERT INTO billing_invoices (username, period, package_name, amount, discount, status, tenant_id) VALUES (?, ?, ?, ?, ?, "unpaid", ?)',
                        [username, currentPeriod, groupname || null, invoiceAmount, userDiscount, tenantIdImport]
                    );
                }
            } else if (billingType === 'prepaid') {
                // Prabayar PSB bulan ini: sudah bayar di awal → PAID bulan ini, billing mulai bulan depan
                const [existInv] = await connection.query('SELECT id FROM billing_invoices WHERE username = ? AND period = ?', [username, currentPeriod]);
                if (existInv.length === 0 && price > 0) {
                    await connection.query(
                        'INSERT INTO billing_invoices (username, period, package_name, amount, discount, status, payment_method, tenant_id) VALUES (?, ?, ?, ?, ?, "paid", "cash", ?)',
                        [username, currentPeriod, groupname || null, invoiceAmount, userDiscount, tenantIdImport]
                    );
                }
            }
            // Pascabayar PSB: tidak generate invoice → cron bulan depan akan generate tagihan bulan ini

            successCount++;
        }

        await connection.commit();
        res.json({ message: `Berhasil mengimpor ${successCount} pelanggan baru, diperbarui ${updatedCount} pelanggan lama.`, imported: successCount, updated: updatedCount, errors, debugDusun, debugImport });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// GET PPP Secret Sync Check — cari pelanggan PPPoE di DB yang tidak ada di MikroTik
app.get('/api/admin/ppp-sync-check', authenticateToken, isAdmin, async (req, res) => {
    try {
        const tenantId = getTenantId(req);

        // 1. Ambil semua NAS local auth milik tenant
        const [nasList] = await db.query(
            `SELECT id, name, host FROM mikrotik_config WHERE tenant_id = ? AND (auth_mode = 'local' OR auth_mode IS NULL)`,
            [tenantId]
        );
        if (nasList.length === 0) return res.json({ missing: [], total_db: 0, nas_checked: [] });

        // 2. Ambil semua pelanggan PPPoE aktif milik tenant (local auth only)
        const [dbCustomers] = await db.query(
            `SELECT cd.username, cd.nas_id, cd.is_isolated, rug.groupname, mc.name AS nas_name
             FROM customer_details cd
             LEFT JOIN radusergroup rug ON rug.username = cd.username
             LEFT JOIN mikrotik_config mc ON mc.id = cd.nas_id
             WHERE cd.tenant_id = ? AND cd.status != 'berhenti'
               AND cd.connection_type = 'pppoe'
               AND cd.nas_id IS NOT NULL
               AND (mc.auth_mode = 'local' OR mc.auth_mode IS NULL)`,
            [tenantId]
        );

        // 2b. Hitung pelanggan PPPoE yang belum di-assign NAS (tidak bisa dicek)
        const [[{ no_nas_count }]] = await db.query(
            `SELECT COUNT(*) AS no_nas_count FROM customer_details
             WHERE tenant_id = ? AND status != 'berhenti' AND connection_type = 'pppoe'
               AND (nas_id IS NULL OR nas_id NOT IN (SELECT id FROM mikrotik_config WHERE tenant_id = ? AND (auth_mode = 'local' OR auth_mode IS NULL)))`,
            [tenantId, tenantId]
        );

        // Index per nas_id
        const dbByNas = {};
        for (const c of dbCustomers) {
            if (!dbByNas[c.nas_id]) dbByNas[c.nas_id] = [];
            dbByNas[c.nas_id].push(c);
        }

        const missing = [];
        const nasChecked = [];

        for (const nas of nasList) {
            let mtSecrets = [];
            try {
                const client = await getMikrotikClient(nas.id);
                const conn = await client.connect();
                mtSecrets = await conn.menu('/ppp/secret').get();
                await client.close();
            } catch (e) {
                nasChecked.push({ nas_id: nas.id, nas_name: nas.name, error: e.message });
                continue;
            }

            const mtNames = new Set(mtSecrets.map(s => s.name));
            const dbForNas = dbByNas[nas.id] || [];

            for (const c of dbForNas) {
                if (!mtNames.has(c.username)) {
                    missing.push({
                        username: c.username,
                        nas_id: nas.id,
                        nas_name: nas.name,
                        groupname: c.groupname,
                        is_isolated: !!c.is_isolated,
                    });
                }
            }

            nasChecked.push({ nas_id: nas.id, nas_name: nas.name, db_count: dbForNas.length, mt_count: mtSecrets.length });
        }

        res.json({ missing, total_db: dbCustomers.length, nas_checked: nasChecked, no_nas_count: parseInt(no_nas_count) || 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST PPP Secret Sync Fix — buat PPP Secret yang missing di MikroTik
app.post('/api/admin/ppp-sync-fix', authenticateToken, isAdmin, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const { usernames } = req.body; // array username yang mau di-fix
        if (!Array.isArray(usernames) || usernames.length === 0) return res.status(400).json({ error: 'Tidak ada username yang dikirim' });

        const results = { success: 0, failed: 0, details: [] };

        for (const username of usernames) {
            try {
                // Verifikasi + ambil data dari DB
                const [[cd]] = await db.query(
                    `SELECT cd.username, cd.nas_id, cd.connection_type, cd.is_isolated, rug.groupname FROM customer_details cd
                     LEFT JOIN radusergroup rug ON rug.username = cd.username
                     WHERE cd.username = ? AND cd.tenant_id = ?`,
                    [username, tenantId]
                );
                if (!cd) { results.failed++; results.details.push({ username, status: 'error', reason: 'Tidak ditemukan di DB' }); continue; }
                if (cd.connection_type === 'static' || cd.connection_type === 'hotspot') {
                    results.details.push({ username, status: 'skip', reason: `Tipe ${cd.connection_type} tidak menggunakan PPP secret` });
                    continue;
                }

                const [[pwRow]] = await db.query("SELECT value FROM radcheck WHERE username = ? AND attribute = 'Cleartext-Password'", [username]);
                const mtProfile = cd.groupname ? await getMikrotikProfile(cd.groupname, cd.nas_id) : null;
                await managePppSecret(cd.nas_id, 'create', { username, password: pwRow?.value || '', profile: mtProfile, disabled: !!cd.is_isolated });

                results.success++;
                results.details.push({ username, status: 'ok' });
            } catch (e) {
                results.failed++;
                results.details.push({ username, status: 'error', reason: e.message });
            }
        }

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET Duplikat NIK (admin tool untuk deteksi masalah data import)
app.get('/api/admin/duplicate-niks', authenticateToken, isAdmin, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query(`
            SELECT identity_number, GROUP_CONCAT(username ORDER BY username SEPARATOR ', ') AS usernames,
                   GROUP_CONCAT(fullname ORDER BY username SEPARATOR ' / ') AS fullnames,
                   COUNT(*) AS count
            FROM customer_details
            WHERE identity_number IS NOT NULL AND identity_number != '' AND tenant_id = ?
            GROUP BY identity_number
            HAVING COUNT(*) > 1
            ORDER BY count DESC
        `, [tenantId]);
        res.json({ duplicates: rows, total: rows.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT Update User
app.put('/api/users/:username', authenticateToken, async (req, res) => {
    const oldUsername = req.params.username;
    const newUsername = req.body.username ? req.body.username.trim() : oldUsername;
    const { password, groupname, staticIp, fullname, address, identity_number, due_date_day, auto_suspend, nas_id, pop, odp, ktp_photo, latitude, longitude, confirm_package_change, change_reason, install_date } = req.body;
    const editConnType = ['static','hotspot'].includes(req.body.connectionType) ? req.body.connectionType : (req.body.connection_type || undefined);
    const editMacAddr  = req.body.macAddress !== undefined ? (req.body.macAddress || null) : (req.body.mac_address !== undefined ? (req.body.mac_address || null) : undefined);
    const discount = req.body.discount !== undefined ? (parseInt(req.body.discount, 10) || 0) : undefined;
    const discount_note = req.body.discount_note !== undefined ? (req.body.discount_note || null) : undefined;
    const phone = normalizePhone(req.body.phone);

    if (!newUsername) return res.status(400).json({ error: 'Username tidak boleh kosong' });

    const connection = await db.getConnection();
    try {
        const tenantId = getTenantId(req);
        if (!await verifyTenantUser(oldUsername, tenantId)) {
            connection.release();
            return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
        }
        await connection.beginTransaction();

        // ── Rename username jika berubah ───────────────────────────────────────
        if (newUsername !== oldUsername) {
            const [existing] = await connection.query(
                "SELECT username FROM radcheck WHERE username = ? AND attribute = 'Cleartext-Password'",
                [newUsername]
            );
            if (existing.length > 0) throw new Error(`Username "${newUsername}" sudah digunakan pelanggan lain`);

            // Update semua tabel yang pakai username sebagai FK/key
            await connection.query('UPDATE radcheck SET username = ? WHERE username = ?', [newUsername, oldUsername]);
            await connection.query('UPDATE radreply SET username = ? WHERE username = ?', [newUsername, oldUsername]);
            await connection.query('UPDATE radusergroup SET username = ? WHERE username = ?', [newUsername, oldUsername]);
            await connection.query('UPDATE billing_invoices SET username = ? WHERE username = ?', [newUsername, oldUsername]);
            await connection.query('UPDATE payment_promises SET username = ? WHERE username = ?', [newUsername, oldUsername]);
            await connection.query('UPDATE radacct SET username = ? WHERE username = ?', [newUsername, oldUsername]);
            // customer_details terakhir karena PRIMARY KEY
            await connection.query('UPDATE customer_details SET username = ? WHERE username = ?', [newUsername, oldUsername]);
        }

        const [oldGroups] = await connection.query('SELECT groupname FROM radusergroup WHERE username = ?', [newUsername]);
        const oldGroupName = oldGroups.length > 0 ? oldGroups[0].groupname : null;
        const [[oldDetail]] = await connection.query('SELECT nas_id, connection_type, static_ip FROM customer_details WHERE username = ?', [newUsername]);
        const oldNasId = oldDetail?.nas_id || null;
        const oldStaticIp = oldDetail?.static_ip || null;
        const isStaticUser = oldDetail?.connection_type === 'static';
        let shouldKick = false;

        // Check NIK duplikat (scoped ke tenant agar tidak bocor antar mitra)
        if (identity_number) {
            const [existingNik] = await connection.query("SELECT username, fullname FROM customer_details WHERE identity_number = ? AND username != ? AND tenant_id = ?", [identity_number, newUsername, tenantId]);
            if (existingNik.length > 0) throw new Error(`Nomor KTP (NIK) sudah digunakan oleh pelanggan lain (${existingNik[0].fullname})`);
        }

        if (password) {
            await connection.query(
                'UPDATE radcheck SET value = ? WHERE username = ? AND attribute = "Cleartext-Password"',
                [password, newUsername]
            );
        }

        if (groupname !== undefined && groupname !== oldGroupName) {
            shouldKick = true;

            // Cek apakah ada invoice unpaid bulan berjalan
            const currentPeriodNow = getLocalPeriod();
            const [unpaidInvoices] = await connection.query(
                `SELECT bi.id, bi.amount, bp.price AS new_amount
                 FROM billing_invoices bi
                 LEFT JOIN bandwidth_profiles bp ON bp.name = ? AND bp.tenant_id = ?
                 WHERE bi.username = ? AND bi.period = ? AND bi.status = 'unpaid'`,
                [groupname || '', tenantId, newUsername, currentPeriodNow]
            );

            if (unpaidInvoices.length > 0 && !confirm_package_change) {
                // Rollback dan return warning — frontend harus konfirmasi dulu
                await connection.rollback();
                const unpaid = unpaidInvoices[0];
                const [newPkg] = await connection.query('SELECT price FROM bandwidth_profiles WHERE name = ? AND tenant_id = ?', [groupname, tenantId]);
                const newPrice = newPkg[0]?.price ?? 0;
                return res.status(409).json({
                    warning: true,
                    message: `Pelanggan memiliki tagihan ${currentPeriodNow} sebesar Rp ${Number(unpaid.amount).toLocaleString('id-ID')} yang belum lunas.`,
                    invoice_id: unpaid.id,
                    old_amount: unpaid.amount,
                    new_amount: newPrice,
                    old_package: oldGroupName,
                    new_package: groupname,
                    period: currentPeriodNow
                });
            }

            // Lakukan update radusergroup — scoped ke tenant ini (by NAS list) agar tidak hapus entry tenant lain
            await connection.query(
                `DELETE FROM radusergroup WHERE username = ? AND (nas_id IS NULL OR nas_id IN (SELECT id FROM mikrotik_config WHERE tenant_id = ?))`,
                [newUsername, tenantId]
            );
            if (groupname) {
                const effectiveNasId = nas_id !== undefined ? (parseInt(nas_id) || null) : oldNasId;
                await connection.query(
                    'INSERT INTO radusergroup (username, groupname, priority, nas_id) VALUES (?, ?, 1, ?)',
                    [newUsername, groupname, effectiveNasId]
                );
            }

            // Jika ada unpaid invoice bulan berjalan dan sudah dikonfirmasi:
            // → Tandai invoice lama sebagai PAID (masuk omzet)
            // → Generate invoice baru dengan harga paket baru sebagai UNPAID
            let invoiceUpdated = 0;
            let updatedInvoiceId = null;
            if (unpaidInvoices && unpaidInvoices.length > 0 && confirm_package_change) {
                const [newPkg] = await connection.query('SELECT price FROM bandwidth_profiles WHERE name = ? AND tenant_id = ?', [groupname, tenantId]);
                const newPrice = newPkg[0]?.price ?? 0;

                // Hapus semua invoice UNPAID periode berjalan (bersihkan duplikat)
                await connection.query(
                    `DELETE FROM billing_invoices WHERE username = ? AND period = ? AND status = 'unpaid'`,
                    [newUsername, currentPeriodNow]
                );

                // Generate invoice baru untuk periode yang sama dengan paket baru
                const [insResult] = await connection.query(
                    'INSERT INTO billing_invoices (username, period, package_name, amount, status, tenant_id) VALUES (?, ?, ?, ?, "unpaid", ?)',
                    [newUsername, currentPeriodNow, groupname || null, newPrice, getTenantId(req)]
                );

                invoiceUpdated = 1;
                updatedInvoiceId = insResult.insertId;
            }

            // Catat log perubahan paket
            const changedByUser = req.user.username || req.user.id?.toString() || 'system';
            const [oldPkg] = await connection.query('SELECT price FROM bandwidth_profiles WHERE name = ? AND tenant_id = ?', [oldGroupName || '', tenantId]);
            const [newPkg2] = await connection.query('SELECT price FROM bandwidth_profiles WHERE name = ? AND tenant_id = ?', [groupname || '', tenantId]);
            await connection.query(
                `INSERT INTO package_change_logs (username, old_package, new_package, old_amount, new_amount, invoice_updated, invoice_id, reason, changed_by, tenant_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    newUsername,
                    oldGroupName || null,
                    groupname || null,
                    oldPkg[0]?.price ?? null,
                    newPkg2[0]?.price ?? null,
                    invoiceUpdated,
                    updatedInvoiceId,
                    change_reason || null,
                    changedByUser,
                    tenantId
                ]
            );
        } else if (groupname !== undefined) {
            // Paket tidak berubah, tapi tetap proses (misal groupname sama dikirim ulang)
            await connection.query('DELETE FROM radusergroup WHERE username = ?', [newUsername]);
            if (groupname) {
                await connection.query('INSERT INTO radusergroup (username, groupname, priority) VALUES (?, ?, 1)', [newUsername, groupname]);
            }
        }

        if (staticIp !== undefined) {
            await connection.query('DELETE FROM radreply WHERE username = ? AND attribute = "Framed-IP-Address"', [newUsername]);
            if (staticIp) {
                await connection.query('INSERT INTO radreply (username, attribute, op, value) VALUES (?, "Framed-IP-Address", "=", ?)', [newUsername, staticIp]);
            }
        }

        // Build update set dinamis — ktp_photo hanya diupdate jika dikirim
        const ktpUpdate = ktp_photo !== undefined ? ', ktp_photo = VALUES(ktp_photo)' : '';
        const ktpCols   = ktp_photo !== undefined ? ', ktp_photo' : '';
        const ktpVals   = ktp_photo !== undefined ? [ktp_photo || null] : [];
        const discountCols  = discount !== undefined ? ', discount, discount_note' : '';
        const discountVals  = discount !== undefined ? [discount, discount_note] : [];
        const discountUpdate = discount !== undefined ? ', discount = VALUES(discount), discount_note = VALUES(discount_note)' : '';
        const { billing_type: editBillingType } = req.body;
        const billingTypeCols  = editBillingType !== undefined ? ', billing_type' : '';
        const billingTypeVals  = editBillingType !== undefined ? [editBillingType === 'postpaid' ? 'postpaid' : 'prepaid'] : [];
        const billingTypeUpdate = editBillingType !== undefined ? ', billing_type = VALUES(billing_type)' : '';
        // Gunakan UPDATE langsung (bukan INSERT ON DUPLICATE KEY) agar aman setelah
        // migrasi unique key customer_details dari (username) → (username, tenant_id)
        const setClauses = [
            'fullname = ?', 'phone = ?', 'address = ?', 'identity_number = ?',
            'due_date_day = ?', 'auto_suspend = ?', 'static_ip = ?',
            'nas_id = ?', 'pop = ?', 'odp = ?',
            'territory_id = ?', 'territory_area_id = ?',
            'latitude = ?', 'longitude = ?',
        ];
        const setVals = [
            fullname || null, phone || null, address || null, identity_number || null,
            due_date_day || 1, auto_suspend !== undefined ? auto_suspend : 1, staticIp || null,
            nas_id || null, pop || null, odp || null,
            req.body.territory_id || null, req.body.territory_area_id || null,
            latitude || null, longitude || null,
        ];
        if (ktp_photo !== undefined) { setClauses.push('ktp_photo = ?'); setVals.push(ktp_photo || null); }
        if (discount !== undefined) { setClauses.push('discount = ?', 'discount_note = ?'); setVals.push(discount, discount_note); }
        if (editBillingType !== undefined) { setClauses.push('billing_type = ?'); setVals.push(editBillingType === 'postpaid' ? 'postpaid' : 'prepaid'); }
        if (editConnType !== undefined) { setClauses.push('connection_type = ?'); setVals.push(editConnType); }
        if (editMacAddr !== undefined) { setClauses.push('mac_address = ?'); setVals.push(editMacAddr); }

        const [cdUpdateResult] = await connection.query(
            `UPDATE customer_details SET ${setClauses.join(', ')} WHERE username = ? AND tenant_id = ?`,
            [...setVals, newUsername, tenantId]
        );
        // Jika belum ada row (pelanggan lama tanpa record customer_details), INSERT baru
        if (cdUpdateResult.affectedRows === 0) {
            await connection.query(
                `INSERT INTO customer_details (username, tenant_id, fullname, phone, address, identity_number, due_date_day, auto_suspend, static_ip, nas_id, pop, odp, territory_id, territory_area_id, latitude, longitude)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [newUsername, tenantId, fullname || null, phone || null, address || null, identity_number || null, due_date_day || 1, auto_suspend !== undefined ? auto_suspend : 1, staticIp || null, nas_id || null, pop || null, odp || null, req.body.territory_id || null, req.body.territory_area_id || null, latitude || null, longitude || null]
            );
        }

        // Jika discount berubah → update semua invoice UNPAID milik user ini
        if (discount !== undefined) {
            const [unpaidInvs] = await connection.query(
                `SELECT bi.id, COALESCE(bp.price, 0) AS base_price, COALESCE(bi.addon_amount, 0) AS addon_amount
                 FROM billing_invoices bi
                 LEFT JOIN radusergroup rug ON bi.username = rug.username
                 LEFT JOIN bandwidth_profiles bp ON rug.groupname = bp.name AND bp.tenant_id = ?
                 WHERE bi.username = ? AND bi.status = 'unpaid'`,
                [tenantId, newUsername]
            );
            for (const inv of unpaidInvs) {
                const newAmount = Math.max(0, inv.base_price - discount) + parseFloat(inv.addon_amount);
                await connection.query(
                    'UPDATE billing_invoices SET amount = ?, discount = ? WHERE id = ?',
                    [newAmount, discount, inv.id]
                );
            }
        }

        // Jika billing_type diubah ke postpaid → revert invoice PAID bulan ini jadi UNPAID
        if (editBillingType === 'postpaid') {
            const nowForBilling = new Date();
            const currentPeriodForBilling = getLocalPeriod(nowForBilling);
            await connection.query(
                `UPDATE billing_invoices
                 SET status = 'unpaid', payment_method = NULL, paid_at = NULL, paid_by_id = NULL
                 WHERE username = ? AND period = ? AND status = 'paid'`,
                [newUsername, currentPeriodForBilling]
            );
        }
        // Jika billing_type diubah ke prepaid → invoice UNPAID bulan ini jadi PAID
        if (editBillingType === 'prepaid') {
            const nowForBilling = new Date();
            const currentPeriodForBilling = getLocalPeriod(nowForBilling);
            await connection.query(
                `UPDATE billing_invoices
                 SET status = 'paid', payment_method = 'cash', paid_at = NOW(), paid_by_id = ?
                 WHERE username = ? AND period = ? AND status = 'unpaid'`,
                [req.user.id, newUsername, currentPeriodForBilling]
            );
        }

        // Update installation_logs jika nama berubah
        if (fullname) {
            await connection.query(
                `UPDATE installation_logs SET fullname = ? WHERE username = ?`,
                [fullname, newUsername]
            );
        }
        // Update installation_logs username jika username berubah
        if (newUsername !== oldUsername) {
            await connection.query(
                `UPDATE installation_logs SET username = ? WHERE username = ?`,
                [newUsername, oldUsername]
            );
        }
        // Update tanggal pemasangan (admin only, hanya jika tanggal benar-benar berubah)
        if (install_date && req.user.role === 'admin') {
            const [[currentLog]] = await connection.query(
                `SELECT install_date FROM installation_logs WHERE username = ?`,
                [newUsername]
            );
            const currentDate = currentLog?.install_date
                ? new Date(currentLog.install_date).toISOString().slice(0, 10)
                : null;
            const newDate = new Date(install_date).toISOString().slice(0, 10);
            if (currentDate !== newDate) {
                await connection.query(
                    `UPDATE installation_logs SET install_date = ? WHERE username = ?`,
                    [install_date, newUsername]
                );
                await connection.query(
                    `UPDATE customer_details SET created_at = ? WHERE username = ?`,
                    [install_date, newUsername]
                );
            }
        }

        await connection.commit();

        // 4. Respond dulu ke frontend, baru kick di background
        res.json({
            message: 'User updated successfully',
            kicked: shouldKick,
            newUsername: newUsername !== oldUsername ? newUsername : null
        });

        if (shouldKick) {
            const kickTarget = newUsername; // pakai username terbaru
            console.log(`[UPGRADE] Paket berubah: ${oldUsername} → ${kickTarget} (${oldGroupName} -> ${groupname}). Memulai kick...`);
            kickMikrotikUser(kickTarget)
                .then(n => { if (n > 0) console.log(`[UPGRADE] RouterOS API kicked ${n} sesi untuk ${kickTarget}`) })
                .catch(e => console.error(`[UPGRADE] RouterOS API kick error:`, e.message));
        }

        // Static IP side effects (background, fire-and-forget)
        if (isStaticUser) {
            const effectiveNasId = nas_id !== undefined ? (nas_id || null) : oldNasId;
            const newStaticIp = staticIp !== undefined ? (staticIp || null) : oldStaticIp;
            const ipChanged = staticIp !== undefined && staticIp !== oldStaticIp;
            const nasChanged = nas_id !== undefined && String(nas_id || '') !== String(oldNasId || '');

            ;(async () => {
                try {
                    // Hapus ppp_active_cache jika IP atau NAS berubah
                    if (ipChanged || nasChanged) {
                        await db.query('DELETE FROM ppp_active_cache WHERE username = ?', [newUsername]);
                        console.log(`[STATIC_EDIT] Cache online dihapus untuk ${newUsername} (IP/NAS berubah)`);
                    }

                    if (nasChanged && oldNasId && oldStaticIp) {
                        // Pindah router: hapus queue & firewall dari router lama
                        await manageSimpleQueue(oldNasId, 'delete', { target: oldStaticIp }).catch(() => {});
                        await manageStaticFirewall(oldNasId, 'unblock', oldStaticIp).catch(() => {});
                        await manageStaticArp(oldNasId, 'delete', { ip: oldStaticIp }).catch(() => {});
                        // Buat queue baru di router baru
                        if (effectiveNasId && newStaticIp) {
                            const [[bp]] = await db.query('SELECT rate_limit FROM bandwidth_profiles WHERE name = (SELECT groupname FROM radusergroup WHERE username = ? LIMIT 1)', [newUsername]);
                            const rateLimit = bp?.rate_limit || '10M/10M';
                            await manageSimpleQueue(effectiveNasId, 'create', {
                                name: fullname || newUsername,
                                target: newStaticIp,
                                maxLimit: rateLimit,
                                comment: `${newUsername}`
                            });
                        }
                        console.log(`[STATIC_EDIT] Pindah router ${newUsername}: NAS ${oldNasId} → ${effectiveNasId}`);
                    } else if (ipChanged && effectiveNasId) {
                        // IP berubah di router yang sama: hapus queue lama, buat queue baru
                        if (oldStaticIp) {
                            await manageSimpleQueue(effectiveNasId, 'delete', { target: oldStaticIp }).catch(() => {});
                            await manageStaticFirewall(effectiveNasId, 'unblock', oldStaticIp).catch(() => {});
                            await manageStaticArp(effectiveNasId, 'delete', { ip: oldStaticIp }).catch(() => {});
                        }
                        if (newStaticIp) {
                            const [[bp]] = await db.query('SELECT rate_limit FROM bandwidth_profiles WHERE name = (SELECT groupname FROM radusergroup WHERE username = ? LIMIT 1)', [newUsername]);
                            const rateLimit = bp?.rate_limit || '10M/10M';
                            await manageSimpleQueue(effectiveNasId, 'create', {
                                name: fullname || newUsername,
                                target: newStaticIp,
                                maxLimit: rateLimit,
                                comment: `${newUsername}`
                            });
                        }
                        console.log(`[STATIC_EDIT] IP berubah untuk ${newUsername}: ${oldStaticIp} → ${newStaticIp}`);
                    } else if (shouldKick && effectiveNasId && newStaticIp) {
                        // Paket berubah: update rate limit queue
                        const [[bp]] = await db.query('SELECT rate_limit FROM bandwidth_profiles WHERE name = ?', [groupname]);
                        if (bp?.rate_limit) {
                            await manageSimpleQueue(effectiveNasId, 'update', { target: newStaticIp, maxLimit: bp.rate_limit });
                            console.log(`[STATIC_EDIT] Queue rate limit diupdate untuk ${newUsername}: ${bp.rate_limit}`);
                        }
                    }
                } catch (e) {
                    console.error(`[STATIC_EDIT] Error background untuk ${newUsername}:`, e.message);
                }
            })();
        }

        // PPP Secret side effects (background, fire-and-forget, hanya PPPoE)
        if (!isStaticUser) {
            const effectiveNasId = (nas_id !== undefined ? (nas_id || null) : oldNasId);
            const nasChanged = nas_id !== undefined && String(nas_id || '') !== String(oldNasId || '');
            const usernameChanged = newUsername !== oldUsername;
            ;(async () => {
                try {
                    if (usernameChanged && effectiveNasId) {
                        // Username berubah: kick sesi lama, rename secret in-place (set name=new [find name=old])
                        await kickMikrotikUser(oldUsername).catch(() => {});
                        const [[pwRow]] = await db.query("SELECT value FROM radcheck WHERE username = ? AND attribute = 'Cleartext-Password'", [newUsername]);
                        const [[grpRow]] = await db.query('SELECT groupname FROM radusergroup WHERE username = ?', [newUsername]);
                        const currentPassword = password || pwRow?.value || '';
                        const currentGroup = groupname || grpRow?.groupname;
                        const mtProfile = currentGroup ? await getMikrotikProfile(currentGroup, effectiveNasId) : null;
                        await managePppSecret(effectiveNasId, 'rename', { username: oldUsername, newUsername, password: currentPassword, profile: mtProfile });
                        console.log(`[PPP_SECRET] Username renamed in-place: ${oldUsername} → ${newUsername}`);
                    } else if (nasChanged && oldNasId) {
                        // Pindah router: hapus secret dari router lama, buat di router baru
                        const [[pwRow]] = await db.query("SELECT value FROM radcheck WHERE username = ? AND attribute = 'Cleartext-Password'", [newUsername]);
                        const [[grpRow]] = await db.query('SELECT groupname FROM radusergroup WHERE username = ?', [newUsername]);
                        const currentPassword = password || pwRow?.value || '';
                        const currentGroup = groupname || grpRow?.groupname;
                        const mtProfile = currentGroup ? await getMikrotikProfile(currentGroup, effectiveNasId) : null;
                        await managePppSecret(oldNasId, 'delete', { username: newUsername });
                        if (effectiveNasId) {
                            await managePppSecret(effectiveNasId, 'create', { username: newUsername, password: currentPassword, profile: mtProfile });
                        }
                        console.log(`[PPP_SECRET] Pindah router untuk ${newUsername}: ${oldNasId} → ${effectiveNasId}`);
                    } else if (effectiveNasId) {
                        const upd = {};
                        if (password) upd.password = password;
                        if (shouldKick && groupname) upd.profile = await getMikrotikProfile(groupname, effectiveNasId);
                        if (Object.keys(upd).length > 0) {
                            await managePppSecret(effectiveNasId, 'update', { username: newUsername, ...upd });
                        }
                    }
                } catch (e) {
                    console.error(`[PPP_SECRET] PUT update error untuk ${newUsername}:`, e.message);
                }
            })();
        }
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// DELETE User
app.delete('/api/users/:username', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Hanya admin yang bisa menghapus pelanggan' });
    const { username } = req.params;
    const { admin_password } = req.body;
    if (!admin_password) return res.status(400).json({ error: 'Password admin wajib diisi' });
    const connection = await db.getConnection();
    try {
        const tenantId = getTenantId(req);
        if (!await verifyTenantUser(username, tenantId)) {
            connection.release();
            return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
        }
        const [[adminUser]] = await connection.query('SELECT password FROM system_accounts WHERE id = ?', [req.user.id]);
        const passMatch = await bcrypt.compare(admin_password, adminUser.password);
        if (!passMatch) return res.status(401).json({ error: 'Password admin salah' });

        // Ambil data pelanggan sebelum dihapus (untuk Simple Queue)
        const [[cdRow]] = await connection.query('SELECT connection_type, static_ip, nas_id FROM customer_details WHERE username = ?', [username]);

        await connection.beginTransaction();

        if (!cdRow || cdRow.connection_type !== 'static') {
            await connection.query('DELETE FROM radcheck WHERE username = ?', [username]);
            await connection.query('DELETE FROM radreply WHERE username = ?', [username]);
            await connection.query('DELETE FROM radusergroup WHERE username = ?', [username]);
        }
        await connection.query('DELETE FROM customer_details WHERE username = ?', [username]);

        await connection.commit();
        res.json({ message: 'User deleted successfully' });

        // Hapus Simple Queue + Static ARP di MikroTik untuk pelanggan Static (background)
        if (cdRow?.connection_type === 'static' && cdRow.nas_id && cdRow.static_ip) {
            try {
                await manageSimpleQueue(cdRow.nas_id, 'delete', { target: cdRow.static_ip });
                console.log(`[QUEUE] Deleted simple queue for ${username} (${cdRow.static_ip})`);
            } catch (qErr) {
                console.error(`[QUEUE] Failed to delete simple queue for ${username}:`, qErr.message);
            }
            manageStaticArp(cdRow.nas_id, 'delete', { ip: cdRow.static_ip }).catch(arpErr => {
                console.error(`[ARP] Failed to delete static ARP for ${username}:`, arpErr.message);
            });
        }

        // Hapus PPP Secret dari MikroTik untuk pelanggan PPPoE (background)
        if (cdRow?.connection_type !== 'static' && cdRow?.nas_id) {
            managePppSecret(cdRow.nas_id, 'delete', { username }).catch(e => {
                console.error(`[PPP_SECRET] Delete secret gagal untuk ${username}:`, e.message);
            });
        }
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});


// POST Sinkron PPP Secret manual
app.post('/api/users/:username/sync-secret', authenticateToken, async (req, res) => {
    const { username } = req.params;
    try {
        const tenantId = getTenantId(req);
        const [[detail]] = await db.query(
            `SELECT cd.nas_id, cd.connection_type, rc.value AS password, rug.groupname
             FROM customer_details cd
             LEFT JOIN radcheck rc ON rc.username = cd.username AND rc.attribute = 'Cleartext-Password'
             LEFT JOIN radusergroup rug ON rug.username = cd.username
             WHERE cd.username = ? AND cd.tenant_id = ?`,
            [username, tenantId]
        );
        if (!detail) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
        if (detail.connection_type === 'static') return res.status(400).json({ error: 'Pelanggan static tidak menggunakan PPP secret' });
        if (!detail.nas_id) return res.status(400).json({ error: 'Pelanggan belum punya router (nas_id kosong)' });

        // Cek apakah sedang suspend (ada Auth-Type:Reject)
        const [[rejectRow]] = await db.query(
            "SELECT id FROM radcheck WHERE username = ? AND attribute = 'Auth-Type' AND value = 'Reject'",
            [username]
        );
        const isSuspended = !!rejectRow;

        const mtProfile = detail.groupname ? await getMikrotikProfile(detail.groupname, detail.nas_id) : null;
        const ok = await managePppSecret(detail.nas_id, 'create', {
            username,
            password: detail.password || '',
            profile: mtProfile
        });

        // Jika suspend, langsung disable secret-nya lagi
        if (ok && isSuspended) {
            await managePppSecret(detail.nas_id, 'disable', { username });
        }

        res.json({
            success: ok,
            suspended: isSuspended,
            message: ok
                ? (isSuspended ? 'PPP Secret disinkronkan (disabled karena suspend)' : 'PPP Secret berhasil disinkronkan')
                : 'Gagal menghubungi MikroTik'
        });
    } catch (err) {
        console.error(`[SYNC_SECRET] Error untuk ${username}:`, err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sa/migrate-local-auth-all — jalankan migrasi untuk semua tenant (superadmin only)
app.post('/api/sa/migrate-local-auth-all', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const [tenants] = await db.query(`SELECT id, name FROM tenants WHERE status = 'aktif'`);
        const results = [];

        for (const tenant of tenants) {
            const [customers] = await db.query(
                `SELECT cd.username, rc.value AS password, rug.groupname, cd.nas_id, cd.connection_type,
                        EXISTS(SELECT 1 FROM radcheck rx WHERE rx.username = cd.username AND rx.attribute = 'Auth-Type' AND rx.value = 'Reject') as is_suspended
                 FROM customer_details cd
                 LEFT JOIN radcheck rc ON rc.username = cd.username AND rc.attribute = 'Cleartext-Password'
                 LEFT JOIN radusergroup rug ON rug.username = cd.username
                 WHERE cd.tenant_id = ? AND cd.nas_id IS NOT NULL AND (cd.connection_type IS NULL OR cd.connection_type != 'static')
                   AND (cd.status IS NULL OR cd.status = 'aktif' OR cd.status = 'suspend')`,
                [tenant.id]
            );

            let success = 0, failed = 0;
            for (const c of customers) {
                try {
                    const mtProfile = c.groupname ? await getMikrotikProfile(c.groupname, c.nas_id) : null;
                    const ok = await managePppSecret(c.nas_id, 'create', {
                        username: c.username,
                        password: c.password || '',
                        profile: mtProfile,
                        disabled: !!c.is_suspended
                    });
                    if (ok) success++; else failed++;
                } catch (e) {
                    failed++;
                    console.error(`[MIGRATE_ALL] Error ${c.username} (tenant ${tenant.id}):`, e.message);
                }
            }

            results.push({ tenant_id: tenant.id, tenant_name: tenant.name, total: customers.length, success, failed });
            console.log(`[MIGRATE_ALL] Tenant ${tenant.name} (${tenant.id}): ${success}/${customers.length} berhasil`);
        }

        const totalSuccess = results.reduce((s, r) => s + r.success, 0);
        const totalFailed = results.reduce((s, r) => s + r.failed, 0);
        const totalAll = results.reduce((s, r) => s + r.total, 0);

        res.json({
            message: `Migrasi semua tenant selesai: ${totalSuccess} berhasil, ${totalFailed} gagal dari ${totalAll} pelanggan`,
            summary: { total: totalAll, success: totalSuccess, failed: totalFailed },
            per_tenant: results
        });
    } catch (err) {
        console.error('[MIGRATE_ALL]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/migrate-local-auth — enable semua PPP secret non-suspend (one-time migration)
app.post('/api/admin/migrate-local-auth', authenticateToken, isAdmin, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        // Ambil semua pelanggan PPPoE non-static yang punya nas_id
        const [customers] = await db.query(
            `SELECT cd.username, rc.value AS password, rug.groupname, cd.nas_id, cd.connection_type,
                    EXISTS(SELECT 1 FROM radcheck rx WHERE rx.username = cd.username AND rx.attribute = 'Auth-Type' AND rx.value = 'Reject') as is_suspended
             FROM customer_details cd
             LEFT JOIN radcheck rc ON rc.username = cd.username AND rc.attribute = 'Cleartext-Password'
             LEFT JOIN radusergroup rug ON rug.username = cd.username
             WHERE cd.tenant_id = ? AND cd.nas_id IS NOT NULL AND (cd.connection_type IS NULL OR cd.connection_type != 'static')
               AND (cd.status IS NULL OR cd.status = 'aktif' OR cd.status = 'suspend')`,
            [tenantId]
        );

        let success = 0, failed = 0, skipped = 0;
        for (const c of customers) {
            try {
                const mtProfile = c.groupname ? await getMikrotikProfile(c.groupname) : null;
                const action = c.is_suspended ? 'disable' : 'enable';

                // Upsert secret dulu (create akan set enabled/disabled sesuai status)
                const ok = await managePppSecret(c.nas_id, 'create', {
                    username: c.username,
                    password: c.password || '',
                    profile: mtProfile,
                    disabled: !!c.is_suspended
                });

                if (ok) success++;
                else { failed++; console.warn(`[MIGRATE] Gagal untuk ${c.username}`); }
            } catch (e) {
                failed++;
                console.error(`[MIGRATE] Error untuk ${c.username}:`, e.message);
            }
        }

        res.json({
            message: `Migrasi selesai: ${success} berhasil, ${failed} gagal dari ${customers.length} pelanggan`,
            total: customers.length, success, failed
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- PACKAGES (PAKET INTERNET / GROUPS) ---

// GET All Packages
app.get('/api/groups', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        // Filter hanya group yang terdaftar sebagai bandwidth_profiles tenant ini
        const query = `
            SELECT rgr.groupname,
            MAX(CASE WHEN rgr.attribute = 'Mikrotik-Rate-Limit' THEN rgr.value END) as rate_limit,
            MAX(CASE WHEN rgr.attribute = 'Session-Timeout' THEN rgr.value END) as session_timeout,
            MAX(CASE WHEN rgr.attribute = 'Mikrotik-Group' THEN rgr.value END) as mikrotik_profile,
            MAX(CASE WHEN rgr.attribute IN ('Framed-Pool', 'Pool-Name') THEN rgr.value END) as ip_pool
            FROM radgroupreply rgr
            WHERE rgr.groupname IN (SELECT name FROM bandwidth_profiles WHERE tenant_id = ?)
            GROUP BY rgr.groupname
        `;
        const [rows] = await db.query(query, [tenantId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST Create Package (Group)
app.post('/api/groups', authenticateToken, isAdmin, async (req, res) => {
    const { groupname, rateLimit, sessionTimeout, mikrotikProfile, uploadLimit, downloadLimit, ipPool } = req.body;

    if (!groupname) {
        return res.status(400).json({ error: 'Groupname is required' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Check if group exists
        const [existing] = await connection.query('SELECT * FROM radgroupreply WHERE groupname = ?', [groupname]);
        if (existing.length > 0) {
            throw new Error('Group already exists');
        }

        // 1. Mikrotik-Rate-Limit (Prefer granular if provided)
        let finalRateLimit = rateLimit;
        if (uploadLimit && downloadLimit) {
            finalRateLimit = `${uploadLimit}/${downloadLimit}`;
        }

        if (finalRateLimit) {
            await connection.query(
                'INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (?, "Mikrotik-Rate-Limit", "=", ?)',
                [groupname, finalRateLimit]
            );
        }

        // 2. IP Pool — tidak diperlukan, IP diassign oleh MikroTik via PPP Profile (Mikrotik-Group)

        if (sessionTimeout) {
            await connection.query(
                'INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (?, "Session-Timeout", "=", ?)',
                [groupname, sessionTimeout]
            );
        }

        if (mikrotikProfile) {
            await connection.query(
                'INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (?, "Mikrotik-Group", "=", ?)',
                [groupname, mikrotikProfile]
            );
        }

        await connection.commit();
        res.status(201).json({ message: 'Package created successfully' });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// PUT Update Package (Group)
app.put('/api/groups/:groupname', authenticateToken, isAdmin, async (req, res) => {
    const oldGroupName = req.params.groupname;
    const { uploadLimit, downloadLimit, ipPool, sessionTimeout, mikrotikProfile } = req.body;
    const tenantId = getTenantId(req);

    // Verifikasi groupname milik tenant ini
    const [[bpCheck]] = await db.query('SELECT id FROM bandwidth_profiles WHERE name = ? AND tenant_id = ?', [oldGroupName, tenantId]);
    if (!bpCheck) return res.status(404).json({ error: 'Paket tidak ditemukan' });

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Delete all existing attributes for this group
        await connection.query('DELETE FROM radgroupreply WHERE groupname = ?', [oldGroupName]);

        // 2. Insert new attributes
        let finalRateLimit = null;
        if (uploadLimit && downloadLimit) {
            finalRateLimit = `${uploadLimit}/${downloadLimit}`;
        }

        if (finalRateLimit) {
            await connection.query(
                'INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (?, "Mikrotik-Rate-Limit", "=", ?)',
                [oldGroupName, finalRateLimit]
            );
        }

        // IP Pool — tidak diperlukan, IP diassign oleh MikroTik via PPP Profile (Mikrotik-Group)

        if (sessionTimeout) {
            await connection.query(
                'INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (?, "Session-Timeout", "=", ?)',
                [oldGroupName, sessionTimeout]
            );
        }

        if (mikrotikProfile) {
            await connection.query(
                'INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (?, "Mikrotik-Group", "=", ?)',
                [oldGroupName, mikrotikProfile]
            );
        }

        // Default if empty
        if (!finalRateLimit && !sessionTimeout && !mikrotikProfile && !ipPool) {
            await connection.query(
                'INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (?, "Fall-Through", "=", "Yes")',
                [oldGroupName]
            );
        }

        await connection.commit();
        res.json({ message: 'Package updated successfully' });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// DELETE Package
app.delete('/api/groups/:groupname', authenticateToken, isAdmin, async (req, res) => {
    const { groupname } = req.params;
    const tenantId = getTenantId(req);

    // Verifikasi groupname milik tenant ini
    const [[bpCheck]] = await db.query('SELECT id FROM bandwidth_profiles WHERE name = ? AND tenant_id = ?', [groupname, tenantId]);
    if (!bpCheck) return res.status(404).json({ error: 'Paket tidak ditemukan' });

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Prevent deleting if users are still in group
        const [users] = await connection.query('SELECT COUNT(*) as count FROM radusergroup WHERE groupname = ?', [groupname]);
        if (users[0].count > 0) {
            throw new Error(`Cannot delete. There are ${users[0].count} users assigned to this package.`);
        }

        await connection.query('DELETE FROM radgroupreply WHERE groupname = ?', [groupname]);
        await connection.query('DELETE FROM radgroupcheck WHERE groupname = ?', [groupname]);

        await connection.commit();
        res.json({ message: 'Package deleted successfully' });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// --- INVOICE & BILLING MANAGEMENT ---

// POST /api/billing/sync-addons — perbaiki addon_amount di semua unpaid invoice tenant ini
app.post('/api/billing/sync-addons', authenticateToken, isAdmin, async (req, res) => {
    const tenantId = getTenantId(req);
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Ambil semua unpaid invoice tenant ini
        const [unpaidInvoices] = await connection.query(
            `SELECT id, username, period FROM billing_invoices WHERE status = 'unpaid' AND tenant_id = ?`,
            [tenantId]
        );

        let fixed = 0;
        for (const inv of unpaidInvoices) {
            const periodStart = inv.period + '-01';
            const lastDay = new Date(inv.period.slice(0, 4), parseInt(inv.period.slice(5, 7)), 0);
            const periodEnd = lastDay.toISOString().slice(0, 10);

            // Ambil addon aktif untuk periode ini
            const [addons] = await connection.query(`
                SELECT ca.addon_type_id, at.name as addon_name,
                       COALESCE(ca.price_override, at.price) as effective_price
                FROM customer_addons ca
                JOIN addon_types at ON ca.addon_type_id = at.id
                WHERE ca.username = ? AND at.is_recurring = 1
                  AND ca.start_date <= ? AND (ca.end_date IS NULL OR ca.end_date >= ?)
            `, [inv.username, periodEnd, periodStart]);

            const addonTotal = addons.reduce((s, a) => s + parseFloat(a.effective_price), 0);

            // Ambil addon yang sudah tercatat
            const [existing] = await connection.query(
                `SELECT addon_type_id, amount FROM billing_invoice_addons WHERE invoice_id = ?`,
                [inv.id]
            );
            const existingMap = {};
            existing.forEach(e => { existingMap[e.addon_type_id] = parseFloat(e.amount); });

            let changed = false;
            for (const addon of addons) {
                if (existingMap[addon.addon_type_id] === undefined) {
                    // Addon belum ada di invoice — tambahkan
                    await connection.query(
                        'INSERT INTO billing_invoice_addons (invoice_id, addon_type_id, addon_name, amount) VALUES (?, ?, ?, ?)',
                        [inv.id, addon.addon_type_id, addon.addon_name, addon.effective_price]
                    );
                    changed = true;
                }
            }

            // Recalculate addon_amount dari billing_invoice_addons
            const [[{ newAddonTotal }]] = await connection.query(
                `SELECT COALESCE(SUM(amount), 0) as newAddonTotal FROM billing_invoice_addons WHERE invoice_id = ?`,
                [inv.id]
            );

            // Update amount: ambil base_price dari paket, tambah addon, kurang diskon
            const [[invRow]] = await connection.query(
                `SELECT bi.discount, COALESCE(bp.price, 0) as pkg_price
                 FROM billing_invoices bi
                 LEFT JOIN radusergroup rug ON rug.username = bi.username
                 LEFT JOIN bandwidth_profiles bp ON bp.name = rug.groupname AND bp.tenant_id = ?
                 WHERE bi.id = ?`, [tenantId, inv.id]
            );
            const newAmount = Math.max(0, invRow.pkg_price - invRow.discount) + parseFloat(newAddonTotal);
            await connection.query(
                `UPDATE billing_invoices SET addon_amount = ?, amount = ? WHERE id = ?`,
                [newAddonTotal, newAmount, inv.id]
            );
            if (changed) fixed++;
        }

        await connection.commit();
        res.json({ message: `Sinkronisasi selesai. ${fixed} invoice diperbarui dari ${unpaidInvoices.length} invoice belum bayar.`, fixed, total: unpaidInvoices.length });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// GET All Invoices
app.get('/api/invoices', authenticateToken, async (req, res) => {
    const { period, status, username, search } = req.query;
    try {
        const tenantId = getTenantId(req);
        let query = `
            SELECT i.*, c.fullname, c.phone, c.address, c.customer_id, i.package_name as current_package
            FROM billing_invoices i
            LEFT JOIN customer_details c ON i.username = c.username AND c.tenant_id = i.tenant_id
            WHERE i.tenant_id = ?
        `;
        const params = [tenantId];

        if (period) {
            query += ' AND i.period = ?';
            params.push(period);
        }
        if (status && status !== 'all') {
            query += ' AND i.status = ?';
            params.push(status);
        }
        if (username) {
            query += ' AND i.username = ?';
            params.push(username);
        }
        if (search) {
            query += ' AND (i.username LIKE ? OR c.fullname LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        // --- Collector Territory Filtering ---
        if (req.user.role === 'collector') {
            query += ` AND (
                c.territory_id IN (SELECT id FROM territories WHERE collector_id = ? AND tenant_id = ?)
                OR c.territory_id IN (SELECT DISTINCT territory_id FROM territory_areas WHERE collector_id = ?)
            )`;
            params.push(req.user.id, tenantId, req.user.id);
        }

        query += ' ORDER BY i.created_at DESC';
        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST Generate Invoices for all users for a given period
app.post('/api/invoices/generate', authenticateToken, isAdmin, async (req, res) => {
    const { period } = req.body; // Expects YYYY-MM
    if (!period) return res.status(400).json({ error: 'Period (YYYY-MM) is required' });

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const tenantId = getTenantId(req);

        // Get all customers with their package price and discount
        const query = `
            SELECT rc.username, bp.price, rug.groupname AS package_name,
                   COALESCE(cd.discount, 0) AS discount
            FROM radcheck rc
            JOIN customer_details cd ON rc.username = cd.username
            JOIN (
                SELECT username, MAX(groupname) as groupname
                FROM radusergroup
                WHERE nas_id IS NULL OR nas_id IN (SELECT id FROM mikrotik_config WHERE tenant_id = ?)
                GROUP BY username
            ) rug ON rug.username = rc.username
            JOIN bandwidth_profiles bp ON rug.groupname = bp.name AND bp.tenant_id = ?
            WHERE rc.attribute = 'Cleartext-Password' AND cd.tenant_id = ?
            AND (cd.status IS NULL OR cd.status = 'aktif')
        `;
        const [users] = await connection.query(query, [tenantId, tenantId, tenantId]); // +1 untuk radusergroup subquery

        let count = 0;
        for (const user of users) {
            const [existing] = await connection.query(
                'SELECT id FROM billing_invoices WHERE username = ? AND period = ?',
                [user.username, period]
            );

            if (existing.length === 0) {
                const amt = Math.max(0, (user.price || 0) - user.discount);
                await connection.query(
                    'INSERT INTO billing_invoices (username, period, package_name, amount, discount, status, tenant_id) VALUES (?, ?, ?, ?, ?, "unpaid", ?)',
                    [user.username, period, user.package_name || null, amt, user.discount, tenantId]
                );
                count++;
            }
        }

        await connection.commit();
        res.json({ message: `${count} invoices generated for period ${period}` });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// POST Mark Invoice as Paid
app.post('/api/invoices/:id/pay', authenticateToken, isAdminOrCollector, async (req, res) => {
    const { id } = req.params;
    const { payment_method = 'cash', proof_image = null } = req.body || {};
    const connection = await db.getConnection();
    try {
        const tenantId = getTenantId(req);
        if (!await verifyTenantInvoice(id, tenantId)) {
            connection.release();
            return res.status(404).json({ error: 'Invoice tidak ditemukan' });
        }
        await connection.beginTransaction();

        // 1. Dapatkan detail invoice untuk mencari username
        const [invoices] = await connection.query('SELECT username, amount FROM billing_invoices WHERE id = ?', [id]);
        if (invoices.length === 0) {
            throw new Error('Invoice tidak ditemukan atau sudah dihapus.');
        }
        const username = invoices[0].username;
        const invoiceAmount = invoices[0].amount;

        // 2. Update status invoice menjadi PAID (simpan bukti transfer jika ada)
        await connection.query(
            'UPDATE billing_invoices SET status = "paid", payment_method = ?, paid_at = NOW(), paid_by_id = ?, collector_proof = ? WHERE id = ?',
            [payment_method, req.user.id, proof_image || null, id]
        );

        // 3. Jika transfer, buat entry payment_proofs pending untuk verifikasi admin
        if (payment_method === 'transfer' || payment_method === 'online') {
            const [existing] = await connection.query(
                'SELECT id FROM payment_proofs WHERE invoice_id = ? AND status = "pending"', [id]
            );
            if (existing.length === 0) {
                await connection.query(
                    `INSERT INTO payment_proofs (invoice_id, username, amount, proof_image, status, notes)
                     VALUES (?, ?, ?, ?, 'pending', ?)`,
                    [id, username, invoiceAmount, proof_image || null,
                     `Dibayar via ${payment_method} oleh kolektor ${req.user.fullname || req.user.username}`]
                );
            }
        }

        // 4. AUTO-REAKTIVASI: Jika user ter-isolir (Auth-Type Reject), hapus isolirnya
        // Cek dulu apakah user sedang suspend — kalau iya, perlu di-kick setelah bayar
        const [[suspendCheck]] = await connection.query(
            "SELECT id FROM radcheck WHERE username = ? AND attribute = 'Auth-Type' AND value = 'Reject' LIMIT 1",
            [username]
        );
        const wasSuspended = !!suspendCheck;
        await connection.query(
            "DELETE FROM radcheck WHERE username = ? AND attribute = 'Auth-Type' AND value = 'Reject'",
            [username]
        );

        // 5. AUTO-CANCEL task cabut ONT jika ada yang pending
        const [ontTasks] = await connection.query(
            "SELECT id, assigned_to FROM ont_removal_tasks WHERE username = ? AND status = 'pending'",
            [username]
        );
        if (ontTasks.length > 0) {
            await connection.query(
                "UPDATE ont_removal_tasks SET status = 'cancelled' WHERE username = ? AND status = 'pending'",
                [username]
            );
            // Notifikasi teknisi yang bersangkutan
            for (const task of ontTasks) {
                createNotification('collector', task.assigned_to, 'ont_task_cancelled',
                    '❌ Task Cabut ONT Dibatalkan',
                    `Task cabut ONT untuk pelanggan ${username} dibatalkan karena pelanggan melunasi tagihan.`,
                    { username }, getTenantId(req)
                ).catch(() => {});
            }
        }

        await connection.commit();
        console.log(`[PAYMENT SUCCESS] Invoice #${id} for ${username} paid via ${payment_method}`);
        res.json({ message: 'Pembayaran berhasil dan user telah diaktifkan kembali.' });
        checkFulfillPromise(username).catch(() => {});
        // Kick sesi Mikrotik HANYA jika sebelumnya suspend — agar isolir langsung terbuka
        // Pelanggan yang tidak suspend tidak perlu di-kick (tidak boleh putus koneksi)
        if (wasSuspended) {
            reactivateLocalAuth(username, tenantId).catch(() => {});
            kickMikrotikUser(username).catch(e => console.error(`[PAYMENT] RouterOS kick error for ${username}:`, e.message));
        }

        // Notifikasi admin: siapa yang bayar & siapa yang melunasi
        const paidByName = req.user.fullname || req.user.username;
        const methodLabel = { cash: 'Cash', transfer: 'Transfer', online: 'Online' }[payment_method] || payment_method;
        createNotification('admin', 'all_admins', 'payment_received',
            `💰 Pembayaran Masuk`,
            `${username} dilunasi via ${methodLabel} oleh ${paidByName}`,
            { invoice_id: Number(id), customer_username: username, paid_by: paidByName, method: payment_method }, getTenantId(req)
        ).catch(() => {});

        // Notifikasi pelanggan: tagihan lunas
        createNotification('customer', username, 'payment_confirmed',
            `✅ Tagihan Lunas`,
            `Tagihan Anda telah dikonfirmasi lunas via ${methodLabel}. Terima kasih!`,
            { invoice_id: Number(id), method: payment_method }, getTenantId(req)
        ).catch(() => {});
    } catch (err) {
        await connection.rollback();
        console.error('[PAYMENT ERROR]', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// PATCH /api/invoices/:id/payment-method — admin edit metode pembayaran invoice yang sudah PAID
app.patch('/api/invoices/:id/payment-method', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { payment_method } = req.body;
    const allowed = ['cash', 'transfer', 'online'];
    if (!payment_method || !allowed.includes(payment_method)) {
        return res.status(400).json({ error: `Metode pembayaran tidak valid. Pilihan: ${allowed.join(', ')}` });
    }
    try {
        const tenantId = getTenantId(req);
        if (!await verifyTenantInvoice(id, tenantId)) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
        const [[inv]] = await db.query('SELECT id, status, payment_method, username, period FROM billing_invoices WHERE id = ?', [id]);
        if (!inv) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
        if (inv.status !== 'paid') return res.status(400).json({ error: 'Invoice belum lunas, tidak bisa edit metode pembayaran' });
        if (inv.payment_method === 'discount') return res.status(400).json({ error: 'Invoice diskon tidak bisa diubah metode pembayarannya' });

        const oldMethod = inv.payment_method;
        await db.query(
            'UPDATE billing_invoices SET payment_method = ? WHERE id = ?',
            [payment_method, id]
        );

        // Audit log
        console.log(`[PAYMENT-METHOD] Invoice #${id} (${inv.username}/${inv.period}): ${oldMethod} → ${payment_method} oleh ${req.user.username}`);

        res.json({ ok: true, message: `Metode pembayaran diubah dari ${oldMethod} ke ${payment_method}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =============================================
// =============================================
// LAYANAN TAMBAHAN (ADDON)
// =============================================

// GET /api/addon-types — daftar jenis addon tenant ini
app.get('/api/addon-types', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query(
            'SELECT * FROM addon_types WHERE tenant_id = ? ORDER BY name ASC',
            [tenantId]
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/addon-types — buat jenis addon baru
app.post('/api/addon-types', authenticateToken, isAdmin, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const { name, description, price, is_recurring = 1 } = req.body;
        if (!name) return res.status(400).json({ error: 'Nama addon wajib diisi' });
        const [result] = await db.query(
            'INSERT INTO addon_types (tenant_id, name, description, price, is_recurring) VALUES (?, ?, ?, ?, ?)',
            [tenantId, name, description || null, price || 0, is_recurring ? 1 : 0]
        );
        res.status(201).json({ id: result.insertId, message: 'Addon berhasil dibuat' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/addon-types/:id — update jenis addon
app.put('/api/addon-types/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const { name, description, price, is_recurring, is_active } = req.body;
        await db.query(
            `UPDATE addon_types SET
                name = COALESCE(?, name),
                description = COALESCE(?, description),
                price = COALESCE(?, price),
                is_recurring = COALESCE(?, is_recurring),
                is_active = COALESCE(?, is_active)
             WHERE id = ? AND tenant_id = ?`,
            [name || null, description || null, price ?? null, is_recurring ?? null, is_active ?? null, req.params.id, tenantId]
        );
        res.json({ message: 'Addon diperbarui' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/addon-types/:id — hapus jenis addon (soft: is_active=0 kalau masih dipakai)
app.delete('/api/addon-types/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const [[used]] = await db.query(
            'SELECT COUNT(*) as cnt FROM customer_addons WHERE addon_type_id = ? AND end_date IS NULL',
            [req.params.id]
        );
        if (used.cnt > 0) {
            await db.query('UPDATE addon_types SET is_active = 0 WHERE id = ? AND tenant_id = ?', [req.params.id, tenantId]);
            return res.json({ message: 'Addon dinonaktifkan (masih digunakan pelanggan aktif)' });
        }
        await db.query('DELETE FROM addon_types WHERE id = ? AND tenant_id = ?', [req.params.id, tenantId]);
        res.json({ message: 'Addon dihapus' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/customers/:username/addons — addon aktif seorang pelanggan
app.get('/api/customers/:username/addons', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!await verifyTenantUser(req.params.username, tenantId)) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
        const [rows] = await db.query(
            `SELECT ca.*, at.name as addon_name, at.description, at.is_recurring,
                    COALESCE(ca.price_override, at.price) as effective_price
             FROM customer_addons ca
             JOIN addon_types at ON ca.addon_type_id = at.id
             WHERE ca.username = ? AND ca.tenant_id = ?
             ORDER BY ca.start_date DESC`,
            [req.params.username, tenantId]
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/customers/:username/addons — assign addon ke pelanggan
app.post('/api/customers/:username/addons', authenticateToken, isAdmin, async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const tenantId = getTenantId(req);
        const { addon_type_id, price_override, start_date, notes } = req.body;
        if (!addon_type_id) return res.status(400).json({ error: 'addon_type_id wajib' });
        const startD = start_date || new Date().toISOString().slice(0, 10);

        const [result] = await connection.query(
            `INSERT INTO customer_addons (username, addon_type_id, price_override, start_date, notes, tenant_id, created_by_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [req.params.username, addon_type_id, price_override ?? null, startD, notes || null, tenantId, req.user.id]
        );

        // Ambil detail addon type
        const [[addonType]] = await connection.query('SELECT * FROM addon_types WHERE id = ?', [addon_type_id]);
        if (addonType && addonType.is_recurring) {
            const effectivePrice = price_override != null ? parseFloat(price_override) : parseFloat(addonType.price);
            const startPeriod = startD.slice(0, 7); // YYYY-MM

            // Update semua invoice UNPAID milik pelanggan ini yang periodenya >= start addon
            const [unpaidInvoices] = await connection.query(
                `SELECT id, period FROM billing_invoices
                 WHERE username = ? AND status = 'unpaid' AND period >= ? AND tenant_id = ?`,
                [req.params.username, startPeriod, tenantId]
            );

            for (const inv of unpaidInvoices) {
                // Cek apakah addon ini sudah ada di invoice (hindari duplikat)
                const [[existing]] = await connection.query(
                    'SELECT id FROM billing_invoice_addons WHERE invoice_id = ? AND addon_type_id = ?',
                    [inv.id, addon_type_id]
                );
                if (existing) continue;

                await connection.query(
                    'INSERT INTO billing_invoice_addons (invoice_id, addon_type_id, addon_name, amount) VALUES (?, ?, ?, ?)',
                    [inv.id, addon_type_id, addonType.name, effectivePrice]
                );
                await connection.query(
                    'UPDATE billing_invoices SET addon_amount = addon_amount + ?, amount = amount + ? WHERE id = ?',
                    [effectivePrice, effectivePrice, inv.id]
                );
            }
        }

        await connection.commit();
        res.status(201).json({ id: result.insertId, message: 'Addon berhasil diassign' });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally { connection.release(); }
});

// DELETE /api/customer-addons/:id — hapus addon dari pelanggan (set end_date)
app.delete('/api/customer-addons/:id', authenticateToken, isAdmin, async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const tenantId = getTenantId(req);
        // Ambil info addon sebelum dihentikan (verifikasi tenant)
        const [[ca]] = await connection.query(
            'SELECT ca.*, at.is_recurring FROM customer_addons ca JOIN addon_types at ON at.id = ca.addon_type_id WHERE ca.id = ? AND ca.tenant_id = ?',
            [req.params.id, tenantId]
        );
        if (!ca) return res.status(404).json({ error: 'Addon tidak ditemukan' });

        await connection.query(
            "UPDATE customer_addons SET end_date = CURDATE() WHERE id = ? AND tenant_id = ?",
            [req.params.id, tenantId]
        );

        // Hapus addon dari invoice UNPAID yang belum lewat bulan ini
        if (ca && ca.is_recurring) {
            const currentPeriod = new Date().toISOString().slice(0, 7);
            const [affectedInvoices] = await connection.query(
                `SELECT bia.id as bia_id, bia.amount as price, bi.id as inv_id
                 FROM billing_invoice_addons bia
                 JOIN billing_invoices bi ON bi.id = bia.invoice_id
                 WHERE bia.addon_type_id = ? AND bi.username = ? AND bi.status = 'unpaid' AND bi.period >= ?`,
                [ca.addon_type_id, ca.username, currentPeriod]
            );
            for (const row of affectedInvoices) {
                await connection.query('DELETE FROM billing_invoice_addons WHERE id = ?', [row.bia_id]);
                await connection.query(
                    'UPDATE billing_invoices SET addon_amount = GREATEST(0, addon_amount - ?), amount = GREATEST(0, amount - ?) WHERE id = ?',
                    [row.price, row.price, row.inv_id]
                );
            }
        }

        await connection.commit();
        res.json({ message: 'Addon dihentikan' });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally { connection.release(); }
});

// GET /api/invoices/:id/addons — line items addon pada invoice tertentu
app.get('/api/invoices/:id/addons', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        if (!await verifyTenantInvoice(req.params.id, tenantId)) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
        const [rows] = await db.query(
            'SELECT * FROM billing_invoice_addons WHERE invoice_id = ?',
            [req.params.id]
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// BULK PAY — Bayar banyak invoice sekaligus
// =============================================
app.post('/api/invoices/bulk-pay', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'collector') {
        return res.status(403).json({ error: 'Akses ditolak. Membutuhkan hak akses Admin atau Kolektor.' });
    }

    const { invoice_ids, payment_method = 'cash', proof_image = null } = req.body || {};
    if (!Array.isArray(invoice_ids) || invoice_ids.length === 0) {
        return res.status(400).json({ error: 'invoice_ids harus berupa array dan tidak boleh kosong' });
    }

    const connection = await db.getConnection();
    try {
        const tenantId = getTenantId(req);
        await connection.beginTransaction();

        // Ambil semua username dari invoice yang dipilih (hanya yang masih unpaid dan milik tenant ini)
        const placeholders = invoice_ids.map(() => '?').join(',');
        const [invoices] = await connection.query(
            `SELECT i.id, i.username FROM billing_invoices i
             WHERE i.id IN (${placeholders}) AND i.status = 'unpaid' AND i.tenant_id = ?`,
            [...invoice_ids, tenantId]
        );
        if (invoices.length === 0) {
            throw new Error('Tidak ada invoice unpaid yang valid dari daftar yang dipilih');
        }

        const paidIds    = invoices.map(inv => inv.id);
        const usernames  = [...new Set(invoices.map(inv => inv.username))];

        // Update semua invoice → paid
        const paidPlaceholders = paidIds.map(() => '?').join(',');
        await connection.query(
            `UPDATE billing_invoices
             SET status = 'paid', payment_method = ?, paid_at = NOW(), paid_by_id = ?, collector_proof = ?
             WHERE id IN (${paidPlaceholders})`,
            [payment_method, req.user.id, proof_image || null, ...paidIds]
        );

        // Auto-reaktivasi: hapus isolir untuk semua username terkait
        const userPlaceholders = usernames.map(() => '?').join(',');
        // Catat siapa yang sedang suspend SEBELUM dihapus — hanya mereka yang perlu di-kick
        const [suspendedRows] = await connection.query(
            `SELECT DISTINCT username FROM radcheck WHERE username IN (${userPlaceholders}) AND attribute = 'Auth-Type' AND value = 'Reject'`,
            usernames
        );
        const suspendedUsernames = suspendedRows.map(r => r.username);
        await connection.query(
            `DELETE FROM radcheck WHERE username IN (${userPlaceholders}) AND attribute = 'Auth-Type' AND value = 'Reject'`,
            usernames
        );

        // Auto-cancel task cabut ONT untuk semua username yang dilunasi
        const [ontTasksBulk] = await connection.query(
            `SELECT id, assigned_to, username FROM ont_removal_tasks WHERE username IN (${userPlaceholders}) AND status = 'pending'`,
            usernames
        );
        if (ontTasksBulk.length > 0) {
            await connection.query(
                `UPDATE ont_removal_tasks SET status = 'cancelled' WHERE username IN (${userPlaceholders}) AND status = 'pending'`,
                usernames
            );
            for (const task of ontTasksBulk) {
                createNotification('collector', task.assigned_to, 'ont_task_cancelled',
                    '❌ Task Cabut ONT Dibatalkan',
                    `Task cabut ONT untuk ${task.username} dibatalkan karena pelanggan melunasi tagihan.`,
                    { username: task.username }, getTenantId(req)
                ).catch(() => {});
            }
        }

        await connection.commit();

        // Proses checkFulfillPromise secara background (tidak await)
        usernames.forEach(u => checkFulfillPromise(u).catch(() => {}));
        // Kick sesi Mikrotik HANYA untuk yang sebelumnya suspend — agar isolir langsung terbuka
        // Pelanggan yang tidak suspend tidak perlu di-kick (tidak boleh putus koneksi)
        suspendedUsernames.forEach(u => {
            reactivateLocalAuth(u, tenantId).catch(() => {});
            kickMikrotikUser(u).catch(e => console.error(`[BULK PAYMENT] RouterOS kick error for ${u}:`, e.message));
        });

        console.log(`[BULK PAYMENT] ${paidIds.length} invoices paid by user #${req.user.id} via ${payment_method}`);
        res.json({ paid: paidIds.length, skipped: invoice_ids.length - paidIds.length });

        // Notifikasi admin (background)
        const paidByName = req.user.fullname || req.user.username;
        const methodLabel = { cash: 'Cash', transfer: 'Transfer', online: 'Online' }[payment_method] || payment_method;
        createNotification('admin', 'all_admins', 'bulk_payment_received',
            `💰 Bayar Massal (${paidIds.length} Invoice)`,
            `${paidIds.length} tagihan dilunasi via ${methodLabel} oleh ${paidByName}`,
            { count: paidIds.length, paid_by: paidByName, method: payment_method, invoice_ids: paidIds }, getTenantId(req)
        ).catch(() => {});

        // Notifikasi per pelanggan (background)
        const bulkNotifTenant = getTenantId(req);
        usernames.forEach(u => {
            createNotification('customer', u, 'payment_confirmed',
                `✅ Tagihan Lunas`,
                `Tagihan Anda telah dikonfirmasi lunas via ${methodLabel}. Terima kasih!`,
                { method: payment_method }, bulkNotifTenant
            ).catch(() => {});
        });
    } catch (err) {
        await connection.rollback();
        console.error('[BULK PAYMENT ERROR]', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// =============================================
// CABUT ONT / ROUTER
// =============================================

// POST /api/ont-removals — kolektor submit cabut ONT
app.post('/api/ont-removals', authenticateToken, async (req, res) => {
    if (!['collector', 'admin', 'technician'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Akses ditolak' });
    }
    const { username, notes } = req.body;
    if (!username) return res.status(400).json({ error: 'username pelanggan wajib diisi' });

    try {
        const tenantId = getTenantId(req);
        // Ambil detail pelanggan + cek status isolir (hanya tenant sendiri)
        const [[cust]] = await db.query(
            `SELECT cd.username, cd.customer_id, cd.fullname, cd.address,
                    ta.dusun_nama as dusun,
                    EXISTS(SELECT 1 FROM radcheck WHERE username = cd.username AND attribute = 'Auth-Type' AND value = 'Reject') as is_suspended
             FROM customer_details cd
             LEFT JOIN territory_areas ta ON cd.territory_area_id = ta.id
             WHERE cd.username = ? AND cd.tenant_id = ?`,
            [username, tenantId]
        );
        if (!cust) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });

        // Kolektor hanya boleh cabut pelanggan yang terisolir
        if (req.user.role === 'collector' && !cust.is_suspended) {
            return res.status(400).json({ error: 'Cabut ONT hanya diperbolehkan untuk pelanggan yang terisolir.' });
        }

        const collectorName = req.user.fullname || req.user.username;

        const [result] = await db.query(
            `INSERT INTO ont_removals (username, customer_id, fullname, address, dusun, collector_id, collector_name, notes, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [cust.username, cust.customer_id, cust.fullname, cust.address, cust.dusun || '', req.user.id, collectorName, notes || null, getTenantId(req)]
        );

        // Notifikasi ke semua admin
        createNotification('admin', 'all_admins', 'ont_removed',
            `🔌 ONT Dicabut`,
            `${cust.fullname || cust.username} (${cust.customer_id || cust.username}) — dicabut oleh ${collectorName}${cust.dusun ? ` di ${cust.dusun}` : ''}`,
            { removal_id: result.insertId, customer_username: cust.username, customer_id: cust.customer_id, collector_name: collectorName }, getTenantId(req)
        ).catch(() => {});

        res.json({ id: result.insertId, message: 'Cabut ONT berhasil dicatat' });
    } catch (err) {
        console.error('[ONT REMOVAL]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/ont-removals — admin: semua data + rekap bulanan
app.get('/api/ont-removals', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { period, collector_id } = req.query;
        const tenantId = getTenantId(req);

        // Rekap bulanan: bulan berjalan & bulan lalu
        const [monthly] = await db.query(`
            SELECT
                period,
                COUNT(*) as total,
                COUNT(DISTINCT collector_id) as total_collectors
            FROM ont_removals
            WHERE period IN (
                DATE_FORMAT(NOW(), '%Y-%m'),
                DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m')
            )
            AND tenant_id = ?
            GROUP BY period
            ORDER BY period DESC
        `, [tenantId]);

        // Rekap per kolektor bulan ini
        const [byCollector] = await db.query(`
            SELECT
                collector_id, collector_name,
                COUNT(*) as total
            FROM ont_removals
            WHERE period = DATE_FORMAT(NOW(), '%Y-%m')
            AND tenant_id = ?
            GROUP BY collector_id, collector_name
            ORDER BY total DESC
        `, [tenantId]);

        // Daftar detail — filter opsional
        let sql = `SELECT id, username, customer_id, fullname, address, dusun,
                          collector_id, collector_name, notes, removed_at, period
                   FROM ont_removals WHERE tenant_id = ?`;
        const params = [tenantId];
        if (period) { sql += ' AND period = ?'; params.push(period); }
        if (collector_id) { sql += ' AND collector_id = ?'; params.push(collector_id); }
        sql += ' ORDER BY removed_at DESC LIMIT 500';

        const [rows] = await db.query(sql, params);

        res.json({ removals: rows, monthly, byCollector });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/collector/ont-removals — kolektor lihat riwayat milik sendiri
app.get('/api/collector/ont-removals', authenticateToken, async (req, res) => {
    if (!['collector', 'technician'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Akses ditolak' });
    }
    try {
        const tenantId = getTenantId(req);
        const { period } = req.query;
        let sql = `SELECT id, username, customer_id, fullname, dusun, notes, removed_at, period
                   FROM ont_removals WHERE collector_id = ? AND tenant_id = ?`;
        const params = [req.user.id, tenantId];
        if (period) { sql += ' AND period = ?'; params.push(period); }
        sql += ' ORDER BY removed_at DESC LIMIT 200';
        const [rows] = await db.query(sql, params);

        // Summary
        const [[thisMonth]] = await db.query(
            "SELECT COUNT(*) as total FROM ont_removals WHERE collector_id = ? AND tenant_id = ? AND period = DATE_FORMAT(NOW(),'%Y-%m')",
            [req.user.id, tenantId]
        );
        const [[lastMonth]] = await db.query(
            "SELECT COUNT(*) as total FROM ont_removals WHERE collector_id = ? AND tenant_id = ? AND period = DATE_FORMAT(NOW()-INTERVAL 1 MONTH,'%Y-%m')",
            [req.user.id, tenantId]
        );

        res.json({ removals: rows, thisMonth: thisMonth.total, lastMonth: lastMonth.total });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// =============================================
// TASK CABUT ONT
// =============================================

// POST /api/ont-removal-tasks — admin/noc buat task, assign ke teknisi
app.post('/api/ont-removal-tasks', authenticateToken, async (req, res) => {
    if (!['admin', 'noc'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' });
    try {
        const { username, technician_username, notes } = req.body;
        if (!username) return res.status(400).json({ error: 'username pelanggan wajib diisi' });
        if (!technician_username) return res.status(400).json({ error: 'technician_username wajib diisi' });

        const tenantId = getTenantId(req);
        // Verifikasi teknisi (dalam tenant yang sama)
        const [[tech]] = await db.query(
            `SELECT id, username, fullname FROM system_accounts WHERE username = ? AND role = 'technician' AND tenant_id = ?`,
            [technician_username, tenantId]
        );
        if (!tech) return res.status(404).json({ error: 'Teknisi tidak ditemukan' });

        // Ambil detail pelanggan (hanya tenant sendiri)
        const [[cust]] = await db.query(
            `SELECT cd.username, cd.customer_id, cd.fullname, cd.address, cd.latitude, cd.longitude,
                    t.name as territory_name
             FROM customer_details cd
             LEFT JOIN territories t ON cd.territory_id = t.id
             WHERE cd.username = ? AND cd.tenant_id = ?`,
            [username, tenantId]
        );
        if (!cust) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });

        // Cek pelanggan terisolir
        const [[suspCheck]] = await db.query(
            `SELECT COUNT(*) as cnt FROM radcheck WHERE username = ? AND attribute = 'Auth-Type' AND value = 'Reject'`,
            [username]
        );
        if (!suspCheck.cnt) return res.status(400).json({ error: 'Pelanggan ini tidak dalam status terisolir' });

        // Cek task pending yang sudah ada untuk pelanggan ini
        const [[existing]] = await db.query(
            `SELECT id FROM ont_removal_tasks WHERE username = ? AND status = 'pending'`,
            [username]
        );
        if (existing) return res.status(400).json({ error: 'Sudah ada task cabut ONT pending untuk pelanggan ini' });

        const [result] = await db.query(
            `INSERT INTO ont_removal_tasks (username, customer_id, fullname, address, territory_name, latitude, longitude, assigned_to, assigned_by, notes, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [cust.username, cust.customer_id, cust.fullname, cust.address, cust.territory_name,
             cust.latitude || null, cust.longitude || null,
             technician_username, req.user.username, notes || null, getTenantId(req)]
        );

        // Notifikasi ke teknisi
        await createNotification('collector', technician_username, 'ont_task_assigned',
            '🔌 Task Cabut ONT Baru',
            `Kamu ditugaskan mencabut ONT ${cust.fullname}${cust.address ? ' di ' + cust.address : ''}. Cek dashboard untuk detail.`,
            { task_id: result.insertId, customer_username: username }, getTenantId(req)
        );

        res.json({ ok: true, id: result.insertId, message: `Task cabut ONT untuk ${cust.fullname} berhasil dibuat` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ont-removal-tasks — admin/noc: semua; teknisi: milik sendiri
app.get('/api/ont-removal-tasks', authenticateToken, async (req, res) => {
    if (!['admin', 'noc', 'technician'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' });
    try {
        const tenantId = getTenantId(req);
        let sql = `
            SELECT t.*,
                sa.fullname AS technician_name
            FROM ont_removal_tasks t
            LEFT JOIN system_accounts sa ON sa.username = t.assigned_to
            WHERE t.tenant_id = ?`;
        const params = [tenantId];

        if (req.user.role === 'technician') {
            sql += ` AND t.assigned_to = ?`;
            params.push(req.user.username);
        }

        const { status } = req.query;
        if (status && status !== 'all') { sql += ` AND t.status = ?`; params.push(status); }

        sql += ` ORDER BY t.created_at DESC`;
        const [rows] = await db.query(sql, params);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/ont-removal-tasks/:id/complete — teknisi tandai selesai
app.post('/api/ont-removal-tasks/:id/complete', authenticateToken, async (req, res) => {
    if (req.user.role !== 'technician') return res.status(403).json({ error: 'Akses ditolak' });
    try {
        const tenantId = getTenantId(req);
        const [[task]] = await db.query('SELECT * FROM ont_removal_tasks WHERE id = ? AND tenant_id = ?', [req.params.id, tenantId]);
        if (!task) return res.status(404).json({ error: 'Task tidak ditemukan' });
        if (task.assigned_to !== req.user.username) return res.status(403).json({ error: 'Bukan task kamu' });
        if (task.status !== 'pending') return res.status(400).json({ error: 'Task sudah selesai atau dibatalkan' });

        const { notes } = req.body;

        // Update task status
        await db.query(
            `UPDATE ont_removal_tasks SET status = 'done', completed_at = NOW(), completed_notes = ? WHERE id = ?`,
            [notes || null, req.params.id]
        );

        // Insert ke ont_removals (riwayat resmi)
        const [[techAccount]] = await db.query('SELECT id, fullname FROM system_accounts WHERE username = ? AND tenant_id = ?', [req.user.username, tenantId]);
        await db.query(
            `INSERT INTO ont_removals (username, customer_id, fullname, address, dusun, collector_id, collector_name, notes, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [task.username, task.customer_id, task.fullname, task.address, task.territory_name || '',
             techAccount?.id || 0, techAccount?.fullname || req.user.username, notes || null, tenantId]
        );

        // Notifikasi ke admin & NOC
        createNotification('admin', 'all_admins', 'ont_removed',
            `🔌 ONT Dicabut (Task)`,
            `${task.fullname} — dicabut oleh teknisi ${req.user.username}${task.territory_name ? ' di ' + task.territory_name : ''}.`,
            { task_id: task.id, customer_username: task.username }, getTenantId(req)
        ).catch(() => {});
        createNotification('admin', 'all_nocs', 'ont_removed',
            `🔌 ONT Dicabut (Task)`,
            `${task.fullname} — dicabut oleh teknisi ${req.user.username}${task.territory_name ? ' di ' + task.territory_name : ''}.`,
            { task_id: task.id, customer_username: task.username }, getTenantId(req)
        ).catch(() => {});

        res.json({ ok: true, message: 'Task selesai, ONT tercatat dicabut' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/ont-removal-tasks/:id — admin/noc batalkan task
// POST /api/ont-removal-tasks/:id/cancel — teknisi batalkan task milik sendiri (wajib isi alasan)
app.post('/api/ont-removal-tasks/:id/cancel', authenticateToken, async (req, res) => {
    if (!['admin', 'noc', 'technician'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' });
    const { cancel_reason } = req.body
    if (!cancel_reason || !cancel_reason.trim()) return res.status(400).json({ error: 'Alasan pembatalan wajib diisi' });
    try {
        const tenantId = getTenantId(req);
        const [[task]] = await db.query('SELECT id, status, assigned_to FROM ont_removal_tasks WHERE id = ? AND tenant_id = ?', [req.params.id, tenantId]);
        if (!task) return res.status(404).json({ error: 'Task tidak ditemukan' });
        if (task.status !== 'pending') return res.status(400).json({ error: 'Hanya task pending yang bisa dibatalkan' });
        // Teknisi hanya bisa batalkan task yang ditugaskan ke mereka
        if (req.user.role === 'technician' && task.assigned_to !== req.user.username)
            return res.status(403).json({ error: 'Kamu tidak memiliki akses ke task ini' });
        await db.query(
            `UPDATE ont_removal_tasks SET status = 'cancelled', cancel_reason = ?, cancelled_by = ?, cancelled_at = NOW() WHERE id = ?`,
            [cancel_reason.trim(), req.user.username, req.params.id]
        );
        // Notifikasi ke admin & NOC
        await createNotification('admin', 'all_admins', 'ont_task_cancelled',
            `❌ Task Cabut ONT Dibatalkan`,
            `Dibatalkan oleh ${req.user.username}: ${cancel_reason.trim()}`,
            { task_id: req.params.id }, getTenantId(req)
        ).catch(() => {});
        await createNotification('admin', 'all_nocs', 'ont_task_cancelled',
            `❌ Task Cabut ONT Dibatalkan`,
            `Dibatalkan oleh ${req.user.username}: ${cancel_reason.trim()}`,
            { task_id: req.params.id }, getTenantId(req)
        ).catch(() => {});
        res.json({ ok: true, message: 'Task berhasil dibatalkan' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/ont-removal-tasks/:id', authenticateToken, async (req, res) => {
    if (!['admin', 'noc'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' });
    try {
        const tenantId = getTenantId(req);
        const [[task]] = await db.query('SELECT id, status FROM ont_removal_tasks WHERE id = ? AND tenant_id = ?', [req.params.id, tenantId]);
        if (!task) return res.status(404).json({ error: 'Task tidak ditemukan' });
        if (task.status !== 'pending') return res.status(400).json({ error: 'Hanya task pending yang bisa dibatalkan' });
        await db.query(`UPDATE ont_removal_tasks SET status = 'cancelled' WHERE id = ? AND tenant_id = ?`, [req.params.id, tenantId]);
        res.json({ ok: true, message: 'Task dibatalkan' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// =============================================
// =============================================
// REKAP SETORAN KOLEKTOR
// =============================================

// GET /api/admin/collector-settlements?date=YYYY-MM-DD
// Rekap semua kolektor untuk tanggal settlement tertentu
app.get('/api/admin/collector-settlements', authenticateToken, async (req, res) => {
    if (!['admin', 'noc'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' });
    try {
        const date = req.query.date || new Date().toISOString().slice(0, 10);
        const tenantId = getTenantId(req);

        // Rekap per kolektor untuk tanggal ini
        const [rows] = await db.query(`
            SELECT
                sa.id as collector_id,
                sa.username as collector_username,
                sa.fullname as collector_name,
                COUNT(bi.id) as invoice_count,
                SUM(CASE WHEN bi.payment_method != 'discount' THEN bi.amount ELSE 0 END) as total_amount,
                SUM(CASE WHEN bi.payment_method = 'cash' OR bi.payment_method IS NULL THEN bi.amount ELSE 0 END) as cash_amount,
                SUM(CASE WHEN bi.payment_method IN ('transfer','online') THEN bi.amount ELSE 0 END) as transfer_amount,
                SUM(CASE WHEN bi.payment_method = 'discount' THEN bi.amount ELSE 0 END) as discount_amount,
                csc.confirmed_by,
                csc.confirmed_at,
                csc.id as confirmation_id
            FROM system_accounts sa
            LEFT JOIN billing_invoices bi ON bi.paid_by_id = sa.id
                AND DATE(bi.paid_at) = ?
                AND bi.status = 'paid'
                AND bi.cancelled_at IS NULL
            LEFT JOIN collector_settlement_confirmations csc
                ON csc.collector_id = sa.id AND csc.settlement_date = ?
            WHERE sa.role = 'collector' AND sa.tenant_id = ?
            GROUP BY sa.id, sa.username, sa.fullname, csc.confirmed_by, csc.confirmed_at, csc.id
            HAVING invoice_count > 0
            ORDER BY sa.fullname
        `, [date, date, tenantId]);

        res.json({ date, collectors: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/collector-settlements/:collector_id/:date
// Detail invoice per kolektor per settlement date
app.get('/api/admin/collector-settlements/:collector_id/:date', authenticateToken, async (req, res) => {
    if (!['admin', 'noc'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' });
    try {
        const { collector_id, date } = req.params;
        const tenantId = getTenantId(req);
        const [invoices] = await db.query(`
            SELECT bi.id, bi.username, bi.period, bi.amount, bi.payment_method,
                   bi.paid_at, bi.settlement_date, bi.cancelled_at, bi.cancel_reason,
                   cd.fullname, cd.phone, cd.customer_id
            FROM billing_invoices bi
            JOIN customer_details cd ON bi.username = cd.username
            WHERE bi.paid_by_id = ? AND DATE(bi.paid_at) = ? AND bi.status = 'paid' AND cd.tenant_id = ?
            ORDER BY bi.paid_at ASC
        `, [collector_id, date, tenantId]);

        const [[collector]] = await db.query('SELECT id, username, fullname FROM system_accounts WHERE id = ? AND tenant_id = ?', [collector_id, tenantId]);
        const [[confirm]] = await db.query(
            'SELECT * FROM collector_settlement_confirmations WHERE collector_id = ? AND settlement_date = ?',
            [collector_id, date]
        );

        res.json({ invoices, collector, confirmation: confirm || null });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/collector-settlements/:collector_id/:date/confirm
app.post('/api/admin/collector-settlements/:collector_id/:date/confirm', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Hanya admin yang bisa konfirmasi' });
    try {
        const { collector_id, date } = req.params;
        const { notes } = req.body;
        const tenantId = getTenantId(req);
        // Verifikasi kolektor milik tenant ini
        const [[collectorCheck]] = await db.query('SELECT id FROM system_accounts WHERE id = ? AND tenant_id = ?', [collector_id, tenantId]);
        if (!collectorCheck) return res.status(404).json({ error: 'Kolektor tidak ditemukan' });
        await db.query(`
            INSERT INTO collector_settlement_confirmations (collector_id, collector_username, settlement_date, confirmed_by, notes)
            SELECT ?, username, ?, ?, ?
            FROM system_accounts WHERE id = ?
            ON DUPLICATE KEY UPDATE confirmed_by = VALUES(confirmed_by), confirmed_at = NOW(), notes = VALUES(notes)
        `, [collector_id, date, req.user.username, notes || null, collector_id]);
        res.json({ ok: true, message: 'Setoran dikonfirmasi' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/admin/collector-settlements/:collector_id/:date/confirm
app.delete('/api/admin/collector-settlements/:collector_id/:date/confirm', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Hanya admin yang bisa hapus konfirmasi' });
    try {
        const { collector_id, date } = req.params;
        const tenantId = getTenantId(req);
        // Verifikasi kolektor milik tenant ini
        const [[collectorCheck]] = await db.query('SELECT id FROM system_accounts WHERE id = ? AND tenant_id = ?', [collector_id, tenantId]);
        if (!collectorCheck) return res.status(404).json({ error: 'Kolektor tidak ditemukan' });
        await db.query('DELETE FROM collector_settlement_confirmations WHERE collector_id = ? AND settlement_date = ?',
            [collector_id, date]);
        res.json({ ok: true, message: 'Konfirmasi dihapus' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/collector-settlements/range?collector_id=X&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
app.get('/api/admin/collector-settlements/range', authenticateToken, async (req, res) => {
    if (!['admin', 'noc'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' });
    try {
        const { collector_id, date_from, date_to } = req.query;
        if (!date_from || !date_to) return res.status(400).json({ error: 'date_from dan date_to wajib diisi' });

        const tenantId = getTenantId(req);
        const params = [date_from, date_to, tenantId];
        const collectorFilter = collector_id ? 'AND sa.id = ?' : '';
        if (collector_id) params.push(collector_id);

        // Summary per kolektor
        const [summary] = await db.query(`
            SELECT
                sa.id as collector_id,
                sa.username as collector_username,
                sa.fullname as collector_name,
                COUNT(bi.id) as invoice_count,
                SUM(CASE WHEN bi.payment_method != 'discount' THEN bi.amount ELSE 0 END) as total_amount,
                SUM(CASE WHEN bi.payment_method = 'cash' OR bi.payment_method IS NULL THEN bi.amount ELSE 0 END) as cash_amount,
                SUM(CASE WHEN bi.payment_method IN ('transfer','online') THEN bi.amount ELSE 0 END) as transfer_amount,
                SUM(CASE WHEN bi.payment_method = 'discount' THEN bi.amount ELSE 0 END) as discount_amount
            FROM system_accounts sa
            LEFT JOIN billing_invoices bi ON bi.paid_by_id = sa.id
                AND DATE(bi.paid_at) BETWEEN ? AND ?
                AND bi.status = 'paid'
                AND bi.cancelled_at IS NULL
            WHERE sa.role = 'collector' AND sa.tenant_id = ? ${collectorFilter}
            GROUP BY sa.id, sa.username, sa.fullname
            HAVING invoice_count > 0
            ORDER BY sa.fullname
        `, params);

        // Detail invoice per kolektor
        const invoiceParams = [date_from, date_to, tenantId];
        if (collector_id) invoiceParams.push(collector_id);
        const [invoices] = await db.query(`
            SELECT
                bi.id, bi.username, bi.period, bi.amount, bi.payment_method,
                bi.paid_at, bi.paid_by_id,
                cd.fullname, cd.phone,
                sa.fullname as collector_name, sa.username as collector_username
            FROM billing_invoices bi
            LEFT JOIN customer_details cd ON bi.username = cd.username
            LEFT JOIN system_accounts sa ON bi.paid_by_id = sa.id
            WHERE DATE(bi.paid_at) BETWEEN ? AND ?
                AND bi.status = 'paid'
                AND bi.cancelled_at IS NULL
                AND sa.role = 'collector'
                AND bi.tenant_id = ?
                ${collector_id ? 'AND bi.paid_by_id = ?' : ''}
            ORDER BY bi.paid_at ASC
        `, invoiceParams);

        res.json({ date_from, date_to, summary, invoices });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/invoices/:id/cancel-payment — admin batalkan pelunasan
// Force-close semua sesi radacct yang terbuka untuk NAS tertentu
// Berguna saat admin mitra disable/enable RADIUS di MikroTik dan sesi lama nyangkut
app.post('/api/admin/sessions/close-stale', authenticateToken, isAdmin, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const { nas_id, hours } = req.body; // hours: threshold jam tanpa update (default 0 = semua)
        const thresholdHours = parseInt(hours) || 0;

        // Ambil NAS milik tenant ini
        let nasFilter = '';
        const params = [];
        if (nas_id) {
            const [[nas]] = await db.query('SELECT id, host, radius_nas_ip FROM mikrotik_config WHERE id = ? AND tenant_id = ?', [nas_id, tenantId]);
            if (!nas) return res.status(404).json({ error: 'NAS tidak ditemukan' });
            const nasIp = nas.radius_nas_ip || nas.host;
            nasFilter = 'AND nasipaddress = ?';
            params.push(nasIp);
        } else {
            // Semua NAS milik tenant ini
            const [nasList] = await db.query('SELECT host, radius_nas_ip FROM mikrotik_config WHERE tenant_id = ?', [tenantId]);
            const nasIps = nasList.map(n => n.radius_nas_ip || n.host);
            if (nasIps.length === 0) return res.status(400).json({ error: 'Tidak ada NAS yang terdaftar' });
            nasFilter = `AND nasipaddress IN (${nasIps.map(() => '?').join(',')})`;
            params.push(...nasIps);
        }

        let timeFilter = '';
        if (thresholdHours > 0) {
            timeFilter = `AND acctupdatetime < NOW() - INTERVAL ${thresholdHours} HOUR`;
        }

        const [result] = await db.query(
            `UPDATE radacct SET acctstoptime = NOW(), acctterminatecause = 'Admin-Force-Close'
             WHERE acctstoptime IS NULL ${nasFilter} ${timeFilter}`,
            params
        );

        // Jalankan sync ulang setelah cleanup
        syncRealtimeOnlineUsers().catch(() => {});

        res.json({ message: `${result.affectedRows} sesi berhasil ditutup`, closed: result.affectedRows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/invoices/:id/cancel-payment', authenticateToken, isAdmin, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Hanya admin yang bisa membatalkan pelunasan' });
    try {
        const { reason, admin_password } = req.body;
        if (!reason?.trim()) return res.status(400).json({ error: 'Alasan pembatalan wajib diisi' });
        if (!admin_password) return res.status(400).json({ error: 'Password admin wajib diisi' });
        const [[adminUser]] = await db.query('SELECT password FROM system_accounts WHERE id = ?', [req.user.id]);
        const passMatch = await bcrypt.compare(admin_password, adminUser.password);
        if (!passMatch) return res.status(401).json({ error: 'Password admin salah' });

        const tenantId = getTenantId(req);
        if (!await verifyTenantInvoice(req.params.id, tenantId)) {
            return res.status(404).json({ error: 'Invoice tidak ditemukan' });
        }
        const [[inv]] = await db.query('SELECT * FROM billing_invoices WHERE id = ?', [req.params.id]);
        if (!inv) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
        if (inv.status !== 'paid') return res.status(400).json({ error: 'Invoice ini belum berstatus lunas' });

        await db.query(`
            UPDATE billing_invoices
            SET status = 'unpaid', paid_at = NULL, paid_by_id = NULL, payment_method = NULL,
                collector_proof = NULL,
                cancelled_at = NOW(), cancelled_by = ?, cancel_reason = ?
            WHERE id = ?
        `, [req.user.username, reason.trim(), req.params.id]);

        // Re-isolir jika sebelumnya diisolir (tidak perlu — pembatalan bukan berarti isolir)
        // Notifikasi ke admin
        createNotification('admin', 'all_admins', 'payment_cancelled',
            '⚠️ Pelunasan Dibatalkan',
            `Invoice #${inv.id} (${inv.username}, ${inv.period}) dibatalkan oleh ${req.user.username}. Alasan: ${reason}`,
            { invoice_id: inv.id, username: inv.username }, getTenantId(req)
        ).catch(() => {});

        res.json({ ok: true, message: 'Pelunasan berhasil dibatalkan' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/admin/invoices/:id — hapus invoice permanen
app.delete('/api/admin/invoices/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Hanya admin yang bisa menghapus invoice' });
    try {
        const { admin_password } = req.body;
        if (!admin_password) return res.status(400).json({ error: 'Password admin wajib diisi' });
        const [[adminUser]] = await db.query('SELECT password FROM system_accounts WHERE id = ?', [req.user.id]);
        const passMatch = await bcrypt.compare(admin_password, adminUser.password);
        if (!passMatch) return res.status(401).json({ error: 'Password admin salah' });

        const tenantId = getTenantId(req);
        if (!await verifyTenantInvoice(req.params.id, tenantId)) {
            return res.status(404).json({ error: 'Invoice tidak ditemukan' });
        }
        const [[inv]] = await db.query('SELECT * FROM billing_invoices WHERE id = ?', [req.params.id]);
        if (!inv) return res.status(404).json({ error: 'Invoice tidak ditemukan' });

        await db.query('DELETE FROM billing_invoices WHERE id = ?', [req.params.id]);
        res.json({ ok: true, message: `Invoice #${req.params.id} berhasil dihapus` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// LAPORAN KEUANGAN LANJUTAN
// =============================================

// GET /api/finances/trend — omzet 6 bulan terakhir (exclude diskon)
app.get('/api/finances/trend', authenticateToken, isAdmin, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query(`
            SELECT
                DATE_FORMAT(bi.paid_at, '%Y-%m') AS month,
                COALESCE(SUM(CASE WHEN bi.payment_method != 'discount' THEN bi.amount ELSE 0 END), 0) AS omzet,
                COALESCE(SUM(CASE WHEN bi.payment_method = 'cash' OR bi.payment_method IS NULL THEN bi.amount ELSE 0 END), 0) AS cash,
                COALESCE(SUM(CASE WHEN bi.payment_method NOT IN ('cash','discount') AND bi.payment_method IS NOT NULL THEN bi.amount ELSE 0 END), 0) AS transfer,
                COALESCE(SUM(CASE WHEN bi.payment_method = 'discount' THEN bi.amount ELSE 0 END), 0) AS diskon,
                COUNT(CASE WHEN bi.payment_method != 'discount' THEN 1 END) AS trx_count
            FROM billing_invoices bi
            JOIN customer_details cd ON bi.username = cd.username
            WHERE bi.status = 'paid'
              AND bi.paid_at >= DATE_SUB(DATE_FORMAT(NOW(),'%Y-%m-01'), INTERVAL 5 MONTH)
              AND cd.tenant_id = ?
            GROUP BY DATE_FORMAT(bi.paid_at, '%Y-%m')
            ORDER BY month ASC
        `, [tenantId]);
        // Pastikan 6 slot bulan selalu ada (isi 0 jika tidak ada data)
        const result = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setDate(1);
            d.setMonth(d.getMonth() - i);
            const key = getLocalPeriod(d);
            const label = d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
            const found = rows.find(r => r.month === key);
            result.push({
                month: key, label,
                omzet: Number(found?.omzet || 0),
                cash: Number(found?.cash || 0),
                transfer: Number(found?.transfer || 0),
                diskon: Number(found?.diskon || 0),
                trx_count: Number(found?.trx_count || 0)
            });
        }
        res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/finances/by-dusun?period=YYYY-MM — rekap lunas vs belum bayar per dusun
app.get('/api/finances/by-dusun', authenticateToken, isAdmin, async (req, res) => {
    const period = req.query.period || getLocalPeriod();
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query(`
            SELECT
                COALESCE(ta.dusun_nama, '(Tanpa Dusun)') AS dusun,
                COALESCE(ta.kelurahan_nama, '') AS kelurahan,
                COALESCE(ta.kecamatan_nama, '') AS kecamatan,
                COUNT(DISTINCT i.username) AS total_pelanggan,
                SUM(CASE WHEN i.status = 'paid' AND i.payment_method != 'discount' THEN 1 ELSE 0 END) AS lunas,
                SUM(CASE WHEN i.status = 'paid' AND i.payment_method = 'discount' THEN 1 ELSE 0 END) AS diskon,
                SUM(CASE WHEN i.status = 'unpaid' THEN 1 ELSE 0 END) AS belum_bayar,
                COALESCE(SUM(CASE WHEN i.status = 'paid' AND i.payment_method != 'discount' THEN i.amount ELSE 0 END), 0) AS omzet
            FROM billing_invoices i
            JOIN customer_details cd ON i.username = cd.username AND cd.tenant_id = i.tenant_id
            LEFT JOIN territory_areas ta ON ta.id = cd.territory_area_id
            WHERE i.period = ? AND i.tenant_id = ?
            GROUP BY ta.id, ta.dusun_nama, ta.kelurahan_nama, ta.kecamatan_nama
            ORDER BY belum_bayar DESC, omzet DESC
        `, [period, tenantId]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/finances/discounts?period=YYYY-MM — rekap diskon per periode
app.get('/api/finances/discounts', authenticateToken, isAdmin, async (req, res) => {
    const period = req.query.period || getLocalPeriod();
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query(`
            SELECT
                i.id, i.username, cd.fullname, i.period, i.amount,
                i.discount_reason, i.paid_at,
                sa.fullname AS discounted_by_name
            FROM billing_invoices i
            JOIN customer_details cd ON i.username = cd.username AND cd.tenant_id = i.tenant_id
            LEFT JOIN system_accounts sa ON i.discount_by = sa.id
            WHERE i.period = ? AND i.payment_method = 'discount' AND i.tenant_id = ?
            ORDER BY i.paid_at DESC
        `, [period, tenantId]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/installations?date=YYYY-MM-DD  → rekap per hari
// GET /api/installations?month=YYYY-MM    → rekap per bulan
app.get('/api/installations', authenticateToken, (req, res, next) => {
    if (!['admin', 'noc'].includes(req.user?.role)) return res.status(403).json({ error: 'Akses ditolak' });
    next();
}, async (req, res) => {
    const { date, month } = req.query;
    const tenantId = getTenantId(req);
    try {
        let whereClause, params;
        if (date) {
            whereClause = 'WHERE il.install_date = ? AND il.tenant_id = ?';
            params = [date, tenantId];
        } else if (month) {
            whereClause = "WHERE DATE_FORMAT(il.install_date, '%Y-%m') = ? AND il.tenant_id = ?";
            params = [month, tenantId];
        } else {
            whereClause = 'WHERE il.install_date = CURDATE() AND il.tenant_id = ?';
            params = [tenantId];
        }
        const [rows] = await db.query(`
            SELECT
                il.id, il.username, il.customer_id, il.fullname, il.phone,
                il.address, il.identity_number, il.groupname,
                il.territory_name, il.install_date,
                il.installed_by_id, il.installed_by_name,
                il.created_at,
                cd.original_install_date
            FROM installation_logs il
            LEFT JOIN customer_details cd ON cd.username = il.username
            ${whereClause}
            ORDER BY il.install_date DESC, il.id DESC
        `, params);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/invoices/:id/discount — admin apply diskon penuh ke invoice (tidak masuk omzet)
app.post('/api/invoices/:id/discount', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { reason = '' } = req.body || {};
    try {
        const tenantId = getTenantId(req);
        if (!await verifyTenantInvoice(id, tenantId)) return res.status(404).json({ error: 'Invoice tidak ditemukan.' });
        const [[inv]] = await db.query('SELECT id, username, amount, status FROM billing_invoices WHERE id = ?', [id]);
        if (!inv) return res.status(404).json({ error: 'Invoice tidak ditemukan.' });
        if (inv.status === 'paid') return res.status(400).json({ error: 'Invoice sudah lunas, tidak bisa didiskon.' });

        await db.query(
            `UPDATE billing_invoices
             SET status = 'paid', payment_method = 'discount', paid_at = NOW(),
                 discount = amount, discount_reason = ?, discount_by = ?, paid_by_id = ?
             WHERE id = ?`,
            [reason || null, req.user.id, req.user.id, id]
        );

        // Auto-reaktivasi isolir jika tidak ada lagi invoice unpaid
        const [[{ cnt }]] = await db.query(
            "SELECT COUNT(*) as cnt FROM billing_invoices WHERE username = ? AND status = 'unpaid'",
            [inv.username]
        );
        if (cnt === 0) {
            await db.query(
                "DELETE FROM radcheck WHERE username = ? AND attribute = 'Auth-Type' AND value = 'Reject'",
                [inv.username]
            );
        }

        console.log(`[DISCOUNT] Invoice #${id} (${inv.username}) Rp${inv.amount} didiskon oleh user #${req.user.id}`);
        res.json({ message: `Invoice bulan ini didiskon (Rp ${inv.amount}).` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- COLLECTOR SETORAN REPORT ---

// GET /api/collector/setoran?period=YYYY-MM&date=YYYY-MM-DD
// Admin only: rekap setoran per collector untuk periode atau tanggal tertentu
app.get('/api/collector/setoran', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Akses ditolak' });

    const { period, date } = req.query;
    try {
        // 1. Summary per collector (dengan breakdown cash vs transfer)
        // today_amount  = semua invoice yang dibayar HARI INI oleh kolektor (tanpa filter period)
        // period_amount = semua invoice yang dibayar di BULAN KALENDER yang dipilih (dari paid_at, bukan period invoice)
        const summaryMonth = period || new Date().toISOString().substring(0, 7); // YYYY-MM
        const summaryQuery = `
            SELECT
                sa.id            AS collector_id,
                sa.fullname      AS collector_name,
                sa.username      AS collector_username,
                COUNT(CASE WHEN DATE(i.paid_at) = CURDATE() THEN 1 END)                                                                                  AS today_count,
                COALESCE(SUM(CASE WHEN DATE(i.paid_at) = CURDATE() THEN i.amount END), 0)                                                                AS today_amount,
                COALESCE(SUM(CASE WHEN DATE(i.paid_at) = CURDATE() AND (i.payment_method = 'cash' OR i.payment_method IS NULL) THEN i.amount END), 0)    AS today_cash,
                COALESCE(SUM(CASE WHEN DATE(i.paid_at) = CURDATE() AND i.payment_method != 'cash' AND i.payment_method IS NOT NULL THEN i.amount END), 0) AS today_transfer,
                COUNT(CASE WHEN DATE_FORMAT(i.paid_at, '%Y-%m') = ? THEN 1 END)                                                                          AS period_count,
                COALESCE(SUM(CASE WHEN DATE_FORMAT(i.paid_at, '%Y-%m') = ? THEN i.amount END), 0)                                                        AS period_amount,
                COALESCE(SUM(CASE WHEN DATE_FORMAT(i.paid_at, '%Y-%m') = ? AND (i.payment_method = 'cash' OR i.payment_method IS NULL) THEN i.amount END), 0)    AS period_cash,
                COALESCE(SUM(CASE WHEN DATE_FORMAT(i.paid_at, '%Y-%m') = ? AND i.payment_method != 'cash' AND i.payment_method IS NOT NULL THEN i.amount END), 0) AS period_transfer
            FROM system_accounts sa
            LEFT JOIN billing_invoices i
                ON i.paid_by_id = sa.id
                AND i.status = 'paid'
                AND i.payment_method != 'discount'
            WHERE sa.role = 'collector' AND sa.tenant_id = ?
            GROUP BY sa.id, sa.fullname, sa.username
            ORDER BY today_amount DESC, period_amount DESC
        `;

        // 2. Detail invoice per collector (termasuk tanda ada/tidaknya bukti transfer)
        let detailQuery = `
            SELECT
                i.id, i.username, i.period, i.amount, i.payment_method, i.paid_at,
                i.paid_by_id,
                CASE WHEN i.collector_proof IS NOT NULL THEN 1 ELSE 0 END AS has_proof,
                c.fullname, c.phone,
                t.name AS territory_name
            FROM billing_invoices i
            LEFT JOIN customer_details c ON i.username = c.username AND c.tenant_id = i.tenant_id
            LEFT JOIN territories t ON c.territory_id = t.id
            WHERE i.status = 'paid' AND i.paid_by_id IS NOT NULL AND i.tenant_id = ?
        `;
        const detailParams = [];
        if (period) {
            detailQuery += ' AND i.period = ?';
            detailParams.push(period);
        }
        if (date) {
            detailQuery += ' AND DATE(i.paid_at) = ?';
            detailParams.push(date);
        }
        detailQuery += ' ORDER BY i.paid_at DESC';

        const tenantId = getTenantId(req);
        const [[summaryRows], [detailRows]] = await Promise.all([
            db.query(summaryQuery, [summaryMonth, summaryMonth, summaryMonth, summaryMonth, tenantId]),
            db.query(detailQuery, [tenantId, ...detailParams]),
        ]);

        // Gabungkan detail ke masing-masing collector
        const result = summaryRows.map(c => ({
            ...c,
            today_amount: Number(c.today_amount),
            today_cash: Number(c.today_cash),
            today_transfer: Number(c.today_transfer),
            period_amount: Number(c.period_amount),
            period_cash: Number(c.period_cash),
            period_transfer: Number(c.period_transfer),
            invoices: detailRows.filter(i => i.paid_by_id === c.collector_id),
        }));

        res.json(result);
    } catch (err) {
        console.error('[SETORAN ERROR]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/collector/history?collector_id=X&months=6
// Admin only: riwayat bulanan per collector (atau semua collector)
app.get('/api/collector/history', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Akses ditolak' });

    const { collector_id, months = 6 } = req.query;
    const monthLimit = Math.min(parseInt(months) || 6, 24);

    try {
        // Ambil daftar collector
        const tenantId = getTenantId(req);
        let collectorQuery = `SELECT id, fullname, username FROM system_accounts WHERE role = 'collector' AND tenant_id = ? ORDER BY fullname`;
        const collectorParams = [tenantId];
        if (collector_id) {
            collectorQuery = `SELECT id, fullname, username FROM system_accounts WHERE role = 'collector' AND tenant_id = ? AND id = ? ORDER BY fullname`;
            collectorParams.push(collector_id);
        }
        const [collectors] = await db.query(collectorQuery, collectorParams);

        if (collectors.length === 0) return res.json([]);

        // Ambil ringkasan bulanan per collector untuk N bulan terakhir
        const monthlyQuery = `
            SELECT
                i.paid_by_id AS collector_id,
                DATE_FORMAT(i.paid_at, '%Y-%m') AS month,
                COUNT(i.id) AS total_count,
                COALESCE(SUM(i.amount), 0) AS total_amount,
                COALESCE(SUM(CASE WHEN (i.payment_method = 'cash' OR i.payment_method IS NULL) THEN i.amount END), 0) AS cash_amount,
                COALESCE(SUM(CASE WHEN i.payment_method != 'cash' AND i.payment_method IS NOT NULL THEN i.amount END), 0) AS transfer_amount,
                COUNT(CASE WHEN (i.payment_method = 'cash' OR i.payment_method IS NULL) THEN 1 END) AS cash_count,
                COUNT(CASE WHEN i.payment_method != 'cash' AND i.payment_method IS NOT NULL THEN 1 END) AS transfer_count
            FROM billing_invoices i
            WHERE i.status = 'paid'
              AND i.payment_method != 'discount'
              AND i.paid_by_id IN (${collectors.map(() => '?').join(',')})
              AND i.paid_at >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
            GROUP BY i.paid_by_id, DATE_FORMAT(i.paid_at, '%Y-%m')
            ORDER BY month DESC
        `;
        const monthlyParams = [...collectors.map(c => c.id), monthLimit];
        const [monthlyRows] = await db.query(monthlyQuery, monthlyParams);

        const result = collectors.map(col => ({
            collector_id: col.id,
            collector_name: col.fullname,
            collector_username: col.username,
            monthly: monthlyRows
                .filter(r => r.collector_id === col.id)
                .map(r => ({
                    month: r.month,
                    total_count: Number(r.total_count),
                    total_amount: Number(r.total_amount),
                    cash_amount: Number(r.cash_amount),
                    transfer_amount: Number(r.transfer_amount),
                    cash_count: Number(r.cash_count),
                    transfer_count: Number(r.transfer_count),
                })),
        }));

        res.json(result);
    } catch (err) {
        console.error('[HISTORY ERROR]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/collector/my-collections — ringkasan koleksi milik kolektor yang sedang login
app.get('/api/collector/my-collections', authenticateToken, async (req, res) => {
    if (req.user.role !== 'collector') return res.status(403).json({ error: 'Akses ditolak' });
    const { period } = req.query; // opsional: YYYY-MM, default bulan berjalan
    const activePeriod = period || getLocalPeriod();
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query(`
            SELECT
                COUNT(*) AS total_count,
                COALESCE(SUM(amount), 0) AS total_amount,
                COALESCE(SUM(CASE WHEN payment_method = 'cash' OR payment_method IS NULL THEN amount END), 0) AS cash_amount,
                COALESCE(SUM(CASE WHEN payment_method != 'cash' AND payment_method IS NOT NULL THEN amount END), 0) AS transfer_amount,
                COUNT(CASE WHEN DATE(paid_at) = CURDATE() THEN 1 END) AS today_count,
                COALESCE(SUM(CASE WHEN DATE(paid_at) = CURDATE() THEN amount END), 0) AS today_amount
            FROM billing_invoices
            WHERE status = 'paid' AND payment_method != 'discount' AND paid_by_id = ? AND period = ? AND tenant_id = ?
        `, [req.user.id, activePeriod, tenantId]);

        const [detail] = await db.query(`
            SELECT i.id, i.username, i.period, i.amount, i.payment_method, i.paid_at,
                   CASE WHEN i.collector_proof IS NOT NULL THEN 1 ELSE 0 END AS has_proof,
                   c.fullname, c.phone, t.name AS territory_name
            FROM billing_invoices i
            LEFT JOIN customer_details c ON i.username = c.username AND c.tenant_id = i.tenant_id
            LEFT JOIN territories t ON c.territory_id = t.id
            WHERE i.status = 'paid' AND i.paid_by_id = ? AND i.period = ? AND i.tenant_id = ?
            ORDER BY i.paid_at DESC
        `, [req.user.id, activePeriod, tenantId]);

        res.json({ summary: rows[0], invoices: detail, period: activePeriod });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/invoices/:id/collector-proof
// Admin/collector: lihat bukti transfer yang di-upload collector
app.get('/api/invoices/:id/collector-proof', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query(
            'SELECT collector_proof, payment_method FROM billing_invoices WHERE id = ? AND tenant_id = ?', [id, tenantId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
        if (!rows[0].collector_proof) return res.status(404).json({ error: 'Tidak ada bukti transfer untuk invoice ini' });
        res.json({ image: rows[0].collector_proof, payment_method: rows[0].payment_method });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- MIKROTIK API INTEGRATION ---

// GET All MikroTik Configs — full (admin only, includes credentials)
app.get('/api/mikrotik/config', authenticateToken, isAdmin, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query('SELECT id, name, host, user, pass, port, radius_secret, radius_nas_ip, auth_mode FROM mikrotik_config WHERE tenant_id = ? ORDER BY id DESC', [tenantId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/mikrotik/routers — daftar router tanpa credentials (untuk PSB teknisi/NOC)
app.get('/api/mikrotik/routers', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query('SELECT id, name, host, auth_mode FROM mikrotik_config WHERE tenant_id = ? ORDER BY id DESC', [tenantId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST Add MikroTik Config & Register to RADIUS NAS
app.post('/api/mikrotik/config', authenticateToken, isAdmin, async (req, res) => {
    const { name, host, user, pass, port, radiusSecret, radiusNasIp, authMode } = req.body;
    const tenantId = getTenantId(req);
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Save for App API use
        const configName = name || `MikroTik-${host}`;
        const secret = radiusSecret || process.env.RADIUS_SECRET || 'Mynet@2026';
        const nasIp = (radiusNasIp || '').trim() || host;
        await connection.query(
            'INSERT INTO mikrotik_config (name, host, user, pass, port, radius_secret, radius_nas_ip, tenant_id, auth_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [configName, host, user, pass, port, secret, radiusNasIp || null, tenantId, authMode || null]
        );

        // 2. Register to RADIUS NAS table (pakai radius_nas_ip jika diisi, fallback ke host)
        await connection.query(
            'INSERT INTO nas (nasname, shortname, type, ports, secret, description) VALUES (?, ?, "other", 0, ?, ?) ON DUPLICATE KEY UPDATE secret = ?, description = ?',
            [nasIp, `MikroTik-${configName}`, secret, `RADIUS Client: ${configName}`, secret, `RADIUS Client: ${configName}`]
        );

        await connection.commit();
        res.json({ message: 'Router MikroTik berhasil ditambahkan dan teregistrasi ke RADIUS' });
        reloadFreeradius(); // NAS baru langsung dikenali FreeRADIUS
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// POST Reload FreeRADIUS Configuration
app.post('/api/radius/sync', authenticateToken, isAdmin, async (req, res) => {
    try {
        // Sync semua mikrotik_config ke nas table agar FreeRADIUS mengenali semua router
        const [routers] = await db.query('SELECT host, name, radius_nas_ip, radius_secret FROM mikrotik_config');
        for (const r of routers) {
            const nasname = r.radius_nas_ip || r.host;
            const secret = r.radius_secret || process.env.RADIUS_SECRET || 'Mynet@2026';
            await db.query(
                `INSERT INTO nas (nasname, shortname, secret, type, ports, community, description)
                 VALUES (?, ?, ?, 'other', 0, '', ?)
                 ON DUPLICATE KEY UPDATE secret = VALUES(secret), shortname = VALUES(shortname)`,
                [nasname, r.name, secret, r.name]
            );
        }
        // Restart FreeRADIUS agar load ulang nas table
        reloadFreeradius();
        res.json({
            message: `Sinkronisasi berhasil. ${routers.length} router disinkronkan ke RADIUS. FreeRADIUS sedang restart.`,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE MikroTik Config & Unregister from RADIUS NAS
app.put('/api/mikrotik/config/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, host, user, pass, port, radiusSecret, radiusNasIp, authMode } = req.body;
    if (!host || !user) return res.status(400).json({ error: 'Host dan User wajib diisi' });

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Ambil data lama untuk update NAS table
        const tenantId = getTenantId(req);
        const [old] = await connection.query('SELECT host, radius_secret, radius_nas_ip FROM mikrotik_config WHERE id = ? AND tenant_id = ?', [id, tenantId]);
        if (old.length === 0) return res.status(404).json({ error: 'Router tidak ditemukan' });
        const oldNasIp = (old[0].radius_nas_ip || '').trim() || old[0].host;
        const newSecret = radiusSecret?.trim() || old[0].radius_secret || 'Mynet@2026';
        const newNasIp = (radiusNasIp || '').trim() || host;

        // Update konfigurasi router
        const updateFields = ['name = ?', 'host = ?', 'user = ?', 'port = ?', 'radius_secret = ?', 'radius_nas_ip = ?', 'auth_mode = ?'];
        const updateValues = [name || '', host, user, port || 8728, newSecret, radiusNasIp || null, authMode ?? null];
        if (pass) { updateFields.push('pass = ?'); updateValues.push(pass); }
        updateValues.push(id);
        await connection.query(`UPDATE mikrotik_config SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);

        // Update NAS table — rename nasname jika NAS IP berubah
        if (oldNasIp !== newNasIp) {
            await connection.query('DELETE FROM nas WHERE nasname = ?', [oldNasIp]);
            await connection.query(
                'INSERT INTO nas (nasname, shortname, type, ports, secret, description) VALUES (?, ?, "other", 0, ?, ?) ON DUPLICATE KEY UPDATE secret = ?',
                [newNasIp, `MikroTik-${name || host}`, newSecret, `RADIUS Client: ${name || host}`, newSecret]
            );
        } else {
            // Upsert — insert jika belum ada, update jika sudah ada
            await connection.query(
                'INSERT INTO nas (nasname, shortname, type, ports, secret, description) VALUES (?, ?, "other", 0, ?, ?) ON DUPLICATE KEY UPDATE secret = ?, shortname = ?, description = ?',
                [newNasIp, `MikroTik-${name || host}`, newSecret, `RADIUS Client: ${name || host}`, newSecret, `MikroTik-${name || host}`, `RADIUS Client: ${name || host}`]
            );
        }

        await connection.commit();
        res.json({ message: 'Router berhasil diperbarui' });
        reloadFreeradius(); // NAS IP mungkin berubah, reload agar FreeRADIUS kenal NAS baru
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

app.delete('/api/mikrotik/config/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const tenantId = getTenantId(req);
        // 1. Get host IP to cleanup NAS table
        const [rows] = await connection.query('SELECT host FROM mikrotik_config WHERE id = ? AND tenant_id = ?', [id, tenantId]);
        if (rows.length > 0) {
            const host = rows[0].host;
            await connection.query('DELETE FROM nas WHERE nasname = ?', [host]);
        }

        // 2. Delete from app config
        await connection.query('DELETE FROM mikrotik_config WHERE id = ? AND tenant_id = ?', [id, tenantId]);

        await connection.commit();
        res.json({ message: 'Router MikroTik berhasil dihapus' });
        reloadFreeradius(); // Hapus NAS, reload FreeRADIUS agar tidak terima request dari NAS lama
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

app.get('/api/mikrotik/profiles', authenticateToken, async (req, res) => {
    let client;
    try {
        const tenantId = getTenantId(req);
        const [tenantRouters] = await db.query('SELECT id FROM mikrotik_config WHERE tenant_id = ? ORDER BY id DESC LIMIT 1', [tenantId]);
        if (tenantRouters.length === 0) return res.json([]);
        client = await getMikrotikClient(tenantRouters[0].id);
        const connection = await client.connect();
        const profiles = await connection.menu('/ppp/profile').get();
        await client.close();
        res.json(profiles.map(p => ({ name: p.name })));
    } catch (err) {
        if (client) try { await client.close(); } catch (e) { }
        // No config or unreachable router — return empty list instead of 500
        if (err.message && (err.message.includes('tidak ditemukan') || err.message.includes('not found') || err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT'))) {
            return res.json([]);
        }
        res.status(500).json({ error: 'Gagal terhubung ke MikroTik API: ' + err.message });
    }
});

// GET MikroTik Router Status (Check Connection)
// Selalu buat koneksi fresh (bypass pool) agar benar-benar verifikasi koneksi saat ini
app.get('/api/mikrotik/status/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    let freshClient = null;
    try {
        const tenantId = getTenantId(req);
        const [[config]] = await db.query('SELECT * FROM mikrotik_config WHERE id = ? AND tenant_id = ?', [id, tenantId]);
        if (!config) return res.status(404).json({ status: 'offline', error: 'Router tidak ditemukan' });
        // Fresh connection — tidak pakai pool, agar status check benar-benar live
        const { client, conn } = await _mtConnect(config);
        freshClient = client;
        // Verifikasi koneksi dengan perintah ringan
        await Promise.race([
            conn.menu('/system/identity').getOnly(),
            new Promise((_, r) => setTimeout(() => r(new Error('Verifikasi koneksi timeout')), 5000))
        ]);
        try { await client.close(); } catch {}
        res.json({ status: 'online' });
    } catch (err) {
        if (freshClient) try { await freshClient.close(); } catch {}
        res.json({ status: 'offline', error: err.message });
    }
});

// DEBUG: Test koneksi MikroTik API + cek active sessions + test kick (admin only)
app.get('/api/debug/mikrotik/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const report = { router: null, api_connect: false, api_error: null, ppp_active_count: 0, ppp_sessions: [], radclient_path: null };
    let client;
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query('SELECT id, host, name, user, port FROM mikrotik_config WHERE id = ? AND tenant_id = ?', [id, tenantId]);
        if (!rows[0]) return res.status(404).json({ error: 'Router tidak ditemukan' });
        report.router = { id: rows[0].id, host: rows[0].host, name: rows[0].name, user: rows[0].user, port: rows[0].port };

        client = await getMikrotikClient(id);
        const connection = await client.connect();
        report.api_connect = true;

        const pppActive = await connection.menu('/ppp/active').get();
        report.ppp_active_count = pppActive.length;
        report.ppp_sessions = pppActive.slice(0, 20).map(s => ({ name: s.name, address: s.address, uptime: s.uptime }));

        await client.close();
    } catch (err) {
        if (client) try { await client.close(); } catch (e) {}
        report.api_error = err.message;
    }

    // Cek radclient
    const { execSync } = require('child_process');
    try {
        execSync('which radclient');
        report.radclient_path = execSync('which radclient').toString().trim();
    } catch (e) {
        report.radclient_path = 'NOT FOUND - radclient tidak terinstall';
    }

    res.json(report);
});

// DEBUG: Test kick user tertentu langsung
app.post('/api/debug/kick/:username', authenticateToken, isAdmin, async (req, res) => {
    const { username } = req.params;
    const result = { username, kicked: 0, error: null };
    try {
        const tenantId = getTenantId(req);
        if (!await verifyTenantUser(username, tenantId)) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
        result.kicked = await kickMikrotikUser(username, null, tenantId);
    } catch (err) {
        result.error = err.message;
    }
    res.json(result);
});

// --- ACCOUNTING LOGS ---

// GET All Accounting Logs
app.get('/api/logs', authenticateToken, isAdmin, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const query = `
            SELECT
                r.username,
                r.acctstarttime as login_time,
                r.acctstoptime as logout_time,
                r.acctsessiontime as duration,
                ROUND(r.acctinputoctets / 1048576, 2) as upload_mb,
                ROUND(r.acctoutputoctets / 1048576, 2) as download_mb,
                r.callingstationid as mac_address,
                r.nasipaddress as router_ip
            FROM radacct r
            INNER JOIN customer_details cd ON r.username = cd.username AND cd.tenant_id = ?
            ORDER BY r.acctstarttime DESC
            LIMIT 100
        `;
        const [rows] = await db.query(query, [tenantId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- IP POOL MANAGEMENT (SQL IPPOOL) ---

// GET IP Pools — ambil dari app_ip_pools (nama referensi saja, MikroTik yg manage actual pool)
app.get('/api/ippools', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query('SELECT id, name AS pool_name, description, created_at FROM app_ip_pools WHERE tenant_id = ? ORDER BY name', [tenantId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST Tambah nama IP Pool baru (tanpa range IP)
app.post('/api/ippools', authenticateToken, isAdmin, async (req, res) => {
    const { pool_name, description } = req.body;
    if (!pool_name || !pool_name.trim()) {
        return res.status(400).json({ error: 'Nama pool wajib diisi' });
    }
    try {
        const tenantId = getTenantId(req);
        await db.query('INSERT INTO app_ip_pools (name, description, tenant_id) VALUES (?, ?, ?)', [pool_name.trim(), description || null, tenantId]);
        res.status(201).json({ message: `IP Pool '${pool_name}' berhasil ditambahkan`, pool_name: pool_name.trim() });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: `Pool '${pool_name}' sudah ada` });
        res.status(500).json({ error: err.message });
    }
});

// PUT Update/Rename IP Pool
app.put('/api/ippools/:oldName', authenticateToken, isAdmin, async (req, res) => {
    const { newName } = req.body;
    const { oldName } = req.params;
    const tenantId = getTenantId(req);

    if (!newName) return res.status(400).json({ error: 'Nama pool baru wajib diisi' });

    // Verifikasi pool milik tenant ini
    const [[poolCheck]] = await db.query('SELECT id FROM app_ip_pools WHERE name = ? AND tenant_id = ?', [oldName, tenantId]);
    if (!poolCheck) return res.status(404).json({ error: 'IP Pool tidak ditemukan' });

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Ubah nama di app_ip_pools
        await connection.query('UPDATE app_ip_pools SET name = ? WHERE name = ? AND tenant_id = ?', [newName, oldName, tenantId]);

        // 2. Ubah juga di radgroupreply agar paket yang pakai pool ini update otomatis
        await connection.query('UPDATE radgroupreply SET value = ? WHERE attribute = "Pool-Name" AND value = ?', [newName, oldName]);

        await connection.commit();
        res.json({ message: `IP Pool berhasil diubah menjadi ${newName}` });
    } catch (err) {
        await connection.rollback();
        if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: `Pool '${newName}' sudah ada` });
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// DELETE IP Pool
app.delete('/api/ippools/:name', authenticateToken, isAdmin, async (req, res) => {
    const { name } = req.params;
    const tenantId = getTenantId(req);
    try {
        // Verifikasi pool milik tenant ini
        const [[poolCheck]] = await db.query('SELECT id FROM app_ip_pools WHERE name = ? AND tenant_id = ?', [name, tenantId]);
        if (!poolCheck) return res.status(404).json({ error: 'Pool tidak ditemukan' });

        // Cek apakah pool dipakai oleh paket aktif
        const [profiles] = await db.query(
            'SELECT groupname FROM radgroupreply WHERE attribute = "Pool-Name" AND value = ?', [name]
        );
        if (profiles.length > 0) {
            const groups = profiles.map(p => p.groupname).join(', ');
            return res.status(400).json({ error: `Tidak bisa hapus pool '${name}', masih dipakai oleh paket: ${groups}` });
        }
        await db.query('DELETE FROM app_ip_pools WHERE name = ? AND tenant_id = ?', [name, tenantId]);
        res.json({ message: `IP Pool '${name}' berhasil dihapus` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET Test User Authentication
app.get('/api/test/user/:username', authenticateToken, isAdmin, async (req, res) => {
    const { username } = req.params;
    try {
        // Verifikasi pelanggan milik tenant ini
        const tenantId = getTenantId(req);
        const [[custCheck]] = await db.query('SELECT 1 FROM customer_details WHERE username = ? AND tenant_id = ?', [username, tenantId]);
        if (!custCheck) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });

        // 1. Check radcheck
        const [radcheck] = await db.query('SELECT * FROM radcheck WHERE username = ?', [username]);

        // 2. Check radusergroup
        const [usergroup] = await db.query('SELECT * FROM radusergroup WHERE username = ?', [username]);

        // 3. Check IP Pool availability
        let poolInfo = null;
        if (usergroup.length > 0) {
            const groupname = usergroup[0].groupname;
            const [poolName] = await db.query(
                'SELECT value FROM radgroupreply WHERE groupname = ? AND attribute = "Pool-Name"',
                [groupname]
            );
            if (poolName.length > 0) {
                const [poolStats] = await db.query(
                    'SELECT COUNT(*) as total, SUM(CASE WHEN username = "" THEN 1 ELSE 0 END) as available FROM radippool WHERE pool_name = ?',
                    [poolName[0].value]
                );
                poolInfo = {
                    pool_name: poolName[0].value,
                    ...poolStats[0]
                };
            }
        }

        // 4. Check active session
        const [activeSessions] = await db.query(
            'SELECT * FROM radacct WHERE username = ? AND acctstoptime IS NULL',
            [username]
        );

        res.json({
            username,
            radcheck,
            usergroup,
            poolInfo,
            activeSessions,
            diagnosis: {
                hasPassword: radcheck.some(r => r.attribute === 'Cleartext-Password'),
                isBlocked: radcheck.some(r => r.attribute === 'Auth-Type' && r.value === 'Reject'),
                hasGroup: usergroup.length > 0,
                poolAvailable: poolInfo ? poolInfo.available > 0 : false,
                hasActiveSession: activeSessions.length > 0
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================
// PAYMENT GATEWAY INTEGRATION
// =========================================================

const crypto = require('crypto');
const https = require('https');

// Helper: generate unique payment order ID
const generateOrderId = (invoiceId) => {
    const ts = Date.now();
    return `PMY-INV${invoiceId}-${ts}`;
};

// Helper: make HTTPS POST request
const httpPost = (url, headers, body) => {
    return new Promise((resolve, reject) => {
        const bodyStr = JSON.stringify(body);
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyStr),
                ...headers
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
                catch (e) { resolve({ status: res.statusCode, data }); }
            });
        });
        req.on('error', reject);
        req.write(bodyStr);
        req.end();
    });
};

// GET Payment Gateway Settings (admin only)
app.get('/api/payment-gateway/config', authenticateToken, isAdmin, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query('SELECT setting_key, setting_value FROM billing_settings WHERE setting_key LIKE "pg_%" AND tenant_id = ?', [tenantId]);
        const config = {};
        rows.forEach(r => config[r.setting_key] = r.setting_value);
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST Save Payment Gateway Settings (admin only)
app.post('/api/payment-gateway/config', authenticateToken, isAdmin, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const settings = req.body;
        const allowed = [
            'pg_active_gateway',
            'pg_duitku_active', 'pg_duitku_merchant_code', 'pg_duitku_api_key', 'pg_duitku_sandbox',
            'pg_tripay_active', 'pg_tripay_merchant_code', 'pg_tripay_api_key', 'pg_tripay_private_key', 'pg_tripay_sandbox',
            'pg_xendit_active', 'pg_xendit_api_key', 'pg_xendit_webhook_token',
            'pg_midtrans_active', 'pg_midtrans_server_key', 'pg_midtrans_client_key', 'pg_midtrans_sandbox',
            'pg_app_base_url',
            'transfer_bank_name', 'transfer_account_number', 'transfer_account_name',
            'transfer_bank_2_name', 'transfer_bank_2_number', 'transfer_bank_2_account'
        ];
        for (const [key, value] of Object.entries(settings)) {
            if (!allowed.includes(key)) continue;
            await db.query(
                'INSERT INTO billing_settings (setting_key, setting_value, tenant_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
                [key, value, tenantId, value]
            );
        }
        res.json({ message: 'Konfigurasi payment gateway berhasil disimpan.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST Create Payment Link
// Body: { invoice_id, gateway } — gateway: 'duitku' | 'tripay' | 'xendit' | 'midtrans'
app.post('/api/payment-gateway/create', authenticateToken, async (req, res) => {
    const { invoice_id, gateway } = req.body;
    if (!invoice_id || !gateway) {
        return res.status(400).json({ error: 'invoice_id dan gateway wajib diisi' });
    }

    try {
        const tenantId = getTenantId(req);
        if (!await verifyTenantInvoice(invoice_id, tenantId)) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
        // 1. Get invoice + customer info
        const [invoices] = await db.query(
            `SELECT i.*, c.fullname, c.phone, c.address, c.customer_id
             FROM billing_invoices i
             LEFT JOIN customer_details c ON i.username = c.username AND c.tenant_id = i.tenant_id
             WHERE i.id = ?`,
            [invoice_id]
        );
        if (invoices.length === 0) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
        const invoice = invoices[0];
        if (invoice.status === 'paid') return res.status(400).json({ error: 'Invoice sudah lunas' });

        // 2. Get gateway config from billing_settings (tenant ini)
        const [settingRows] = await db.query('SELECT setting_key, setting_value FROM billing_settings WHERE setting_key LIKE "pg_%" AND tenant_id = ?', [tenantId]);
        const cfg = {};
        settingRows.forEach(r => cfg[r.setting_key] = r.setting_value);

        const baseUrl = cfg.pg_app_base_url || 'https://pmyradius.salfa.my.id';
        const orderId = generateOrderId(invoice_id);
        const amount = Math.round(Number(invoice.amount));
        const customerName = invoice.fullname || invoice.username;
        const customerPhone = invoice.phone || '08123456789';
        const customerEmail = `${invoice.username}@billing.local`;
        const description = `Tagihan Internet ${invoice.username} periode ${invoice.period}`;
        const callbackUrl = `${baseUrl}/api/payment-gateway/webhook`;
        const returnUrl = `${baseUrl}/portal?status=success`;

        // 3. Save order_id to invoice for webhook lookup (scoped per tenant)
        await db.query(
            'INSERT INTO billing_settings (setting_key, setting_value, tenant_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
            [`pg_order_${orderId}`, invoice_id, tenantId, invoice_id]
        );

        let paymentUrl = null;
        let paymentData = {};

        // ---- DUITKU ----
        if (gateway === 'duitku') {
            const merchantCode = cfg.pg_duitku_merchant_code;
            const apiKey = cfg.pg_duitku_api_key;
            const sandbox = cfg.pg_duitku_sandbox === '1';
            if (!merchantCode || !apiKey) return res.status(400).json({ error: 'Konfigurasi Duitku belum lengkap' });

            const signature = crypto.createHash('md5')
                .update(`${merchantCode}${orderId}${amount}${apiKey}`)
                .digest('hex');

            const duitkuUrl = sandbox
                ? 'https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry'
                : 'https://passport.duitku.com/webapi/api/merchant/v2/inquiry';

            const response = await httpPost(duitkuUrl, {}, {
                merchantCode, paymentAmount: amount, merchantOrderId: orderId,
                productDetails: description, customerVaName: customerName,
                email: customerEmail, phoneNumber: customerPhone,
                itemDetails: [{ name: description, price: amount, quantity: 1 }],
                callbackUrl, returnUrl, signature,
                expiryPeriod: 1440
            });

            if (response.data.statusCode === '00') {
                paymentUrl = response.data.paymentUrl;
                paymentData = { reference: response.data.reference, va_number: response.data.vaNumber };
            } else {
                throw new Error(`Duitku: ${response.data.statusMessage || 'Gagal membuat transaksi'}`);
            }
        }

        // ---- TRIPAY ----
        else if (gateway === 'tripay') {
            const merchantCode = cfg.pg_tripay_merchant_code;
            const apiKey = cfg.pg_tripay_api_key;
            const privateKey = cfg.pg_tripay_private_key;
            const sandbox = cfg.pg_tripay_sandbox === '1';
            if (!merchantCode || !apiKey || !privateKey) return res.status(400).json({ error: 'Konfigurasi Tripay belum lengkap' });

            const signature = crypto.createHmac('sha256', privateKey)
                .update(`${merchantCode}${orderId}${amount}`)
                .digest('hex');

            const tripayUrl = sandbox
                ? 'https://tripay.co.id/api-sandbox/transaction/create'
                : 'https://tripay.co.id/api/transaction/create';

            const response = await httpPost(tripayUrl,
                { 'Authorization': `Bearer ${apiKey}` },
                {
                    method: 'QRIS', merchant_ref: orderId, amount,
                    customer_name: customerName, customer_email: customerEmail,
                    customer_phone: customerPhone,
                    order_items: [{ name: description, price: amount, quantity: 1 }],
                    callback_url: callbackUrl, return_url: returnUrl, signature,
                    expired_time: Math.floor(Date.now() / 1000) + 86400
                }
            );

            if (response.data.success) {
                paymentUrl = response.data.data.checkout_url;
                paymentData = { reference: response.data.data.reference, pay_code: response.data.data.pay_code };
            } else {
                throw new Error(`Tripay: ${response.data.message || 'Gagal membuat transaksi'}`);
            }
        }

        // ---- XENDIT ----
        else if (gateway === 'xendit') {
            const apiKey = cfg.pg_xendit_api_key;
            if (!apiKey) return res.status(400).json({ error: 'Konfigurasi Xendit belum lengkap' });

            const auth = Buffer.from(`${apiKey}:`).toString('base64');
            const response = await httpPost('https://api.xendit.co/v2/invoices',
                { 'Authorization': `Basic ${auth}` },
                {
                    external_id: orderId, amount, payer_email: customerEmail,
                    description, customer: { given_names: customerName, mobile_number: customerPhone },
                    invoice_duration: 86400, currency: 'IDR',
                    success_redirect_url: returnUrl, failure_redirect_url: `${baseUrl}/portal?status=failed`
                }
            );

            if (response.data.id) {
                paymentUrl = response.data.invoice_url;
                paymentData = { invoice_id: response.data.id, expiry: response.data.expiry_date };
            } else {
                throw new Error(`Xendit: ${JSON.stringify(response.data)}`);
            }
        }

        // ---- MIDTRANS ----
        else if (gateway === 'midtrans') {
            const serverKey = cfg.pg_midtrans_server_key;
            const sandbox = cfg.pg_midtrans_sandbox !== '0';
            if (!serverKey) return res.status(400).json({ error: 'Konfigurasi Midtrans belum lengkap' });

            const auth = Buffer.from(`${serverKey}:`).toString('base64');
            const snapUrl = sandbox
                ? 'https://app.sandbox.midtrans.com/snap/v1/transactions'
                : 'https://app.midtrans.com/snap/v1/transactions';

            const response = await httpPost(snapUrl,
                { 'Authorization': `Basic ${auth}` },
                {
                    transaction_details: { order_id: orderId, gross_amount: amount },
                    customer_details: { first_name: customerName, email: customerEmail, phone: customerPhone },
                    item_details: [{ id: `INV-${invoice_id}`, name: description, price: amount, quantity: 1 }],
                    callbacks: { finish: returnUrl, error: `${baseUrl}/portal?status=failed`, pending: `${baseUrl}/portal?status=pending` }
                }
            );

            if (response.data.token) {
                paymentUrl = response.data.redirect_url;
                paymentData = { snap_token: response.data.token };
            } else {
                throw new Error(`Midtrans: ${JSON.stringify(response.data.error_messages || response.data)}`);
            }
        }

        else {
            return res.status(400).json({ error: `Gateway tidak dikenal: ${gateway}` });
        }

        // 4. Save payment link to invoice record (payment_method = gateway name, status stays 'unpaid')
        await db.query(
            'UPDATE billing_invoices SET payment_method = ? WHERE id = ?',
            [gateway, invoice_id]
        );

        res.json({
            message: 'Link pembayaran berhasil dibuat',
            order_id: orderId,
            payment_url: paymentUrl,
            gateway,
            amount,
            ...paymentData
        });

    } catch (err) {
        console.error('[PAYMENT CREATE ERROR]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST Payment Webhook (callback dari gateway)
app.post('/api/payment-gateway/webhook', async (req, res) => {
    try {
        // req.body is already parsed by express.json() or express.urlencoded()
        const body = req.body || {};
        const payload = (body.event && body.data) ? body.data : body;
        console.log('[WEBHOOK] Received:', JSON.stringify(payload, null, 2));

        let orderId = null;
        let isPaid = false;
        let gateway = 'unknown';

        // Tahap 1: Identifikasi gateway dan ekstrak orderId (TANPA validasi signature dulu)
        if (payload.merchantOrderId && payload.resultCode !== undefined) {
            gateway = 'duitku';
            orderId = payload.merchantOrderId;
            isPaid = payload.resultCode === '00';
        } else if (payload.external_id && payload.status) {
            gateway = 'xendit';
            orderId = payload.external_id;
            isPaid = ['PAID', 'SETTLED'].includes(payload.status?.toUpperCase());
        } else if (payload.order_id && payload.transaction_status) {
            gateway = 'midtrans';
            orderId = payload.order_id;
            const ts = payload.transaction_status;
            isPaid = ts === 'settlement' || (ts === 'capture' && payload.fraud_status === 'accept');
        } else if (payload.merchant_ref && payload.status) {
            gateway = 'tripay';
            orderId = payload.merchant_ref;
            isPaid = payload.status === 'PAID';
        }

        if (!orderId) {
            console.error('[WEBHOOK] Unknown payload structure:', payload);
            return res.status(400).json({ error: 'Unknown gateway payload' });
        }

        // Tahap 2: Lookup invoice_id dari billing_settings (key: pg_order_<orderId>)
        const [lookup] = await db.query(
            'SELECT setting_value FROM billing_settings WHERE setting_key = ?',
            [`pg_order_${orderId}`]
        );

        if (lookup.length === 0) {
            console.error('[WEBHOOK] Order not found in lookup:', orderId);
            return res.status(404).json({ error: 'Order tidak ditemukan' });
        }

        const invoiceId = lookup[0].setting_value;

        // Tahap 3: Dapatkan tenant_id dari invoice agar validasi signature menggunakan konfigurasi PG tenant yang benar
        const [[invoiceTenant]] = await db.query('SELECT tenant_id FROM billing_invoices WHERE id = ?', [invoiceId]);
        const webhookTenantId = invoiceTenant ? invoiceTenant.tenant_id : null;

        // Tahap 4: Load konfigurasi PG khusus tenant ini
        const pgQuery = webhookTenantId
            ? 'SELECT setting_key, setting_value FROM billing_settings WHERE setting_key LIKE "pg_%" AND tenant_id = ?'
            : 'SELECT setting_key, setting_value FROM billing_settings WHERE setting_key LIKE "pg_%"';
        const pgParams = webhookTenantId ? [webhookTenantId] : [];
        const [settingRows] = await db.query(pgQuery, pgParams);
        const cfg = {};
        settingRows.forEach(r => cfg[r.setting_key] = r.setting_value);

        // Tahap 5: Validasi signature menggunakan konfigurasi tenant yang tepat
        if (gateway === 'duitku') {
            const merchantCode = cfg.pg_duitku_merchant_code;
            const apiKey = cfg.pg_duitku_api_key;
            if (merchantCode && apiKey) {
                const expected = crypto.createHash('md5')
                    .update(`${merchantCode}${payload.amount}${orderId}${apiKey}`)
                    .digest('hex');
                if (payload.signature !== expected) {
                    console.error('[WEBHOOK][Duitku] Invalid signature');
                    return res.status(401).json({ error: 'Invalid signature' });
                }
            }
        } else if (gateway === 'xendit') {
            const token = req.headers['x-callback-token'];
            const webhookToken = cfg.pg_xendit_webhook_token;
            if (webhookToken && token !== webhookToken) {
                console.error('[WEBHOOK][Xendit] Invalid callback token');
                return res.status(401).json({ error: 'Invalid token' });
            }
        } else if (gateway === 'midtrans') {
            const serverKey = cfg.pg_midtrans_server_key;
            if (serverKey && payload.signature_key) {
                const expected = crypto.createHash('sha512')
                    .update(`${orderId}${payload.status_code}${payload.gross_amount}${serverKey}`)
                    .digest('hex');
                if (payload.signature_key !== expected) {
                    console.error('[WEBHOOK][Midtrans] Invalid signature');
                    return res.status(401).json({ error: 'Invalid signature' });
                }
            }
        }
        // Tripay: signature verification requires raw body; skipping if not available

        console.log(`[WEBHOOK][${gateway}] OrderID=${orderId} isPaid=${isPaid}`);

        if (!isPaid) {
            return res.json({ message: 'Webhook diterima (tidak paid)', orderId, gateway });
        }

        // Mark invoice as paid
        await db.query(
            'UPDATE billing_invoices SET status = "paid", payment_method = ?, paid_at = NOW() WHERE id = ? AND status != "paid"',
            [gateway, invoiceId]
        );

        // Auto-reaktivasi jika diisolir
        const [inv] = await db.query('SELECT username FROM billing_invoices WHERE id = ?', [invoiceId]);
        if (inv.length > 0) {
            const paidUsername = inv[0].username;
            await db.query(
                "DELETE FROM radcheck WHERE username = ? AND attribute = 'Auth-Type' AND value = 'Reject'",
                [paidUsername]
            );
            console.log(`[WEBHOOK] Invoice #${invoiceId} (${paidUsername}) marked PAID via ${gateway}`);

            // Ambil info pelanggan untuk notifikasi
            const [custInfo] = await db.query(
                'SELECT cd.fullname, bi.amount FROM billing_invoices bi LEFT JOIN customer_details cd ON bi.username = cd.username WHERE bi.id = ?',
                [invoiceId]
            );
            const custName = custInfo[0]?.fullname || paidUsername;
            const paidAmount = Number(custInfo[0]?.amount || 0).toLocaleString('id-ID');
            const gwLabel = { midtrans: 'Midtrans', xendit: 'Xendit', duitku: 'Duitku', tripay: 'Tripay' }[gateway] || gateway;

            // Notifikasi ke admin — sertakan webhookTenantId agar tidak bocor ke mitra lain
            createNotification(
                'admin', 'all_admins', 'payment_received',
                'Pembayaran via Payment Gateway',
                `${custName} telah membayar Invoice #${String(invoiceId).padStart(5,'0')} sebesar Rp ${paidAmount} via ${gwLabel}. Invoice otomatis lunas.`,
                { invoice_id: invoiceId, username: paidUsername, gateway }, webhookTenantId
            );

            // Notifikasi ke pelanggan
            createNotification(
                'customer', paidUsername, 'payment_confirmed',
                'Pembayaran Berhasil ✓',
                `Pembayaran Invoice #${String(invoiceId).padStart(5,'0')} sebesar Rp ${paidAmount} via ${gwLabel} telah diterima. Akses internet kamu aktif.`,
                { invoice_id: invoiceId, gateway }, webhookTenantId
            );

            checkFulfillPromise(paidUsername).catch(() => {});
            reactivateLocalAuth(paidUsername, webhookTenantId).catch(() => {});
            // Kick via RouterOS API agar PPPoE client langsung retry konek
            kickMikrotikUser(paidUsername)
                .then(n => { if (n > 0) console.log(`[WEBHOOK] RouterOS kick ${n} sesi untuk ${paidUsername}`) })
                .catch(e => console.error(`[WEBHOOK] RouterOS kick error:`, e.message));
        }

        res.json({ message: 'OK', invoiceId, gateway });
    } catch (err) {
        console.error('[WEBHOOK ERROR]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// =============================================
// CUSTOMER PORTAL ROUTES
// =============================================

// POST /api/portal/login - login pakai nomor HP + PIN
app.post('/api/portal/login', async (req, res) => {
    const { phone, pin } = req.body;
    if (!phone) return res.status(400).json({ error: 'Nomor HP wajib diisi.' });
    if (!pin)   return res.status(400).json({ error: 'PIN wajib diisi.' });

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const cleanPhone = phone.replace(/[\s\-().+]/g, '');

    try {
        // Rate limiting: max 5 percobaan per nomor HP dalam 5 menit
        const [attempts] = await db.query(
            `SELECT COUNT(*) as cnt FROM portal_login_attempts
             WHERE phone = ? AND attempted_at > NOW() - INTERVAL 5 MINUTE`,
            [cleanPhone]
        );
        if (attempts[0].cnt >= 5) {
            return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi dalam 5 menit.' });
        }

        const [rows] = await db.query(
            `SELECT cd.*, rug.groupname as package_name, bp.rate_limit, bp.price
             FROM customer_details cd
             LEFT JOIN radusergroup rug ON cd.username = rug.username
             LEFT JOIN bandwidth_profiles bp ON rug.groupname = bp.name AND bp.tenant_id = cd.tenant_id
             WHERE REPLACE(REPLACE(REPLACE(cd.phone, ' ', ''), '-', ''), '+', '') = ?
                OR cd.phone = ?`,
            [cleanPhone, phone.trim()]
        );

        // Catat percobaan (sebelum cek hasil — agar gagal karena nomor tidak ada pun tetap ter-rate-limit)
        await db.query(
            `INSERT INTO portal_login_attempts (phone, ip) VALUES (?, ?)`,
            [cleanPhone, ip]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Nomor HP atau PIN salah.' });
        }

        // Jika nomor HP terdaftar di lebih dari satu mitra, tolak login untuk keamanan
        if (rows.length > 1) {
            return res.status(409).json({ error: 'Nomor HP terdaftar di lebih dari satu akun. Hubungi admin.' });
        }

        const customer = rows[0];

        // Cek PIN
        if (!customer.pin_hash) {
            return res.status(401).json({ error: 'PIN belum diatur. Hubungi admin untuk mengaktifkan akses portal.' });
        }
        const pinMatch = await bcrypt.compare(String(pin), customer.pin_hash);
        if (!pinMatch) {
            return res.status(401).json({ error: 'Nomor HP atau PIN salah.' });
        }

        // Login berhasil — hapus percobaan gagal untuk nomor ini
        await db.query(`DELETE FROM portal_login_attempts WHERE phone = ?`, [cleanPhone]);

        const { pin_hash, ...safeCustomer } = customer; // jangan return pin_hash ke frontend
        const token = jwt.sign(
            { id: customer.username, username: customer.username, role: 'customer', tenant_id: customer.tenant_id },
            JWT_SECRET,
            { expiresIn: '90d' }
        );
        res.json({ token, customer: safeCustomer });
    } catch (err) {
        console.error('[PORTAL LOGIN]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/portal/change-pin - ganti PIN (pelanggan, harus login)
app.post('/api/portal/change-pin', authenticateToken, isCustomer, async (req, res) => {
    const { old_pin, new_pin } = req.body;
    if (!old_pin || !new_pin) return res.status(400).json({ error: 'PIN lama dan PIN baru wajib diisi.' });
    if (!/^\d{6}$/.test(String(new_pin))) return res.status(400).json({ error: 'PIN harus 6 digit angka.' });
    try {
        const [rows] = await db.query('SELECT pin_hash FROM customer_details WHERE username = ?', [req.user.username]);
        if (!rows.length || !rows[0].pin_hash) return res.status(400).json({ error: 'PIN belum diatur. Hubungi admin.' });
        const match = await bcrypt.compare(String(old_pin), rows[0].pin_hash);
        if (!match) return res.status(401).json({ error: 'PIN lama salah.' });
        const newHash = await bcrypt.hash(String(new_pin), 10);
        await db.query('UPDATE customer_details SET pin_hash = ?, pin_is_default = 0 WHERE username = ?', [newHash, req.user.username]);
        res.json({ message: 'PIN berhasil diubah.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/users/:username/set-pin - set/reset PIN oleh admin
app.post('/api/users/:username/set-pin', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Akses ditolak.' });
    }
    const { username } = req.params;
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: 'PIN wajib diisi.' });
    if (!/^\d{6}$/.test(String(pin))) return res.status(400).json({ error: 'PIN harus 6 digit angka.' });
    try {
        const tenantId = getTenantId(req);
        const hash = await bcrypt.hash(String(pin), 10);
        const [result] = await db.query('UPDATE customer_details SET pin_hash = ?, pin_is_default = 1 WHERE username = ? AND tenant_id = ?', [hash, username, tenantId]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Pelanggan tidak ditemukan.' });
        res.json({ message: `PIN untuk ${username} berhasil diatur.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/portal/me - profil pelanggan
app.get('/api/portal/me', authenticateToken, isCustomer, async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT cd.*,
             rug.groupname as package_name,
             bp.rate_limit, bp.price,
             (SELECT COUNT(*) FROM radcheck WHERE username = cd.username AND attribute = 'Auth-Type' AND value = 'Reject') as is_suspended
             FROM customer_details cd
             LEFT JOIN radusergroup rug ON cd.username = rug.username
             LEFT JOIN bandwidth_profiles bp ON rug.groupname = bp.name AND bp.tenant_id = cd.tenant_id
             WHERE cd.username = ?`,
            [req.user.username]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Data pelanggan tidak ditemukan.' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/portal/invoices - daftar tagihan pelanggan
app.get('/api/portal/invoices', authenticateToken, isCustomer, async (req, res) => {
    try {
        const [invoices] = await db.query(
            `SELECT bi.*,
             sa.fullname as paid_by_name, sa.role as paid_by_role,
             pp.status as proof_status, pp.id as proof_id, pp.reject_reason
             FROM billing_invoices bi
             LEFT JOIN system_accounts sa ON bi.paid_by_id = sa.id
             LEFT JOIN payment_proofs pp ON bi.id = pp.invoice_id AND pp.status != 'rejected'
             WHERE bi.username = ?
             ORDER BY bi.created_at DESC`,
            [req.user.username]
        );
        res.json(invoices);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/portal/config/gateways - cek gateway aktif + info rekening transfer
app.get('/api/portal/config/gateways', authenticateToken, isCustomer, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query(
            `SELECT setting_key, setting_value FROM billing_settings WHERE setting_key IN (
                'pg_duitku_active','pg_tripay_active','pg_xendit_active','pg_midtrans_active','pg_app_base_url',
                'transfer_bank_name','transfer_account_number','transfer_account_name',
                'transfer_bank_2_name','transfer_bank_2_number','transfer_bank_2_account',
                'company_name','company_phone'
            ) AND tenant_id = ?`,
            [tenantId]
        );
        const config = {};
        rows.forEach(r => { config[r.setting_key] = r.setting_value; });
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/portal/connection - status koneksi internet pelanggan
app.get('/api/portal/connection', authenticateToken, isCustomer, async (req, res) => {
    try {
        const username = req.user.username;

        // Sesi aktif
        const [active] = await db.query(
            `SELECT framedipaddress, acctstarttime, nasipaddress, acctsessiontime,
                    acctinputoctets, acctoutputoctets, callingstationid
             FROM radacct
             WHERE username = ? AND acctstoptime IS NULL
             ORDER BY acctstarttime DESC LIMIT 1`,
            [username]
        );

        if (active.length > 0) {
            const s = active[0];
            return res.json({
                is_online: true,
                ip_address: s.framedipaddress || '-',
                session_start: s.acctstarttime,
                session_seconds: s.acctsessiontime || 0,
                nas_ip: s.nasipaddress || '-',
                mac_address: s.callingstationid || '-',
                upload_bytes: Number(s.acctinputoctets || 0),
                download_bytes: Number(s.acctoutputoctets || 0),
            });
        }

        // Sesi terakhir (offline)
        const [last] = await db.query(
            `SELECT framedipaddress, acctstarttime, acctstoptime, acctterminatecause,
                    acctsessiontime, acctinputoctets, acctoutputoctets
             FROM radacct
             WHERE username = ?
             ORDER BY acctstoptime DESC LIMIT 1`,
            [username]
        );

        if (last.length > 0) {
            const l = last[0];
            return res.json({
                is_online: false,
                last_ip: l.framedipaddress || '-',
                last_seen: l.acctstoptime,
                last_session_seconds: l.acctsessiontime || 0,
                disconnect_reason: l.acctterminatecause || '-',
                upload_bytes: Number(l.acctinputoctets || 0),
                download_bytes: Number(l.acctoutputoctets || 0),
            });
        }

        res.json({ is_online: false, last_seen: null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/portal/payment/gateway - buat link pembayaran
app.post('/api/portal/payment/gateway', authenticateToken, isCustomer, async (req, res) => {
    const { invoice_id, gateway } = req.body;
    if (!invoice_id || !gateway) return res.status(400).json({ error: 'invoice_id dan gateway wajib diisi.' });
    try {
        const [inv] = await db.query(
            'SELECT bi.*, cd.fullname, cd.phone FROM billing_invoices bi LEFT JOIN customer_details cd ON bi.username = cd.username WHERE bi.id = ? AND bi.username = ?',
            [invoice_id, req.user.username]
        );
        if (inv.length === 0) return res.status(404).json({ error: 'Invoice tidak ditemukan.' });
        if (inv[0].status === 'paid') return res.status(400).json({ error: 'Invoice sudah lunas.' });
        // Reuse payment gateway creation - forward to existing endpoint logic
        req.body.invoice_id = invoice_id;
        req.user.role = 'customer'; // keep role but let PG creation proceed
        // Call internal PG logic
        const invoice = inv[0];
        // Ambil tenant_id dari customer untuk load setting PG yang benar
        const [[portalCust]] = await db.query('SELECT tenant_id FROM customer_details WHERE username = ?', [req.user.username]);
        const portalTenantId = portalCust ? portalCust.tenant_id : null;
        const [settingsRows] = portalTenantId
            ? await db.query('SELECT setting_key, setting_value FROM billing_settings WHERE tenant_id = ?', [portalTenantId])
            : await db.query('SELECT setting_key, setting_value FROM billing_settings');
        const settings = {};
        settingsRows.forEach(r => { settings[r.setting_key] = r.setting_value; });

        const orderId = `INV${invoice.id}-${Date.now()}`;
        const amount = Number(invoice.amount);
        const customerName = invoice.fullname || invoice.username;
        const customerPhone = (invoice.phone || '08000000000').replace(/\D/g, '');
        const baseUrl = settings.pg_app_base_url || 'https://pmyradius.salfa.my.id';

        let paymentUrl = null;

        if (gateway === 'midtrans' && settings.pg_midtrans_active === '1') {
            const serverKey = settings.pg_midtrans_server_key;
            const isSandbox = settings.pg_midtrans_sandbox !== '0';
            const snapUrl = isSandbox ? 'https://app.sandbox.midtrans.com/snap/v1/transactions' : 'https://app.midtrans.com/snap/v1/transactions';
            const auth = Buffer.from(serverKey + ':').toString('base64');
            const mtBody = {
                transaction_details: { order_id: orderId, gross_amount: amount },
                customer_details: { first_name: customerName, phone: customerPhone },
                callbacks: { finish: `${baseUrl}/portal?status=success`, error: `${baseUrl}/portal?status=cancel`, pending: `${baseUrl}/portal?status=pending` }
            };
            const mtRes = await fetch(snapUrl, {
                method: 'POST', headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(mtBody)
            });
            const mtData = await mtRes.json();
            if (mtData.token) {
                paymentUrl = isSandbox ? `https://app.sandbox.midtrans.com/snap/v4/redirection/${mtData.token}` : `https://app.midtrans.com/snap/v4/redirection/${mtData.token}`;
                await db.query('INSERT INTO billing_settings (setting_key, setting_value, tenant_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
                    [`pg_order_${orderId}`, invoice.id, portalTenantId || 1, invoice.id]);
            } else {
                return res.status(500).json({ error: 'Gagal membuat link Midtrans: ' + JSON.stringify(mtData) });
            }
        } else if (gateway === 'xendit' && settings.pg_xendit_active === '1') {
            const xenditRes = await fetch('https://api.xendit.co/v2/invoices', {
                method: 'POST',
                headers: { 'Authorization': 'Basic ' + Buffer.from(settings.pg_xendit_api_key + ':').toString('base64'), 'Content-Type': 'application/json' },
                body: JSON.stringify({ external_id: orderId, amount, description: `Invoice #${invoice.id} - ${customerName}`, customer: { given_names: customerName, mobile_number: customerPhone }, success_redirect_url: `${baseUrl}/portal?status=success`, failure_redirect_url: `${baseUrl}/portal?status=cancel` })
            });
            const xenditData = await xenditRes.json();
            if (xenditData.invoice_url) {
                paymentUrl = xenditData.invoice_url;
                await db.query('INSERT INTO billing_settings (setting_key, setting_value, tenant_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
                    [`pg_order_${orderId}`, invoice.id, portalTenantId || 1, invoice.id]);
            } else {
                return res.status(500).json({ error: 'Gagal membuat link Xendit.' });
            }
        } else {
            return res.status(400).json({ error: `Gateway ${gateway} tidak aktif atau tidak didukung.` });
        }

        res.json({ paymentUrl, orderId, gateway });
    } catch (err) {
        console.error('[PORTAL PG]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/portal/payment/proof - upload bukti transfer
app.post('/api/portal/payment/proof', authenticateToken, isCustomer, async (req, res) => {
    const { invoice_id, bank_name, amount, transfer_date, notes, image_base64 } = req.body;
    if (!invoice_id || !bank_name || !image_base64) {
        return res.status(400).json({ error: 'invoice_id, bank_name, dan image_base64 wajib diisi.' });
    }
    try {
        const [inv] = await db.query(
            'SELECT * FROM billing_invoices WHERE id = ? AND username = ?',
            [invoice_id, req.user.username]
        );
        if (inv.length === 0) return res.status(404).json({ error: 'Invoice tidak ditemukan.' });
        if (inv[0].status === 'paid') return res.status(400).json({ error: 'Invoice sudah lunas.' });

        const [existing] = await db.query(
            "SELECT id FROM payment_proofs WHERE invoice_id = ? AND status = 'pending'",
            [invoice_id]
        );
        if (existing.length > 0) return res.status(400).json({ error: 'Sudah ada bukti transfer yang menunggu verifikasi admin.' });

        await db.query(
            `INSERT INTO payment_proofs (invoice_id, username, bank_name, amount, transfer_date, notes, proof_image)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [invoice_id, req.user.username, bank_name, amount || inv[0].amount, transfer_date || null, notes || null, image_base64]
        );

        // Notifikasi ke admin: pelanggan upload bukti TF
        const customerName = req.user.fullname || req.user.username;
        const proofAmount = Number(amount || inv[0].amount).toLocaleString('id-ID');
        createNotification(
            'admin', 'all_admins', 'proof_uploaded',
            'Bukti Transfer Masuk',
            `${customerName} mengupload bukti transfer Rp ${proofAmount} — Invoice #${String(invoice_id).padStart(5,'0')} (via ${bank_name}). Menunggu verifikasi.`,
            { invoice_id, username: req.user.username, bank_name }, req.user.tenant_id || null
        );

        res.json({ message: 'Bukti transfer berhasil diupload. Menunggu verifikasi admin.' });
    } catch (err) {
        console.error('[PORTAL PROOF UPLOAD]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/portal/payment/proof/:invoice_id - cek status bukti
app.get('/api/portal/payment/proof/:invoice_id', authenticateToken, isCustomer, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, bank_name, amount, transfer_date, notes, status, reject_reason, created_at, reviewed_at FROM payment_proofs WHERE invoice_id = ? AND username = ? ORDER BY created_at DESC LIMIT 1',
            [req.params.invoice_id, req.user.username]
        );
        res.json(rows[0] || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =============================================
// ADMIN PAYMENT PROOF ROUTES
// =============================================

// GET /api/admin/payment-proofs/pending-count - jumlah bukti transfer pending
app.get('/api/admin/payment-proofs/pending-count', authenticateToken, isAdmin, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const [[row]] = await db.query(
            `SELECT COUNT(*) as count FROM payment_proofs pp
             JOIN customer_details cd ON pp.username = cd.username
             WHERE pp.status = 'pending' AND cd.tenant_id = ?`,
            [tenantId]
        );
        res.json({ count: row.count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/payment-proofs - list bukti transfer (admin/collector)
app.get('/api/admin/payment-proofs', authenticateToken, isAdmin, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const status = req.query.status || 'pending';
        const [rows] = await db.query(
            `SELECT pp.id, pp.invoice_id, pp.username, pp.bank_name, pp.amount, pp.transfer_date,
             pp.notes, pp.status, pp.reject_reason, pp.created_at, pp.reviewed_at,
             bi.period, bi.amount as invoice_amount,
             cd.fullname, cd.phone
             FROM payment_proofs pp
             JOIN billing_invoices bi ON pp.invoice_id = bi.id
             JOIN customer_details cd ON pp.username = cd.username
             WHERE pp.status = ? AND cd.tenant_id = ?
             ORDER BY pp.created_at DESC`,
            [status, tenantId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/payment-proofs/:id/image - ambil gambar bukti
app.get('/api/admin/payment-proofs/:id/image', authenticateToken, isAdmin, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query(
            `SELECT pp.proof_image FROM payment_proofs pp
             JOIN customer_details cd ON pp.username = cd.username
             WHERE pp.id = ? AND cd.tenant_id = ?`,
            [req.params.id, tenantId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Bukti tidak ditemukan.' });
        res.json({ image: rows[0].proof_image });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/users/:username/ktp - ambil foto KTP (admin & teknisi)
app.get('/api/users/:username/ktp', authenticateToken, async (req, res) => {
    if (!['admin', 'technician'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    try {
        const tenantId = getTenantId(req);
        const [rows] = await db.query('SELECT ktp_photo FROM customer_details WHERE username = ? AND tenant_id = ?', [req.params.username, tenantId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
        if (!rows[0].ktp_photo) return res.status(404).json({ error: 'Foto KTP belum diupload' });
        res.json({ ktp_photo: rows[0].ktp_photo });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/admin/payment-proofs/:id/verify - approve atau reject
app.put('/api/admin/payment-proofs/:id/verify', authenticateToken, isAdmin, async (req, res) => {
    const { action, reject_reason } = req.body;
    if (!action || !['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Action harus approve atau reject.' });
    }
    try {
        const tenantId = getTenantId(req);
        const [proofs] = await db.query(
            `SELECT pp.* FROM payment_proofs pp
             JOIN customer_details cd ON pp.username = cd.username
             WHERE pp.id = ? AND cd.tenant_id = ?`,
            [req.params.id, tenantId]
        );
        if (proofs.length === 0) return res.status(404).json({ error: 'Bukti tidak ditemukan.' });
        if (proofs[0].status !== 'pending') return res.status(400).json({ error: 'Bukti sudah diverifikasi sebelumnya.' });

        const proof = proofs[0];
        if (action === 'approve') {
            await db.query(
                "UPDATE payment_proofs SET status = 'approved', reviewed_at = NOW(), reviewed_by_id = ? WHERE id = ?",
                [req.user.id || 0, req.params.id]
            );
            await db.query(
                "UPDATE billing_invoices SET status = 'paid', payment_method = 'transfer', paid_at = NOW(), paid_by_id = ? WHERE id = ?",
                [req.user.id || 0, proof.invoice_id]
            );
            await db.query(
                "DELETE FROM radcheck WHERE username = ? AND attribute = 'Auth-Type' AND value = 'Reject'",
                [proof.username]
            );
            console.log(`[PROOF APPROVED] Invoice #${proof.invoice_id} (${proof.username}) approved by ${req.user.username}`);

            // Notifikasi ke pelanggan: bukti disetujui
            createNotification(
                'customer', proof.username, 'payment_confirmed',
                'Pembayaran Dikonfirmasi ✓',
                `Bukti transfer kamu untuk Invoice #${String(proof.invoice_id).padStart(5,'0')} telah diverifikasi dan disetujui. Akses internet kamu sudah aktif kembali.`,
                { invoice_id: proof.invoice_id }, getTenantId(req)
            );

            res.json({ message: 'Bukti transfer disetujui. Invoice telah lunas dan akses dipulihkan.' });
            checkFulfillPromise(proof.username).catch(() => {});
            reactivateLocalAuth(proof.username, getTenantId(req)).catch(() => {});
            // Kick via RouterOS API agar PPPoE client langsung retry
            kickMikrotikUser(proof.username)
                .then(n => { if (n > 0) console.log(`[PROOF APPROVED] RouterOS kick ${n} sesi untuk ${proof.username}`) })
                .catch(e => console.error(`[PROOF APPROVED] RouterOS kick error:`, e.message));
        } else {
            await db.query(
                "UPDATE payment_proofs SET status = 'rejected', reject_reason = ?, reviewed_at = NOW(), reviewed_by_id = ? WHERE id = ?",
                [reject_reason || 'Ditolak oleh admin', req.user.id || 0, req.params.id]
            );

            // Notifikasi ke pelanggan: bukti ditolak
            createNotification(
                'customer', proof.username, 'payment_rejected',
                'Bukti Transfer Ditolak',
                `Bukti transfer untuk Invoice #${String(proof.invoice_id).padStart(5,'0')} ditolak. Alasan: ${reject_reason || 'Tidak sesuai'}. Silakan upload ulang bukti yang valid.`,
                { invoice_id: proof.invoice_id, reject_reason: reject_reason || 'Tidak sesuai' }, getTenantId(req)
            );

            res.json({ message: 'Bukti transfer ditolak.' });
        }
    } catch (err) {
        console.error('[PROOF VERIFY]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// =============================================
// WAITING LIST ROUTES
// =============================================

// GET /api/waiting-list — admin/noc: semua, teknisi: hanya yang assigned ke mereka
app.get('/api/waiting-list', authenticateToken, async (req, res) => {
    try {
        const { role, username } = req.user;
        if (!['admin', 'technician', 'noc'].includes(role)) return res.status(403).json({ error: 'Akses ditolak' });

        const tenantId = getTenantId(req);
        let query = `
            SELECT wl.*, t.name as territory_name,
                GROUP_CONCAT(wla.technician_username ORDER BY wla.assigned_at SEPARATOR ',') as assigned_technicians_str,
                MIN(wla.assigned_by) as assigned_by_user,
                MIN(wla.assigned_at) as first_assigned_at
            FROM waiting_list wl
            LEFT JOIN territories t ON wl.territory_id = t.id
            LEFT JOIN waiting_list_assignments wla ON wl.id = wla.wl_id
            WHERE wl.tenant_id = ?`;
        const params = [tenantId];

        // Teknisi hanya bisa lihat WL yang di-assign ke mereka
        if (role === 'technician') {
            query += ` AND wl.id IN (SELECT wl_id FROM waiting_list_assignments WHERE technician_username = ?)`;
            params.push(username);
        }

        const status = req.query.status;
        if (status) { query += ` AND wl.status = ?`; params.push(status); }

        query += ` GROUP BY wl.id ORDER BY first_assigned_at DESC, wl.created_at DESC`;
        const [rows] = await db.query(query, params);

        // Parse assigned_technicians_str → array
        const result = rows.map(r => ({
            ...r,
            assigned_technicians: r.assigned_technicians_str
                ? r.assigned_technicians_str.split(',')
                : []
        }));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/waiting-list/:id — detail satu entry (tanpa foto, untuk auto-fill)
app.get('/api/waiting-list/:id', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const [[row]] = await db.query(
            `SELECT wl.*, t.name as territory_name FROM waiting_list wl
             LEFT JOIN territories t ON wl.territory_id = t.id
             WHERE wl.id = ? AND wl.tenant_id = ?`, [req.params.id, tenantId]
        );
        if (!row) return res.status(404).json({ error: 'Tidak ditemukan' });
        res.json(row);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/waiting-list/:id/ktp — ambil foto KTP
app.get('/api/waiting-list/:id/ktp', authenticateToken, async (req, res) => {
    try {
        const tenantId = getTenantId(req);
        const [[row]] = await db.query('SELECT ktp_photo FROM waiting_list WHERE id = ? AND tenant_id = ?', [req.params.id, tenantId]);
        if (!row || !row.ktp_photo) return res.status(404).json({ error: 'Foto tidak ada' });
        res.json({ ktp_photo: row.ktp_photo });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// =====================================================================
// KONFIRMASI PEMBAYARAN AWAL PSB (24 JAM COUNTDOWN)
// =====================================================================



// POST /api/waiting-list — admin/noc tambah entry baru
app.post('/api/waiting-list', authenticateToken, async (req, res) => {
    if (!['admin', 'noc'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' });
    try {
        const { fullname, phone, address, identity_number, ktp_photo, notes, territory_id, territory_area_id, kelurahan_kode, groupname, sales, latitude, longitude } = req.body;
        if (!fullname) return res.status(400).json({ error: 'Nama wajib diisi' });
        if (!ktp_photo) return res.status(400).json({ error: 'Foto KTP wajib diupload' });

        const tenantId = getTenantId(req);
        const [result] = await db.query(
            `INSERT INTO waiting_list (fullname, phone, address, identity_number, ktp_photo, notes, territory_id, territory_area_id, kelurahan_kode, groupname, sales, latitude, longitude, created_by, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [fullname, phone || null, address || null, identity_number || null,
             ktp_photo, notes || null, territory_id || null, territory_area_id || null, kelurahan_kode || null, groupname || null, sales || null,
             latitude || null, longitude || null, req.user.username, tenantId]
        );

        // Notifikasi ke teknisi di wilayah tersebut
        if (territory_id) {
            const [technicians] = await db.query(
                `SELECT DISTINCT sa.username FROM system_accounts sa
                 JOIN territory_areas ta ON ta.collector_id = sa.id
                 WHERE ta.territory_id = ? AND sa.role = 'technician'`,
                [territory_id]
            );
            for (const tech of technicians) {
                await createNotification('collector', tech.username, 'new_waiting_list',
                    '📋 Waiting List Baru',
                    `${fullname} ditambahkan ke antrian pemasangan di wilayahmu.`,
                    { waiting_list_id: result.insertId }, tenantId
                );
            }
        }

        res.json({ ok: true, id: result.insertId, message: 'Berhasil ditambahkan ke waiting list' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/waiting-list/:id — admin/noc edit entry
app.put('/api/waiting-list/:id', authenticateToken, async (req, res) => {
    if (!['admin', 'noc'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' });
    try {
        const { fullname, phone, address, identity_number, ktp_photo, notes, territory_id, territory_area_id, kelurahan_kode, groupname, status, sales, latitude, longitude } = req.body;
        const fields = [];
        const vals = [];
        if (fullname !== undefined) { fields.push('fullname = ?'); vals.push(fullname); }
        if (phone !== undefined) { fields.push('phone = ?'); vals.push(phone); }
        if (address !== undefined) { fields.push('address = ?'); vals.push(address); }
        if (identity_number !== undefined) { fields.push('identity_number = ?'); vals.push(identity_number); }
        if (ktp_photo !== undefined) { fields.push('ktp_photo = ?'); vals.push(ktp_photo); }
        if (notes !== undefined) { fields.push('notes = ?'); vals.push(notes); }
        if (territory_id !== undefined) { fields.push('territory_id = ?'); vals.push(territory_id || null); }
        if (territory_area_id !== undefined) { fields.push('territory_area_id = ?'); vals.push(territory_area_id || null); }
        if (kelurahan_kode !== undefined) { fields.push('kelurahan_kode = ?'); vals.push(kelurahan_kode || null); }
        if (groupname !== undefined) { fields.push('groupname = ?'); vals.push(groupname || null); }
        if (status !== undefined) { fields.push('status = ?'); vals.push(status); }
        if (sales !== undefined) { fields.push('sales = ?'); vals.push(sales || null); }
        if (latitude !== undefined) { fields.push('latitude = ?'); vals.push(latitude || null); }
        if (longitude !== undefined) { fields.push('longitude = ?'); vals.push(longitude || null); }
        if (!fields.length) return res.status(400).json({ error: 'Tidak ada data yang diubah' });
        const tenantId = getTenantId(req);
        vals.push(req.params.id, tenantId);
        await db.query(`UPDATE waiting_list SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, vals);
        res.json({ ok: true, message: 'Berhasil diperbarui' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/waiting-list/:id — admin/noc hapus/batalkan
app.delete('/api/waiting-list/:id', authenticateToken, async (req, res) => {
    if (!['admin', 'noc'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' });
    try {
        const tenantId = getTenantId(req);
        await db.query(`UPDATE waiting_list SET status = 'cancelled' WHERE id = ? AND tenant_id = ?`, [req.params.id, tenantId]);
        res.json({ ok: true, message: 'Waiting list dibatalkan' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/waiting-list/:id/restore — admin/noc kembalikan entry cancelled ke waiting
app.post('/api/waiting-list/:id/restore', authenticateToken, async (req, res) => {
    if (!['admin', 'noc'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' });
    try {
        const tenantId = getTenantId(req);
        const [[entry]] = await db.query(`SELECT id, status FROM waiting_list WHERE id = ? AND tenant_id = ?`, [req.params.id, tenantId]);
        if (!entry) return res.status(404).json({ error: 'Entry tidak ditemukan' });
        if (entry.status !== 'cancelled') return res.status(400).json({ error: 'Hanya entry yang dibatalkan yang bisa dikembalikan' });
        await db.query(`UPDATE waiting_list SET status = 'waiting' WHERE id = ?`, [req.params.id]);
        res.json({ ok: true, message: 'Entry berhasil dikembalikan ke waiting list' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/waiting-list/:id/assign — admin/noc assign WL entry ke satu atau banyak teknisi
app.post('/api/waiting-list/:id/assign', authenticateToken, async (req, res) => {
    if (!['admin', 'noc'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' });
    try {
        const tenantId = getTenantId(req);
        // Support single (technician_username) atau multi (technician_usernames array)
        let usernames = req.body.technician_usernames || (req.body.technician_username ? [req.body.technician_username] : []);
        if (!Array.isArray(usernames) || usernames.length === 0) return res.status(400).json({ error: 'technician_usernames wajib diisi' });

        const [[entry]] = await db.query('SELECT * FROM waiting_list WHERE id = ? AND tenant_id = ?', [req.params.id, tenantId]);
        if (!entry) return res.status(404).json({ error: 'Waiting list tidak ditemukan' });
        if (entry.status !== 'waiting') return res.status(400).json({ error: 'Entry ini sudah diproses' });

        // Verifikasi semua teknisi valid dan milik tenant ini
        const placeholders = usernames.map(() => '?').join(',');
        const [techs] = await db.query(
            `SELECT username, fullname FROM system_accounts WHERE username IN (${placeholders}) AND role = 'technician' AND tenant_id = ?`,
            [...usernames, tenantId]
        );
        if (techs.length !== usernames.length) return res.status(404).json({ error: 'Satu atau lebih teknisi tidak ditemukan' });

        // Ambil assignment lama untuk tahu siapa yang baru
        const [existing] = await db.query('SELECT technician_username FROM waiting_list_assignments WHERE wl_id = ?', [req.params.id]);
        const existingSet = new Set(existing.map(e => e.technician_username));

        // Replace semua assignment dengan yang baru (hapus lama, insert baru)
        await db.query('DELETE FROM waiting_list_assignments WHERE wl_id = ?', [req.params.id]);
        for (const u of usernames) {
            await db.query(
                'INSERT INTO waiting_list_assignments (wl_id, technician_username, assigned_by) VALUES (?, ?, ?)',
                [req.params.id, u, req.user.username]
            );
        }

        // Notifikasi hanya ke teknisi yang BARU di-assign
        for (const tech of techs) {
            if (!existingSet.has(tech.username)) {
                await createNotification('collector', tech.username, 'wl_assigned',
                    '🔧 Tugas Pemasangan Baru',
                    `Kamu ditugaskan memasang ${entry.fullname}${entry.address ? ' di ' + entry.address : ''}. Cek Waiting List untuk detail.`,
                    { waiting_list_id: entry.id }, getTenantId(req)
                );
            }
        }

        const names = techs.map(t => t.fullname || t.username).join(', ');
        res.json({ ok: true, message: `Berhasil ditugaskan ke ${names}` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/waiting-list/:id/assign — admin/noc hapus semua assignment dari WL entry
app.delete('/api/waiting-list/:id/assign', authenticateToken, async (req, res) => {
    if (!['admin', 'noc'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' });
    try {
        const tenantId = getTenantId(req);
        const [[wlCheck]] = await db.query('SELECT id FROM waiting_list WHERE id = ? AND tenant_id = ?', [req.params.id, tenantId]);
        if (!wlCheck) return res.status(404).json({ error: 'Entry tidak ditemukan' });
        await db.query('DELETE FROM waiting_list_assignments WHERE wl_id = ?', [req.params.id]);
        res.json({ ok: true, message: 'Penugasan dihapus' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/waiting-list/bulk-assign — admin/noc assign banyak WL entry ke satu atau banyak teknisi
app.post('/api/waiting-list/bulk-assign', authenticateToken, async (req, res) => {
    if (!['admin', 'noc'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' });
    try {
        // Support single (technician_username) atau multi (technician_usernames array)
        let usernames = req.body.technician_usernames || (req.body.technician_username ? [req.body.technician_username] : []);
        const { ids } = req.body;
        if (!Array.isArray(usernames) || usernames.length === 0) return res.status(400).json({ error: 'technician_usernames wajib diisi' });
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids wajib diisi' });

        const tenantId = getTenantId(req);
        // Verifikasi teknisi (hanya dari tenant ini)
        const techPlaceholders = usernames.map(() => '?').join(',');
        const [techs] = await db.query(
            `SELECT username, fullname FROM system_accounts WHERE username IN (${techPlaceholders}) AND role = 'technician' AND tenant_id = ?`,
            [...usernames, tenantId]
        );
        if (techs.length !== usernames.length) return res.status(404).json({ error: 'Satu atau lebih teknisi tidak ditemukan' });

        // Ambil entry valid (hanya dari tenant ini)
        const idPlaceholders = ids.map(() => '?').join(',');
        const [entries] = await db.query(
            `SELECT id, fullname, address FROM waiting_list WHERE id IN (${idPlaceholders}) AND status = 'waiting' AND tenant_id = ?`,
            [...ids, tenantId]
        );
        if (entries.length === 0) return res.status(400).json({ error: 'Tidak ada entry valid yang bisa di-assign' });

        // Insert assignments (IGNORE duplikat)
        for (const entry of entries) {
            for (const u of usernames) {
                await db.query(
                    'INSERT IGNORE INTO waiting_list_assignments (wl_id, technician_username, assigned_by) VALUES (?, ?, ?)',
                    [entry.id, u, req.user.username]
                );
            }
        }

        // Satu notifikasi ringkasan per teknisi
        const shortNames = entries.length <= 3
            ? entries.map(e => e.fullname).join(', ')
            : `${entries[0].fullname}, ${entries[1].fullname}, dan ${entries.length - 2} lainnya`;

        for (const tech of techs) {
            await createNotification('collector', tech.username, 'wl_assigned',
                `🔧 ${entries.length} Tugas Pemasangan Baru`,
                `Kamu ditugaskan memasang ${shortNames}. Cek Waiting List untuk detail.`,
                { count: entries.length }, getTenantId(req)
            );
        }

        const techNames = techs.map(t => t.fullname || t.username).join(', ');
        res.json({ ok: true, count: entries.length, message: `${entries.length} pelanggan berhasil ditugaskan ke ${techNames}` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/waiting-list/:id/install — teknisi/admin tandai sudah terpasang (dipanggil saat PSB selesai)
app.post('/api/waiting-list/:id/install', authenticateToken, async (req, res) => {
    if (!['admin', 'noc', 'technician'].includes(req.user.role)) return res.status(403).json({ error: 'Akses ditolak' });
    try {
        const { pppoe_username } = req.body;
        const tenantId = getTenantId(req);
        const [[entry]] = await db.query('SELECT * FROM waiting_list WHERE id = ? AND tenant_id = ?', [req.params.id, tenantId]);
        if (!entry) return res.status(404).json({ error: 'Tidak ditemukan' });
        if (entry.status !== 'waiting') return res.status(400).json({ error: 'Entry ini sudah diproses' });

        await db.query(
            `UPDATE waiting_list SET status = 'installed', installed_at = NOW(),
             installed_by = ?, pppoe_username = ? WHERE id = ?`,
            [req.user.username, pppoe_username || null, req.params.id]
        );

        // Notifikasi ke admin & NOC
        await createNotification('admin', 'all_admins', 'waiting_list_installed',
            '✅ Waiting List Terpasang',
            `${entry.fullname} berhasil dipasang oleh ${req.user.username}${pppoe_username ? ` (${pppoe_username})` : ''}.`,
            { waiting_list_id: entry.id, pppoe_username }, getTenantId(req)
        );
        await createNotification('admin', 'all_nocs', 'waiting_list_installed',
            '✅ Waiting List Terpasang',
            `${entry.fullname} berhasil dipasang oleh ${req.user.username}${pppoe_username ? ` (${pppoe_username})` : ''}.`,
            { waiting_list_id: entry.id, pppoe_username }, getTenantId(req)
        );

        // Notifikasi ke kolektor wilayah tersebut
        if (entry.territory_id) {
            const [collectors] = await db.query(
                `SELECT DISTINCT sa.username FROM system_accounts sa
                 JOIN territory_areas ta ON ta.collector_id = sa.id
                 WHERE ta.territory_id = ? AND sa.role = 'collector'`,
                [entry.territory_id]
            );
            for (const col of collectors) {
                await createNotification('collector', col.username, 'waiting_list_installed',
                    '✅ Pelanggan Baru Terpasang',
                    `${entry.fullname} sudah dipasang di wilayahmu${pppoe_username ? ` dengan akun ${pppoe_username}` : ''}.`,
                    { waiting_list_id: entry.id, pppoe_username }, getTenantId(req)
                );
            }
        }

        res.json({ ok: true, message: 'Berhasil ditandai terpasang' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 5001;

// Mulai Server setelah Database diinisialisasi
const startServer = async () => {
    await initializeDatabase();

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[BOOT] Backend server running on port ${PORT} (0.0.0.0)`);

        // Jalankan pemeliharaan cerdas setelah server UP (delay 30 detik agar login user aman)
        setTimeout(runSmartMaintenance, 30000);

        // Sync realtime: bersihkan ghost session di radacct
        // (sesi yang MikroTik sudah putus tapi Accounting-Stop belum diterima)
        setTimeout(syncRealtimeOnlineUsers, 60000);
        setInterval(syncRealtimeOnlineUsers, 300000); // setiap 5 menit

        // Polling /ppp/active dari semua router untuk deteksi online (full local auth)
        setTimeout(startPppPolling, 10000); // delay 10 detik setelah boot
    });
};

startServer();
