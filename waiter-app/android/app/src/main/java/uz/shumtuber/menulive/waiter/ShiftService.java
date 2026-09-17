package uz.shumtuber.menulive.waiter;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * Служба смены. Пока она живёт, система не выгружает процесс и WebView держит
 * соединение с сервером заказов. Ничего не качает сама: вся работа в веб-части.
 */
public class ShiftService extends android.app.Service {

    static final String CHANNEL_SHIFT = "menulive_shift";
    static final String CHANNEL_ORDERS = "menulive_orders";
    private static final int NOTIFICATION_ID = 7710;

    private PowerManager.WakeLock wakeLock;

    static void start(Context ctx) {
        try {
            ContextCompat.startForegroundService(ctx, new Intent(ctx, ShiftService.class));
        } catch (Exception ignored) {
        }
    }

    static void stop(Context ctx) {
        try {
            ctx.stopService(new Intent(ctx, ShiftService.class));
        } catch (Exception ignored) {
        }
    }

    /** Каналы уведомлений. Вызывается и из моста, поэтому статический и безопасный к повтору. */
    static void ensureChannels(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        NotificationChannel shift = new NotificationChannel(
                CHANNEL_SHIFT, "Смена", NotificationManager.IMPORTANCE_LOW);
        shift.setDescription("Приложение на связи с сервером заказов");
        shift.setShowBadge(false);
        nm.createNotificationChannel(shift);

        NotificationChannel orders = new NotificationChannel(
                CHANNEL_ORDERS, "Новые заказы", NotificationManager.IMPORTANCE_HIGH);
        orders.setDescription("Заказ со стола и вызовы гостей");
        orders.enableVibration(true);
        nm.createNotificationChannel(orders);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannels(this);

        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(
                this, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification n = new NotificationCompat.Builder(this, CHANNEL_SHIFT)
                .setSmallIcon(android.R.drawable.ic_menu_agenda)
                .setContentTitle("Смена идёт")
                .setContentText("Заказы со столов приходят сюда")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setContentIntent(pi)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }

        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "menulive:shift");
                wakeLock.setReferenceCounted(false);
                // Восемь часов это длина смены. Дальше система сама отпустит.
                wakeLock.acquire(8L * 60L * 60L * 1000L);
            }
        } catch (Exception ignored) {
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
