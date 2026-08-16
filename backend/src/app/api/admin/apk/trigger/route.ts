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

// ─── file generators ─────────────────────────────────────────────────────────

function mainActivity(pkg: string, startUrl: string, baseUrl: string): string {
  return `package ${pkg}

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
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
}
dependencies {
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'com.google.android.material:material:1.11.0'
    implementation 'androidx.work:work-runtime-ktx:2.9.0'
    implementation 'androidx.core:core-ktx:1.12.0'
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
rootProject.name = "${appName.replace(/\s+/g, '')}"
include ':app'
`;

const gradleProperties = () =>
  `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\nandroid.useAndroidX=true\nkotlin.code.style=official\n`;

const gradleWrapperProperties = () =>
  `distributionBase=GRADLE_USER_HOME\ndistributionPath=wrapper/dists\ndistributionUrl=https\\://services.gradle.org/distributions/gradle-8.4-bin.zip\nnetworkTimeout=10000\nvalidateDistributionUrl=true\nzipStoreBase=GRADLE_USER_HOME\nzipStorePath=wrapper/dists\n`;

const androidManifest = (pkg: string) => `<?xml version="1.0" encoding="utf-8"?>
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

const stringsXml = (appName: string) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">${appName}</string>\n</resources>\n`;

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

function qrisListenerManifest(pkg: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
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
            android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"
            android:exported="false">
            <intent-filter>
                <action android:name="android.service.notification.NotificationListenerService" />
            </intent-filter>
        </service>
        <receiver android:name=".BootReceiver" android:exported="true">
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

import android.Manifest
import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.method.ScrollingMovementMethod
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {
    companion object {
        const val PREFS_NAME = "qris_listener_prefs"
        const val PREF_WEBHOOK_URL = "webhook_url"
        const val PREF_DEVICE_KEY = "device_key"
        const val PREF_REGEX = "regex"
        const val PREF_LOGS = "logs"
        const val DEFAULT_REGEX = "Rp\\s*([\\d.,]+)"
    }

    private lateinit var tvStatus: TextView
    private lateinit var tvLog: TextView
    private lateinit var etWebhookUrl: EditText
    private lateinit var etDeviceKey: EditText
    private lateinit var etRegex: EditText

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        tvStatus = findViewById(R.id.tvStatus)
        tvLog = findViewById(R.id.tvLog)
        etWebhookUrl = findViewById(R.id.etWebhookUrl)
        etDeviceKey = findViewById(R.id.etDeviceKey)
        etRegex = findViewById(R.id.etRegex)
        tvLog.movementMethod = ScrollingMovementMethod()

        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        // Load defaults from strings.xml (pre-filled at build time)
        val defaultWebhook = getString(R.string.default_webhook_url)
        val defaultKey = getString(R.string.default_device_key)

        etWebhookUrl.setText(prefs.getString(PREF_WEBHOOK_URL, defaultWebhook))
        etDeviceKey.setText(prefs.getString(PREF_DEVICE_KEY, defaultKey))
        etRegex.setText(prefs.getString(PREF_REGEX, DEFAULT_REGEX))

        // Request POST_NOTIFICATIONS permission
        if (Build.VERSION.SDK_INT >= 33) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }

        findViewById<Button>(R.id.btnSave).setOnClickListener {
            prefs.edit()
                .putString(PREF_WEBHOOK_URL, etWebhookUrl.text.toString().trim())
                .putString(PREF_DEVICE_KEY, etDeviceKey.text.toString().trim())
                .putString(PREF_REGEX, etRegex.text.toString().trim())
                .apply()
            Toast.makeText(this, "Konfigurasi disimpan", Toast.LENGTH_SHORT).show()
            updateStatus()
        }

        findViewById<Button>(R.id.btnEnableNotif).setOnClickListener {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            startActivity(intent)
        }

        findViewById<Button>(R.id.btnDisableBattery).setOnClickListener {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                intent.data = Uri.parse("package:$packageName")
                startActivity(intent)
            } else {
                Toast.makeText(this, "Optimasi baterai sudah dinonaktifkan", Toast.LENGTH_SHORT).show()
            }
        }

        findViewById<Button>(R.id.btnTestNotif).setOnClickListener {
            val testText = "Pembayaran diterima Rp 150.000 dari QRIS"
            QrisNotificationListener.processNotification(this, testText, "TestApp")
        }

        refreshLogs()
    }

    override fun onResume() {
        super.onResume()
        updateStatus()
        refreshLogs()
    }

    private fun updateStatus() {
        val enabled = isNotificationListenerEnabled()
        val hasConfig = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(PREF_WEBHOOK_URL, null) != null

        val statusText = buildString {
            append("Status: ")
            append(if (enabled) "AKTIF ✓" else "NONAKTIF ✗")
            append("\n")
            append("Config: ")
            append(if (hasConfig) "Tersimpan" else "Belum disimpan")
        }
        tvStatus.text = statusText
    }

    private fun isNotificationListenerEnabled(): Boolean {
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
        return flat != null && flat.contains(packageName)
    }

    fun refreshLogs() {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val logsJson = prefs.getString(PREF_LOGS, "[]")
        try {
            val arr = JSONArray(logsJson)
            val sb = StringBuilder()
            val count = minOf(arr.length(), 20)
            for (i in 0 until count) {
                val entry = arr.getJSONObject(i)
                val time = entry.optString("time", "")
                val amount = entry.optString("amount", "")
                val status = entry.optString("status", "")
                val emoji = if (status == "success") "✅" else "❌"
                sb.append("$emoji [$time] Rp$amount - $status\n")
            }
            tvLog.text = if (sb.isEmpty()) "Belum ada log." else sb.toString()
        } catch (e: Exception) {
            tvLog.text = "Belum ada log."
        }
    }
}
`;
}

function qrisNotificationListener(pkg: string): string {
  return `package ${pkg}

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.regex.Pattern


