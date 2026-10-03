package com.omran.device;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** الاتّصال بجسر الأجهزة في الخادم (op = claim · poll · result) وحفظ المفتاح محلّيًّا. */
final class Bridge {
    static final String DEFAULT_SERVER = "https://omran-ai-builder.vercel.app";
    private static final String PREFS = "omran_device";

    static final class Reply {
        final int status;
        final JSONObject json;
        Reply(int status, JSONObject json) { this.status = status; this.json = json; }
    }

    private Bridge() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String server(Context c) { return prefs(c).getString("server", DEFAULT_SERVER); }
    static String key(Context c) { return prefs(c).getString("key", null); }

    static void saveKey(Context c, String server, String key, String name) {
        prefs(c).edit().putString("server", server).putString("key", key).putString("name", name).apply();
    }

    static void forget(Context c) { prefs(c).edit().remove("key").apply(); }

    static Reply post(String server, JSONObject body, int timeoutMs) throws Exception {
        URL url = new URL(server.replaceAll("/+$", "") + "/api/system?action=device");
        HttpURLConnection h = (HttpURLConnection) url.openConnection();
        try {
            h.setRequestMethod("POST");
            h.setConnectTimeout(15000);
            h.setReadTimeout(timeoutMs);
            h.setDoOutput(true);
            h.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            byte[] out = body.toString().getBytes(StandardCharsets.UTF_8);
            h.setFixedLengthStreamingMode(out.length);
            try (OutputStream os = h.getOutputStream()) { os.write(out); }
            int status = h.getResponseCode();
            InputStream is = status >= 400 ? h.getErrorStream() : h.getInputStream();
            String text = "";
            if (is != null) {
                try (InputStream in = is) {
                    ByteArrayOutputStream buf = new ByteArrayOutputStream();
                    byte[] b = new byte[8192];
                    int n;
                    while ((n = in.read(b)) > 0) buf.write(b, 0, n);
                    text = buf.toString("UTF-8");
                }
            }
            JSONObject json;
            try {
                json = new JSONObject(text);
            } catch (Exception e) {
                json = new JSONObject().put("error", "HTTP " + status);
            }
            return new Reply(status, json);
        } finally {
            h.disconnect();
        }
    }
}
