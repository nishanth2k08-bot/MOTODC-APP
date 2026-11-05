package com.motodc.partner;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
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
            DispatchForegroundService.startService(ctx, username, riderId);
            ShiftAlarmReceiver.scheduleAllShiftAlarms(ctx);
        }
        call.resolve();
    }

    @PluginMethod
    public void clearRiderSession(PluginCall call) {
        Context ctx = getContext();
        if (ctx != null) {
            OrderPollReceiver.stopPolling(ctx);
            DispatchForegroundService.stopService(ctx);
            ShiftAlarmReceiver.scheduleAllShiftAlarms(ctx);
        }
        call.resolve();
    }

    @PluginMethod
    public void initShiftAlarms(PluginCall call) {
        Context ctx = getContext();
        if (ctx != null) {
            ShiftAlarmReceiver.scheduleAllShiftAlarms(ctx);
        }
        call.resolve();
    }

    @PluginMethod
    public void triggerOrderNotification(PluginCall call) {
        String orderId = call.getString("orderId", "");
        String customer = call.getString("customer", "");
        String city = call.getString("city", "Karaikal");
        int count = call.getInt("count", 1);
        Context ctx = getContext();
        if (ctx != null) {
            OrderPollReceiver.showNotification(ctx, orderId, customer, city, count);
        }
        call.resolve();
    }

    @PluginMethod
    public void checkAutoLogoff(PluginCall call) {
        Context ctx = getContext();
        JSObject ret = new JSObject();
        if (ctx != null) {
            SharedPreferences prefs = ctx.getSharedPreferences("motodc_partner_prefs", Context.MODE_PRIVATE);
            boolean autoLoggedOff = prefs.getBoolean("auto_logged_off", false);
            long autoLoggedOffAt = prefs.getLong("auto_logged_off_at", 0);
            if (autoLoggedOff) {
                // Clear the flag after reading
                prefs.edit().remove("auto_logged_off").remove("auto_logged_off_at").apply();
            }
            ret.put("autoLoggedOff", autoLoggedOff);
            ret.put("autoLoggedOffAt", autoLoggedOffAt);
        } else {
            ret.put("autoLoggedOff", false);
            ret.put("autoLoggedOffAt", 0);
        }
        call.resolve(ret);
    }
}
