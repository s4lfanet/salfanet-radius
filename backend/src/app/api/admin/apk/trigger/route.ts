import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import {
  mkdirSync, writeFileSync, existsSync, chmodSync,
  openSync, copyFileSync, statSync, readdirSync, readFileSync,
} from 'fs';
import { join } from 'path';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { deflateSync } from 'zlib';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

const ROLES = {
  admin:         { label: 'Salfanet Admin',     pkg: 'net.salfanet.admin',         color: '#1e40af', pathSuffix: '/admin' },
  customer:      { label: 'Salfanet Customer',  pkg: 'net.salfanet.customer',      color: '#0891b2', pathSuffix: '/customer' },
  technician:    { label: 'Salfanet Teknisi',   pkg: 'net.salfanet.technician',    color: '#059669', pathSuffix: '/technician' },
  agent:         { label: 'Salfanet Agent',     pkg: 'net.salfanet.agent',         color: '#7c3aed', pathSuffix: '/agent' },
  collector:     { label: 'Salfanet Collector', pkg: 'net.salfanet.collector',     color: '#d97706', pathSuffix: '/collector' },
  qris_listener: { label: 'Salfanet QRIS Listener', pkg: 'net.salfanet.qrislistener', color: '#e11d48', pathSuffix: '' },
} as const;
type RoleKey = keyof typeof ROLES;

const APK_DIR       = '/var/data/salfanet/apk';
const GRADLE_CACHE  = '/var/data/salfanet/gradle-cache';
const ANDROID_HOME  = process.env.ANDROID_HOME || '/opt/android';
const WRAPPER_JAR_CANDIDATES = [
  '/var/www/salfanet-radius/frontend/public/android-template/gradle-wrapper.jar',
  '/var/www/salfanet-radius/public/android-template/gradle-wrapper.jar',
  join(process.cwd(), 'frontend', 'public', 'android-template', 'gradle-wrapper.jar'),
  join(process.cwd(), 'public', 'android-template', 'gradle-wrapper.jar'),
  join(__dirname, '..', '..', '..', '..', '..', '..', 'frontend', 'public', 'android-template', 'gradle-wrapper.jar'),
];
const WRAPPER_JAR = WRAPPER_JAR_CANDIDATES.find(p => existsSync(p)) || WRAPPER_JAR_CANDIDATES[0];

/** Last meaningful lines of a Gradle log: the "What went wrong" part. */
function buildLogTail(logFile: string, max = 15): string {
  try {
    const lines = readFileSync(logFile, 'utf-8').split(/\r?\n/)
      .filter((l) => l.trim() && !/^\s+at /.test(l) && !/^\.+$/.test(l.trim()));
    const wrong = lines.findIndex((l) => l.includes('What went wrong'));
    const picked = wrong >= 0 ? lines.slice(wrong, wrong + max) : lines.slice(-max);
    return picked.join('\n').slice(0, 2000) || `Log kosong: ${logFile}`;
  } catch {
    return `Cek log: ${logFile}`;
  }
}

// ─── file generators ─────────────────────────────────────────────────────────

function mainActivity(pkg: string, startUrl: string, baseUrl: string): string {
  return `package ${pkg}

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.*
import java.util.concurrent.TimeUnit
import java.io.IOException
import java.io.OutputStream
import java.util.UUID

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    companion object {
        const val CHANNEL_ID = "salfanet_push_channel"
        const val CHANNEL_NAME = "Notifikasi Salfanet"
        const val PREFS_NAME = "salfanet_prefs"
        const val PREF_BASE_URL = "base_url"
        const val PREF_LAST_NOTIF_ID = "last_notif_id"
        const val PREF_SESSION_COOKIE = "session_cookie"
    }

    private val fileChooser = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        fileCallback?.onReceiveValue(
            if (result.resultCode == Activity.RESULT_OK)
                WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            else null
        )
        fileCallback = null
    }

    private var geolocationCallback: GeolocationPermissions.Callback? = null
    private var geolocationOrigin: String? = null

    private val locationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        val granted = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                      grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        geolocationCallback?.invoke(geolocationOrigin, granted, false)
        geolocationCallback = null
        geolocationOrigin = null
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun showNotification(title: String, body: String) {
            showNativeNotification(title, body, System.currentTimeMillis().toInt())
        }
        @JavascriptInterface
        fun showNotificationWithTag(title: String, body: String, tag: String) {
            showNativeNotification(title, body, tag.hashCode())
        }
        @JavascriptInterface
        fun saveBaseUrl(url: String) {
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putString(PREF_BASE_URL, url).apply()
        }
    }

    inner class BluetoothPrinterBridge {
        private var bluetoothSocket: BluetoothSocket? = null
        private var outputStream: OutputStream? = null
        private val SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34BF")

        @JavascriptInterface
        fun isSupported(): Boolean {
            val bm = getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            return bm?.adapter != null
        }

        @JavascriptInterface
        fun isConnected(): Boolean {
            return bluetoothSocket?.isConnected == true
        }

        @JavascriptInterface
        fun getBondedDevices(): String {
            val bm = getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            val adapter = bm?.adapter ?: return "[]"
            if (Build.VERSION.SDK_INT >= 31 &&
                ActivityCompat.checkSelfPermission(this@MainActivity, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                return "[]"
            }
            val sb = StringBuilder("[")
            var first = true
            for (dev in adapter.bondedDevices) {
                if (!first) sb.append(",")
                sb.append("{\\"name\\":\\"").append(dev.name?.replace("\\"", "\\\\"))
                sb.append("\\",\\"address\\":\\"").append(dev.address).append("\\"}")
                first = false
            }
            sb.append("]")
            return sb.toString()
        }

        @JavascriptInterface
        fun connect(address: String): Boolean {
            disconnect()
            val bm = getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            val adapter = bm?.adapter ?: return false
            if (Build.VERSION.SDK_INT >= 31 &&
                ActivityCompat.checkSelfPermission(this@MainActivity, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread { requestBluetoothPermission() }
                return false
            }
            val device = adapter.getRemoteDevice(address) ?: return false
            return try {
                val socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
                adapter.cancelDiscovery()
                socket.connect()
                bluetoothSocket = socket
                outputStream = socket.outputStream
                true
            } catch (e: IOException) {
                try { bluetoothSocket?.close() } catch (_: Exception) {}
                bluetoothSocket = null
                outputStream = null
                false
            }
        }

        @JavascriptInterface
        fun disconnect(): Boolean {
            return try {
                outputStream?.flush()
                bluetoothSocket?.close()
                true
            } catch (_: Exception) {
                false
            } finally {
                bluetoothSocket = null
                outputStream = null
            }
        }

        @JavascriptInterface
        fun print(base64Data: String): Boolean {
            val os = outputStream ?: return false
            return try {
                val bytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT)
                os.write(bytes)
                os.flush()
                true
            } catch (e: IOException) {
                false
            }
        }

        @JavascriptInterface
        fun printText(text: String): Boolean {
            val os = outputStream ?: return false
            return try {
                os.write(text.toByteArray(Charsets.UTF_8))
                os.flush()
                true
            } catch (e: IOException) {
                false
            }
        }
    }

    private fun requestBluetoothPermission() {
        if (Build.VERSION.SDK_INT >= 31) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(
                    Manifest.permission.BLUETOOTH_CONNECT,
                    Manifest.permission.BLUETOOTH_SCAN
                ),
                100
            )
        }
    }

    fun showNativeNotification(title: String, body: String, notifId: Int) {
        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val vibratePattern = longArrayOf(0, 300, 200, 300)
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setTicker(title)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setSound(soundUri)
            .setVibrate(vibratePattern)
            .setLights(Color.CYAN, 1000, 500)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setFullScreenIntent(pendingIntent, true)
        try {
            NotificationManagerCompat.from(this).notify(notifId, builder.build())
        } catch (e: SecurityException) { /* POST_NOTIFICATIONS not granted */ }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val audioAttributes = AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build()
            val channel = NotificationChannel(
                CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifikasi push dari Salfanet"
                enableLights(true)
                lightColor = Color.CYAN
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 300, 200, 300)
                setSound(soundUri, audioAttributes)
                setShowBadge(true)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            }
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
    }

    private fun scheduleBackgroundPolling() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        val workRequest = PeriodicWorkRequestBuilder<NotificationWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.LINEAR, 5, TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "salfanet_notif_poll",
            ExistingPeriodicWorkPolicy.KEEP,
            workRequest
        )
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.webView)
        createNotificationChannel()
        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
        // Request location permission on startup
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                2
            )
        }
        // Request Bluetooth permissions on startup (Android 12+)
        if (Build.VERSION.SDK_INT >= 31) {
            val btPerms = arrayOf(
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN
            )
            val needsBt = btPerms.any {
                ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
            }
            if (needsBt) {
                ActivityCompat.requestPermissions(this, btPerms, 100)
            }
        }
        with(webView.settings) {
            javaScriptEnabled    = true
            domStorageEnabled    = true
            databaseEnabled      = true
            loadWithOverviewMode = true
            useWideViewPort      = true
            allowFileAccess      = true
            allowContentAccess   = true
            setGeolocationEnabled(true)
            setSupportZoom(false)
            builtInZoomControls  = false
            displayZoomControls  = false
            cacheMode            = WebSettings.LOAD_DEFAULT
            mixedContentMode     = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            userAgentString      = userAgentString + " SalfanetApp/2.0"
        }
        // Disable overscroll glow/bounce effect
        webView.overScrollMode = android.view.View.OVER_SCROLL_NEVER
        webView.addJavascriptInterface(AndroidBridge(), "Android")
        webView.addJavascriptInterface(BluetoothPrinterBridge(), "AndroidBluetoothPrinter")
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                val isInternal = url.startsWith("${baseUrl}") || url.startsWith("blob:")
                if (!isInternal) { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))); return true }
                return false
            }
            override fun onPageFinished(view: WebView?, url: String?) {
                // Cache session cookie for background polling
                val cookie = CookieManager.getInstance().getCookie("${baseUrl}")
                if (!cookie.isNullOrEmpty()) {
                    getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                        .edit().putString(PREF_SESSION_COOKIE, cookie).apply()
                }
                // Bridge service worker push events to native notification
                view?.evaluateJavascript(
                    "(function(){" +
                    "if(typeof Android!=='undefined'&&typeof Android.saveBaseUrl==='function')" +
                    "{try{Android.saveBaseUrl(window.location.origin);}catch(e){}}" +
                    "if('serviceWorker' in navigator){" +
                    "navigator.serviceWorker.addEventListener('message',function(e){" +
                    "var d=e.data;" +
                    "if(d&&(d.type==='PUSH_RECEIVED'||d.type==='PUSH_NOTIFICATION')&&typeof Android!=='undefined'){" +
                    "try{Android.showNotificationWithTag(d.title||'Salfanet',d.body||'',d.tag||'');}catch(err){}" +
                    "}});}})();",
                    null
                )
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView?, callback: ValueCallback<Array<Uri>>?, params: FileChooserParams?): Boolean {
                fileCallback = callback
                val intent = params?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply { type = "*/*" }
                fileChooser.launch(intent); return true
            }
            override fun onPermissionRequest(request: PermissionRequest?) {
                request?.grant(request.resources)
            }
            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                val hasFine = ContextCompat.checkSelfPermission(
                    this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED
                val hasCoarse = ContextCompat.checkSelfPermission(
                    this@MainActivity, Manifest.permission.ACCESS_COARSE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED
                if (hasFine || hasCoarse) {
                    callback?.invoke(origin, true, false)
                } else {
                    geolocationCallback = callback
                    geolocationOrigin = origin
                    locationPermissionLauncher.launch(
                        arrayOf(
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                        )
                    )
                }
            }
        }
        if (savedInstanceState != null) webView.restoreState(savedInstanceState)
        else webView.loadUrl("${startUrl}")
        scheduleBackgroundPolling()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { if (webView.canGoBack()) webView.goBack() else super.onBackPressed() }
    override fun onSaveInstanceState(outState: Bundle) { super.onSaveInstanceState(outState); webView.saveState(outState) }
}
`;
}

