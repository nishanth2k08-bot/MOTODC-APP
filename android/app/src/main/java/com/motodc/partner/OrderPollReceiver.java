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
import android.os.SystemClock;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashSet;
import java.util.Set;

/**
 * Operates at the Android OS kernel level via AlarmManager.
 * Wakes up periodically even if the Partner App is killed, swiped away from recent tasks,
 * or the device screen is locked, querying for newly assigned delivery stops.
 */
public class OrderPollReceiver extends BroadcastReceiver {
    private static final String TAG = "MotoDC_OrderPoll";
    private static final String PREFS_NAME = "motodc_partner_prefs";
    private static final String KEY_RIDER_ID = "rider_id";
    private static final String KEY_RIDER_USERNAME = "rider_username";
    private static final String KEY_NOTIFIED_ORDERS = "notified_order_ids";
    private static final String CHANNEL_ID = "motodc_dispatch_alerts_v4";
    private static final int POLL_INTERVAL_MS = 25000; // 25 seconds

    @Override
    public void onReceive(Context context, Intent intent) {
        checkOrdersInBackground(context);
    }

    public static void checkOrdersInBackground(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String riderId = prefs.getString(KEY_RIDER_ID, "");
        String username = prefs.getString(KEY_RIDER_USERNAME, "");

        String lookup = !riderId.isEmpty() ? riderId : username;
        if (lookup == null || lookup.trim().isEmpty()) {
            return;
        }

        // Run network query on background thread
        new Thread(() -> {
            try {
                String targetUrl = "https://motodc-official.vercel.app/api/delivery-partner?action=active-deliveries&riderId="
                        + java.net.URLEncoder.encode(lookup.trim(), "UTF-8");
                URL url = new URL(targetUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(9000);
                conn.setReadTimeout(9000);

                int responseCode = conn.getResponseCode();
                if (responseCode == 200) {
                    BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    StringBuilder content = new StringBuilder();
                    String inputLine;
                    while ((inputLine = in.readLine()) != null) {
                        content.append(inputLine);
                    }
                    in.close();

                    JSONObject json = new JSONObject(content.toString());
                    JSONArray stops = json.optJSONArray("stops");

                    if (stops != null && stops.length() > 0) {
                        Set<String> notified = prefs.getStringSet(KEY_NOTIFIED_ORDERS, new HashSet<>());
                        Set<String> updatedNotified = new HashSet<>(notified);
                        boolean foundNew = false;
                        String lastNewOrderId = "";
                        String lastCustomer = "";
                        String lastCity = "Karaikal";

                        for (int i = 0; i < stops.length(); i++) {
                            JSONObject stop = stops.getJSONObject(i);
                            String oId = stop.optString("orderId", stop.optString("id", ""));
                            if (!oId.isEmpty() && !notified.contains(oId)) {
                                foundNew = true;
                                lastNewOrderId = oId;
                                JSONObject cust = stop.optJSONObject("customer");
                                if (cust != null) lastCustomer = cust.optString("name", "");
                                JSONObject ship = stop.optJSONObject("shipping");
                                if (ship != null) lastCity = ship.optString("city", "Karaikal");
                                updatedNotified.add(oId);
                            }
                        }

                        if (foundNew) {
                            prefs.edit().putStringSet(KEY_NOTIFIED_ORDERS, updatedNotified).apply();
                            showNotification(context, lastNewOrderId, lastCustomer, lastCity, stops.length());
                        }
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Background poll warning: " + e.getMessage());
            } finally {
                // Re-arm alarm so polling continues while app is closed
                scheduleNextPoll(context);
            }
        }).start();
    }

    public static void showNotification(Context context, String orderId, String customer, String city, int totalCount) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        createNotificationChannel(context, nm);

        Intent openAppIntent = new Intent(context, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(
                context,
                (int) System.currentTimeMillis(),
                openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

        String title = "🚨 NEW ORDER ASSIGNED: #" + orderId;
        String body = (customer != null && !customer.isEmpty() ? "Customer: " + customer + " • " : "")
                + "Assigned to your route in " + city + ". Open app to start delivery.";

        int smallIcon = context.getApplicationInfo().icon != 0
                ? context.getApplicationInfo().icon
                : android.R.drawable.ic_dialog_info;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(smallIcon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body + "\nTotal active orders: " + totalCount))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setSound(soundUri)
                .setVibrate(new long[]{0, 700, 200, 700, 200, 900})
                .setContentIntent(pi);

        nm.notify((int) (System.currentTimeMillis() % 100000), builder.build());
    }

    private static void createNotificationChannel(Context context, NotificationManager nm) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = nm.getNotificationChannel(CHANNEL_ID);
            if (channel == null) {
                channel = new NotificationChannel(
                        CHANNEL_ID,
                        "MotoDC Urgent Dispatch Alerts",
                        NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("High-priority heads-up alerts when new orders are assigned to your route");
                channel.enableVibration(true);
                channel.setVibrationPattern(new long[]{0, 700, 200, 700, 200, 900});
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

    public static void scheduleNextPoll(Context context) {
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;

            Intent intent = new Intent(context, OrderPollReceiver.class);
            PendingIntent pi = PendingIntent.getBroadcast(
                    context,
                    9001,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );

            long triggerAt = SystemClock.elapsedRealtime() + POLL_INTERVAL_MS;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi);
            } else {
                am.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to schedule poll: " + e.getMessage());
        }
    }

    public static void startPolling(Context context, String username, String riderId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
                .putString(KEY_RIDER_USERNAME, username)
                .putString(KEY_RIDER_ID, riderId)
                .apply();

        checkOrdersInBackground(context);
        scheduleNextPoll(context);
    }

    public static void stopPolling(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().clear().apply();

            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;

            Intent intent = new Intent(context, OrderPollReceiver.class);
            PendingIntent pi = PendingIntent.getBroadcast(
                    context,
                    9001,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
            );
            am.cancel(pi);
        } catch (Exception ignored) {}
    }
}
