package com.motodc.partner;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Resume background poller if rider session exists
        SharedPreferences prefs = getSharedPreferences("motodc_partner_prefs", Context.MODE_PRIVATE);
        String username = prefs.getString("rider_username", "");
        String riderId = prefs.getString("rider_id", "");
        if (!username.isEmpty() || !riderId.isEmpty()) {
            OrderPollReceiver.scheduleNextPoll(this);
        }

        // Expose JavaScript Interface to Bridge WebView so frontend can sync login/logout state
        try {
            WebView webView = this.getBridge().getWebView();
            if (webView != null) {
                webView.addJavascriptInterface(new MotoDCAndroidBridge(this), "MotoDCAndroid");
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public static class MotoDCAndroidBridge {
        private final Context context;

        public MotoDCAndroidBridge(Context ctx) {
            this.context = ctx;
        }

        @JavascriptInterface
        public void setRiderSession(String username, String riderId) {
            OrderPollReceiver.startPolling(context, username, riderId);
        }

        @JavascriptInterface
        public void clearRiderSession() {
            OrderPollReceiver.stopPolling(context);
        }
    }
}
