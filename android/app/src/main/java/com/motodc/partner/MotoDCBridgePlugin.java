package com.motodc.partner;

import android.content.Context;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MotoDCBridge")
public class MotoDCBridgePlugin extends Plugin {

    @PluginMethod
    public void setRiderSession(PluginCall call) {
        String username = call.getString("username", "");
        String riderId = call.getString("riderId", "");
        Context ctx = getContext();
        if (ctx != null) {
            OrderPollReceiver.startPolling(ctx, username, riderId);
        }
        call.resolve();
    }

    @PluginMethod
    public void clearRiderSession(PluginCall call) {
        Context ctx = getContext();
        if (ctx != null) {
            OrderPollReceiver.stopPolling(ctx);
        }
        call.resolve();
    }
}