function notificationWorker(pkg: string): string {
  return `package ${pkg}

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class NotificationWorker(
    private val context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val prefs = context.getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE)
        val baseUrl = prefs.getString(MainActivity.PREF_BASE_URL, null) ?: return Result.success()
        val cookie = prefs.getString(MainActivity.PREF_SESSION_COOKIE, null)
        if (cookie.isNullOrEmpty()) return Result.success()
        val lastId = prefs.getString(MainActivity.PREF_LAST_NOTIF_ID, null)
        try {
            val conn = (URL(baseUrl + "/api/notifications?unreadOnly=true&limit=5").openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                setRequestProperty("Cookie", cookie)
                setRequestProperty("Accept", "application/json")
                connectTimeout = 10000
                readTimeout = 10000
            }
            if (conn.responseCode == 200) {
                val response = conn.inputStream.bufferedReader().readText()
                conn.disconnect()
                val json = JSONObject(response)
                val notifications = json.optJSONArray("notifications")
                val unreadCount = json.optInt("unreadCount", 0)
                if (notifications != null && notifications.length() > 0 && unreadCount > 0) {
                    val first = notifications.getJSONObject(0)
                    val firstId = first.optString("id", "")
                    if (firstId.isNotEmpty() && firstId != lastId) {
                        prefs.edit().putString(MainActivity.PREF_LAST_NOTIF_ID, firstId).apply()
                        val title = first.optString("title", "Notifikasi Baru")
                        val message = first.optString("message", "Anda memiliki notifikasi baru")
                        showNotification(title, message, firstId.hashCode())
                    }
                }
            } else {
                conn.disconnect()
            }
        } catch (e: Exception) { /* Network error, try next cycle */ }
        return Result.success()
    }

    private fun showNotification(title: String, body: String, notifId: Int) {
        // Channel is created once at app startup (MainActivity.createNotificationChannel).
        // Do NOT recreate it here — Android ignores updates to existing channels.
        val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val vibratePattern = longArrayOf(0, 300, 200, 300)
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val builder = NotificationCompat.Builder(context, MainActivity.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setTicker(title)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setSound(soundUri)
            .setVibrate(vibratePattern)
            .setLights(android.graphics.Color.CYAN, 1000, 500)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setFullScreenIntent(pendingIntent, true)
        try {
            NotificationManagerCompat.from(context).notify(notifId, builder.build())
        } catch (e: SecurityException) { /* Permission not granted */ }
    }
}
`;
}

function appBuildGradle(pkg: string): string {
  return `plugins {
    id 'com.android.application'
    id 'org.jetbrains.kotlin.android'
}
android {
    namespace '${pkg}'
    compileSdk 34
    defaultConfig {
        applicationId "${pkg}"
        minSdk 24
        targetSdk 34
        versionCode 1
        versionName "1.0.0"
    }
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
            signingConfig signingConfigs.debug
        }
    }
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = '17' }
    lint {
        checkReleaseBuilds false
        abortOnError false
    }
}
dependencies {
    implementation 'androidx.appcompat:appcompat:1.7.0'
    implementation 'com.google.android.material:material:1.11.0'
    implementation 'androidx.core:core-ktx:1.13.1'
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'
    implementation 'androidx.work:work-runtime-ktx:2.9.1'
}
`;
}

const rootBuildGradle = () => `plugins {
    id 'com.android.application' version '8.2.2' apply false
    id 'org.jetbrains.kotlin.android' version '1.9.22' apply false
}
`;

const settingsGradle = (appName: string) => `pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "${appName.replace(/[^A-Za-z0-9_-]/g, '') || 'SalfanetApp'}"
include ':app'
`;

const gradleProperties = () =>
  `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\nandroid.useAndroidX=true\nkotlin.code.style=official\n`;

const gradleWrapperProperties = () =>
  `distributionBase=GRADLE_USER_HOME\ndistributionPath=wrapper/dists\ndistributionUrl=https\\://services.gradle.org/distributions/gradle-8.4-bin.zip\nnetworkTimeout=180000\nvalidateDistributionUrl=true\nzipStoreBase=GRADLE_USER_HOME\nzipStorePath=wrapper/dists\n`;

const androidManifest = (_pkg: string) => `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
    <uses-feature android:name="android.hardware.bluetooth" android:required="false" />
    <application
        android:allowBackup="true"
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="false">
        <activity android:name=".MainActivity" android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`;

const activityMainXml = () => `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent">
    <WebView android:id="@+id/webView"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />
</FrameLayout>
`;

/** Escapes text for an Android string resource (XML + aapt quoting). */
const androidString = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');

const stringsXml = (appName: string) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">${androidString(appName)}</string>\n</resources>\n`;

const colorsXml = (color: string) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="colorPrimary">${color}</color>\n    <color name="colorPrimaryDark">${color}</color>\n    <color name="colorAccent">${color}</color>\n    <color name="statusBar">${color}</color>\n</resources>\n`;

const themesXml = () => `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.Light.NoActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
        <item name="android:statusBarColor">@color/statusBar</item>
        <item name="android:windowBackground">@color/colorPrimary</item>
    </style>