class QrisNotificationListener : NotificationListenerService() {

    companion object {
        const val PREFS_NAME = "qris_listener_prefs"
        const val PREF_WEBHOOK_URL = "webhook_url"
        const val PREF_DEVICE_KEY = "device_key"
        const val PREF_REGEX = "regex"
        const val PREF_LOGS = "logs"
        const val DEFAULT_REGEX = "Rp\\s*([\\d.,]+)"

        // E-wallet packages to listen to
        val TARGET_PACKAGES = setOf(
            "com.gojek.gopay",
            "com.gojek.gopaymerchant",
            "com.dana",
            "com.ovo",
            "com.shopee.id",
            "com.tencent.ewallet",
            "id.co.bca.mybca",
            "com.bca",
            "com.bri.brimo",
            "com.bni",
            "com.bankmandiri.mandirionline",
            "com.jenius",
            "com.linkaja",
            "com.sakuku",
            "com.bankjatim.mobilebanking",
            "com.bsi.mobile",
            "com.bankbsi.indomaret",
            "id.co.cimbniaga.mobile",
            "com.bankbpdjatim",
        )

        fun processNotification(context: Context, text: String, sourceApp: String) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val webhookUrl = prefs.getString(PREF_WEBHOOK_URL, null)
            val deviceKey = prefs.getString(PREF_DEVICE_KEY, null)
            val regexStr = prefs.getString(PREF_REGEX, DEFAULT_REGEX)

            if (webhookUrl.isNullOrEmpty() || deviceKey.isNullOrEmpty()) {
                addLog(context, "0", "no_config")
                return
            }

            // Extract amount using regex
            val amount = extractAmount(text, regexStr)
            if (amount <= 0) {
                addLog(context, "0", "no_amount")
                return
            }

            // Send to webhook in background thread
            Thread {
                try {
                    val payload = JSONObject().apply {
                        put("device_key", deviceKey)
                        put("amount", amount)
                        put("source_app", sourceApp)
                        put("raw_text", text)
                        put("timestamp", System.currentTimeMillis())
                    }

                    val conn = (URL(webhookUrl).openConnection() as HttpURLConnection).apply {
                        requestMethod = "POST"
                        setRequestProperty("Content-Type", "application/json")
                        setRequestProperty("Accept", "application/json")
                        connectTimeout = 15000
                        readTimeout = 15000
                        doOutput = true
                    }

                    OutputStreamWriter(conn.outputStream, "UTF-8").use { it.write(payload.toString()) }

                    val responseCode = conn.responseCode
                    val response = if (responseCode == 200) {
                        conn.inputStream.bufferedReader().readText()
                    } else {
                        conn.errorStream?.bufferedReader()?.readText() ?: "HTTP $responseCode"
                    }
                    conn.disconnect()

                    val respJson = JSONObject(response)
                    val success = respJson.optBoolean("success", false)
                    val status = if (success) "success" else "failed: \${respJson.optString(\"error\", \"unknown\")}"

                    addLog(context, amount.toString(), status)

                    if (success) {
                        // Vibrate on success
                        val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as android.os.Vibrator
                        vibrator.vibrate(300)
                    }
                } catch (e: Exception) {
                    addLog(context, amount.toString(), "error: \${e.message}")
                }
            }.start()
        }

