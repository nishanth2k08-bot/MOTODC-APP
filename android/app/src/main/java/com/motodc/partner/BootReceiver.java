package com.motodc.partner;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            SharedPreferences prefs = context.getSharedPreferences("motodc_partner_prefs", Context.MODE_PRIVATE);
            String username = prefs.getString("rider_username", "");
            String riderId = prefs.getString("rider_id", "");
            if (!username.isEmpty() || !riderId.isEmpty()) {
                OrderPollReceiver.scheduleNextPoll(context);
            }
        }
    }
}
