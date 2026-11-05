package com.motodc.partner;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import java.util.TimeZone;

/**
 * Operates at the Android OS kernel level via AlarmManager.RTC_WAKEUP.
 * Wakes up the CPU and triggers heads-up notifications with sound and vibration
 * at the exact scheduled clock times even when the phone is locked, screen is off,
 * or the Partner App has been killed or cleared from Recent Apps.
 */
public class ShiftAlarmReceiver extends BroadcastReceiver {
    private static final String TAG = "MotoDC_ShiftAlarm";
    private static final String PREFS_NAME = "motodc_partner_prefs";
    private static final String CHANNEL_ID = "motodc_shift_alerts_v4";

    public static final String ACTION_MORNING_CHECKIN = "com.motodc.partner.ACTION_MORNING_CHECKIN";
    public static final String ACTION_MORNING_GRACE = "com.motodc.partner.ACTION_MORNING_GRACE";
    public static final String ACTION_AFTERNOON_CHECKIN = "com.motodc.partner.ACTION_AFTERNOON_CHECKIN";
    public static final String ACTION_AFTERNOON_GRACE = "com.motodc.partner.ACTION_AFTERNOON_GRACE";
    public static final String ACTION_SHIFT_AUTOLOGOFF = "com.motodc.partner.ACTION_SHIFT_AUTOLOGOFF";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : "";
        if (action == null) return;

        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wakeLock = pm != null
                ? pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MotoDC:ShiftAlarmWakeLock")
                : null;
        if (wakeLock != null) {
            wakeLock.acquire(10000);
        }

        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String riderId = prefs.getString("rider_id", "");
            String username = prefs.getString("rider_username", "");
            boolean isLoggedIn = (!riderId.isEmpty() || !username.isEmpty());

