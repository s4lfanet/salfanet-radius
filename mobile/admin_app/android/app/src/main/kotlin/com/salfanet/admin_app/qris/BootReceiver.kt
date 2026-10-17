package com.salfanet.admin_app.qris

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        val prefs = context.getSharedPreferences(
            QrisNotificationListener.PREFS_NAME, Context.MODE_PRIVATE
        )
        val enabled = prefs.getBoolean(QrisNotificationListener.PREF_ENABLED, false)
        val hasUrl  = !prefs.getString(QrisNotificationListener.PREF_SERVER_URL, "").isNullOrEmpty()
        val hasKey  = !prefs.getString(QrisNotificationListener.PREF_DEVICE_KEY, "").isNullOrEmpty()

        if (enabled && hasUrl && hasKey) {
            Log.i("BootReceiver", "Device booted — memulai QrisNotificationListener")
            val svcIntent = Intent(context, QrisNotificationListener::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(svcIntent)
            } else {
                context.startService(svcIntent)
            }
            QrisWatchdogWorker.schedule(context)
        } else {
            Log.d("BootReceiver", "Listener tidak aktif atau belum dikonfigurasi, skip.")
        }
    }
}
