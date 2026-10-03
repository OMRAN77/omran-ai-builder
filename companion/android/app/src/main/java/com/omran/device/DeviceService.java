package com.omran.device;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Bitmap;
import android.graphics.Path;
import android.hardware.HardwareBuffer;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Base64;
import android.view.Display;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * خدمة إمكانيّة الوصول: تنبض للجسر، تسحب أمر الوكيل، تنفّذه (لقطة · ضغطة · سحب · كتابة · زرّ)،
 * وتعيد الناتج مع لقطة بعده. الإحداثيّات تصل بمقاس اللقطة المصغّرة وتُعاد هنا إلى بكسلات الشاشة.
 */
public class DeviceService extends AccessibilityService {
    private static final int MAX_SIDE = 1280;
    private static final int JPEG_Q = 60;
    private static final long ACTIVE_EVERY = 1000;
    private static final long IDLE_EVERY = 6000;
    private static final long ACTIVE_FOR = 90_000;
    private static final long PAUSE_AFTER = 30 * 60_000;

    static volatile DeviceService instance;
    static volatile String status = "متوقّف";

    private final Executor shotExec = Executors.newSingleThreadExecutor();
    private final Object lock = new Object();
    private volatile boolean running;
    private volatile boolean paused;
    private Thread worker;
    private int realW, realH, shotW, shotH;

