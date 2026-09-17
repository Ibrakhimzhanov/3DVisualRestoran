package uz.shumtuber.menulive.waiter;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

/**
 * Оболочка приложения официанта. Весь интерфейс лежит в assets/www и работает без сети,
 * по сети идут только данные заказов через REST и SSE.
 */
public class MainActivity extends AppCompatActivity {

    // Содержимое waiter-app/www попадает в корень assets, а не в подпапку www.
    private static final String START_URL = "file:///android_asset/index.html";
    private static final int REQ_NOTIFICATIONS = 101;

    private WebView web;
    private NativeBridge bridge;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);

        // Экран не гаснет: официант держит телефон в руке всю смену.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        CookieManager.getInstance().setAcceptCookie(true);

        web.setBackgroundColor(0xFF0B1106);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);

        bridge = new NativeBridge(this);
        web.addJavascriptInterface(bridge, "MenuLiveNative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Внутри оболочки живёт только наша страница из assets.
                // Всё внешнее отдаём системному браузеру.
                String url = request.getUrl().toString();
                if (url.startsWith("file:///android_asset/")) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl()));
                } catch (Exception ignored) {
                    // нет браузера, просто ничего не делаем
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                // Логи веб-части видно в logcat по тегу MenuLiveWeb.
                android.util.Log.d("MenuLiveWeb", m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
                return true;
            }
        });

        // Аппаратная кнопка назад ходит по истории веб-части, а не закрывает приложение.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (web.canGoBack()) {
                    web.goBack();
                } else {
                    moveTaskToBack(true);
                }
            }
        });

        if (saved != null) {
            web.restoreState(saved);
        } else {
            web.loadUrl(START_URL);
        }

        askNotificationPermission();
        ShiftService.start(this);
    }

    private void askNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        boolean granted = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
        if (!granted) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        web.resumeTimers();
    }

    @Override
    protected void onPause() {
        // Таймеры НЕ останавливаем: пока идёт смена, соединение с сервером должно жить.
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        ShiftService.stop(this);
        web.destroy();
        super.onDestroy();
    }
}