</resources>
`;

// ─── QRIS Listener app generators ─────────────────────────────────────────────

function qrisListenerManifest(_pkg: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
    <application
        android:allowBackup="true"
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="false">
        <activity android:name=".MainActivity" android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
        <service
            android:name=".QrisNotificationListener"
            android:exported="false"
            android:label="QRIS Notification Listener"
            android:foregroundServiceType="specialUse"
            android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
            <property
                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
                android:value="Memantau notifikasi pembayaran QRIS untuk konfirmasi pembayaran otomatis" />
            <intent-filter>
                <action android:name="android.service.notification.NotificationListenerService" />
            </intent-filter>
        </service>
        <receiver android:name=".BootReceiver" android:exported="false">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
            </intent-filter>
        </receiver>
    </application>
</manifest>
`;
}

function qrisListenerLayoutXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<ScrollView xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="#1a0f35"
    android:padding="16dp">
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="vertical">

        <TextView
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:text="QRIS Listener"
            android:textSize="24sp"
            android:textStyle="bold"
            android:textColor="#00f7ff"
            android:layout_marginBottom="4dp" />
        <TextView
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:text="Pendengar notifikasi pembayaran QRIS"
            android:textSize="12sp"
            android:textColor="#e0d0ff"
            android:layout_marginBottom="24dp" />

        <!-- Status Card -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical"
            android:background="#0a0520"
            android:padding="16dp"
            android:layout_marginBottom="16dp">
            <TextView
                android:id="@+id/tvStatus"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:text="Status: Memeriksa..."
                android:textSize="14sp"
                android:textColor="#e0d0ff" />
            <Button
                android:id="@+id/btnEnableNotif"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:text="Buka Pengaturan Notifikasi"
                android:layout_marginTop="8dp" />
            <Button
                android:id="@+id/btnDisableBattery"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:text="Nonaktifkan Optimasi Baterai"
                android:layout_marginTop="4dp" />
        </LinearLayout>

        <!-- Config Card -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical"
            android:background="#0a0520"
            android:padding="16dp"
            android:layout_marginBottom="16dp">
            <TextView
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:text="Konfigurasi"
                android:textSize="16sp"
                android:textStyle="bold"
                android:textColor="#00f7ff"
                android:layout_marginBottom="12dp" />
            <TextView
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:text="Webhook URL"
                android:textSize="12sp"
                android:textColor="#e0d0ff"
                android:layout_marginBottom="4dp" />
            <EditText
                android:id="@+id/etWebhookUrl"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:inputType="textUri"
                android:hint="https://domain.com/api/payment/qris-notify"
                android:textColor="#ffffff"
                android:textColorHint="#666666"
                android:background="#1a0f35"
                android:padding="12dp"
                android:layout_marginBottom="12dp" />
            <TextView
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:text="Device Key"
                android:textSize="12sp"
                android:textColor="#e0d0ff"
                android:layout_marginBottom="4dp" />
            <EditText
                android:id="@+id/etDeviceKey"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:inputType="textPassword"
                android:hint="Device key dari admin panel"
                android:textColor="#ffffff"
                android:textColorHint="#666666"
                android:background="#1a0f35"
                android:padding="12dp"
                android:layout_marginBottom="12dp" />
            <TextView
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:text="Regex Nominal (opsional)"
                android:textSize="12sp"
                android:textColor="#e0d0ff"
                android:layout_marginBottom="4dp" />
            <EditText
                android:id="@+id/etRegex"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:inputType="text"
                android:hint="Default: Rp\s*([\d.,]+)"
                android:textColor="#ffffff"
                android:textColorHint="#666666"
                android:background="#1a0f35"
                android:padding="12dp"
                android:layout_marginBottom="12dp" />
            <Button
                android:id="@+id/btnSave"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:text="Simpan Konfigurasi" />
        </LinearLayout>

        <!-- Test Card -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical"
            android:background="#0a0520"
            android:padding="16dp"
            android:layout_marginBottom="16dp">
            <TextView
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:text="Simulator"
                android:textSize="16sp"
                android:textStyle="bold"
                android:textColor="#00f7ff"
                android:layout_marginBottom="12dp" />
            <Button
                android:id="@+id/btnTestNotif"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:text="Simulasikan Notifikasi Pembayaran" />
        </LinearLayout>

        <!-- Log Card -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical"
            android:background="#0a0520"
            android:padding="16dp">
            <TextView
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:text="Log Terakhir (20)"
                android:textSize="16sp"
                android:textStyle="bold"
                android:textColor="#00f7ff"
                android:layout_marginBottom="8dp" />
            <TextView
                android:id="@+id/tvLog"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:text="Belum ada log."
                android:textSize="11sp"
                android:textColor="#e0d0ff"
                android:fontFamily="monospace" />
        </LinearLayout>
    </LinearLayout>
</ScrollView>
`;
}

function qrisListenerActivity(pkg: string): string {
  return `package ${pkg}

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.service.notification.NotificationListenerService as NLS
import android.text.InputType
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray

class MainActivity : AppCompatActivity() {

    private lateinit var prefs: SharedPreferences
    private lateinit var etServerUrl: EditText
    private lateinit var etDeviceKey: EditText
    private lateinit var etDeviceSecret: EditText
    private lateinit var swEnabled: Switch
    private lateinit var swVoice: Switch
    private var testTts: android.speech.tts.TextToSpeech? = null
    private lateinit var tvPermStatus: TextView
    private lateinit var tvConnStatus: TextView
    private lateinit var btnGrantPermission: Button
    private lateinit var btnForceReconnect: Button
    private lateinit var btnBatteryOpt: Button
    private lateinit var tvDebug: TextView

    private var lastAutoReconnectAttempt = 0L

    private val handler = Handler(Looper.getMainLooper())
    private val refreshRunnable: Runnable = object : Runnable {
        override fun run() {
            refreshDebug()
            autoReconnectIfNeeded()
            handler.postDelayed(this, 3000)
        }
    }

    private val cBlue    get() = 0xFF1565C0.toInt()
    private val cGreen   get() = 0xFF2E7D32.toInt()
    private val cRed     get() = 0xFFC62828.toInt()
    private val cSurface get() = 0xFFF0F2F5.toInt()
    private val cCard    get() = 0xFFFFFFFF.toInt()
    private val cBorder  get() = 0xFFE0E0E0.toInt()
    private val cTextSec get() = 0xFF757575.toInt()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = getSharedPreferences(QrisNotificationListener.PREFS_NAME, Context.MODE_PRIVATE)
        QrisWatchdogWorker.schedule(this)

        val scroll = ScrollView(this).apply { setBackgroundColor(cSurface) }
        val root   = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        scroll.addView(root)