    @Override
    protected void onServiceConnected() {
        instance = this;
        running = true;
        worker = new Thread(this::loop, "omran-device");
        worker.start();
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {}

    @Override
    public void onInterrupt() {}

    @Override
    public void onDestroy() {
        running = false;
        resume();
        if (worker != null) worker.interrupt();
        instance = null;
        status = "متوقّف";
        super.onDestroy();
    }

    /** من الشاشة الرئيسيّة: تفتح الخدمة بعد التوقّف التلقائيّ، أو بعد ربط جديد. */
    void resume() {
        synchronized (lock) {
            paused = false;
            lock.notifyAll();
        }
    }

    private void loop() {
        long lastAction = SystemClock.elapsedRealtime();
        long backoff = 1000;
        while (running) {
            String key = Bridge.key(this);
            String server = Bridge.server(this);
            long idle = SystemClock.elapsedRealtime() - lastAction;
            if (key == null || idle > PAUSE_AFTER) {
                status = key == null ? "غير مربوط — اكتب رمز الربط" : "متوقّف بعد ٣٠ دقيقة بلا أوامر — افتح التطبيق للمتابعة";
                synchronized (lock) {
                    paused = true;
                    while (paused && running) {
                        try { lock.wait(); } catch (InterruptedException e) { return; }
                    }
                }
                lastAction = SystemClock.elapsedRealtime();
                continue;
            }
            try {
                JSONObject body = new JSONObject().put("op", "poll").put("key", key);
                if (shotW > 0) body.put("w", shotW).put("h", shotH);
                Bridge.Reply r = Bridge.post(server, body, 30000);
                backoff = 1000;
                if (r.status == 403) {
                    Bridge.forget(this);
                    status = "الخادم لا يعرف هذا الجهاز — اربطه من جديد";
                    continue;
                }
                JSONObject act = r.status == 200 ? r.json.optJSONObject("action") : null;
                status = "متّصل — الوكيل يرى هذه الشاشة";
                if (act != null) {
                    lastAction = SystemClock.elapsedRealtime();
                    handle(server, key, act);
                    continue;
                }
                sleep(idle < ACTIVE_FOR ? ACTIVE_EVERY : IDLE_EVERY);
            } catch (InterruptedException e) {
                return;
            } catch (Exception e) {
                status = "شبكة متعثّرة — أعيد المحاولة";
                try { sleep(backoff); } catch (InterruptedException ie) { return; }
                backoff = Math.min(30000, backoff * 2);
            }
        }
    }

    private static void sleep(long ms) throws InterruptedException { Thread.sleep(ms); }

    private void handle(String server, String key, JSONObject act) throws Exception {
        String name = act.optString("name");
        JSONObject in = act.optJSONObject("input");
        if (in == null) in = new JSONObject();
        String out;
        try {
            out = run(name, in);
        } catch (Exception e) {
            out = "✗ " + e.getMessage();
        }
        sleep("screenshot".equals(name) ? 100 : 700);
        String image = "";
        try {
            image = capture();
        } catch (Exception e) {
            out += " (تعذّرت اللقطة: " + e.getMessage() + ")";
        }
        JSONObject res = new JSONObject().put("op", "result").put("key", key).put("id", act.optString("id"))
                .put("output", out).put("image", image).put("mime", "image/jpeg").put("w", shotW).put("h", shotH);
        Bridge.post(server, res, 60000);
    }

    private String run(String name, JSONObject in) throws Exception {
        switch (name) {
            case "screenshot":
                return "لقطة";
            case "tap": {
                float x = px(in.optDouble("x")), y = py(in.optDouble("y"));
                boolean dbl = in.optBoolean("double"), longPress = in.optBoolean("right");
                Path p = new Path();
                p.moveTo(x, y);
                GestureDescription.Builder g = new GestureDescription.Builder();
                g.addStroke(new GestureDescription.StrokeDescription(p, 0, longPress ? 700 : 60));
                if (dbl) g.addStroke(new GestureDescription.StrokeDescription(p, 160, 60));
                gesture(g.build());
                return (longPress ? "ضغطت مطوّلًا " : dbl ? "ضغطت مرّتين " : "ضغطت ") + in.optInt("x") + "،" + in.optInt("y");
            }
            case "swipe": {
                Path p = new Path();
                p.moveTo(px(in.optDouble("x1")), py(in.optDouble("y1")));
                p.lineTo(px(in.optDouble("x2")), py(in.optDouble("y2")));
                long ms = Math.max(100, Math.min(5000, in.optLong("ms", 400)));
                gesture(new GestureDescription.Builder().addStroke(new GestureDescription.StrokeDescription(p, 0, ms)).build());
                return "سحبت من " + in.optInt("x1") + "،" + in.optInt("y1") + " إلى " + in.optInt("x2") + "،" + in.optInt("y2");
            }
            case "type": {
                String text = in.optString("text");
                AccessibilityNodeInfo f = focused();
                CharSequence old = f.isShowingHintText() ? "" : f.getText();
                setText(f, (old == null ? "" : old.toString()) + text);
                return "كتبت " + text.length() + " حرفًا";
            }
            case "key":
                return key(in.optString("key").trim().toLowerCase());
            default:
                throw new IllegalArgumentException("أمر غير معروف: " + name);
        }
    }

    private String key(String k) throws Exception {
        int global;
        switch (k) {
            case "back": case "esc": case "escape": global = GLOBAL_ACTION_BACK; break;
            case "home": global = GLOBAL_ACTION_HOME; break;
            case "recents": case "alt+tab": global = GLOBAL_ACTION_RECENTS; break;
            case "notifications": global = GLOBAL_ACTION_NOTIFICATIONS; break;
            case "quick_settings": global = GLOBAL_ACTION_QUICK_SETTINGS; break;
            case "lock": global = GLOBAL_ACTION_LOCK_SCREEN; break;
            case "enter": {
                AccessibilityNodeInfo f = focused();
                if (!f.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId()))
                    throw new IllegalStateException("الحقل لا يقبل Enter");
                return "ضغطت enter";
            }
            case "backspace": {
                AccessibilityNodeInfo f = focused();
                CharSequence t = f.isShowingHintText() ? "" : f.getText();
                String s = t == null ? "" : t.toString();
                if (!s.isEmpty()) setText(f, s.substring(0, s.offsetByCodePoints(s.length(), -1)));
                return "مسحت حرفًا";
            }
            default:
                throw new IllegalArgumentException("زرّ غير معروف على أندرويد: " + k + " (المتاح: back · home · recents · notifications · quick_settings · lock · enter · backspace)");
        }
        if (!performGlobalAction(global)) throw new IllegalStateException("النظام رفض الزرّ " + k);
        return "ضغطت " + k;
    }

