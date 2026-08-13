# Contoh Integrasi Android Studio

Folder ini berisi contoh sederhana untuk memanggil API backend dari Android Studio dengan Retrofit.

## Dependency yang perlu ditambahkan ke build.gradle

```gradle
implementation "com.squareup.retrofit2:retrofit:2.9.0"
implementation "com.squareup.retrofit2:converter-gson:2.9.0"
implementation "com.squareup.okhttp3:logging-interceptor:4.12.0"
implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1"
```

## Base URL

- Production: https://billing.pmynet.id/api/
- Emulator Android Studio: http://10.0.2.2:5001/api/

## File contoh

- `ApiService.kt` — interface Retrofit
- `RetrofitClient.kt` — instance Retrofit + token interceptor

## Contoh pemakaian

```kotlin
val response = RetrofitClient.instance.portalLogin(
    PortalLoginRequest("08123456789", "123456")
)

if (response.isSuccessful) {
    val token = response.body()?.token
    val customer = response.body()?.customer
}
```