        // Header
        root.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(cBlue)
            setPadding(dp(16), dp(28), dp(16), dp(20))
            gravity = android.view.Gravity.CENTER_VERTICAL
            try {
                addView(ImageView(this@MainActivity).apply {
                    setImageResource(R.mipmap.ic_launcher_round)
                    layoutParams = LinearLayout.LayoutParams(dp(52), dp(52))
                })
            } catch (_: Exception) {}
            addView(LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(14), 0, 0, 0)
                addView(TextView(this@MainActivity).apply {
                    text = "QRIS Mandiri Listener"
                    textSize = 19f
                    setTextColor(0xFFFFFFFF.toInt())
                    setTypeface(typeface, android.graphics.Typeface.BOLD)
                })
                addView(TextView(this@MainActivity).apply {
                    text = "Salfanet Radius — Konfirmasi pembayaran QRIS otomatis"
                    textSize = 11f
                    setTextColor(0xFFBBDEFB.toInt())
                })
            })
        })

        // STATUS LAYANAN
        root.addView(sectionLabel("Status Layanan"))
        root.addView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(cCard)
            setPadding(dp(16), dp(14), dp(16), dp(14))
            layoutParams = cardLp()
            addView(run {
                tvPermStatus = TextView(this@MainActivity).apply { textSize = 14f }
                tvPermStatus
            })
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                addView(TextView(this@MainActivity).apply {
                    text = "Catatan Android 13+: Setelan > Aplikasi > QRIS Listener > menu opsi > Izinkan Setelan Terbatas > Akses Notifikasi"
                    textSize = 11f
                    setTextColor(0xFF7A4800.toInt())
                    setBackgroundColor(0xFFFFF8E1.toInt())
                    setPadding(dp(10), dp(8), dp(10), dp(8))
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply { topMargin = dp(6); bottomMargin = dp(6) }
                })
            }
            addView(run {
                btnGrantPermission = Button(this@MainActivity).apply {
                    text = "Beri Izin Akses Notifikasi"
                    setTextColor(0xFFFFFFFF.toInt())
                    setBackgroundColor(cRed)
                    setOnClickListener { startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, dp(44)
                    ).apply { topMargin = dp(6); bottomMargin = dp(8) }
                }
                btnGrantPermission
            })
            addView(divider())
            addView(run {
                tvConnStatus = TextView(this@MainActivity).apply {
                    textSize = 14f
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply { topMargin = dp(4) }
                }
                tvConnStatus
            })
            addView(divider())
            addView(run {
                btnForceReconnect = Button(this@MainActivity).apply {
                    text = "Paksa Reconnect"
                    setTextColor(0xFFFFFFFF.toInt())
                    setBackgroundColor(0xFFE65100.toInt())
                    setOnClickListener { forceReconnect() }
                    visibility = View.GONE
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, dp(44)
                    ).apply { topMargin = dp(6); bottomMargin = dp(4) }
                }
                btnForceReconnect
            })
            addView(divider())
            addView(run {
                btnBatteryOpt = Button(this@MainActivity).apply {
                    text = "Nonaktifkan Optimasi Baterai"
                    setTextColor(0xFFFFFFFF.toInt())
                    setBackgroundColor(0xFFE65100.toInt())
                    setOnClickListener { requestIgnoreBatteryOptimizations() }
                    visibility = View.GONE
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, dp(44)
                    ).apply { topMargin = dp(6); bottomMargin = dp(4) }
                }
                btnBatteryOpt
            })
            addView(Button(this@MainActivity).apply {
                text = "Izinkan Autostart / Jalan di Latar"
                setTextColor(0xFFFFFFFF.toInt())
                setBackgroundColor(0xFF37474F.toInt())
                setOnClickListener { openAutostartSettings() }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, dp(44)
                ).apply { topMargin = dp(6); bottomMargin = dp(4) }
            })
            addView(TextView(this@MainActivity).apply {
                text = "Wajib dinonaktifkan agar service tidak dibunuh sistem saat di background. " +
                        "Xiaomi/Redmi tambahan: Pengaturan > Aplikasi > QRIS Listener > Aktifkan Autostart."
                textSize = 11f
                setTextColor(cTextSec)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = dp(4) }
            })
        })

        // KONFIGURASI
        root.addView(sectionLabel("Konfigurasi"))
        root.addView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(cCard)
            setPadding(dp(16), dp(16), dp(16), dp(16))
            layoutParams = cardLp()
            addView(label("URL Server (qris-notify endpoint)"))
            addView(run {
                etServerUrl = EditText(this@MainActivity).apply {
                    hint = "https://radius.salfa.my.id/api/payment/qris-notify"
                    inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
                    textSize = 14f
                    setText(prefs.getString(QrisNotificationListener.PREF_SERVER_URL, ""))
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply { bottomMargin = dp(16) }
                }
                etServerUrl
            })
            addView(label("Device Key"))
            addView(run {
                etDeviceKey = EditText(this@MainActivity).apply {
                    hint = "Paste device key dari halaman admin"
                    inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
                    textSize = 14f
                    setText(prefs.getString(QrisNotificationListener.PREF_DEVICE_KEY, ""))
                }
                etDeviceKey
            })
            addView(label("Device Secret (wajib, dari panel admin)"))
            addView(run {
                etDeviceSecret = EditText(this@MainActivity).apply {
                    hint = "Paste device secret dari halaman admin"
                    inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
                    textSize = 14f
                    setText(prefs.getString(QrisNotificationListener.PREF_DEVICE_SECRET, ""))
                }
                etDeviceSecret
            })
            addView(divider())
            addView(run {
                swEnabled = Switch(this@MainActivity).apply {
                    text = "Aktifkan Listener"
                    isChecked = prefs.getBoolean(QrisNotificationListener.PREF_ENABLED, false)
                    textSize = 15f
                }
                swEnabled
            })
            addView(run {
                swVoice = Switch(this@MainActivity).apply {
                    text = "Bacakan nominal pembayaran dengan suara"
                    isChecked = prefs.getBoolean(QrisNotificationListener.PREF_VOICE, true)
                    textSize = 15f
                    setPadding(0, dp(8), 0, 0)
                    setOnCheckedChangeListener { _, on ->
                        prefs.edit().putBoolean(QrisNotificationListener.PREF_VOICE, on).apply()
                    }
                }
                swVoice
            })
            addView(TextView(this@MainActivity).apply {
                text = "Suara keluar lewat volume media. Bila dimatikan, hanya bunyi notifikasi biasa."
                textSize = 11f
                setTextColor(cTextSec)
            })
            addView(Button(this@MainActivity).apply {
                text = "Tes Suara"
                setTextColor(0xFFFFFFFF.toInt())
                setBackgroundColor(0xFF37474F.toInt())
                setOnClickListener { testVoice() }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, dp(44)
                ).apply { topMargin = dp(6) }
            })
        })

        // TOMBOL SIMPAN
        root.addView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(4), dp(12), dp(4))
            addView(Button(this@MainActivity).apply {
                text = "SIMPAN & TERAPKAN"
                textSize = 15f
                setTextColor(0xFFFFFFFF.toInt())
                setBackgroundColor(cBlue)
                setOnClickListener { saveSettings() }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, dp(52)
                )
            })
            addView(Button(this@MainActivity).apply {
                text = "TES KONEKSI SERVER"
                setTextColor(0xFFFFFFFF.toInt())
                setBackgroundColor(0xFF37474F.toInt())
                setOnClickListener { testConnection() }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, dp(48)
                ).apply { topMargin = dp(8) }
            })
            addView(TextView(this@MainActivity).apply {
                text = "PENTING: jangan tutup aplikasi ini dengan menggeser dari daftar aplikasi terbaru. " +
                        "Di Xiaomi/Oppo/Vivo, itu menghentikan aplikasi total sehingga notifikasi tidak terbaca. " +
                        "Kunci aplikasi (ikon gembok) di daftar terbaru dan aktifkan Autostart."
                textSize = 11f
                setTextColor(0xFFC62828.toInt())
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { topMargin = dp(8) }
            })
        })

        // Info app dipantau
        root.addView(TextView(this).apply {
            text = "Memantau: DANA | GoPay | ShopeePay | BRImo | BCA Mobile | Mandiri"
            textSize = 11f
            setTextColor(cTextSec)
            gravity = android.view.Gravity.CENTER
            setPadding(dp(16), dp(8), dp(16), dp(4))
        })

        // DEBUG LOG
        root.addView(sectionLabel("Debug Log"))
        root.addView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF1A1A2E.toInt())
            setPadding(dp(14), dp(14), dp(14), dp(14))
            layoutParams = cardLp()
            addView(run {
                tvDebug = TextView(this@MainActivity).apply {
                    textSize = 11f
                    setTextColor(0xFF7EC8A0.toInt())
                    setTypeface(android.graphics.Typeface.MONOSPACE)
                }
                tvDebug
            })
            addView(Button(this@MainActivity).apply {
                text = "Refresh"
                textSize = 12f
                setTextColor(0xFFE0E0E0.toInt())
                setBackgroundColor(0xFF2D3561.toInt())
                setOnClickListener { refreshDebug() }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, dp(38)
                ).apply { topMargin = dp(10) }
            })
        })
        root.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(24))
        })

        setContentView(scroll)
        updateStatusUI()
        refreshDebug()
    }

    override fun onResume() {
        super.onResume()
        updateStatusUI()
        refreshDebug()
        autoReconnectIfNeeded()
        handler.postDelayed(refreshRunnable, 3000)
    }

    override fun onPause() {
        super.onPause()
        handler.removeCallbacks(refreshRunnable)
    }

    override fun onDestroy() {
        testTts?.shutdown()
        testTts = null
        super.onDestroy()
    }

    private fun testVoice() {
        val sample = PaymentVoice.phrase("DANA", 3086)
        testTts?.let {
            PaymentVoice.speak(this, it, sample)
            return
        }
        testTts = android.speech.tts.TextToSpeech(this) { status ->
            val t = testTts
            if (status != android.speech.tts.TextToSpeech.SUCCESS || t == null) {
                Toast.makeText(this, "Mesin suara (Text-to-Speech) tidak tersedia di HP ini", Toast.LENGTH_LONG).show()
                return@TextToSpeech
            }
            if (!PaymentVoice.configure(t)) {
                Toast.makeText(this, "Suara Bahasa Indonesia belum terpasang. Pasang di pengaturan Text-to-Speech.", Toast.LENGTH_LONG).show()
                try { startActivity(Intent("com.android.settings.TTS_SETTINGS")) } catch (_: Exception) {}
            }
            PaymentVoice.speak(this, t, sample)
        }
    }

    private fun updateStatusUI() {
        val ok = isNotificationAccessGranted()
        tvPermStatus.text = if (ok) "Izin Notifikasi: Diberikan" else "Izin Notifikasi: Belum Diberikan"
        tvPermStatus.setTextColor(if (ok) cGreen else cRed)
        btnGrantPermission.visibility = if (ok) View.GONE else View.VISIBLE

        val batteryOk = isIgnoringBatteryOptimizations()
        btnBatteryOpt.visibility = if (batteryOk) View.GONE else View.VISIBLE
    }

    private fun isNotificationAccessGranted(): Boolean {
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners") ?: ""
        return flat.contains(packageName)
    }

    private fun isIgnoringBatteryOptimizations(): Boolean {
        return try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            pm.isIgnoringBatteryOptimizations(packageName)
        } catch (e: Exception) {
            true
        }
    }

    /**
     * Opens the vendor screen that lets an app start and stay running in
     * the background. Without it Xiaomi, Oppo, Vivo, Realme and Huawei kill
     * the listener soon after the screen turns off.
     */
    private fun openAutostartSettings() {
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
        for (c in candidates) {
            try {
                startActivity(Intent().setComponent(c).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                Toast.makeText(this, "Aktifkan \${getString(R.string.app_name)} di daftar ini", Toast.LENGTH_LONG).show()
                return
            } catch (_: Exception) {}
        }
        // Other phones: the app's own settings page (Baterai > Tidak dibatasi).
        try {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:\${packageName}")))
            Toast.makeText(this, "Pilih Baterai > Tidak dibatasi, dan izinkan aktivitas latar", Toast.LENGTH_LONG).show()
        } catch (_: Exception) {
            Toast.makeText(this, "Buka manual: Pengaturan > Aplikasi > QRIS Listener", Toast.LENGTH_LONG).show()
        }
    }

    private fun requestIgnoreBatteryOptimizations() {
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:\${packageName}")
            }
            startActivity(intent)
        } catch (e: Exception) {
            try {
                startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            } catch (_: Exception) {
                Toast.makeText(this, "Buka manual: Pengaturan > Baterai > QRIS Listener > Tidak dibatasi", Toast.LENGTH_LONG).show()
            }
        }
    }

    /**
     * The listener writes a heartbeat every 5 minutes while Android keeps it
     * bound. The "connected" flag is only cleared on a clean disconnect, so a
     * process the system killed kept showing "Terhubung: YA".
     */
    private fun lastBeat(): Long = prefs.getLong(QrisNotificationListener.PREF_HEARTBEAT, 0L)
    private fun listenerAlive(): Boolean = System.currentTimeMillis() - lastBeat() < 11 * 60_000L

    /** Makes Android bind the listener again; also used after it was killed. */
    private fun rebindListener() {
        val cn = ComponentName(this, QrisNotificationListener::class.java)
        try {
            packageManager.setComponentEnabledSetting(cn, android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DISABLED, android.content.pm.PackageManager.DONT_KILL_APP)
            packageManager.setComponentEnabledSetting(cn, android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_ENABLED, android.content.pm.PackageManager.DONT_KILL_APP)
        } catch (_: Exception) {}
        try { NLS.requestRebind(cn) } catch (_: Exception) {}
    }

    private fun testConnection() {
        val url = etServerUrl.text.toString().trim()
        val key = etDeviceKey.text.toString().trim()
        val secret = etDeviceSecret.text.toString().trim()
        if (url.isEmpty() || key.isEmpty()) {
            Toast.makeText(this, "Isi URL Server dan Device Key dulu", Toast.LENGTH_SHORT).show()
            return
        }
        tvDebug.text = "Menguji koneksi ke server..."
        Thread {
            val result = try {
                val ts = System.currentTimeMillis() / 1000
                val nonce = java.util.UUID.randomUUID().toString().replace("-", "")
                val payload = org.json.JSONObject().apply {
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
                val json = try { org.json.JSONObject(body) } catch (_: Exception) { org.json.JSONObject() }
                if (json.optBoolean("success")) json.optString("message", "Koneksi OK")
                else "GAGAL (HTTP \${code}): " + json.optString("error", body.take(120))
            } catch (e: Exception) {
                "GAGAL: tidak bisa menghubungi server (\${e.message})"
            }
            runOnUiThread {
                tvDebug.text = result
                Toast.makeText(this, result, Toast.LENGTH_LONG).show()
            }
        }.start()
    }

    private fun autoReconnectIfNeeded() {
        val enabled   = prefs.getBoolean(QrisNotificationListener.PREF_ENABLED, false)
        if (!enabled || listenerAlive()) return

        val permOk = isNotificationAccessGranted()
        val hasUrl = !prefs.getString(QrisNotificationListener.PREF_SERVER_URL, "").isNullOrEmpty()
        val hasKey = !prefs.getString(QrisNotificationListener.PREF_DEVICE_KEY, "").isNullOrEmpty()
        if (!permOk || !hasUrl || !hasKey) return

        val now = System.currentTimeMillis()
        if (now - lastAutoReconnectAttempt < 15_000L) return
        lastAutoReconnectAttempt = now

        rebindListener()
    }

    private fun saveSettings() {
        val url = etServerUrl.text.toString().trim()
        val key = etDeviceKey.text.toString().trim()
        val secret = etDeviceSecret.text.toString().trim()

        if (url.isEmpty()) { etServerUrl.error = "URL server wajib diisi"; return }
        if (!url.startsWith("http")) { etServerUrl.error = "URL harus dimulai http/https"; return }
        if (key.isEmpty()) { etDeviceKey.error = "Device key wajib diisi"; return }

        prefs.edit()
            .putString(QrisNotificationListener.PREF_SERVER_URL, url)
            .putString(QrisNotificationListener.PREF_DEVICE_KEY, key)
            .putString(QrisNotificationListener.PREF_DEVICE_SECRET, secret)
            .putBoolean(QrisNotificationListener.PREF_ENABLED, swEnabled.isChecked)
            .apply()

        Toast.makeText(
            this,
            if (secret.isEmpty()) "Disimpan, tetapi Device Secret kosong: pembayaran akan ditolak server." else "Pengaturan disimpan.",
            Toast.LENGTH_LONG
        ).show()
        tvDebug.text = "Memulai service... tunggu 2-3 detik"

        val svcIntent = Intent(this, QrisNotificationListener::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(svcIntent)
        } else {
            startService(svcIntent)
        }
        rebindListener()

        handler.postDelayed({ refreshDebug() }, 2000)
        handler.postDelayed({ refreshDebug() }, 5000)
    }

    private fun forceReconnect() {
        val cn = ComponentName(this, QrisNotificationListener::class.java)
        rebindListener()
        val svcIntent = Intent(this, QrisNotificationListener::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(svcIntent)
        } else {
            startService(svcIntent)
        }

        val delays = listOf(0L, 2000L, 5000L, 10000L, 18000L, 28000L)
        for (delay in delays) {
            handler.postDelayed({
                try { NLS.requestRebind(cn) } catch (_: Exception) {}
            }, delay)
        }

        Toast.makeText(this, "Mencoba reconnect... tunggu 30 detik.", Toast.LENGTH_LONG).show()

        for (delay in listOf(3000L, 8000L, 15000L, 22000L, 32000L)) {
            handler.postDelayed({ refreshDebug() }, delay)
        }
    }

    private fun refreshDebug() {
        val connected = listenerAlive()
        val beat = lastBeat()
        val since = if (beat > 0) java.text.SimpleDateFormat("dd/MM HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date(beat)) else "-"
        val permOk    = isNotificationAccessGranted()

        tvConnStatus.text = if (connected)
            "Service: Aktif (terakhir \${since})"
        else
            "Service: TIDAK aktif (terakhir \${since}). Tekan Reconnect."
        tvConnStatus.setTextColor(if (connected) cGreen else cRed)

        btnForceReconnect.visibility = if (!connected && permOk) View.VISIBLE else View.GONE

        val sb = StringBuilder()
        sb.appendLine("=== Status Service ===")
        sb.appendLine(if (connected) "Aktif: YA (terakhir \${since})" else "Aktif: TIDAK sejak \${since}. Notifikasi tidak terbaca.")
        sb.appendLine()

        sb.appendLine("=== DANA / e-wallet terakhir ===")
        val lastEwallet = prefs.getString(QrisNotificationListener.PREF_DEBUG_LAST_EWALLET, "(belum ada)") ?: "(belum ada)"
        val lastResult  = prefs.getString(QrisNotificationListener.PREF_DEBUG_LAST_RESULT, "") ?: ""
        sb.appendLine(lastEwallet)
        if (lastResult.isNotEmpty()) sb.appendLine("-> \${lastResult}")
        sb.appendLine()

        sb.appendLine("=== 10 notif terakhir (semua app) ===")
        val rawJson = prefs.getString(QrisNotificationListener.PREF_DEBUG_LAST_10, "[]") ?: "[]"
        try {
            val arr = JSONArray(rawJson)
            if (arr.length() == 0) {
                sb.appendLine("(belum ada notifikasi tercatat)")
            } else {
                for (i in 0 until arr.length()) {
                    val obj = arr.getJSONObject(i)
                    sb.appendLine("[\${obj.optString("time")}] \${obj.optString("pkg")}: \${obj.optString("title")}")
                }
            }
        } catch (_: Exception) {
            sb.appendLine("(error membaca log)")
        }

        tvDebug.text = sb.toString().trimEnd()
    }

    private fun dp(dp: Int) = (dp * resources.displayMetrics.density + 0.5f).toInt()

    private fun cardLp() = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
    ).apply { setMargins(dp(12), 0, dp(12), dp(8)) }

    private fun sectionLabel(text: String) = TextView(this).apply {
        this.text = text.uppercase()
        textSize = 11f
        setTextColor(cBlue)
        setTypeface(typeface, android.graphics.Typeface.BOLD)
        setPadding(dp(16), dp(16), dp(16), dp(6))
    }

    private fun label(text: String) = TextView(this).apply {
        this.text = text
        textSize = 13f
        setTextColor(cTextSec)
        setPadding(0, 0, 0, dp(4))
    }

    private fun divider() = View(this).apply {
        setBackgroundColor(cBorder)
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 1
        ).apply { topMargin = dp(12); bottomMargin = dp(12) }
    }
}
`;
}

function qrisNotificationListener(pkg: string): string {
  return `package ${pkg}

