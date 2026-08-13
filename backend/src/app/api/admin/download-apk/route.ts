import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { strToU8, zipSync } from 'fflate';
import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const ROLES = {
  admin: {
    label: 'Salfanet Admin',
    pkg: 'net.salfanet.admin',
    color: '#1e40af',
    pathSuffix: '/admin',
    icon: 'admin',
  },
  customer: {
    label: 'Salfanet Customer',
    pkg: 'net.salfanet.customer',
    color: '#0891b2',
    pathSuffix: '/customer',
    icon: 'customer',
  },
  technician: {
    label: 'Salfanet Teknisi',
    pkg: 'net.salfanet.technician',
    color: '#059669',
    pathSuffix: '/technician',
    icon: 'technician',
  },
  agent: {
    label: 'Salfanet Agent',
    pkg: 'net.salfanet.agent',
    color: '#7c3aed',
    pathSuffix: '/agent',
    icon: 'agent',
  },
} as const;

type RoleKey = keyof typeof ROLES;

function mainActivity(pkg: string, appLabel: string, startUrl: string, baseUrl: string): string {
  const escapedBaseUrl = baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `package ${pkg}

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null

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

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)

        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1)
        }

        with(webView.settings) {
            javaScriptEnabled    = true
            domStorageEnabled    = true
            databaseEnabled      = true
            loadWithOverviewMode = true
            useWideViewPort      = true
            allowFileAccess      = true
            allowContentAccess   = true
            setSupportZoom(false)
            builtInZoomControls  = false
            displayZoomControls  = false
            cacheMode            = WebSettings.LOAD_DEFAULT
            mixedContentMode     = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            userAgentString      = userAgentString + " SalfanetApp/2.0"
        }
        // Disable overscroll glow/bounce effect
        webView.overScrollMode = android.view.View.OVER_SCROLL_NEVER

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                val isInternal = url.startsWith("${baseUrl}") ||
                                 url.startsWith("http://localhost") ||
                                 url.startsWith("blob:")
                if (!isInternal) {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    return true
                }
                return false
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView?,
                callback: ValueCallback<Array<Uri>>?,
                params: FileChooserParams?
            ): Boolean {
                fileCallback = callback
                val intent = params?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply { type = "*/*" }
                fileChooser.launch(intent)
                return true
            }
        }

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl("${startUrl}")
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }
}
`;
}

function appBuildGradle(pkg: string, appName: string, color: string): string {
  const colorHex = color.replace('#', '');
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

    kotlinOptions {
        jvmTarget = '17'
    }
}

dependencies {
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'com.google.android.material:material:1.11.0'
}
`;
}

function rootBuildGradle(): string {
  return `plugins {
    id 'com.android.application' version '8.2.2' apply false
    id 'org.jetbrains.kotlin.android' version '1.9.22' apply false
}
`;
}

function settingsGradle(appName: string): string {
  const rootName = appName.replace(/\s+/g, '');
  return `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "${rootName}"
include ':app'
`;
}

function androidManifest(pkg: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
        android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />

    <application
        android:allowBackup="true"
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="false">

        <activity
            android:name=".MainActivity"
            android:exported="true"
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
}

function activityMainXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <WebView
        android:id="@+id/webView"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />

</FrameLayout>
`;
}

function stringsXml(appName: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${appName}</string>
</resources>
`;
}

function colorsXml(color: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">${color}</color>
    <color name="colorPrimaryDark">${color}</color>
    <color name="colorAccent">${color}</color>
    <color name="statusBar">${color}</color>
</resources>
`;
}

function themesXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
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
}

function githubWorkflow(roleName: string): string {
  return `name: Build ${roleName} APK

on:
  push:
    branches: [ main, master ]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup JDK 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Make gradlew executable
        run: chmod +x gradlew

      - name: Build APK
        run: ./gradlew assembleRelease --no-daemon

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: ${roleName.toLowerCase().replace(/\s+/g, '-')}-apk
          path: app/build/outputs/apk/release/*.apk
          retention-days: 30
`;
}

function gradleProperties(): string {
  return `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
`;
}

function gradleWrapperProperties(): string {
  return `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.4-bin.zip
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`;
}

function readmeTxt(appName: string, role: string, startUrl: string, pkg: string): string {
  return `# ${appName} — Android APK Project

## Informasi
- **Nama App:** ${appName}
- **Role:** ${role}
- **URL:** ${startUrl}
- **Package:** ${pkg}

## Cara Build

### Metode 1 — GitHub Actions (Gratis, Tanpa Install Android SDK)
1. Buat repository baru di https://github.com/new
2. Upload semua file ini ke repository tersebut
3. Buka tab **Actions** → pilih workflow **Build ${appName} APK** → klik **Run workflow**
4. Tunggu ~5 menit → download APK dari bagian **Artifacts**

### Metode 2 — Android Studio (Lokal)
1. Download dan install [Android Studio](https://developer.android.com/studio)
2. Buka folder project ini di Android Studio
3. Tunggu Gradle sync selesai
4. Menu **Build → Build Bundle(s)/APK(s) → Build APK(s)**
5. APK ada di \`app/build/outputs/apk/debug/\`

## Catatan
- APK ini adalah WebView wrapper yang membuka URL di atas
- Tidak ada backend yang dibutuhkan — semua data dari server Salfanet
- Untuk update URL: edit file \`app/src/main/java/${pkg.replace(/\./g, '/')}/MainActivity.kt\`
`;
}

