package com.motodc.partner;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MotoDCBridgePlugin.class);
        super.onCreate(savedInstanceState);

        // 1. Native notification permission request for Android 13+ (API 33+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }

        // 2. Request Battery Optimization Exemption (allows background network when screen off / locked)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                }
            } catch (Exception ignored) {}
        }

        // 3. Guarantee exact shift alarms are scheduled in Android AlarmManager
        ShiftAlarmReceiver.scheduleAllShiftAlarms(this);

        // 4. Resume background poller & foreground service if rider session exists
        SharedPreferences prefs = getSharedPreferences("motodc_partner_prefs", Context.MODE_PRIVATE);
        String username = prefs.getString("rider_username", "");
        String riderId = prefs.getString("rider_id", "");
        if (!username.isEmpty() || !riderId.isEmpty()) {
            OrderPollReceiver.scheduleNextPoll(this);
            DispatchForegroundService.startService(this, username, riderId);
        }
    }
}
