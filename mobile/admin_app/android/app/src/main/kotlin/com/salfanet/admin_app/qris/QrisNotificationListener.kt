package com.salfanet.admin_app.qris

import android.app.Notification
import com.salfanet.admin_app.MainActivity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ServiceInfo
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.speech.tts.TextToSpeech
import android.util.Log
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.regex.Pattern

/**
 * Spoken payment announcement, used by the listener and the test button.
 * Amounts are spelled out in Indonesian because TTS engines read "3.086"
 * as "tiga koma nol delapan enam" or by digit.
 */
object PaymentVoice {
    const val UTTERANCE_ID = "qris_payment"
    private val satuan = arrayOf(
        "", "satu", "dua", "tiga", "empat", "lima", "enam",
        "tujuh", "delapan", "sembilan", "sepuluh", "sebelas",
    )

    fun terbilang(n: Long): String {
        if (n == 0L) return "nol"
        return spell(n).split(' ').filter { it.isNotEmpty() }.joinToString(" ")
    }

    private fun spell(n: Long): String = when {
        n < 12 -> satuan[n.toInt()]
        n < 20 -> spell(n - 10) + " belas"
        n < 100 -> spell(n / 10) + " puluh " + spell(n % 10)
        n < 200 -> "seratus " + spell(n - 100)
        n < 1_000 -> spell(n / 100) + " ratus " + spell(n % 100)
        n < 2_000 -> "seribu " + spell(n - 1_000)
        n < 1_000_000 -> spell(n / 1_000) + " ribu " + spell(n % 1_000)
        n < 1_000_000_000 -> spell(n / 1_000_000) + " juta " + spell(n % 1_000_000)
        else -> spell(n / 1_000_000_000) + " miliar " + spell(n % 1_000_000_000)
    }

    /** "Pembayaran DANA diterima, tiga ribu delapan puluh enam rupiah". */
    fun phrase(appLabel: String?, amount: Int): String {
        // Unknown apps are labelled by package name, which is unreadable aloud.
        val from = if (appLabel != null && !appLabel.contains('.')) " " + appLabel else ""
        return "Pembayaran" + from + " diterima, " + terbilang(amount.toLong()) + " rupiah"
    }

    /** Returns false when no Indonesian voice is installed on the phone. */
    fun configure(tts: TextToSpeech): Boolean {
        // Media volume, like merchant soundboxes: it is not silenced by the
        // ringer switch and does not use the alarm tone.
        tts.setAudioAttributes(
            android.media.AudioAttributes.Builder()
                .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
        )
        tts.setSpeechRate(0.95f)
        val r = tts.setLanguage(Locale("in", "ID"))
        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
            tts.language = Locale.getDefault()
            return false
        }
        return true
    }

    /** Speaks [text], lowering music for the duration instead of mixing over it. */
    fun speak(ctx: Context, tts: TextToSpeech, text: String) {
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
        var focus: android.media.AudioFocusRequest? = null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focus = android.media.AudioFocusRequest.Builder(android.media.AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(
                    android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                .build()
            am.requestAudioFocus(focus)
        }
        tts.setOnUtteranceProgressListener(object : android.speech.tts.UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}
            override fun onDone(utteranceId: String?) { release() }
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) { release() }
            private fun release() {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) focus?.let { am.abandonAudioFocusRequest(it) }
            }
        })
        tts.speak(text, TextToSpeech.QUEUE_ADD, null, UTTERANCE_ID)
    }
}

class QrisNotificationListener : NotificationListenerService() {

