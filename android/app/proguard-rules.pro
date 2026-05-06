# HydroSync ProGuard Rules

# Keep line numbers for crash logs
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Capacitor - WebView bridge classes must not be renamed
-keep class com.getcapacitor.** { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.annotation.CapacitorPlugin <methods>;
}

# Firebase - keep all public API classes
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# MQTT (HiveMQ client uses reflection)
-keep class org.eclipse.paho.** { *; }
-dontwarn org.eclipse.paho.**

# Keep JavaScript interface for WebView
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
