package com.salfanet.admin_app.qris

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.speech.tts.TextToSpeech
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import org.json.JSONArray
import org.json.JSONObject

/**
 * Bridge between the Flutter "Kasir QRIS" screen and the native listener.
 * The listener keeps reading its settings from the same SharedPreferences
 * it always used; this only writes them and reports state back.
 */
class QrisChannel(private val activity: Activity) : MethodChannel.MethodCallHandler {

    companion object {
        const val NAME = "salfanet/qris_listener"
    }

    private val prefs = activity.getSharedPreferences(QrisNotificationListener.PREFS_NAME, Context.MODE_PRIVATE)
    private val main = Handler(Looper.getMainLooper())
    private var tts: TextToSpeech? = null

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "status" -> result.success(status())
            "configure" -> {
                configure(
                    call.argument<String>("serverUrl") ?: "",
                    call.argument<String>("deviceKey") ?: "",
                    call.argument<String>("deviceSecret") ?: "",
                    call.argument<Boolean>("enabled") ?: false,
                )
                result.success(status())
            }
            "setVoice" -> {
                prefs.edit().putBoolean(QrisNotificationListener.PREF_VOICE, call.argument<Boolean>("enabled") ?: true).apply()
                result.success(null)
            }
            "openNotificationAccess" -> { open(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)); result.success(null) }
            "openBatteryOptimization" -> { openBatteryOptimization(); result.success(null) }
            "openAutostart" -> result.success(openAutostart())
            "reconnect" -> { rebind(); result.success(null) }
            "testVoice" -> { testVoice(result) }
            "testConnection" -> testConnection(result)
            else -> result.notImplemented()
        }
    }

    private fun accessGranted(): Boolean {
        val flat = Settings.Secure.getString(activity.contentResolver, "enabled_notification_listeners") ?: ""
        return flat.contains(activity.packageName)
    }

    private fun batteryUnrestricted(): Boolean = try {
        (activity.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(activity.packageName)
    } catch (_: Exception) { true }

    private fun status(): Map<String, Any?> {
        val recent = try { JSONArray(prefs.getString(QrisNotificationListener.PREF_DEBUG_LAST_10, "[]") ?: "[]") } catch (_: Exception) { JSONArray() }
        val queue = try { JSONArray(prefs.getString(QrisNotificationListener.PREF_QUEUE, "[]") ?: "[]").length() } catch (_: Exception) { 0 }
        return mapOf(
            "accessGranted" to accessGranted(),
            "batteryUnrestricted" to batteryUnrestricted(),
            "enabled" to prefs.getBoolean(QrisNotificationListener.PREF_ENABLED, false),
            "voice" to prefs.getBoolean(QrisNotificationListener.PREF_VOICE, true),
            "serverUrl" to (prefs.getString(QrisNotificationListener.PREF_SERVER_URL, "") ?: ""),
            "deviceKey" to (prefs.getString(QrisNotificationListener.PREF_DEVICE_KEY, "") ?: ""),
            "hasSecret" to !prefs.getString(QrisNotificationListener.PREF_DEVICE_SECRET, "").isNullOrEmpty(),
            "heartbeatAt" to prefs.getLong(QrisNotificationListener.PREF_HEARTBEAT, 0L),
            "lastResult" to (prefs.getString(QrisNotificationListener.PREF_DEBUG_LAST_RESULT, "") ?: ""),
            "lastEwallet" to (prefs.getString(QrisNotificationListener.PREF_DEBUG_LAST_EWALLET, "") ?: ""),
            "queueSize" to queue,
            "recent" to (0 until recent.length()).map { i ->
                val o = recent.optJSONObject(i) ?: JSONObject()
                mapOf("pkg" to o.optString("pkg"), "title" to o.optString("title"), "time" to o.optString("time"))
            },
        )
    }

    private fun configure(serverUrl: String, deviceKey: String, deviceSecret: String, enabled: Boolean) {
        prefs.edit()
            .putString(QrisNotificationListener.PREF_SERVER_URL, serverUrl.trim())
            .putString(QrisNotificationListener.PREF_DEVICE_KEY, deviceKey.trim())
            .putString(QrisNotificationListener.PREF_DEVICE_SECRET, deviceSecret.trim())
            .putBoolean(QrisNotificationListener.PREF_ENABLED, enabled)
            .apply()
        val svc = Intent(activity, QrisNotificationListener::class.java)
        if (enabled) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) activity.startForegroundService(svc) else activity.startService(svc)
            } catch (_: Exception) {}
            QrisWatchdogWorker.schedule(activity)
            rebind()
        } else {
            // A plain start; the service sees enabled=false and drops its notice.
            try { activity.startService(svc) } catch (_: Exception) {}
        }
    }

    /** Toggling the component makes Android bind the listener again, also after it was killed. */
    private fun rebind() {
        val cn = ComponentName(activity, QrisNotificationListener::class.java)
        try {
            activity.packageManager.setComponentEnabledSetting(cn, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
            activity.packageManager.setComponentEnabledSetting(cn, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
        } catch (_: Exception) {}
        try { NotificationListenerService.requestRebind(cn) } catch (_: Exception) {}
    }

    private fun open(intent: Intent): Boolean = try {
        activity.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true
    } catch (_: Exception) { false }

    private fun openBatteryOptimization() {
        if (!open(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${activity.packageName}")))) {
            open(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    /**
     * The vendor screen that lets an app start and stay running in the
     * background; Xiaomi, Oppo, Vivo, Realme and Huawei otherwise kill the
     * listener soon after the screen turns off. Returns "vendor" or "app".
     */
    private fun openAutostart(): String {
        val candidates = listOf(
            ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
            ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
            ComponentName("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"),
            ComponentName("com.oplus.safecenter", "com.oplus.safecenter.permission.startup.StartupAppListActivity"),
            ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
            ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager"),
            ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
            ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"),
        )
        for (c in candidates) if (open(Intent().setComponent(c))) return "vendor"
        open(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${activity.packageName}")))
        return "app"
    }

    private fun testVoice(result: MethodChannel.Result) {
        val sample = PaymentVoice.phrase("DANA", 3086)
        tts?.let {
            PaymentVoice.speak(activity, it, sample)
            result.success("ok")
            return
        }
        tts = TextToSpeech(activity) { status ->
            val t = tts
            if (status != TextToSpeech.SUCCESS || t == null) {
                result.success("no_engine")
                return@TextToSpeech
            }
            val indonesian = PaymentVoice.configure(t)
            PaymentVoice.speak(activity, t, sample)
            result.success(if (indonesian) "ok" else "no_indonesian")
        }
    }

    /** Signed test request to qris-notify; the server checks key and secret without settling anything. */
    private fun testConnection(result: MethodChannel.Result) {
        val url = prefs.getString(QrisNotificationListener.PREF_SERVER_URL, "") ?: ""
        val key = prefs.getString(QrisNotificationListener.PREF_DEVICE_KEY, "") ?: ""
        val secret = prefs.getString(QrisNotificationListener.PREF_DEVICE_SECRET, "") ?: ""
        Thread {
            val message = try {
                val ts = System.currentTimeMillis() / 1000
                val nonce = java.util.UUID.randomUUID().toString().replace("-", "")
                val payload = JSONObject().apply {
                    put("test", true)
                    put("device_key", key)
                    put("amount", 0)
                    put("timestamp", ts)
                    put("nonce", nonce)
                    if (secret.isNotEmpty()) {
                        val mac = javax.crypto.Mac.getInstance("HmacSHA256")
                        mac.init(javax.crypto.spec.SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
                        put("signature", mac.doFinal("$key|0|$ts|$nonce".toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) })
                    }
                }
                val conn = java.net.URL(url).openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "POST"
                conn.connectTimeout = 15_000
                conn.readTimeout = 15_000
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
                val code = conn.responseCode
                val body = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.readText() ?: ""
                conn.disconnect()
                val json = try { JSONObject(body) } catch (_: Exception) { JSONObject() }
                if (json.optBoolean("success")) mapOf("ok" to true, "message" to json.optString("message", "Koneksi OK"))
                else mapOf("ok" to false, "message" to "HTTP $code: " + json.optString("error", body.take(160)))
            } catch (e: Exception) {
                mapOf("ok" to false, "message" to "Tidak bisa menghubungi server (${e.message})")
            }
            main.post { result.success(message) }
        }.start()
    }

    fun dispose() {
        tts?.shutdown()
        tts = null
    }
}