    companion object {
        private const val TAG = "QrisListener"

        const val CHANNEL_FG_ID    = "qris_fg_channel"
        // Warnings (permission revoked): normal notification sound.
        const val CHANNEL_ALERT_ID = "qris_alert_v2"
        // Payments: silent, the voice announces them.
        const val CHANNEL_PAYMENT_ID = "qris_payment_v2"
        // Created with the alarm tone by older versions; removed on start.
        const val LEGACY_ALERT_ID = "qris_alert_channel"
        const val FOREGROUND_NOTIF_ID = 9001
        const val PAYMENT_NOTIF_BASE  = 9100

        private val MONITORED_APPS = mapOf(
            "id.dana"              to "DANA",
            "com.gojek.app"        to "GoPay",
            "com.shopee.id"        to "ShopeePay",
            "com.bri.brimo"        to "BRImo",
            "id.co.bankbri.brimo"  to "BRImo",
            "com.bca.mobile"       to "BCA Mobile",
            "com.mandiri.smartpay" to "Mandiri",
            "com.beatcom.network"  to "Mandiri",
            "id.bmri.livin"        to "Livin Mandiri",
            "id.bmri.livinmerchant" to "Livin' Merchant",
            "ovo.id"               to "OVO",
            "com.telkom.mwallet"   to "LinkAja",
            "src.com.bni"          to "BNI Mobile",
        )

        // Money going out also says "diterima"/"masuk" ("Pesanan diterima
        // Rp..."); such notifications must never be reported as a payment.
        private val OUTGOING_HINTS = listOf(
            "transfer ke", "kirim ke", "bayar ke", "berhasil bayar", "pembelian", "belanja",
            "pesanan", "kamu membayar", "anda membayar", "transaksi keluar", "debit", "top up ke", "tarik tunai",
        )

        private val BLOCKED_APPS = setOf(
            "com.whatsapp",
            "com.whatsapp.w4b",
            "com.android.mms",
            "com.google.android.apps.messaging",
            "org.telegram.messenger",
            "org.telegram.plus",
            "org.thunderdog.challegram",
            "com.facebook.orca",
            "com.instagram.android",
            "com.twitter.android",
            "jp.naver.line.android",
            "com.kakao.talk",
            "com.viber.voip",
            "com.skype.raider",
            "com.discord",
            "com.tencent.mm",
        )

        private val PAYMENT_PATTERNS = listOf(
            Pattern.compile(
                """(?:dapat|terima)\s+(?:pembayaran|transfer|uang|dana)\s*(?:sebesar\s*)?Rp\.?\s*(\d{1,3}(?:[.,]\d{3})*)""",
                Pattern.CASE_INSENSITIVE
            ),
            Pattern.compile(
                """(?:menerima|diterima|masuk|received|transfer\s+masuk|pembayaran\s+masuk)[^Rp0-9]*[Rp\s]*(\d{1,3}(?:[.,]\d{3})*)""",
                Pattern.CASE_INSENSITIVE
            ),
            // Livin' Merchant: "Kamu telah menerima pembayaran Rp 469 dari SEABANK atas nama ...".
            Pattern.compile(
                """(?:menerima|diterima|terima)\s+pembayaran\b[^0-9]{0,30}?Rp\.?\s*(\d{1,3}(?:[.,]\d{3})*)""",
                Pattern.CASE_INSENSITIVE
            ),
            Pattern.compile(
                """Rp\s*(\d{1,3}(?:[.,]\d{3})*)(?:\s*telah\s*diterima|\s*berhasil\s*diterima)""",
                Pattern.CASE_INSENSITIVE
            ),
            Pattern.compile(
                """Rp\s*(\d{1,3}(?:[.,]\d{3})*)\s+dari\s+\S+\s+berhasil\s*diterima""",
                Pattern.CASE_INSENSITIVE
            ),
            Pattern.compile(
                """berhasil\s+diterima\s+Rp\s*(\d{1,3}(?:[.,]\d{3})*)""",
                Pattern.CASE_INSENSITIVE
            ),
            Pattern.compile(
                """(?:kamu|anda)?\s*menerima\s+[Rp\s]*(\d{1,3}(?:[.,]\d{3})*)""",
                Pattern.CASE_INSENSITIVE
            ),
            Pattern.compile(
                """Rp\s*(\d{1,3}(?:[.,]\d{3})*)\s+diterima\b""",
                Pattern.CASE_INSENSITIVE
            ),
        )

        const val PREFS_NAME       = "qris_listener_prefs"
        const val PREF_SERVER_URL  = "server_url"
        const val PREF_DEVICE_KEY  = "device_key"
        const val PREF_DEVICE_SECRET = "device_secret"
        const val PREF_ENABLED     = "enabled"
        const val PREF_VOICE       = "voice_enabled"

        const val PREF_DEBUG_CONNECTED       = "debug_connected"
        const val PREF_DEBUG_CONNECTED_SINCE = "debug_connected_since"
        const val PREF_DEBUG_LAST_EWALLET    = "debug_last_ewallet"
        const val PREF_DEBUG_LAST_RESULT     = "debug_last_result"
        const val PREF_DEBUG_LAST_10         = "debug_last_10"
        // Payments that could not be delivered (offline, server down); retried.
        const val PREF_QUEUE                 = "pending_queue"
        // Written while the listener is bound; the watchdog uses its age to
        // tell a live listener from one the system killed silently.
        const val PREF_HEARTBEAT             = "heartbeat_at"

        // A notification from an app outside MONITORED_APPS (merchant apps,
        // other banks) is used only when it clearly reports money coming in.
        private val INCOMING_HINTS = listOf(
            "menerima", "diterima", "dana masuk", "uang masuk", "saldo masuk", "transfer masuk",
            "pembayaran masuk", "pembayaran diterima", "qris berhasil", "received",
            "dapat pembayaran", "terima pembayaran", "dapat transfer", "terima transfer",
        )
        private const val QUEUE_MAX_AGE_MS   = 24 * 60 * 60 * 1000L
        private val timeFmt = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
    }

