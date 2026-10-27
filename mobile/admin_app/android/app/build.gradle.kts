import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.salfanet.admin_app"
    compileSdk = flutter.compileSdkVersion
    // Pinned above flutter.ndkVersion: the Firebase and local-notification
    // plugins require this NDK (same as the customer app).
    ndkVersion = "27.0.12077973"

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
        // Required by flutter_local_notifications (java.time APIs on API < 26).
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_11.toString()
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "id.my.salfa.admin_app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // One fixed signing key for every release build. Android installs an
    // update (also the in-app one) only when its key matches the installed
    // app. android/key.properties points at the keystore and stays out of
    // git; without it the build falls back to this machine's debug key.
    val keyProps = Properties().apply {
        val f = rootProject.file("key.properties")
        if (f.exists()) f.inputStream().use { load(it) }
    }
    if (!keyProps.isEmpty) {
        signingConfigs {
            create("release") {
                storeFile = file(keyProps.getProperty("storeFile"))
                storePassword = keyProps.getProperty("storePassword")
                keyAlias = keyProps.getProperty("keyAlias")
                keyPassword = keyProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName(if (keyProps.isEmpty) "debug" else "release")
        }
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
    // Kasir QRIS listener (android/app/src/main/kotlin/.../qris)
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
}

flutter {
    source = "../.."
}

// No google-services plugin: Firebase is configured at runtime from the
// server the app connects to (GET /api/public/push-config), so one APK works
// with any installation. A baked-in google-services.json would start Firebase
// natively with a fixed project and clash with that.
