package com.motodc.partner;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import java.util.Calendar;
import java.util.TimeZone;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            // 1. Always re-arm exact shift alarms (8:15 AM, 8:55 AM, 1:15 PM, 1:55 PM, 8:30 PM)
            ShiftAlarmReceiver.scheduleAllShiftAlarms(context);

            // 2. Check rider session
            SharedPreferences prefs = context.getSharedPreferences("motodc_partner_prefs", Context.MODE_PRIVATE);
            String username = prefs.getString("rider_username", "");
            String riderId = prefs.getString("rider_id", "");
            boolean isLoggedIn = (!username.isEmpty() || !riderId.isEmpty());

            if (isLoggedIn) {
                // If the phone was rebooted after 8:30 PM (20:30 IST) or before 8:00 AM, sign out immediately
                Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Kolkata"));
                int currentMinutes = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE);
                if (currentMinutes >= 20 * 60 + 30 || currentMinutes < 8 * 60) {
                    final String activeRider = !riderId.isEmpty() ? riderId : username;
                    prefs.edit()
                            .remove("rider_id")
                            .remove("rider_username")
                            .remove("notified_order_ids")
                            .putBoolean("auto_logged_off", true)
                            .putLong("auto_logged_off_at", System.currentTimeMillis())
                            .apply();

                    ShiftAlarmReceiver.showShiftNotification(
                            context,
                            1005,
                            "🌙 Shift Concluded & Automated Signout",
                            "Your scheduled shift has ended. You have been automatically signed off. Shift attendance recorded at Karaikal Hub."
                    );

                    ShiftAlarmReceiver.notifyServerLogout(activeRider);
                } else {
                    // Shift hours are active; resume background order poller & foreground service
                    OrderPollReceiver.scheduleNextPoll(context);
                    DispatchForegroundService.startService(context, username, riderId);
                }
            }
        }
    }
}