    private val scope = CoroutineScope(Dispatchers.IO)
    private lateinit var prefs: SharedPreferences
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var pendingSpeech: String? = null
    private var paymentNotifCounter = PAYMENT_NOTIF_BASE

    private val recentlySent = mutableMapOf<Int, Long>()

    private val heartbeatHandler = Handler(Looper.getMainLooper())
    private val heartbeatRunnable: Runnable = object : Runnable {
        override fun run() {
            beat()
            heartbeatHandler.postDelayed(this, 5 * 60_000L)
        }
    }

    private fun beat() {
        prefs.edit().putLong(PREF_HEARTBEAT, System.currentTimeMillis()).putBoolean(PREF_DEBUG_CONNECTED, true).apply()
    }

    private val queueHandler = Handler(Looper.getMainLooper())
    private val flushRunnable: Runnable = object : Runnable {
        override fun run() {
            scope.launch { flushQueue() }
            if (queueSize() > 0) queueHandler.postDelayed(this, 60_000L)
        }
    }
    private val rebindHandler = Handler(Looper.getMainLooper())
    private var rebindRetryCount = 0
    private val maxRebindRetries = 36
    private val rebindRunnable: Runnable = object : Runnable {
        override fun run() {
            if (prefs.getBoolean(PREF_DEBUG_CONNECTED, false)) {
                rebindRetryCount = 0
                return
            }
            if (rebindRetryCount >= maxRebindRetries) {
                Log.w(TAG, "rebind: batas retry tercapai, berhenti")
                rebindRetryCount = 0
                return
            }
            rebindRetryCount++
            Log.i(TAG, "rebind retry #${rebindRetryCount}")
            try {
                requestRebind(ComponentName(this@QrisNotificationListener, QrisNotificationListener::class.java))
            } catch (e: Exception) {
                Log.e(TAG, "requestRebind gagal: ${e.message}")
            }
            rebindHandler.postDelayed(this, 10_000L)
        }
    }

