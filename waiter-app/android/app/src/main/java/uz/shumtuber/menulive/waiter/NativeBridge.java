package uz.shumtuber.menulive.waiter;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.webkit.JavascriptInterface;

import androidx.core.app.NotificationCompat;

/**
 * Мост между веб-частью и телефоном. Веб-часть зовёт его как window.MenuLiveNative.
 * Всё, что тут есть, должно молча переживать отсутствие прав и железа:
 * на разных телефонах половина этого может быть недоступна.
 */
public class NativeBridge {

    private final Activity activity;

    NativeBridge(Activity activity) {
        this.activity = activity;
    }

    /** Новый заказ: вибрация, системный звук и уведомление в шторке. */
    @JavascriptInterface
    public void notifyNewOrder(String title, String text) {
        vibratePattern();
        playAlert();
        showNotification(title, text);
    }

    /** Короткая вибрация, например на подтверждение действия. */
    @JavascriptInterface
    public void tap() {
        try {
            Vibrator v = vibrator();
            if (v == null || !v.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createOneShot(30, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                v.vibrate(30);
            }
        } catch (Exception ignored) {
        }
    }

    /** Есть ли вообще оболочка: веб-часть проверяет наличие объекта и этого метода. */
    @JavascriptInterface
    public String platform() {
        return "android";
    }

    private void vibratePattern() {
        try {
            Vibrator v = vibrator();
            if (v == null || !v.hasVibrator()) return;
            long[] pattern = {0, 220, 140, 220, 140, 420};
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createWaveform(pattern, -1));
            } else {
                v.vibrate(pattern, -1);
            }
        } catch (Exception ignored) {
        }
    }

    private void playAlert() {
        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (uri == null) return;
            android.media.Ringtone r = RingtoneManager.getRingtone(activity, uri);
            if (r == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                r.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
            } else {
                r.setStreamType(AudioManager.STREAM_NOTIFICATION);
            }
            r.play();
        } catch (Exception ignored) {
        }
    }

    private void showNotification(String title, String text) {
        try {
            NotificationManager nm = (NotificationManager) activity.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            ShiftService.ensureChannels(activity);
            NotificationCompat.Builder b = new NotificationCompat.Builder(activity, ShiftService.CHANNEL_ORDERS)
                    .setSmallIcon(android.R.drawable.ic_dialog_email)
                    .setContentTitle(title == null || title.isEmpty() ? "Новый заказ" : title)
                    .setContentText(text == null ? "" : text)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setCategory(NotificationCompat.CATEGORY_EVENT)
                    .setAutoCancel(true);
            nm.notify((int) (System.currentTimeMillis() % 100000), b.build());
        } catch (Exception ignored) {
        }
    }

    private Vibrator vibrator() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) activity.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return vm == null ? null : vm.getDefaultVibrator();
        }
        return (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
    }
}
