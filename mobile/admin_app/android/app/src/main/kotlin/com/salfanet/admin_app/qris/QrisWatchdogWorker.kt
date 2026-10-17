package com.salfanet.admin_app.qris

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.service.notification.NotificationListenerService as NLS
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

class QrisWatchdogWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    companion object {
        private const val WORK_NAME = "qris_watchdog"
        private const val NOTIF_ID_REVOKED = 9002
        private const val PREF_LAST_REVOKED_ALERT = "last_revoked_alert_at"
        private const val ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000L

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<QrisWatchdogWorker>(15, TimeUnit.MINUTES).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
        }
    }

    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val prefs = ctx.getSharedPreferences(QrisNotificationListener.PREFS_NAME, Context.MODE_PRIVATE)

        val enabled = prefs.getBoolean(QrisNotificationListener.PREF_ENABLED, false)
        if (!enabled) return Result.success()

        val hasUrl = !prefs.getString(QrisNotificationListener.PREF_SERVER_URL, "").isNullOrEmpty()
        val hasKey = !prefs.getString(QrisNotificationListener.PREF_DEVICE_KEY, "").isNullOrEmpty()
        if (!hasUrl || !hasKey) return Result.success()

        if (!isNotificationAccessGranted(ctx)) {
            maybeAlertRevoked(ctx, prefs)
            return Result.success()
        }

        // SELALU coba restart+rebind, jangan gerbang lewat PREF_DEBUG_CONNECTED.
        // Flag itu cuma di-set false lewat callback graceful (onDestroy/
        // onListenerDisconnected) — kalau OS membunuh proses secara paksa,
        // callback itu tidak pernah terpanggil, flag tetap basi bernilai true.
        val component = ComponentName(ctx, QrisNotificationListener::class.java)
        val lastBeat = prefs.getLong(QrisNotificationListener.PREF_HEARTBEAT, 0L)
        val silentMs = System.currentTimeMillis() - lastBeat

        // A listener killed by the system is not rebound on its own on many
        // phones. Disabling and re-enabling the component makes Android bind
        // it again; done only after 20 minutes without a heartbeat.
        if (silentMs > 20 * 60_000L) {
            try {
                val pm = ctx.packageManager
                pm.setComponentEnabledSetting(component, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
                pm.setComponentEnabledSetting(component, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
            } catch (_: Exception) {}
        }
        try {
            NLS.requestRebind(component)
        } catch (_: Exception) {}

        // Android 12+ refuses to start a foreground service from the
        // background unless the app is exempt from battery optimisation;
        // that refusal used to crash this worker before the rebind above.
        try {
            val svcIntent = Intent(ctx, QrisNotificationListener::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(svcIntent)
            } else {
                ctx.startService(svcIntent)
            }
        } catch (_: Exception) {}

        return Result.success()
    }

    private fun isNotificationAccessGranted(ctx: Context): Boolean {
        val flat = Settings.Secure.getString(ctx.contentResolver, "enabled_notification_listeners") ?: ""
        return flat.contains(ctx.packageName)
    }

    private fun maybeAlertRevoked(ctx: Context, prefs: SharedPreferences) {
        val now = System.currentTimeMillis()
        val last = prefs.getLong(PREF_LAST_REVOKED_ALERT, 0L)
        if (now - last < ALERT_COOLDOWN_MS) return
        prefs.edit().putLong(PREF_LAST_REVOKED_ALERT, now).apply()

        ensureAlertChannel(ctx)

        val pi = PendingIntent.getActivity(
            ctx, 0, Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notif = NotificationCompat.Builder(ctx, QrisNotificationListener.CHANNEL_ALERT_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("Kasir QRIS berhenti memantau")
            .setContentText("Izin akses notifikasi tercabut sistem. Tap untuk aktifkan ulang.")
            .setStyle(NotificationCompat.BigTextStyle()
                .bigText("Android mencabut izin akses notifikasi Salfanet Admin (biasanya karena battery manager membunuh app). Pembayaran QRIS TIDAK akan terdeteksi otomatis sampai izin diaktifkan ulang. Tap notifikasi ini untuk buka pengaturan."))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ERROR)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()

        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIF_ID_REVOKED, notif)
    }

    private fun ensureAlertChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.deleteNotificationChannel(QrisNotificationListener.LEGACY_ALERT_ID)
            nm.createNotificationChannel(NotificationChannel(
                QrisNotificationListener.CHANNEL_ALERT_ID,
                "QRIS - Peringatan Listener",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Peringatan saat listener berhenti memantau"
            })
        }
    }
}
