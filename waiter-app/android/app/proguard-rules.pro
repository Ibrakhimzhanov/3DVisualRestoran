# Мост в WebView вызывается из JavaScript по имени, обфускация его ломает.
-keepclassmembers class uz.shumtuber.menulive.waiter.NativeBridge {
    public *;
}