        private fun extractAmount(text: String, regexStr: String): Long {
            try {
                val pattern = Pattern.compile(regexStr)
                val matcher = pattern.matcher(text)
                if (matcher.find()) {
                    val rawAmount = matcher.group(1) ?: return 0
                    // Remove dots and commas (Indonesian number format)
                    val cleanAmount = rawAmount.replace(".", "").replace(",", "")
                    return cleanAmount.toLongOrNull() ?: 0
                }
            } catch (e: Exception) {
                // Regex error, try default
                val defaultPattern = Pattern.compile(DEFAULT_REGEX)
                val matcher = defaultPattern.matcher(text)
                if (matcher.find()) {
                    val rawAmount = matcher.group(1) ?: return 0
                    val cleanAmount = rawAmount.replace(".", "").replace(",", "")
                    return cleanAmount.toLongOrNull() ?: 0
                }
            }
            return 0
        }

        private fun addLog(context: Context, amount: String, status: String) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val time = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
            val logsJson = prefs.getString(PREF_LOGS, "[]")
            try {
                val arr = JSONArray(logsJson)
                val entry = JSONObject().apply {
                    put("time", time)
                    put("amount", amount)
                    put("status", status)
                }
                arr.put(0, entry) // Add to front
                // Keep only last 20
                val trimmed = JSONArray()
                val count = minOf(arr.length(), 20)
                for (i in 0 until count) {
                    trimmed.put(arr.getJSONObject(i))
                }
                prefs.edit().putString(PREF_LOGS, trimmed.toString()).apply()
            } catch (e: Exception) {
                // Reset logs on error
                prefs.edit().putString(PREF_LOGS, "[]").apply()
            }
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val packageName = sbn.packageName
        if (packageName !in TARGET_PACKAGES) return

        val notification = sbn.notification ?: return
        val extras = notification.extras ?: return

        val title = extras.getCharSequence("android.title")?.toString() ?: ""
        val text = extras.getCharSequence("android.text")?.toString() ?: ""
        val bigText = extras.getCharSequence("android.bigText")?.toString() ?: ""

        val fullText = "$title $text $bigText"

        // Only process if it looks like a payment notification
        val keywords = listOf("rp", "transfer", "pembayaran", "diterima", "qris", "masuk", "payment")
        val hasKeyword = keywords.any { fullText.lowercase().contains(it) }
        if (!hasKeyword) return

        processNotification(this, fullText, packageName)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        // No action needed
    }
}
`;
}

function qrisBootReceiver(pkg: string): string {
  return `package ${pkg}

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log


class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.i("QrisBootReceiver", "Boot completed — NotificationListenerService will auto-resume")
        }
    }
}
`;
}

const gradlewScript = () => `#!/bin/sh
set -e
APP_HOME="$(cd "$(dirname "$0")" && pwd -P)"
CLASSPATH="$APP_HOME/gradle/wrapper/gradle-wrapper.jar"
[ -n "$JAVA_HOME" ] && JAVACMD="$JAVA_HOME/bin/java" || JAVACMD="java"
exec "$JAVACMD" "-Dorg.gradle.appname=$(basename "$0")" -classpath "$CLASSPATH" org.gradle.wrapper.GradleWrapperMain "$@"
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
          `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">${appName}</string>\n    <string name="default_device_key">${company.qrisDeviceKey}</string>\n    <string name="default_webhook_url">${baseUrl}/api/payment/qris-notify</string>\n</resources>\n`);
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

export async function GET(req: NextRequest) {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          error: `Gradle exit code ${code}. Cek: /var/data/salfanet/apk/${role}/build.log`,
        }));
      }
    } catch { /* ignore */ }

    // Cleanup project dir
    try { spawn('rm', ['-rf', projectDir], { detached: true, stdio: 'ignore' }).unref(); } catch { /* ignore */ }
  });

  proc.unref();

  return NextResponse.json({ status: 'building', startedAt });
}