    private AccessibilityNodeInfo focused() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        AccessibilityNodeInfo f = root == null ? null : root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (f == null) throw new IllegalStateException("لا حقل كتابة محدَّد — اضغط الحقل أوّلًا");
        return f;
    }

    private static void setText(AccessibilityNodeInfo f, String text) {
        Bundle b = new Bundle();
        b.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
        if (!f.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, b))
            throw new IllegalStateException("الحقل رفض الكتابة");
    }

    private void gesture(GestureDescription g) throws Exception {
        final boolean[] ok = {false};
        CountDownLatch done = new CountDownLatch(1);
        boolean sent = dispatchGesture(g, new GestureResultCallback() {
            @Override public void onCompleted(GestureDescription d) { ok[0] = true; done.countDown(); }
            @Override public void onCancelled(GestureDescription d) { done.countDown(); }
        }, null);
        if (!sent || !done.await(8, TimeUnit.SECONDS) || !ok[0]) throw new IllegalStateException("النظام ألغى الإيماءة");
    }

    private float px(double x) {
        ensureSize();
        return (float) Math.max(0, Math.min(realW - 1, x * realW / shotW));
    }

    private float py(double y) {
        ensureSize();
        return (float) Math.max(0, Math.min(realH - 1, y * realH / shotH));
    }

    private void ensureSize() {
        if (shotW > 0) return;
        try {
            capture();
        } catch (Exception e) {
            throw new IllegalStateException("لا مقاس للشاشة بعد: " + e.getMessage());
        }
    }

    /** لقطة JPEG مصغّرة بـbase64، وتحديث المقاسين الحقيقيّ والمصغّر. */
    private String capture() throws Exception {
        Bitmap full = screenshot();
        realW = full.getWidth();
        realH = full.getHeight();
        float scale = Math.min(1f, (float) MAX_SIDE / Math.max(realW, realH));
        Bitmap small = scale < 1f ? Bitmap.createScaledBitmap(full, Math.round(realW * scale), Math.round(realH * scale), true) : full;
        shotW = small.getWidth();
        shotH = small.getHeight();
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        small.compress(Bitmap.CompressFormat.JPEG, JPEG_Q, buf);
        if (small != full) small.recycle();
        full.recycle();
        return Base64.encodeToString(buf.toByteArray(), Base64.NO_WRAP);
    }

    private Bitmap screenshot() throws Exception {
        for (int attempt = 0; attempt < 4; attempt++) {
            final Bitmap[] out = {null};
            final int[] err = {0};
            CountDownLatch done = new CountDownLatch(1);
            takeScreenshot(Display.DEFAULT_DISPLAY, shotExec, new TakeScreenshotCallback() {
                @Override public void onSuccess(ScreenshotResult r) {
                    HardwareBuffer hb = r.getHardwareBuffer();
                    Bitmap hw = Bitmap.wrapHardwareBuffer(hb, r.getColorSpace());
                    out[0] = hw == null ? null : hw.copy(Bitmap.Config.ARGB_8888, false);
                    if (hw != null) hw.recycle();
                    hb.close();
                    done.countDown();
                }
                @Override public void onFailure(int code) { err[0] = code; done.countDown(); }
            });
            if (!done.await(8, TimeUnit.SECONDS)) throw new IllegalStateException("اللقطة لم تكتمل");
            if (out[0] != null) return out[0];
            if (err[0] != ERROR_TAKE_SCREENSHOT_INTERVAL_TIME_SHORT) throw new IllegalStateException("النظام رفض اللقطة (" + err[0] + ")");
            sleep(400);
        }
        throw new IllegalStateException("اللقطات متقاربة جدًّا");
    }
}