    override fun onCreate() {
        super.onCreate()
        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        createNotifChannels()
        QrisWatchdogWorker.schedule(this)
        if (queueSize() > 0) queueHandler.postDelayed(flushRunnable, 5_000L)
        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val t = tts ?: return@TextToSpeech
                if (!PaymentVoice.configure(t)) Log.w(TAG, "TTS: suara Bahasa Indonesia belum terpasang")
                ttsReady = true
                pendingSpeech?.let { PaymentVoice.speak(this, t, it) }
                pendingSpeech = null
                Log.i(TAG, "TTS initialized")
            } else {
                Log.w(TAG, "TTS init failed, status=${status}")
            }
        }
        Log.i(TAG, "Service onCreate")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // The admin app is on every staff phone; only the cashier phone that
        // switched Kasir QRIS on keeps a foreground notice. Turning it off
        // sends a plain start that lands here and removes the notice.
        if (!prefs.getBoolean(PREF_ENABLED, false)) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        startForegroundCompat()
        Log.i(TAG, "onStartCommand - service dimulai")
        return START_STICKY
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        if (prefs.getBoolean(PREF_ENABLED, false)) startForegroundCompat()
        rebindHandler.removeCallbacks(rebindRunnable)
        rebindRetryCount = 0
        heartbeatHandler.removeCallbacks(heartbeatRunnable)
        heartbeatHandler.post(heartbeatRunnable)
        prefs.edit()
            .putBoolean(PREF_DEBUG_CONNECTED, true)
            .putString(PREF_DEBUG_CONNECTED_SINCE, timeFmt.format(Date()))
            .apply()
        Log.i(TAG, "Listener terhubung")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        prefs.edit()
            .putBoolean(PREF_DEBUG_CONNECTED, false)
            .apply()
        heartbeatHandler.removeCallbacks(heartbeatRunnable)
        Log.w(TAG, "Listener terputus - memulai rebind retry loop...")
        rebindHandler.removeCallbacks(rebindRunnable)
        rebindRetryCount = 0
        rebindHandler.post(rebindRunnable)
    }

    override fun onDestroy() {
        super.onDestroy()
        rebindHandler.removeCallbacks(rebindRunnable)
        queueHandler.removeCallbacks(flushRunnable)
        heartbeatHandler.removeCallbacks(heartbeatRunnable)
        prefs.edit().putBoolean(PREF_DEBUG_CONNECTED, false).apply()
        tts?.stop()
        tts?.shutdown()
        tts = null
        Log.w(TAG, "Service onDestroy")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return
        val packageName = sbn.packageName ?: return

        if (packageName in BLOCKED_APPS) return
        // Never read our own notifications: the payment alert this service
        // posts, and in the admin app the server's own push messages
        // ("Pembayaran diterima Rp ..."), would otherwise be reported back
        // as new incoming payments.
        if (packageName == applicationContext.packageName) return
        // Only payment apps are read at all; anything else (OTP, shopping,
        // news...) never leaves the phone.
        val knownLabel = MONITORED_APPS[packageName]
        val notification = sbn.notification ?: return

        val category = notification.category
        if (category == Notification.CATEGORY_MESSAGE ||
            category == Notification.CATEGORY_EMAIL ||
            category == Notification.CATEGORY_SOCIAL) return

        val extras = notification.extras ?: return
        val title   = (extras.getCharSequence(Notification.EXTRA_TITLE) ?: extras.getCharSequence(Notification.EXTRA_TITLE_BIG))?.toString() ?: ""
        val text    = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""
        val textLines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
            ?.joinToString(" ") { it.toString() } ?: ""
        val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString() ?: ""
        val rawText = listOf(title, text, bigText, textLines, subText)
            .filter { it.isNotEmpty() }.distinct().joinToString(" | ")

        logRecentNotif(packageName, title)
        beat()

        if (!prefs.getBoolean(PREF_DEBUG_CONNECTED, false)) {
            prefs.edit()
                .putBoolean(PREF_DEBUG_CONNECTED, true)
                .putString(PREF_DEBUG_CONNECTED_SINCE, timeFmt.format(Date()))
                .apply()
        }

        if (!prefs.getBoolean(PREF_ENABLED, false)) return

        val serverUrl = prefs.getString(PREF_SERVER_URL, "") ?: ""
        val deviceKey = prefs.getString(PREF_DEVICE_KEY, "") ?: ""
        val deviceSecret = prefs.getString(PREF_DEVICE_SECRET, "") ?: ""
        if (serverUrl.isEmpty() || deviceKey.isEmpty()) return

        val displayLabel = knownLabel ?: packageName

        Log.d(TAG, "[${displayLabel}] ${rawText}")

        prefs.edit()
            .putString(PREF_DEBUG_LAST_EWALLET, "[${packageName}]\n${rawText}")
            .apply()

        if (deviceSecret.isEmpty()) {
            prefs.edit().putString(PREF_DEBUG_LAST_RESULT,
                "Device Secret belum diisi. Salin dari Payment Gateway > QRIS Mandiri di panel admin.").apply()
            return
        }
        val lower = rawText.lowercase(Locale.ROOT)
        if (OUTGOING_HINTS.any { lower.contains(it) }) {
            prefs.edit().putString(PREF_DEBUG_LAST_RESULT, "Uang keluar, diabaikan:\n${rawText.take(150)}").apply()
            return
        }
        if (knownLabel == null && INCOMING_HINTS.none { lower.contains(it) }) {
            // Not a payment app and not a payment text: never leaves the phone.
            return
        }
        val amount = extractAmount(rawText)
        if (amount == null) {
            // Not a recognisable incoming payment: keep it on the phone.
            prefs.edit().putString(PREF_DEBUG_LAST_RESULT,
                "Bukan notifikasi uang masuk, tidak dikirim:\n${rawText.take(150)}").apply()
            return
        }

        val now = System.currentTimeMillis()
        val lastSent = recentlySent[amount] ?: 0L
        if (now - lastSent < 60_000L) {
            Log.d(TAG, "[${displayLabel}] Duplikat Rp${amount} diabaikan (${now - lastSent}ms lalu)")
            prefs.edit().putString(PREF_DEBUG_LAST_RESULT,
                "Duplikat diabaikan: Rp${amount}\n(${((now - lastSent) / 1000)}d lalu dari ${packageName})").apply()
            return
        }
        recentlySent[amount] = now
        recentlySent.entries.removeIf { now - it.value > 120_000L }

        Log.i(TAG, "[${displayLabel}] Terdeteksi: Rp${amount}")
        prefs.edit().putString(PREF_DEBUG_LAST_RESULT, "Mengirim Rp${amount} ke server...").apply()

        playPaymentAlert(displayLabel, amount)
        scope.launch {
            sendToServer(serverUrl, deviceKey, deviceSecret, amount, packageName, rawText.take(255))
            if (queueSize() > 0) flushQueue()
        }
    }

    private fun logRecentNotif(pkg: String, title: String) {
        val raw = prefs.getString(PREF_DEBUG_LAST_10, "[]") ?: "[]"
        val arr = try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
        val entry = JSONObject().put("pkg", pkg).put("title", title).put("time", timeFmt.format(Date()))
        val newArr = JSONArray()
        newArr.put(entry)
        for (i in 0 until minOf(9, arr.length())) newArr.put(arr.getJSONObject(i))
        prefs.edit().putString(PREF_DEBUG_LAST_10, newArr.toString()).apply()
    }

    private fun playPaymentAlert(appLabel: String, amount: Int) {
        val formatted = NumberFormat.getNumberInstance(Locale("id", "ID")).format(amount)

        if (prefs.getBoolean(PREF_VOICE, true)) {
            val text = PaymentVoice.phrase(appLabel, amount)
            val t = tts
            if (t != null && ttsReady) PaymentVoice.speak(this, t, text) else pendingSpeech = text
        } else {
            // Voice off: a single ordinary notification tone.
            try {
                RingtoneManager.getRingtone(applicationContext, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))?.play()
            } catch (e: Exception) {
                Log.e(TAG, "Ringtone error: ${e.message}")
            }
        }
        val pi = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notif = NotificationCompat.Builder(this, CHANNEL_PAYMENT_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Pembayaran QRIS Masuk!")
            .setContentText("${appLabel} — Rp ${formatted} diterima")
            .setStyle(NotificationCompat.BigTextStyle()
                .bigText("${appLabel} mendeteksi pembayaran masuk Rp ${formatted}.\nMengirim konfirmasi ke server..."))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setVibrate(longArrayOf(0, 250, 150, 250))
            .setSilent(true)
            .setLights(0xFF00FF00.toInt(), 500, 500)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(paymentNotifCounter++, notif)
    }

    private fun startForegroundCompat() {
        val notif = buildForegroundNotif()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(FOREGROUND_NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(FOREGROUND_NOTIF_ID, notif)
        }
    }

    private fun buildForegroundNotif(): Notification {
        val pi = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_FG_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Kasir QRIS aktif")
            .setContentText("Memantau notifikasi DANA, GoPay, ShopeePay, BRImo, BCA, Livin'")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setOngoing(true)
            .setShowWhen(false)
            .setContentIntent(pi)
            .build()
    }

    private fun createNotifChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            nm.createNotificationChannel(NotificationChannel(
                CHANNEL_FG_ID,
                "Kasir QRIS - status",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Tampil selama Kasir QRIS memantau pembayaran"
                setShowBadge(false)
            })

            nm.deleteNotificationChannel(LEGACY_ALERT_ID)
            nm.createNotificationChannel(NotificationChannel(
                CHANNEL_PAYMENT_ID,
                "QRIS - Pembayaran Masuk",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Pembayaran QRIS terdeteksi. Tanpa nada; nominal dibacakan dengan suara."
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 250, 150, 250)
                setSound(null, null)
            })
        }
    }

    private fun extractAmount(text: String): Int? {
        for (pattern in PAYMENT_PATTERNS) {
            val matcher = pattern.matcher(text)
            if (matcher.find()) {
                val raw = matcher.group(1) ?: continue
                val cleaned = raw.replace("[.,]".toRegex(), "")
                return cleaned.toIntOrNull()
            }
        }
        return null
    }

    /** Sends one payment; returns true when the server gave a final answer. */
    private fun sendToServer(
        serverUrl: String,
        deviceKey: String,
        deviceSecret: String,
        amount: Int,
        sourceApp: String,
        rawText: String,
        queueOnFailure: Boolean = true,
    ): Boolean {
        try {
            val url  = URL(serverUrl)
            val conn = url.openConnection() as HttpURLConnection
            conn.apply {
                requestMethod  = "POST"
                connectTimeout = 15_000
                readTimeout    = 15_000
                doOutput       = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
                setRequestProperty("Accept", "application/json")
                setRequestProperty("X-QRIS-Client", "SalfanetAndroid/3.1")
            }
            // Signed fresh on every attempt: the server only accepts a
            // timestamp within 5 minutes and each nonce once.
            val ts = System.currentTimeMillis() / 1000
            val nonce = java.util.UUID.randomUUID().toString().replace("-", "")
            val canonical = "$deviceKey|$amount|$ts|$nonce"
            val mac = javax.crypto.Mac.getInstance("HmacSHA256")
            mac.init(javax.crypto.spec.SecretKeySpec(deviceSecret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
            val sig = mac.doFinal(canonical.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
            val payload = JSONObject().apply {
                put("device_key", deviceKey)
                put("amount",     amount)
                put("source_app", sourceApp)
                put("raw_text",   rawText)
                put("timestamp",  ts)
                put("nonce",      nonce)
                put("signature",  sig)
            }
            conn.outputStream.use { os: OutputStream -> os.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            val responseCode = conn.responseCode
            val stream = if (responseCode in 200..299) conn.inputStream else conn.errorStream
            val response = stream?.bufferedReader()?.readText() ?: ""
            conn.disconnect()
            Log.i(TAG, "Server [${responseCode}]: ${response}")
            val json = try { JSONObject(response) } catch (_: Exception) { JSONObject() }
            if (responseCode >= 500 || responseCode == 429) {
                if (queueOnFailure) enqueue(amount, sourceApp, rawText)
                prefs.edit().putString(PREF_DEBUG_LAST_RESULT,
                    "Server sibuk (HTTP ${responseCode}), Rp${amount} diantrikan untuk dikirim ulang").apply()
                return false
            }
            val resultMsg = when {
                json.optBoolean("success") -> "TERCATAT: Rp${amount} lunas di server"
                responseCode == 401 -> "Ditolak server: " + json.optString("error", "kunci tidak cocok")
                else -> "Server: " + json.optString("error", "HTTP " + responseCode)
            }
            prefs.edit().putString(PREF_DEBUG_LAST_RESULT, resultMsg).apply()
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Gagal kirim ke server: ${e.message}")
            if (queueOnFailure) enqueue(amount, sourceApp, rawText)
            prefs.edit().putString(PREF_DEBUG_LAST_RESULT,
                "Offline: Rp${amount} diantrikan, dikirim ulang otomatis").apply()
            return false
        }
    }

    private fun readQueue(): JSONArray =
        try { JSONArray(prefs.getString(PREF_QUEUE, "[]") ?: "[]") } catch (_: Exception) { JSONArray() }

    private fun queueSize() = readQueue().length()

    @Synchronized
    private fun enqueue(amount: Int, sourceApp: String, rawText: String) {
        val q = readQueue()
        for (i in 0 until q.length()) {
            val e = q.getJSONObject(i)
            if (e.optInt("amount") == amount && e.optString("raw") == rawText) return
        }
        q.put(JSONObject().put("amount", amount).put("app", sourceApp).put("raw", rawText).put("at", System.currentTimeMillis()))
        prefs.edit().putString(PREF_QUEUE, q.toString()).apply()
        queueHandler.removeCallbacks(flushRunnable)
        queueHandler.postDelayed(flushRunnable, 60_000L)
    }

    /**
     * Retries queued payments. A payment that arrives after its QR expired
     * is still sent: the server records it in the webhook log so the admin
     * can match it by hand instead of it vanishing.
     */
    @Synchronized
    private fun flushQueue() {
        val serverUrl = prefs.getString(PREF_SERVER_URL, "") ?: ""
        val deviceKey = prefs.getString(PREF_DEVICE_KEY, "") ?: ""
        val deviceSecret = prefs.getString(PREF_DEVICE_SECRET, "") ?: ""
        if (serverUrl.isEmpty() || deviceKey.isEmpty() || deviceSecret.isEmpty()) return
        val q = readQueue()
        val keep = JSONArray()
        val now = System.currentTimeMillis()
        for (i in 0 until q.length()) {
            val e = q.getJSONObject(i)
            if (now - e.optLong("at") > QUEUE_MAX_AGE_MS) continue
            val done = sendToServer(serverUrl, deviceKey, deviceSecret, e.optInt("amount"), e.optString("app"), e.optString("raw"), queueOnFailure = false)
            if (!done) keep.put(e)
        }
        prefs.edit().putString(PREF_QUEUE, keep.toString()).apply()
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        // No action needed
    }
}