import android.app.Notification
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
                """(?:dapat|terima)\\s+(?:pembayaran|transfer|uang|dana)\\s*(?:sebesar\\s*)?Rp\\.?\\s*(\\d{1,3}(?:[.,]\\d{3})*)""",
                Pattern.CASE_INSENSITIVE
            ),
            Pattern.compile(
                """(?:menerima|diterima|masuk|received|transfer\\s+masuk|pembayaran\\s+masuk)[^Rp0-9]*[Rp\\s]*(\\d{1,3}(?:[.,]\\d{3})*)""",
                Pattern.CASE_INSENSITIVE
            ),
            Pattern.compile(
                """Rp\\s*(\\d{1,3}(?:[.,]\\d{3})*)(?:\\s*telah\\s*diterima|\\s*berhasil\\s*diterima)""",
                Pattern.CASE_INSENSITIVE
            ),
            Pattern.compile(
                """Rp\\s*(\\d{1,3}(?:[.,]\\d{3})*)\\s+dari\\s+\\S+\\s+berhasil\\s*diterima""",
                Pattern.CASE_INSENSITIVE
            ),
            Pattern.compile(
                """berhasil\\s+diterima\\s+Rp\\s*(\\d{1,3}(?:[.,]\\d{3})*)""",
                Pattern.CASE_INSENSITIVE
            ),
            Pattern.compile(
                """(?:kamu|anda)?\\s*menerima\\s+[Rp\\s]*(\\d{1,3}(?:[.,]\\d{3})*)""",
                Pattern.CASE_INSENSITIVE
            ),
            Pattern.compile(
                """Rp\\s*(\\d{1,3}(?:[.,]\\d{3})*)\\s+diterima\\b""",
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
            Log.i(TAG, "rebind retry #\${rebindRetryCount}")
            try {
                requestRebind(ComponentName(this@QrisNotificationListener, QrisNotificationListener::class.java))
            } catch (e: Exception) {
                Log.e(TAG, "requestRebind gagal: \${e.message}")
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
                Log.w(TAG, "TTS init failed, status=\${status}")
            }
        }
        Log.i(TAG, "Service onCreate")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForegroundCompat()
        Log.i(TAG, "onStartCommand - service dimulai")
        return START_STICKY
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        startForegroundCompat()
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

        Log.d(TAG, "[\${displayLabel}] \${rawText}")

        prefs.edit()
            .putString(PREF_DEBUG_LAST_EWALLET, "[\${packageName}]\\n\${rawText}")
            .apply()

        if (deviceSecret.isEmpty()) {
            prefs.edit().putString(PREF_DEBUG_LAST_RESULT,
                "Device Secret belum diisi. Salin dari Payment Gateway > QRIS Mandiri di panel admin.").apply()
            return
        }
        val lower = rawText.lowercase(Locale.ROOT)
        if (OUTGOING_HINTS.any { lower.contains(it) }) {
            prefs.edit().putString(PREF_DEBUG_LAST_RESULT, "Uang keluar, diabaikan:\\n\${rawText.take(150)}").apply()
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
                "Bukan notifikasi uang masuk, tidak dikirim:\\n\${rawText.take(150)}").apply()
            return
        }

        val now = System.currentTimeMillis()
        val lastSent = recentlySent[amount] ?: 0L
        if (now - lastSent < 60_000L) {
            Log.d(TAG, "[\${displayLabel}] Duplikat Rp\${amount} diabaikan (\${now - lastSent}ms lalu)")
            prefs.edit().putString(PREF_DEBUG_LAST_RESULT,
                "Duplikat diabaikan: Rp\${amount}\\n(\${((now - lastSent) / 1000)}d lalu dari \${packageName})").apply()
            return
        }
        recentlySent[amount] = now
        recentlySent.entries.removeIf { now - it.value > 120_000L }

        Log.i(TAG, "[\${displayLabel}] Terdeteksi: Rp\${amount}")
        prefs.edit().putString(PREF_DEBUG_LAST_RESULT, "Mengirim Rp\${amount} ke server...").apply()

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
                Log.e(TAG, "Ringtone error: \${e.message}")
            }
        }
        val pi = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notif = NotificationCompat.Builder(this, CHANNEL_PAYMENT_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Pembayaran QRIS Masuk!")
            .setContentText("\${appLabel} — Rp \${formatted} diterima")
            .setStyle(NotificationCompat.BigTextStyle()
                .bigText("\${appLabel} mendeteksi pembayaran masuk Rp \${formatted}.\\nMengirim konfirmasi ke server..."))
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
            .setContentTitle("QRIS Listener Aktif")
            .setContentText("Memantau notifikasi DANA, GoPay, ShopeePay, BRImo, BCA, Mandiri")
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
                "QRIS Listener - Status Berjalan",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Notifikasi status service QRIS Listener (selalu tampil saat aktif)"
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
            Log.i(TAG, "Server [\${responseCode}]: \${response}")
            val json = try { JSONObject(response) } catch (_: Exception) { JSONObject() }
            if (responseCode >= 500 || responseCode == 429) {
                if (queueOnFailure) enqueue(amount, sourceApp, rawText)
                prefs.edit().putString(PREF_DEBUG_LAST_RESULT,
                    "Server sibuk (HTTP \${responseCode}), Rp\${amount} diantrikan untuk dikirim ulang").apply()
                return false
            }
            val resultMsg = when {
                json.optBoolean("success") -> "TERCATAT: Rp\${amount} lunas di server"
                responseCode == 401 -> "Ditolak server: " + json.optString("error", "kunci tidak cocok")
                else -> "Server: " + json.optString("error", "HTTP " + responseCode)
            }
            prefs.edit().putString(PREF_DEBUG_LAST_RESULT, resultMsg).apply()
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Gagal kirim ke server: \${e.message}")
            if (queueOnFailure) enqueue(amount, sourceApp, rawText)
            prefs.edit().putString(PREF_DEBUG_LAST_RESULT,
                "Offline: Rp\${amount} diantrikan, dikirim ulang otomatis").apply()
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
`;
}

function qrisWatchdogWorker(pkg: string): string {
  return `package ${pkg}

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
            .setContentTitle("QRIS Listener Berhenti Memantau")
            .setContentText("Izin akses notifikasi tercabut sistem. Tap untuk aktifkan ulang.")
            .setStyle(NotificationCompat.BigTextStyle()
                .bigText("Android mencabut izin akses notifikasi QRIS Listener (biasanya karena battery manager membunuh app). Pembayaran QRIS TIDAK akan terdeteksi otomatis sampai izin diaktifkan ulang. Tap notifikasi ini untuk buka pengaturan."))
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
`;
}

function qrisBootReceiver(pkg: string): string {
  return `package ${pkg}

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
`;
}

const gradlewScript = () => `#!/bin/sh
set -e
APP_HOME="$(cd "$(dirname "$0")" && pwd -P)"
CLASSPATH="$APP_HOME/gradle/wrapper/gradle-wrapper.jar"
exec java -classpath "$CLASSPATH" org.gradle.wrapper.GradleWrapperMain "$@"
`;

// ─── write project to disk ───────────────────────────────────────────────────

async function writeProjectToDisk(
  projectDir: string,
  role: RoleKey,
  appName: string,
  startUrl: string,
  baseUrl: string,
  logoPath: string | null = null,
) {
  const cfg = ROLES[role];
  const pkgPath = cfg.pkg.replace(/\./g, '/');

  // Create directories
  for (const d of [
    'gradle/wrapper',
    `app/src/main/java/${pkgPath}`,
    'app/src/main/res/layout',
    'app/src/main/res/values',
    ...['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'].map(d => `app/src/main/res/mipmap-${d}`),
  ]) {
    mkdirSync(join(projectDir, d), { recursive: true });
  }

  // Root files
  writeFileSync(join(projectDir, 'build.gradle'), rootBuildGradle());
  writeFileSync(join(projectDir, 'settings.gradle'), settingsGradle(appName));
  writeFileSync(join(projectDir, 'gradle.properties'), gradleProperties());
  writeFileSync(join(projectDir, 'local.properties'), `sdk.dir=${ANDROID_HOME}\n`);

  // Gradle wrapper
  writeFileSync(join(projectDir, 'gradle/wrapper/gradle-wrapper.properties'), gradleWrapperProperties());
  if (existsSync(WRAPPER_JAR)) {
    copyFileSync(WRAPPER_JAR, join(projectDir, 'gradle/wrapper/gradle-wrapper.jar'));
  }
  const gradlew = join(projectDir, 'gradlew');
  writeFileSync(gradlew, gradlewScript());
  chmodSync(gradlew, '755');

  // App module
  writeFileSync(join(projectDir, 'app/build.gradle'), appBuildGradle(cfg.pkg));
  writeFileSync(join(projectDir, 'app/proguard-rules.pro'), '# ProGuard rules\n');

  if (role === 'qris_listener') {
    // QRIS Listener is a native app (not WebView)
    writeFileSync(join(projectDir, 'app/src/main/AndroidManifest.xml'), qrisListenerManifest(cfg.pkg));
    writeFileSync(join(projectDir, `app/src/main/java/${pkgPath}/MainActivity.kt`), qrisListenerActivity(cfg.pkg));
    writeFileSync(join(projectDir, `app/src/main/java/${pkgPath}/QrisNotificationListener.kt`), qrisNotificationListener(cfg.pkg));
    writeFileSync(join(projectDir, `app/src/main/java/${pkgPath}/QrisWatchdogWorker.kt`), qrisWatchdogWorker(cfg.pkg));
    writeFileSync(join(projectDir, `app/src/main/java/${pkgPath}/BootReceiver.kt`), qrisBootReceiver(cfg.pkg));
    writeFileSync(join(projectDir, 'app/src/main/res/layout/activity_main.xml'), qrisListenerLayoutXml());
    writeFileSync(join(projectDir, 'app/src/main/res/values/strings.xml'), stringsXml(appName));
    writeFileSync(join(projectDir, 'app/src/main/res/values/colors.xml'), colorsXml(cfg.color));
    writeFileSync(join(projectDir, 'app/src/main/res/values/themes.xml'), themesXml());
    // Pre-fill webhook URL and device key from company settings
    try {
      const company = await prisma.company.findFirst({ select: { qrisDeviceKey: true } });
      if (company?.qrisDeviceKey) {
        writeFileSync(join(projectDir, 'app/src/main/res/values/strings.xml'),
          `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">${androidString(appName)}</string>\n    <string name="default_device_key">${androidString(company.qrisDeviceKey)}</string>\n    <string name="default_webhook_url">${baseUrl}/api/payment/qris-notify</string>\n</resources>\n`);
      }
    } catch { /* ignore */ }
  } else {
    // Standard WebView app
    writeFileSync(join(projectDir, 'app/src/main/AndroidManifest.xml'), androidManifest(cfg.pkg));
    writeFileSync(join(projectDir, `app/src/main/java/${pkgPath}/MainActivity.kt`), mainActivity(cfg.pkg, startUrl, baseUrl));
    writeFileSync(join(projectDir, `app/src/main/java/${pkgPath}/NotificationWorker.kt`), notificationWorker(cfg.pkg));
    writeFileSync(join(projectDir, 'app/src/main/res/layout/activity_main.xml'), activityMainXml());
    writeFileSync(join(projectDir, 'app/src/main/res/values/strings.xml'), stringsXml(appName));
    writeFileSync(join(projectDir, 'app/src/main/res/values/colors.xml'), colorsXml(cfg.color));
    writeFileSync(join(projectDir, 'app/src/main/res/values/themes.xml'), themesXml());
  }

  // Icons per density — use company logo if available, fallback to solid color
  const densitySizes: Record<string, number> = {
    mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192,
  };

  let logoConverted = false;
  if (logoPath && existsSync(logoPath)) {
    // 1) Try sharp (bundled with Next.js — no external dependencies needed)
    try {
      const sharp = (await import('sharp')).default;
      const logoBuffer = readFileSync(logoPath);
      for (const [density, size] of Object.entries(densitySizes)) {
        const resized = await sharp(logoBuffer)
          .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
          .png()
          .toBuffer();
        const outPng = join(projectDir, `app/src/main/res/mipmap-${density}/ic_launcher.png`);
        writeFileSync(outPng, resized);
        copyFileSync(outPng, join(projectDir, `app/src/main/res/mipmap-${density}/ic_launcher_round.png`));
      }
      logoConverted = true;
    } catch {
      // 2) Fallback: ImageMagick
      try {
        await execAsync('which convert', { timeout: 3000 });
        for (const [density, size] of Object.entries(densitySizes)) {
          const outPng = join(projectDir, `app/src/main/res/mipmap-${density}/ic_launcher.png`);
          await execAsync(
            `convert "${logoPath}" -thumbnail ${size}x${size} -background white -gravity center -extent ${size}x${size} "${outPng}"`,
            { timeout: 20000 },
          );
          copyFileSync(outPng, join(projectDir, `app/src/main/res/mipmap-${density}/ic_launcher_round.png`));
        }
        logoConverted = true;
      } catch { /* ImageMagick also unavailable — fall through to solid color */ }
    }
  }

  if (!logoConverted) {
    // Fallback: solid color placeholder
    const hex = cfg.color.replace('#', '');
    const ir = parseInt(hex.slice(0, 2), 16);
    const ig = parseInt(hex.slice(2, 4), 16);
    const ib = parseInt(hex.slice(4, 6), 16);
    for (const [density, size] of Object.entries(densitySizes)) {
      const iconPng = makePlaceholderPng(size, size, ir, ig, ib);
      writeFileSync(join(projectDir, `app/src/main/res/mipmap-${density}/ic_launcher.png`), iconPng);
      writeFileSync(join(projectDir, `app/src/main/res/mipmap-${density}/ic_launcher_round.png`), iconPng);
    }
  }
}

