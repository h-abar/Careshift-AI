# Android release (item 12)

The Android shell is a Capacitor WebView pointed at the deployed web app —
`API_ORIGIN` in `capacitor.config.ts` sets `server.url` (HTTPS only).

## One-time setup

```powershell
npm run build
npx cap add android            # generates android/ — do NOT commit signing keys
# HTTPS-only: copy scripts/android/network_security_config.xml to
#   android/app/src/main/res/xml/  and add to AndroidManifest.xml:
#   <application android:networkSecurityConfig="@xml/network_security_config" ...>
# (scripts/android-release.ps1 does both automatically)
```

Generate the upload keystore **outside the repo**:

```powershell
keytool -genkey -v -keystore $env:USERPROFILE\keys\careshift.jks `
  -alias careshift -keyalg RSA -keysize 2048 -validity 10000
```

In `android/app/build.gradle`, add a release signingConfig that reads the
env-injected properties (one manual edit):

```gradle
signingConfigs {
    release {
        storeFile file(System.getenv("CS_KEYSTORE_PATH") ?: "unused")
        storePassword System.getenv("CS_KEYSTORE_PASSWORD")
        keyAlias System.getenv("CS_KEY_ALIAS")
        keyPassword System.getenv("CS_KEY_PASSWORD")
    }
}
buildTypes { release { signingConfig signingConfigs.release
                       minifyEnabled true   // R8/ProGuard
                       proguardFiles getDefaultProguardFile("proguard-android-optimize.txt") } }
```

## Release build

```powershell
$env:API_ORIGIN            = "https://careshift.example.com"
$env:CS_KEYSTORE_PATH      = "$env:USERPROFILE\keys\careshift.jks"
$env:CS_KEYSTORE_PASSWORD  = "<from secrets manager>"
$env:CS_KEY_ALIAS          = "careshift"
$env:CS_KEY_PASSWORD       = "<from secrets manager>"
./scripts/android-release.ps1 -Bump patch -Aab
```

The script syncs Capacitor, applies the HTTPS-only network security config,
bumps `versionCode`/`versionName`, injects signing properties and runs
`gradlew assembleRelease` (+ `bundleRelease` with `-Aab`). Passwords come
only from env vars — nothing is written to the repo.

## ProGuard/R8

`minifyEnabled` runs R8. Capacitor needs no extra rules for core; if a
plugin breaks under R8 add `-keep class com.getcapacitor.** { *; }` to
`app/proguard-rules.pro`.

## Build status on this machine

**Not run** — `ANDROID_SDK_ROOT`/`ANDROID_HOME` is unset and no Android SDK
or Gradle wrapper is installed (JDK 17 is present). `android/` is not
generated. On a machine with the SDK, `./scripts/android-release.ps1`
performs the full flow; a debug build would be
`npx cap add android && npx cap sync && cd android && ./gradlew.bat assembleDebug`.