            switch (action) {
                case ACTION_MORNING_CHECKIN:
                    // 8:15 AM IST: Shift check-in opens
                    if (!isLoggedIn) {
                        showShiftNotification(
                                context,
                                1001,
                                "⏰ Karaikal Hub Check-In Open (8:15 AM)",
                                "Morning attendance window is active (8:15 AM – 9:00 AM). Log in now to record on-time punctuality."
                        );
                    }
                    // Reschedule for next day
                    scheduleAlarm(context, ACTION_MORNING_CHECKIN, 101, 8, 15);
                    break;

                case ACTION_MORNING_GRACE:
                    // 8:55 AM IST: 5 minutes before 9:00 AM grace cutoff
                    if (!isLoggedIn) {
                        showShiftNotification(
                                context,
                                1002,
                                "🚨 FINAL CALL: Grace Ends in 5 Mins (9:00 AM)!",
                                "Check-in cutoff is 9:00 AM sharp! Log in immediately to avoid late strike & protect your ₹2,500 bonus."
                        );
                    }
                    // Reschedule for next day
                    scheduleAlarm(context, ACTION_MORNING_GRACE, 102, 8, 55);
                    break;

                case ACTION_AFTERNOON_CHECKIN:
                    // 1:15 PM (13:15) IST: Afternoon check-in opens
                    if (!isLoggedIn) {
                        showShiftNotification(
                                context,
                                1003,
                                "⏰ Afternoon Shift Check-In Open (1:15 PM)",
                                "Afternoon attendance window is active (1:15 PM – 2:00 PM). Log in now at Karaikal Hub."
                        );
                    }
                    scheduleAlarm(context, ACTION_AFTERNOON_CHECKIN, 103, 13, 15);
                    break;

                case ACTION_AFTERNOON_GRACE:
                    // 1:55 PM (13:55) IST: 5 mins before 2:00 PM cutoff
                    if (!isLoggedIn) {
                        showShiftNotification(
                                context,
                                1004,
                                "🚨 FINAL CALL: Afternoon Grace Ends in 5 Mins (2:00 PM)!",
                                "Afternoon check-in closes at 2:00 PM sharp. Log in now to avoid attendance strike."
                        );
                    }
                    scheduleAlarm(context, ACTION_AFTERNOON_GRACE, 104, 13, 55);
                    break;

                case ACTION_SHIFT_AUTOLOGOFF:
                    // 8:30 PM (20:30) IST: Scheduled shift end & automatic signout
                    if (isLoggedIn) {
                        final String activeRider = !riderId.isEmpty() ? riderId : username;
                        // 1. Immediately log off in SharedPreferences
                        prefs.edit()
                                .remove("rider_id")
                                .remove("rider_username")
                                .remove("notified_order_ids")
                                .putBoolean("auto_logged_off", true)
                                .putLong("auto_logged_off_at", System.currentTimeMillis())
                                .apply();

                        // 2. Stop order polling alarm and foreground service
                        OrderPollReceiver.stopPolling(context);
                        DispatchForegroundService.stopService(context);

                        // 3. Fire high-priority heads-up notification immediately
                        showShiftNotification(
                                context,
                                1005,
                                "🌙 Shift Concluded & Automated Signout (8:30 PM)",
                                "Your scheduled shift has ended. You have been automatically signed off. Shift attendance recorded at Karaikal Hub."
                        );

                        // 4. Notify backend server asynchronously
                        notifyServerLogout(activeRider);
                    }
                    // Reschedule for next day
                    scheduleAlarm(context, ACTION_SHIFT_AUTOLOGOFF, 105, 20, 30);
                    break;
            }
        } finally {
            if (wakeLock != null && wakeLock.isHeld()) {
                try { wakeLock.release(); } catch (Exception ignored) {}
            }
        }
    }

    public static void notifyServerLogout(String riderId) {
        new Thread(() -> {
            try {
                URL url = new URL("https://motodc-official.vercel.app/api/delivery-auth?action=logout");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                conn.setDoOutput(true);

                JSONObject payload = new JSONObject();
                payload.put("riderId", riderId);
                payload.put("source", "android_alarm_autologoff_830pm");

                OutputStream os = conn.getOutputStream();
                os.write(payload.toString().getBytes(StandardCharsets.UTF_8));
                os.flush();
                os.close();

                conn.getResponseCode();
            } catch (Exception e) {
                Log.w(TAG, "Backend sync notice: " + e.getMessage());
            }
        }).start();
    }

    public static void showShiftNotification(Context context, int notificationId, String title, String body) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        createNotificationChannel(context, nm);

        Intent openAppIntent = new Intent(context, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(
                context,
                notificationId,
                openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

        int smallIcon = R.drawable.ic_stat_motodc;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(smallIcon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setSound(soundUri)
                .setVibrate(new long[]{0, 600, 200, 600, 200, 800})
                .setContentIntent(pi);

        nm.notify(notificationId, builder.build());
    }

    private static void createNotificationChannel(Context context, NotificationManager nm) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = nm.getNotificationChannel(CHANNEL_ID);
            if (channel == null) {
                channel = new NotificationChannel(
                        CHANNEL_ID,
                        "MotoDC Shift Attendance Alerts",
                        NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Urgent exact-time reminders for shift check-in, grace windows, and automated signout");
                channel.enableVibration(true);
                channel.setVibrationPattern(new long[]{0, 600, 200, 600, 200, 800});
                channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);

                Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .build();
                channel.setSound(soundUri, audioAttributes);

                nm.createNotificationChannel(channel);
            }
        }
    }

    public static void scheduleAllShiftAlarms(Context context) {
        // 1. Morning Check-In (8:15 AM IST)
        scheduleAlarm(context, ACTION_MORNING_CHECKIN, 101, 8, 15);
        // 2. Morning Grace 5-min warning (8:55 AM IST)
        scheduleAlarm(context, ACTION_MORNING_GRACE, 102, 8, 55);
        // 3. Afternoon Check-In (1:15 PM / 13:15 IST)
        scheduleAlarm(context, ACTION_AFTERNOON_CHECKIN, 103, 13, 15);
        // 4. Afternoon Grace 5-min warning (1:55 PM / 13:55 IST)
        scheduleAlarm(context, ACTION_AFTERNOON_GRACE, 104, 13, 55);
        // 5. Scheduled Shift End & Auto Signout (8:30 PM / 20:30 IST)
        scheduleAlarm(context, ACTION_SHIFT_AUTOLOGOFF, 105, 20, 30);
    }

    public static void scheduleAlarm(Context context, String action, int requestCode, int hour, int minute) {
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;

            Intent intent = new Intent(context, ShiftAlarmReceiver.class);
            intent.setAction(action);

            PendingIntent pi = PendingIntent.getBroadcast(
                    context,
                    requestCode,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            long triggerAt = getNextTriggerTimeMillis(hour, minute);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            }
            Log.d(TAG, "Scheduled exact alarm for " + action + " at millis: " + triggerAt);
        } catch (Exception e) {
            Log.e(TAG, "Failed to schedule " + action + ": " + e.getMessage());
        }
    }

    public static long getNextTriggerTimeMillis(int hour, int minute) {
        TimeZone istZone = TimeZone.getTimeZone("Asia/Kolkata");
        Calendar cal = Calendar.getInstance(istZone);
        cal.set(Calendar.HOUR_OF_DAY, hour);
        cal.set(Calendar.MINUTE, minute);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);

        long now = System.currentTimeMillis();
        if (cal.getTimeInMillis() <= now) {
            cal.add(Calendar.DAY_OF_YEAR, 1);
        }
        return cal.getTimeInMillis();
    }
}
