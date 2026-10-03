package com.luna.blindfire;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** APK HTTPS transport. Browser preflight is not involved; TLS is verified normally. */
public final class RemoteHttp {
    public interface Listener { void response(String id, int status, String body, String error); }
    private final URI base;
    private final String userAgent;
    private final Listener listener;
    private final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
    private final ExecutorService workers = Executors.newFixedThreadPool(3);
    private final Map<String, HttpURLConnection> active = new ConcurrentHashMap<String, HttpURLConnection>();
    private final Set<String> pending = Collections.newSetFromMap(new ConcurrentHashMap<String, Boolean>());
    private volatile boolean closed;

    public RemoteHttp(String baseUrl, String userAgent, Listener listener) {
        this.base = URI.create(baseUrl); this.userAgent = userAgent; this.listener = listener;
        boolean local = "127.0.0.1".equals(base.getHost());
        if ((!"https".equals(base.getScheme()) && !local) || !base.getPath().endsWith("/api/rooms/") || base.getUserInfo()!=null || base.getQuery()!=null)
            throw new IllegalArgumentException("Invalid room service");
    }
    public void request(final String id, final String path, final String body, final int timeout) {
        if (closed || id==null || !id.matches("[a-zA-Z0-9_-]{1,80}") || !Arrays.asList("create","join","exchange","leave").contains(path) || body==null || body.length()>81920) return;
        if (!pending.add(id)) return;
        workers.execute(new Runnable(){ public void run(){
            int status=0; String response="",error=""; HttpURLConnection connection=null;
            try {
                if (!pending.contains(id)) return;
                URI uri=base.resolve(path); connection=(HttpURLConnection)uri.toURL().openConnection(); active.put(id,connection);
                int wait=Math.max(1000,Math.min(18000,timeout)); connection.setConnectTimeout(wait);connection.setReadTimeout(wait);
                connection.setInstanceFollowRedirects(false);connection.setUseCaches(false);connection.setRequestMethod("POST");connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type","text/plain; charset=utf-8");connection.setRequestProperty("Accept","application/json");connection.setRequestProperty("User-Agent",userAgent);
                for (Map.Entry<String,List<String>> h:cookies.get(uri,Collections.<String,List<String>>emptyMap()).entrySet())
                    if ("Cookie".equalsIgnoreCase(h.getKey())) connection.setRequestProperty("Cookie",join(h.getValue()));
                byte[] payload=body.getBytes(StandardCharsets.UTF_8);connection.setFixedLengthStreamingMode(payload.length);
                try(OutputStream out=connection.getOutputStream()){out.write(payload);}
                status=connection.getResponseCode();cookies.put(uri,connection.getHeaderFields());
                InputStream stream=status>=400?connection.getErrorStream():connection.getInputStream();
                if(stream!=null)try(InputStream in=stream;ByteArrayOutputStream out=new ByteArrayOutputStream()){
                    byte[] bytes=new byte[4096];int n;while((n=in.read(bytes))!=-1){if(out.size()+n>131072)throw new IOException("Response too large");out.write(bytes,0,n);}response=new String(out.toByteArray(),StandardCharsets.UTF_8);
                }
            }catch(SocketTimeoutException e){error="连接超时，请检查网络后重试";}
            catch(UnknownHostException e){error="无法解析联机服务地址，请检查网络";}
            catch(IOException e){error="无法连接联机服务，请检查网络后重试";}
            finally {active.remove(id);if(connection!=null)connection.disconnect();if(pending.remove(id)&&!closed)listener.response(id,status,response,error);}
        }});
    }
    private static String join(List<String> values){StringBuilder out=new StringBuilder();for(String s:values){if(out.length()>0)out.append("; ");out.append(s);}return out.toString();}
    public void cancel(String id){pending.remove(id);HttpURLConnection c=active.remove(id);if(c!=null)c.disconnect();}
    public void close(){closed=true;pending.clear();for(HttpURLConnection c:active.values())c.disconnect();active.clear();workers.shutdownNow();}
}
