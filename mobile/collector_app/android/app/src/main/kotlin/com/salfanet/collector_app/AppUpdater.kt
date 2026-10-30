package com.salfanet.collector_app

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.File

/** Gives the update APK to the system installer (content:// URI, cache/updates/ only). */
class UpdateFileProvider : FileProvider()

/**
 * In-app update: Flutter downloads the new APK, this hands it to Android's
 * installer. Android always asks the user to confirm an install from an app
 * outside the Play Store, and once asks to allow this app as a source.
 */
class AppUpdater(private val activity: Activity) : MethodChannel.MethodCallHandler {
    companion object {
        const val NAME = "salfanet/updater"
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "info" -> {
                val pm = activity.packageManager
                @Suppress("DEPRECATION")
                val pi = if (Build.VERSION.SDK_INT >= 33) {
                    pm.getPackageInfo(activity.packageName, PackageManager.PackageInfoFlags.of(0))
                } else {
                    pm.getPackageInfo(activity.packageName, 0)
                }
                @Suppress("DEPRECATION")
                val code = if (Build.VERSION.SDK_INT >= 28) pi.longVersionCode else pi.versionCode.toLong()
                result.success(
                    mapOf(
                        "versionCode" to code,
                        "versionName" to (pi.versionName ?: ""),
                        "updatesDir" to updatesDir().absolutePath,
                    ),
                )
            }
            "canInstall" -> result.success(canInstall())
            "openInstallPermission" -> {
                if (Build.VERSION.SDK_INT >= 26) {
                    activity.startActivity(
                        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")),
                    )
                }
                result.success(null)
            }
            "install" -> {
                val path = call.argument<String>("path")
                val file = path?.let { File(it) }
                if (file == null || !file.exists() || file.parentFile?.canonicalPath != updatesDir().canonicalPath) {
                    result.error("bad_file", "File update tidak ditemukan", null)
                    return
                }
                try {
                    val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.updates", file)
                    val intent = Intent(Intent.ACTION_VIEW).apply {
                        setDataAndType(uri, "application/vnd.android.package-archive")
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    activity.startActivity(intent)
                    result.success(true)
                } catch (e: Exception) {
                    result.error("install_failed", e.message, null)
                }
            }
            else -> result.notImplemented()
        }
    }

    private fun canInstall(): Boolean =
        Build.VERSION.SDK_INT < 26 || activity.packageManager.canRequestPackageInstalls()

    private fun updatesDir(): File = File(activity.cacheDir, "updates").apply { mkdirs() }
}
