const express = require('express');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
app.use(express.json());

const PORT = process.env.WA_SERVICE_PORT || 4000;
const AUTH_DIR = path.join(__dirname, '.baileys_auth');

let sock = null;
let qrCodeImage = null;
let connectionStatus = 'initializing';
let myNumber = null;

// Logger
const logger = pino({ level: 'silent' });

async function connectToWhatsApp() {
    connectionStatus = 'initializing';
    qrCodeImage = null;

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[WA Service] using WA v${version.join('.')}, isLatest: ${isLatest}`);

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('[WA Service] QR Code generated. Awaiting scan...');
            // Convert to Data URI Base64
            qrCodeImage = await QRCode.toDataURL(qr);
            connectionStatus = 'qr';
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('[WA Service] Connection closed due to', lastDisconnect.error, ', reconnecting:', shouldReconnect);
            
            if (shouldReconnect) {
                connectionStatus = 'reconnecting';
                setTimeout(connectToWhatsApp, 3000);
            } else {
                console.log('[WA Service] Logged out. Deleting session...');
                connectionStatus = 'logged_out';
                fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                sock = null;
            }
        } else if (connection === 'open') {
            console.log('[WA Service] Connected to WhatsApp!');
            connectionStatus = 'connected';
            qrCodeImage = null;
            
            // Get our number
            if (sock?.user?.id) {
                myNumber = sock.user.id.split(':')[0].split('@')[0];
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Start connection on launch
connectToWhatsApp();


// ============================================
// API ROUTES
// ============================================

// Standard Health & Status Check
app.get('/status', (req, res) => {
    res.json({
        status: connectionStatus,
        connected: connectionStatus === 'connected',
        phone: myNumber
    });
});

// Get QR Code
app.get('/qr', (req, res) => {
    if (connectionStatus === 'connected') {
        return res.status(422).json({
            status: 'ALREADY_LOGGED_IN',
            message: 'Device sudah tersambung!',
            alreadyConnected: true
        });
    }

    if (!qrCodeImage) {
        return res.status(400).json({
            status: 'WAITING',
            message: 'QR Code sedang dibuat, silakan coba lagi beberapa detik.'
        });
    }

    // Wrap in standard MPWA format to simplify frontend compatibility
    res.json({
        status: 'qrcode',
        qrcode: qrCodeImage
    });
});

// Send Message
app.post('/send', async (req, res) => {
    const { phone, message } = req.body;

    if (!phone || !message) {
        return res.status(400).json({ status: false, message: 'Phone and message are required' });
    }

    if (connectionStatus !== 'connected' || !sock) {
        return res.status(503).json({ status: false, message: 'WhatsApp is not connected' });
    }

    try {
        // Format number to JID
        let jid = phone.replace(/[^0-9]/g, '');
        if (jid.startsWith('0')) jid = '62' + jid.substring(1);
        if (!jid.startsWith('62')) jid = '62' + jid;
        jid = jid + '@s.whatsapp.net';

        // Check if number exists on WA
        const [result] = await sock.onWhatsApp(jid);
        if (!result?.exists) {
           return res.status(400).json({ status: false, message: 'Nomor tidak terdaftar di WhatsApp' });
        }

        await sock.sendMessage(jid, { text: message });
        
        res.json({ status: true, message: 'Message sent successfully' });
    } catch (error) {
        console.error('[WA Service] Failed to send message:', error);
        res.status(500).json({ status: false, message: 'Failed to send message: ' + (error.message || 'Unknown error') });
    }
});

// Restart/Logout session
app.post('/restart', async (req, res) => {
    console.log('[WA Service] Requested session restart...');
    try {
        if (sock) {
            // Explicitly logout
            sock.logout('Restart requested');
        } else {
            // If the socket was null, just wipe folder
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        }
    } catch (e) {
        console.error('Error during logout:', e);
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
    
    // Give it a moment to clean up then reconnect
    setTimeout(() => {
        connectToWhatsApp();
    }, 2000);

    res.json({ success: true, message: 'Session restarted' });
});

app.listen(PORT, '127.0.0.1', () => {
    console.log(`[WA Service] Running internal API on http://127.0.0.1:${PORT}`);
});
