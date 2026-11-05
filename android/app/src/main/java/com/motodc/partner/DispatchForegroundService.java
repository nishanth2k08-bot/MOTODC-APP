package com.motodc.partner;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * High-reliability Foreground Service that keeps the Partner App process alive
 * and network radio open when the phone screen is off, locked, or app swiped from recents.
 * (Identical architecture used by Zomato, Swiggy, and Uber Driver apps).
 */
public class DispatchForegroundService extends Service {
    private static final String TAG = "MotoDC_DispatchService";
    private static final String PREFS_NAME = "motodc_partner_prefs";
    private static final String SERVICE_CHANNEL_ID = "motodc_duty_service_channel";
    private static final int SERVICE_NOTIFICATION_ID = 5001;
    private static final int POLL_INTERVAL_SECONDS = 5;

    private ScheduledExecutorService executorService;
    private boolean isRunning = false;

    public static void startService(Context context, String username, String riderId) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit()
                    .putString("rider_username", username)
                    .putString("rider_id", riderId)
                    .putBoolean("is_on_duty", true)
                    .apply();

            Intent intent = new Intent(context, DispatchForegroundService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
            Log.d(TAG, "DispatchForegroundService started for " + username);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start DispatchForegroundService: " + e.getMessage());
        }
    }

    public static void stopService(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putBoolean("is_on_duty", false).apply();

            Intent intent = new Intent(context, DispatchForegroundService.class);
            context.stopService(intent);
            Log.d(TAG, "DispatchForegroundService stopped");
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop DispatchForegroundService: " + e.getMessage());
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createServiceNotificationChannel();
        Notification notification = buildServiceNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(SERVICE_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(SERVICE_NOTIFICATION_ID, notification);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!isRunning) {
            isRunning = true;
            startPollingLoop();
        }
        return START_STICKY;
    }

    private void startPollingLoop() {
        if (executorService != null && !executorService.isShutdown()) {
            executorService.shutdownNow();
        }
        executorService = Executors.newSingleThreadScheduledExecutor();
        executorService.scheduleWithFixedDelay(() -> {
            try {
                pollForAssignedOrders();
            } catch (Exception e) {
                Log.w(TAG, "Poll iteration exception: " + e.getMessage());
            }
        }, 1, POLL_INTERVAL_SECONDS, TimeUnit.SECONDS);
    }

    private void pollForAssignedOrders() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String riderId = prefs.getString("rider_id", "");
        String username = prefs.getString("rider_username", "");
        String lookup = !riderId.isEmpty() ? riderId : username;

        if (lookup == null || lookup.trim().isEmpty()) {
            return;
        }

        try {
            String targetUrl = "https://motodc-official.vercel.app/api/delivery-partner?action=active-deliveries&riderId="
                    + java.net.URLEncoder.encode(lookup.trim(), "UTF-8");
            URL url = new URL(targetUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent", "MotoDC-Partner-ForegroundService/1.0.28");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);

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
                    Set<String> notified = prefs.getStringSet("notified_order_ids", new HashSet<>());
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
                        prefs.edit().putStringSet("notified_order_ids", updatedNotified).apply();
                        // Trigger high-priority heads-up notification with sound & vibration
                        OrderPollReceiver.showNotification(this, lastNewOrderId, lastCustomer, lastCity, stops.length());
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Service poll warning: " + e.getMessage());
        }
    }

    private Notification buildServiceNotification() {
        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(
                this,
                0,
                openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String name = prefs.getString("rider_username", "Partner");

        return new NotificationCompat.Builder(this, SERVICE_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_motodc)
                .setContentTitle("🟢 MotoDC Rider On Duty (" + name + ")")
                .setContentText("Active background dispatch monitoring • Ready for orders")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setContentIntent(pi)
                .build();
    }

    private void createServiceNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                NotificationChannel channel = nm.getNotificationChannel(SERVICE_CHANNEL_ID);
                if (channel == null) {
                    channel = new NotificationChannel(
                            SERVICE_CHANNEL_ID,
                            "MotoDC Active Duty Service",
                            NotificationManager.IMPORTANCE_LOW
                    );
                    channel.setDescription("Shows active shift status and enables background order polling");
                    channel.setShowBadge(false);
                    nm.createNotificationChannel(channel);
                }
            }
        }
    }

    @Override
    public void onDestroy() {
        isRunning = false;
        if (executorService != null) {
            executorService.shutdownNow();
            executorService = null;
        }
        stopForeground(true);
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
