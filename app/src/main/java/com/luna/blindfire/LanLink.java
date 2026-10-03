package com.luna.blindfire;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/** Two-peer, bounded line transport. Game rules and hidden information stay on the host. */
public final class LanLink {
    public interface Listener {
        void listening(int port);
        void connected(boolean host);
        void data(String data);
        void closed(String message);
    }
    private final Listener listener;
    private final AtomicInteger generation = new AtomicInteger();
    private volatile ServerSocket server;
    private volatile Socket peer;
    private volatile LinkedBlockingQueue<String> outbound;
    public LanLink(Listener listener) { this.listener = listener; }

    public synchronized void close() {
        generation.incrementAndGet();
        Socket oldPeer = peer; ServerSocket oldServer = server;
        peer = null; server = null; outbound = null;
        try { if (oldPeer != null) oldPeer.close(); } catch (IOException ignored) {}
        try { if (oldServer != null) oldServer.close(); } catch (IOException ignored) {}
    }
    public synchronized void host(final int port, final String code) {
        close(); final int run = generation.get();
        new Thread(new Runnable() { public void run() {
            ServerSocket localServer = null;
            try {
                localServer = new ServerSocket(); localServer.setReuseAddress(true);
                localServer.bind(new InetSocketAddress(port));
                synchronized (LanLink.this) {
                    if (run != generation.get()) { localServer.close(); return; }
                    server = localServer;
                }
                listener.listening(localServer.getLocalPort());
                while (run == generation.get()) {
                    Socket candidate = localServer.accept(); candidate.setSoTimeout(6000); candidate.setTcpNoDelay(true);
                    BufferedReader in = new BufferedReader(new InputStreamReader(candidate.getInputStream(), StandardCharsets.UTF_8));
                    BufferedWriter out = new BufferedWriter(new OutputStreamWriter(candidate.getOutputStream(), StandardCharsets.UTF_8));
                    String hello;
                    try { hello = boundedLine(in); } catch (IOException error) { candidate.close(); continue; }
                    if (!("BLINDFIRE6 " + code).equals(hello)) {
                        out.write("DENIED\n"); out.flush(); candidate.close(); continue;
                    }
                    if (run != generation.get()) { candidate.close(); return; }
                    out.write("BLINDFIRE6 OK\n"); out.flush();
                    localServer.close(); localServer = null; server = null;
                    serve(candidate, in, out, run, true); return;
                }
            } catch (IOException error) { fail(run, "房间已关闭或端口被占用，请重试。"); }
            finally { try { if (localServer != null) localServer.close(); } catch (IOException ignored) {} }
        }}, "blindfire-host").start();
    }
    public synchronized void join(final String address, final int port, final String code) {
        close(); final int run = generation.get();
        new Thread(new Runnable() { public void run() {
            Socket socket = new Socket();
            try {
                socket.connect(new InetSocketAddress(address, port), 6000); socket.setSoTimeout(6000); socket.setTcpNoDelay(true);
                if (run != generation.get()) { socket.close(); return; }
                BufferedReader in = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                BufferedWriter out = new BufferedWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8));
                out.write("BLINDFIRE6 " + code + "\n"); out.flush();
                if (!"BLINDFIRE6 OK".equals(boundedLine(in))) { socket.close(); fail(run, "房间码错误，或游戏版本不一致。"); return; }
                serve(socket, in, out, run, false);
            } catch (IOException error) { try { socket.close(); } catch (IOException ignored) {} fail(run, "连接已结束，请核对地址、房间码与同一网络。"); }
        }}, "blindfire-join").start();
    }
    private void serve(final Socket socket, BufferedReader in, final BufferedWriter out, final int run, boolean host) throws IOException {
        final LinkedBlockingQueue<String> queue = new LinkedBlockingQueue<String>(64);
        synchronized (this) { if (run != generation.get()) { socket.close(); return; } peer = socket; outbound = queue; }
        socket.setSoTimeout(12000);
        new Thread(new Runnable() { public void run() {
            try {
                while (run == generation.get()) {
                    String message = queue.poll(2, TimeUnit.SECONDS);
                    if (message == null) message = "!PING";
                    out.write(message); out.write('\n'); out.flush();
                }
            } catch (Exception error) { fail(run, "对方已断开连接。"); }
        }}, "blindfire-write").start();
        listener.connected(host);
        try {
            while (run == generation.get()) {
                String data = boundedLine(in);
                if (data == null) { fail(run, "对方已断开连接。"); return; }
                if (!"!PING".equals(data)) listener.data(data);
            }
        } finally { try { socket.close(); } catch (IOException ignored) {} }
    }
    private static String boundedLine(BufferedReader in) throws IOException {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < 65537; i++) {
            int c = in.read(); if (c == -1) return b.length() == 0 ? null : b.toString();
            if (c == '\n') return b.toString(); if (c != '\r') b.append((char)c);
        }
        throw new IOException("Message too long");
    }
    public void send(String data) {
        LinkedBlockingQueue<String> queue = outbound;
        if (queue == null || data == null || data.length() > 65536 || data.indexOf('\n') >= 0 || data.indexOf('\r') >= 0) return;
        if (!queue.offer(data)) fail(generation.get(), "连接拥堵，请重新建立房间。");
    }
    private synchronized void fail(int run, String message) {
        if (run != generation.get()) return;
        close(); listener.closed(message);
    }
}