// ─── PNG generator (valid PNG, no external deps) ─────────────────────────────

function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const tb = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crc]);
}

function makePlaceholderPng(w: number, h: number, r: number, g: number, b: number): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // bit depth=8, color type=RGB
  const lines: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    row[0] = 0; // filter none
    for (let x = 0; x < w; x++) { row[1+x*3]=r; row[2+x*3]=g; row[3+x*3]=b; }
    lines.push(row);
  }
  const idat = deflateSync(Buffer.concat(lines), { level: 1 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

// ─── detect JAVA_HOME ────────────────────────────────────────────────────────

async function detectJavaHome(): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync('java -XshowSettings:property -version 2>&1', { timeout: 8000 });
    const out = stdout + stderr;
    const m = out.match(/java\.home\s*=\s*(.+)/);
    if (m) return m[1].trim();
  } catch { /* ignore */ }
  for (const p of [
    '/usr/lib/jvm/java-17-openjdk-amd64',
    '/usr/lib/jvm/java-21-openjdk-amd64',
    '/usr/lib/jvm/java-11-openjdk-amd64',
    '/usr/lib/jvm/temurin-17',
  ]) {
    if (existsSync(join(p, 'bin/java'))) return p;
  }
  return '';
}

// ─── GET: check environment ───────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const authCheck = await requirePermission('settings.view');
  if (!authCheck.authorized) return authCheck.response;

  let java = false;
  let javaVersion = '';
  try {
    const { stdout, stderr } = await execAsync('java -version 2>&1', { timeout: 8000 });
    const out = stdout + stderr;
    java = true;
    javaVersion = out.match(/version "([^"]+)"/)?.[1] ?? 'detected';
  } catch { /* java not found */ }

  const androidSdk =
    existsSync(join(ANDROID_HOME, 'build-tools')) &&
    existsSync(join(ANDROID_HOME, 'platforms'));

  // Default URL shown in UI input — from env or company DB
  let defaultUrl = (process.env.NEXTAUTH_URL || process.env.APP_URL || '').replace(/\/$/, '');
  if (!defaultUrl) {
    try {
      const company = await prisma.company.findFirst({ select: { baseUrl: true } });
      if (company?.baseUrl) defaultUrl = company.baseUrl.replace(/\/$/, '');
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    ready: java && androidSdk,
    java,
    javaVersion,
    androidSdk,
    androidHome: ANDROID_HOME,
    defaultUrl,
  });
}

