package com.motodc.partner;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MotoDCBridgePlugin.class);
        super.onCreate(savedInstanceState);

        // Resume background poller if rider session exists
        SharedPreferences prefs = getSharedPreferences("motodc_partner_prefs", Context.MODE_PRIVATE);
        String username = prefs.getString("rider_username", "");
        String riderId = prefs.getString("rider_id", "");
        if (!username.isEmpty() || !riderId.isEmpty()) {
            OrderPollReceiver.scheduleNextPoll(this);
        }
    }
}
