package com.omran.device;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

/** شاشة الإعداد: رمز الربط، تفعيل الخدمة، الحال. */
public class MainActivity extends Activity {
    private final Handler ui = new Handler(Looper.getMainLooper());
    private TextView state;
    private EditText code;
    private Button pairBtn;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        int pad = dp(20);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(pad, pad * 2, pad, pad);
        col.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);

        TextView title = text("جهاز عمران", 24);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        col.addView(title);
        col.addView(text("يربط هذا الجوّال بوكيلك: يرى الشاشة ويضغط ويكتب حين تطلب منه في التطبيق.", 15));

        state = text("", 16);
        state.setPadding(0, pad, 0, pad);
        col.addView(state);

        col.addView(text("١. في تطبيق عمران قل للوكيل: «اربط جوّالي» واكتب الرمز هنا:", 15));
        code = new EditText(this);
        code.setHint("ABCD-EFGH");
        code.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        code.setGravity(Gravity.CENTER);
        code.setTextSize(22);
        col.addView(code);
        pairBtn = button("ربط", v -> pair());
        col.addView(pairBtn);

        col.addView(text("٢. فعّل الخدمة: إمكانيّة الوصول ← التطبيقات المثبّتة ← «جهاز عمران — تحكّم الوكيل».", 15));
        col.addView(button("فتح إعدادات إمكانيّة الوصول", v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))));
        if (Build.VERSION.SDK_INT >= 33) {
            col.addView(text("إن كان المفتاح رماديًّا: معلومات التطبيق ← ⋮ أعلى الشاشة ← «السماح بالإعدادات المقيَّدة»، ثمّ ارجع وفعّله.", 14));
            col.addView(button("معلومات التطبيق", v -> startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())))));
        }

        col.addView(text("للإيقاف: عطّل الخدمة من الإعدادات نفسها، أو ألغِ الربط:", 15));
        col.addView(button("إلغاء الربط", v -> { Bridge.forget(this); refresh(); }));

        ScrollView scroll = new ScrollView(this);
        scroll.addView(col);
        setContentView(scroll);
    }

    @Override
    protected void onResume() {
        super.onResume();
        DeviceService s = DeviceService.instance;
        if (s != null) s.resume();
        tick.run();
    }

    @Override
    protected void onPause() {
        super.onPause();
        ui.removeCallbacks(tick);
    }

    private final Runnable tick = new Runnable() {
        @Override public void run() { refresh(); ui.postDelayed(this, 1000); }
    };

    private void refresh() {
        boolean paired = Bridge.key(this) != null;
        boolean on = DeviceService.instance != null;
        String s = !paired ? "⚪ غير مربوط" : !on ? "🟡 مربوط — فعّل الخدمة من إمكانيّة الوصول" : "🟢 " + DeviceService.status;
        state.setText(s);
        code.setVisibility(paired ? View.GONE : View.VISIBLE);
        pairBtn.setVisibility(paired ? View.GONE : View.VISIBLE);
    }

    private void pair() {
        // «الرمز@الخادم» لخادم آخر غير الإنتاج (معاينة أو تجربة محلّيّة)
        final String raw = code.getText().toString().trim();
        final int at = raw.indexOf('@');
        final String c = at < 0 ? raw : raw.substring(0, at).trim();
        final String server = at < 0 ? Bridge.DEFAULT_SERVER : raw.substring(at + 1).trim();
        if (c.isEmpty()) return;
        pairBtn.setEnabled(false);
        state.setText("… أربط");
        final String name = (Build.MANUFACTURER + " " + Build.MODEL).trim();
        new Thread(() -> {
            String msg;
            try {
                Bridge.Reply r = Bridge.post(server,
                        new JSONObject().put("op", "claim").put("code", c).put("type", "android").put("name", name), 30000);
                String key = r.json.optString("key", "");
                if (r.status == 200 && !key.isEmpty()) {
                    Bridge.saveKey(this, server, key, name);
                    msg = null;
                } else {
                    msg = "✗ الربط فشل (" + r.json.optString("error") + ") — اطلب رمزًا جديدًا من الوكيل: يعيش ١٠ دقائق ولمرّة واحدة.";
                }
            } catch (Exception e) {
                msg = "✗ لا اتّصال: " + e.getMessage();
            }
            final String m = msg;
            ui.post(() -> {
                pairBtn.setEnabled(true);
                DeviceService s = DeviceService.instance;
                if (s != null) s.resume();
                refresh();
                if (m != null) state.setText(m);
            });
        }).start();
    }

    private TextView text(String s, int sp) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setPadding(0, dp(6), 0, dp(6));
        return t;
    }

    private Button button(String label, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setOnClickListener(l);
        return b;
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
}