// ─── POST: start build ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authCheck = await requirePermission('settings.edit');
  if (!authCheck.authorized) return authCheck.response;

  const role = req.nextUrl.searchParams.get('role') as RoleKey;
  if (!role || !ROLES[role]) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  // Optional custom URL passed from UI
  const customUrlParam = req.nextUrl.searchParams.get('url');
  let customBaseUrl: string | null = null;
  if (customUrlParam) {
    try {
      const parsed = new URL(customUrlParam);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid protocol');
      customBaseUrl = parsed.origin; // strip trailing path/slash
    } catch {
      return NextResponse.json({ error: 'URL tidak valid. Gunakan format https://domain.com' }, { status: 400 });
    }
  }

  // Verify Java
  try {
    await execAsync('java -version 2>&1', { timeout: 8000 });
  } catch {
    return NextResponse.json(
      { error: 'Java tidak terinstall. Jalankan: apt-get install -y openjdk-17-jdk' },
      { status: 503 },
    );
  }

  // Verify Android SDK
  if (!existsSync(join(ANDROID_HOME, 'build-tools'))) {
    return NextResponse.json(
      { error: `Android SDK tidak ditemukan di ${ANDROID_HOME}. Jalankan setup terlebih dahulu.` },
      { status: 503 },
    );
  }

  const roleDir = join(APK_DIR, role);
  mkdirSync(roleDir, { recursive: true });
  mkdirSync(GRADLE_CACHE, { recursive: true });

  const statusFile = join(roleDir, 'status.json');

  // Prevent concurrent build for same role
  if (existsSync(statusFile)) {
    try {
      const s = JSON.parse(readFileSync(statusFile, 'utf-8'));
      if (s.status === 'building') {
        const elapsed = Date.now() - new Date(s.startedAt).getTime();
        if (elapsed < 15 * 60 * 1000) {
          return NextResponse.json({ status: 'building', message: 'Build sedang berjalan' });
        }
      }
    } catch { /* ignore */ }
  }

  // Fetch company name, base URL, and logo path
  let baseUrl = (process.env.NEXTAUTH_URL || process.env.APP_URL || 'https://your-vps.com').replace(/\/$/, '');
  let appName: string = ROLES[role].label;
  let logoPath: string | null = null;
  try {
    const company = await prisma.company.findFirst({ select: { name: true, logo: true, baseUrl: true } });
    if (company?.name) {
      appName = `${company.name} ${role.charAt(0).toUpperCase() + role.slice(1)}`;
    }
    if (company?.baseUrl) {
      baseUrl = company.baseUrl.replace(/\/$/, '');
    }
    if (company?.logo) {
      // logo stored as e.g. "/api/uploads/logos/logo-abc.png" — resolve to filesystem path
      const filename = company.logo.split('/').pop();
      if (filename && /^[a-zA-Z0-9._-]+$/.test(filename)) {
        const uploadDir = process.env.UPLOAD_DIR ||
          (process.env.NODE_ENV === 'production' ? '/var/data/salfanet/uploads' : join(process.cwd(), 'data', 'uploads'));
        const candidate = join(uploadDir, 'logos', filename);
        if (existsSync(candidate)) {
          logoPath = candidate;
        } else {
          // Legacy location
          const legacy = join(process.cwd(), 'public', 'uploads', 'logos', filename);
          if (existsSync(legacy)) logoPath = legacy;
        }
      }
    }
  } catch { /* use defaults */ }

  // Custom URL from UI overrides everything
  if (customBaseUrl) {
    baseUrl = customBaseUrl;
  }

  const startUrl   = `${baseUrl}${ROLES[role].pathSuffix}`;
  const startedAt  = new Date().toISOString();
  const projectDir = `/tmp/salfanet-build-${role}-${Date.now()}`;

  // Mark as building
  writeFileSync(statusFile, JSON.stringify({ status: 'building', startedAt, role, appName, url: startUrl }));

  if (!existsSync(WRAPPER_JAR)) {
    writeFileSync(statusFile, JSON.stringify({
      status: 'failed', startedAt, finishedAt: new Date().toISOString(),
      error: `gradle-wrapper.jar tidak ditemukan. Pastikan ${WRAPPER_JAR_CANDIDATES[0]} ada (ikut deploy dari frontend/public/android-template).`,
    }));
    return NextResponse.json({ error: 'gradle-wrapper.jar tidak ditemukan' }, { status: 503 });
  }

  // Write project files
  try {
    await writeProjectToDisk(projectDir, role, appName, startUrl, baseUrl, logoPath);
  } catch (err) {
    writeFileSync(statusFile, JSON.stringify({
      status: 'failed', startedAt, finishedAt: new Date().toISOString(),
      error: `Gagal generate project: ${err}`,
    }));
    return NextResponse.json({ error: 'Gagal generate project' }, { status: 500 });
  }

  // Spawn Gradle build in background
  const logFile = join(roleDir, 'build.log');
  const logFd   = openSync(logFile, 'w');
  const javaHome = await detectJavaHome();
  const env: NodeJS.ProcessEnv = {
    ...(process.env),
    ANDROID_HOME,
    GRADLE_USER_HOME: GRADLE_CACHE,
    TERM: 'dumb',
  };
  if (javaHome) env.JAVA_HOME = javaHome;

  const proc = spawn('./gradlew', ['assembleRelease', '--no-daemon', '-q'], {
    cwd: projectDir,
    env,
    detached: true,
    stdio: ['ignore', logFd, logFd],
  }) as any;

  proc.on('exit', (code: number | null) => {
    try {
      if (code === 0) {
        const releaseDir = join(projectDir, 'app/build/outputs/apk/release');
        const apkFiles   = existsSync(releaseDir)
          ? readdirSync(releaseDir).filter(f => f.endsWith('.apk'))
          : [];

        if (apkFiles.length > 0) {
          const src  = join(releaseDir, apkFiles[0]);
          const dst  = join(roleDir, 'app.apk');
          copyFileSync(src, dst);
          writeFileSync(statusFile, JSON.stringify({
            status: 'done', startedAt, finishedAt: new Date().toISOString(),
            appName, url: startUrl, apkSize: statSync(dst).size,
          }));
        } else {
          writeFileSync(statusFile, JSON.stringify({
            status: 'failed', startedAt, finishedAt: new Date().toISOString(),
            error: 'File APK tidak ditemukan setelah build selesai.',
          }));
        }
      } else {
        writeFileSync(statusFile, JSON.stringify({
          status: 'failed', startedAt, finishedAt: new Date().toISOString(),
          error: `Gradle exit code ${code}.\n${buildLogTail(logFile)}`,
        }));
      }
    } catch { /* ignore */ }

    // Cleanup project dir
    try { spawn('rm', ['-rf', projectDir], { detached: true, stdio: 'ignore' }).unref(); } catch { /* ignore */ }
  });

  proc.unref();

  return NextResponse.json({ status: 'building', startedAt });
}
