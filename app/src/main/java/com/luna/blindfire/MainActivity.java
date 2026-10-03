package com.luna.blindfire;

import android.app.Activity;
import android.os.Bundle;
import android.os.Vibrator;
import android.content.Context;
import android.net.Uri;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.*;
import java.io.*;
import java.net.*;
import java.security.SecureRandom;
import java.util.*;
import org.json.*;

public class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net/assets/";
    private static final int PORT = 42316;
    private WebView game;
    private LanLink link;
    private volatile String roomCode;
    private boolean foreground;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        immersive();
        game = new WebView(this); game.setBackgroundColor(0xff101a19);
        WebSettings s = game.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false); s.setAllowContentAccess(false); s.setAllowUniversalAccessFromFileURLs(false);
        s.setAllowFileAccessFromFileURLs(false); s.setMediaPlaybackRequiresUserGesture(false);
        game.setWebChromeClient(new WebChromeClient());
        game.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith(ORIGIN)) {
                    String path = Uri.parse(url).getPath().substring("/assets/".length());
                    if (path.matches("[a-zA-Z0-9_./-]+") && !path.contains("..")) {
                        try {
                            String mime = path.endsWith(".js") ? "application/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".woff") ? "font/woff" : "text/html";
                            return new WebResourceResponse(mime, "UTF-8", getAssets().open(path));
                        } catch (IOException ignored) {}
                    }
                }
                return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return !url.equals(ORIGIN + "index.html"); }
        });
        link = new LanLink(new LanLink.Listener() {
            public void listening(int port) {
                JSONObject e = event("listening"); put(e,"code",roomCode); put(e,"ips",addresses()); emit(e);
            }
            public void connected(boolean host) { JSONObject e=event("connected");put(e,"role",host?"host":"guest");emit(e); }
            public void data(String data) { JSONObject e=event("data");put(e,"data",data);emit(e); }
            public void closed(String message) { JSONObject e=event("closed");put(e,"message",message);emit(e); }
        });
        game.addJavascriptInterface(new Bridge(), "Native");
        setContentView(game); game.loadUrl(ORIGIN + "index.html");
    }
    private void immersive() { getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN); }
    @Override public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus); if(focus)immersive(); }
    private JSONObject event(String type) { JSONObject e=new JSONObject();put(e,"type",type);return e; }
    private static void put(JSONObject e,String k,Object v) { try{e.put(k,v);}catch(JSONException ignored){} }
    private void emit(final JSONObject event) { runOnUiThread(new Runnable(){public void run(){if(game!=null)game.evaluateJavascript("window.onNativeNetwork && window.onNativeNetwork("+event.toString()+")",null);}}); }
    private JSONArray addresses() {
        JSONArray a=new JSONArray();
        try {
            Enumeration<NetworkInterface> all=NetworkInterface.getNetworkInterfaces();
            while(all!=null && all.hasMoreElements()) {
                NetworkInterface n=all.nextElement(); if(!n.isUp() || n.isLoopback())continue;
                Enumeration<InetAddress> ips=n.getInetAddresses();
                while(ips.hasMoreElements()){InetAddress ip=ips.nextElement();if(ip instanceof Inet4Address && !ip.isLoopbackAddress())a.put(ip.getHostAddress());}
            }
        }catch(SocketException ignored){}
        return a;
    }
    public final class Bridge {
        @JavascriptInterface public void host() { roomCode=String.format(Locale.US,"%06d",new SecureRandom().nextInt(1000000));link.host(PORT,roomCode); }
        @JavascriptInterface public void join(String address,String code) {
            if(address==null || !address.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}") || code==null || !code.matches("[0-9]{6}"))return;
            link.join(address,PORT,code);
        }
        @JavascriptInterface public void send(String data) { link.send(data); }
        @JavascriptInterface public void leave() { link.close(); }
        @JavascriptInterface public void vibrate(int ms) { Vibrator v=(Vibrator)getSystemService(Context.VIBRATOR_SERVICE);if(v!=null)v.vibrate(Math.min(100,Math.max(1,ms))); }
        @JavascriptInterface public void finishApp() { runOnUiThread(new Runnable(){public void run(){finish();}}); }
    }
    @Override public void onBackPressed() { if(game!=null)game.evaluateJavascript("window.onNativeBack && window.onNativeBack()",null); }
    @Override protected void onPause() {
        foreground=false;
        if(game!=null)game.evaluateJavascript("window.onNativePause && window.onNativePause()",new ValueCallback<String>(){public void onReceiveValue(String ignored){if(!foreground && game!=null){game.onPause();game.pauseTimers();}}});
        if(link!=null)link.close(); super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();foreground=true;
        if(game!=null){game.onResume();game.resumeTimers();game.evaluateJavascript("window.onNativeResume && window.onNativeResume()",null);}
    }
    @Override protected void onDestroy() {
        if(link!=null)link.close();
        if(game!=null){game.removeJavascriptInterface("Native");game.stopLoading();game.destroy();game=null;}
        super.onDestroy();
    }
}
