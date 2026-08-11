/**
 * Salfanet Radius — Baileys Native WhatsApp Service
 * Runs as a standalone Express server (PM2 process: salfanet-wa)
 * Listens on 127.0.0.1:${WA_SERVICE_PORT} (default 4000)
 *
 * Endpoints:
 *   GET  /status   - connection status
 *   GET  /qr       - QR code as data URI (for scanning)
 *   POST /send     - send WhatsApp message { phone, message }
 *   POST /restart  - logout and reconnect (new QR)
 */

const express = require('express');
const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
app.use(express.json());

const PORT = process.env.WA_SERVICE_PORT || 4000;
const AUTH_DIR = process.env.WA_AUTH_DIR || path.join(__dirname, '.baileys_auth');

let sock = null;
let qrCodeImage = null;
let connectionStatus = 'initializing';
let myNumber = null;

// Silent logger — no noise in PM2 logs except our console.log calls
const logger = pino({ level: 'silent' });

async function connectToWhatsApp() {
  connectionStatus = 'initializing';
  qrCodeImage = null;

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`[WA Service] Baileys v${version.join('.')}, isLatest: ${isLatest}`);

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 30000,
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('[WA Service] QR Code generated — awaiting scan...');
      qrCodeImage = await QRCode.toDataURL(qr);
      connectionStatus = 'qr';
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(
        '[WA Service] Connection closed:',
        lastDisconnect?.error?.message || 'unknown',
        '| reconnect:',
        shouldReconnect,
      );

      if (shouldReconnect) {
        connectionStatus = 'reconnecting';
        setTimeout(connectToWhatsApp, 5000);
      } else {
        console.log('[WA Service] Logged out — deleting session...');
        connectionStatus = 'logged_out';
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch { }
        sock = null;
      }
    } else if (connection === 'open') {
      console.log('[WA Service] ✅ Connected to WhatsApp!');
      connectionStatus = 'connected';
      qrCodeImage = null;
      if (sock?.user?.id) {
        myNumber = sock.user.id.split(':')[0].split('@')[0];
        console.log('[WA Service] Phone:', myNumber);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

// Start on launch
connectToWhatsApp().catch(err => {
  console.error('[WA Service] Startup error:', err);
  connectionStatus = 'error';
});

// ─── API Routes ──────────────────────────────────────────────────────────────

// Health / status
app.get('/status', (_req, res) => {
  res.json({
    status: connectionStatus,
    connected: connectionStatus === 'connected',
    phone: myNumber,
  });
});

// QR Code (Base64 data URI)
app.get('/qr', (_req, res) => {
  if (connectionStatus === 'connected') {
    return res.status(422).json({
      status: 'ALREADY_LOGGED_IN',
      message: 'Device sudah tersambung!',
      alreadyConnected: true,
    });
  }

  // Auto-restart if session was logged out or errored — so user just needs to click QR
  if (connectionStatus === 'logged_out' || connectionStatus === 'error') {
    console.log(`[WA Service] Auto-restarting from state '${connectionStatus}' on QR request...`);
    connectionStatus = 'initializing';
    qrCodeImage = null;
    connectToWhatsApp().catch(err => console.error('[WA Service] Auto-restart error:', err));
  }

  if (!qrCodeImage) {
    return res.status(400).json({
      status: 'WAITING',
      message: 'QR Code sedang dibuat, silakan coba lagi beberapa detik.',
    });
  }

  // Wrapped in MPWA-compatible format so the UI can handle it uniformly
  res.json({ status: 'qrcode', qrcode: qrCodeImage });
});

// Send message
app.post('/send', async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ status: false, message: 'Phone and message are required' });
  }

  if (connectionStatus !== 'connected' || !sock) {
    return res.status(503).json({
      status: false,
      message: `WhatsApp is not connected (status: ${connectionStatus})`,
    });
  }

  try {
    // Normalise to JID
    let jid = phone.replace(/[^0-9]/g, '');
    if (jid.startsWith('0')) jid = '62' + jid.substring(1);
    if (!jid.startsWith('62')) jid = '62' + jid;
    jid = jid + '@s.whatsapp.net';

    // Verify the number is on WhatsApp
    const [result] = await sock.onWhatsApp(jid);
    if (!result?.exists) {
      return res.status(400).json({ status: false, message: 'Nomor tidak terdaftar di WhatsApp' });
    }

    await sock.sendMessage(jid, { text: message });
    res.json({ status: true, message: 'Message sent successfully' });
  } catch (error) {
    console.error('[WA Service] Send error:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to send message: ' + (error.message || 'Unknown error'),
    });
  }
});

// Restart / logout session — triggers new QR
app.post('/restart', async (req, res) => {
  console.log('[WA Service] Restart requested...');
  try {
    if (sock) {
      try { await sock.logout('Restart requested'); } catch { }
    }
    try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch { }
  } catch (e) {
    console.error('[WA Service] Restart cleanup error:', e);
  }

  connectionStatus = 'initializing';
  qrCodeImage = null;
  sock = null;

  setTimeout(() => {
    connectToWhatsApp().catch(err => console.error('[WA Service] Reconnect error:', err));
  }, 2000);

  res.json({ success: true, message: 'Session restarted — scan new QR code' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[WA Service] Listening on http://127.0.0.1:${PORT}`);
});