// Minimal icon PNG (1×1 dark blue pixel) as placeholder
// Real icon should come from company logo
function minimalIconPng(): Uint8Array {
  // 1×1 PNG with dark blue color #03131d
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADklEQVQI12NgYGD4DwABBAEAwS2OUQAAAABJRU5ErkJggg==';
  return Buffer.from(base64, 'base64');
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const roleParam = searchParams.get('role') as RoleKey | null;

  if (!roleParam || !ROLES[roleParam]) {
    return NextResponse.json({ error: 'Invalid role. Use: admin, customer, technician, agent' }, { status: 400 });
  }

  const role = ROLES[roleParam];

  // Get app base URL and company name from DB
  let baseUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || 'https://your-vps-domain.com';
  baseUrl = baseUrl.replace(/\/$/, '');

  let appName: string = role.label;
  try {
    const company = await prisma.company.findFirst({ select: { name: true } });
    if (company?.name) {
      appName = `${company.name} ${roleParam.charAt(0).toUpperCase() + roleParam.slice(1)}`;
    }
  } catch { /* use default */ }

  const startUrl = `${baseUrl}${role.pathSuffix}`;
  const pkgPath = role.pkg.replace(/\./g, '/');
  const dirName = appName.replace(/\s+/g, '');

  // Build ZIP in memory using fflate
  const files: Record<string, Uint8Array> = {};

  const s = (str: string) => strToU8(str);

  // Root project files
  files['build.gradle'] = s(rootBuildGradle());
  files['settings.gradle'] = s(settingsGradle(appName));
  files['gradle.properties'] = s(gradleProperties());
  files['README.md'] = s(readmeTxt(appName, roleParam, startUrl, role.pkg));

  // GitHub Actions
  files['.github/workflows/build-apk.yml'] = s(githubWorkflow(appName));

  // Gradle wrapper
  files['gradle/wrapper/gradle-wrapper.properties'] = s(gradleWrapperProperties());
  try {
    const jarPath = join(process.cwd(), 'public', 'android-template', 'gradle-wrapper.jar');
    files['gradle/wrapper/gradle-wrapper.jar'] = readFileSync(jarPath);
  } catch { /* skip if not available; GitHub Actions can still build without it using setup-gradle action */ }

  // App module
  files['app/build.gradle'] = s(appBuildGradle(role.pkg, appName, role.color));
  files['app/proguard-rules.pro'] = s('# Add project specific ProGuard rules here.\n');

  // AndroidManifest
  files[`app/src/main/AndroidManifest.xml`] = s(androidManifest(role.pkg));

  // MainActivity.kt
  files[`app/src/main/java/${pkgPath}/MainActivity.kt`] = s(
    mainActivity(role.pkg, appName, startUrl, baseUrl)
  );

  // Layouts
  files['app/src/main/res/layout/activity_main.xml'] = s(activityMainXml());

  // Values
  files['app/src/main/res/values/strings.xml'] = s(stringsXml(appName));
  files['app/src/main/res/values/colors.xml'] = s(colorsXml(role.color));
  files['app/src/main/res/values/themes.xml'] = s(themesXml());

  // Placeholder icons (small PNG) for all densities
  // User should replace with real icons after extracting ZIP
  const iconPng = minimalIconPng();
  const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
  for (const density of densities) {
    files[`app/src/main/res/mipmap-${density}/ic_launcher.png`] = iconPng;
    files[`app/src/main/res/mipmap-${density}/ic_launcher_round.png`] = iconPng;
  }

  // gradlew (standard Android Gradle wrapper script for Linux/macOS)
  files['gradlew'] = s(`#!/bin/sh
# Copyright 2015 the original author or authors.
# Gradle wrapper script for Unix/Linux/macOS
APP_NAME="Gradle"
APP_BASE_NAME=\`basename "\$0"\`
DEFAULT_JVM_OPTS='-Dfile.encoding=UTF-8 "-Xmx64m" "-Xms64m"'
die() { echo; echo "ERROR: \$*"; echo; exit 1; }
warn() { echo "WARNING: \$*"; }
MAX_FD="maximum"
CDPATH=""
case "\`uname\`" in CYGWIN*) cygwin=true; darwin=false; nonstop=false;;
  Darwin*) cygwin=false; darwin=true; nonstop=false;;
  NONSTOP*) cygwin=false; darwin=false; nonstop=true;;
  *) cygwin=false; darwin=false; nonstop=false;;
esac
CLASSPATH=\$APP_HOME/gradle/wrapper/gradle-wrapper.jar
JAVA_OPTS=\$(cat <<-OPTS
\${DEFAULT_JVM_OPTS} \\
-classpath "\${CLASSPATH}" \\
org.gradle.wrapper.GradleWrapperMain \\
"\$@"
OPTS
)
exec "\$JAVACMD" \$JAVA_OPTS org.gradle.wrapper.GradleWrapperMain "\$@"
`);

  // gradlew.bat (Windows)
  files['gradlew.bat'] = s(`@rem Gradle startup script for Windows
@if "%DEBUG%"=="" @echo off
@rem Set local scope for the variables with windows NT shell
if "%OS%"=="Windows_NT" setlocal
set DIRNAME=%~dp0
if "%DIRNAME%"=="" set DIRNAME=.
set CLASSPATH=%DIRNAME%\\gradle\\wrapper\\gradle-wrapper.jar
set JAVA_EXE=java.exe
%JAVA_EXE% -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*
`);

  // gitignore
  files['.gitignore'] = s(`*.iml
.gradle
/local.properties
/.idea
.DS_Store
/build
/captures
.externalNativeBuild
.cxx
local.properties
`);

  const zipBuffer = zipSync(files, { level: 6 });

  const filename = `${dirName}-android.zip`;
  return new NextResponse(Buffer.from(zipBuffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
