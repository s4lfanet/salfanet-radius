plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "id.my.salfa.customer_app"
    compileSdk = flutter.compileSdkVersion
    // Pinned above flutter.ndkVersion — firebase_core/firebase_messaging/
    // flutter_local_notifications/flutter_secure_storage all require this NDK.
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
        applicationId = "id.my.salfa.customer_app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

flutter {
    source = "../.."
}

// Push notifications need a real Firebase project: drop android/app/google-services.json
// in from the Firebase console (package name id.my.salfa.customer_app) to enable it.
// Until then this plugin is skipped so the app still builds and runs — PushService
// catches the resulting Firebase.initializeApp() failure and no-ops, matching the
// backend's fcm-push.service.ts graceful no-op when unconfigured.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}
