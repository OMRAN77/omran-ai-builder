// v-talk-contacts-sync (غرفة الربع — مزامنة جهات الاتّصال، المسار B في العقد): نشاط شفّاف يفتحه
// الرابط omranai://contacts-sync?t=<تذكرة>&n=<nonce> بضغطة من الصفحة داخل Chrome TWA (حزمة Google Play، وهواتف هواوي التي
// فيها Chrome). أيّ موقع أو تطبيق يقدر يفتح هذا الرابط، فكلّ إطلاق يبدأ بإفصاح أصليّ (AlertDialog: العنوان والنصّ و«سماح / ليس
// الآن») قبل أيّ طلب صلاحيّة أو قراءة أو رفع؛ «ليس الآن» أو الرجوع = ‎#csd. بعد «سماح»: يطلب READ_CONTACTS إن لزم، ويُظهر بطاقة
// تقدّم لا تُلغى، يقرأ الأسماء والأرقام على الجهاز، يضغطها (gzip) ويشفّرها AES-256-GCM بمفتاح
// عشوائيّ جديد، يرفع النصّ المشفَّر وحده إلى الخادم (sync-put، يُحذف عند أوّل قراءة)، ثمّ يعيد فتح التطبيق على
// https://omran-ai-builder.vercel.app/room.html#cs=<t>.<n>.<المفتاح> — الجزء بعد # لا يصل الخادم أبدًا، فالخادم لا يقرأ
// القائمة، والأرقام لا تظهر في أيّ رابط. الصفحة تفكّ التشفير وتحوّل الأرقام إلى E.164 وتبعث بصماتها (SHA-256) فقط للمطابقة.
//
// قواعد ثابتة هنا: النطاق مكتوب في الكود ولا يُؤخذ من النيّة الواردة أبدًا؛ لا رقم ولا اسم في أيّ سجلّ (Log)؛ لا تخزين
// للقائمة على الجهاز (allowBackup=true في البيان)؛ الشبكة على خيط خلفيّ بمهلة محدّدة.
// الدوالّ الساكنة (القراءة وبناء JSON والصلاحيّة) يستعملها أيضًا جسر OmranContacts في MahaWebViewFallbackActivity (المسار A).
//
// غير مُتحقَّق حيًّا: لا Android SDK ولا جهاز في جلسة الكتابة — أوّل ترجمة حقيقيّة في android-release / play-release.
package com.omran.aibuilder.twa;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.ContactsContract;
import android.telephony.TelephonyManager;
import android.util.Base64;
import android.util.Log;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.zip.GZIPOutputStream;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

public class ContactsSyncActivity extends Activity {
    private static final String TAG = "ContactsSync";

    /** نطاق التطبيق — ثابت في الكود، لا من النيّة الواردة (أيّ موقع يقدر يفتح omranai://). */
    static final String APP_HOST = "omran-ai-builder.vercel.app";
    static final String SYNC_SCHEME = "omranai";
    static final String SYNC_HOST = "contacts-sync";
    static final int MAX_ENTRIES = 3000;
    static final int NAME_MAX = 40;
    // رقم أطول من هذا ليس رقم هاتف (E.164 أقصاه ١٥ رقمًا مع التنسيق)، فلا يُضخَّم الحمل به.
    static final int NUMBER_MAX = 40;
    // سقف الخادم لـsync-put: ‎^[A-Za-z0-9_-]{24,110000}$‎.
    static final int BLOB_MAX = 110000;
    private static final int RC_CONTACTS = 8431;
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 20000;
    private static final String STATE_ASKED = "contacts-asked";

    private static final Pattern TICKET = Pattern.compile("^[0-9a-f]{32}$");
    private static final Pattern NONCE = Pattern.compile("^[A-Za-z0-9_-]{8,64}$");
    private static final SecureRandom RNG = new SecureRandom();
    // التذكرة التي يجري رفعها الآن (خيط الواجهة وحده يقرأ ويكتب). نسخة ثانية من النشاط للتذكرة نفسها (إعادة إنشاء بعد تدوير
    // الشاشة أثناء الرفع، أو ضغطتان على الرابط) لا ترفع ثانيةً: sync-put الثاني يُرفض (التذكرة صارت s:1) فكان يفتح الغرفة بـ#cse
    // بعد #cs. تبقى ظاهرة حتّى ينتهي الرفع الأوّل فيغلقها معه — نافذة ظاهرة للتطبيق شرط أندرويد ١٠+ لفتح LauncherActivity.
    private static String sSyncingTicket;
    private static WeakReference<ContactsSyncActivity> sFollower;

    private String mTicket;
    private String mNonce;
    private boolean mAsked;
    private boolean mRunning;
    // بطاقة التقدّم ظاهرة: الرجوع لا يغلقها (إغلاقها يُسقط النتيجة والرفع جارٍ).
    private boolean mBusy;
    private AlertDialog mDisclosure;

    static boolean validTicket(String t) {
        return t != null && TICKET.matcher(t).matches();
    }

    static boolean validNonce(String n) {
        return n != null && NONCE.matcher(n).matches();
    }

    /** قبل أندرويد ٦ تُمنح الصلاحيّة عند التثبيت؛ بعده تُفحص وقت التشغيل. */
    static boolean hasContactsPermission(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return true;
        }
        return ctx.checkSelfPermission(Manifest.permission.READ_CONTACTS)
                == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * الإفصاح البارز الأصليّ (سياسة بيانات المستخدم في Play): العنوان والنصّ المترجمان من res/values-*، و«سماح / ليس الآن».
     * onAllow لزرّ «سماح» وحده؛ onLater لـ«ليس الآن» والرجوع واللمس خارج الحوار. يستعمله المساران: هذا النشاط (كلّ إطلاق)، وجسر
     * OmranContacts قبل طلب الصلاحيّة (إطار في الصفحة، كتطبيق مستخدم في p.html، قد يتخطّى إفصاح الصفحة).
     */
    static AlertDialog showDisclosure(Activity activity, final Runnable onAllow, final Runnable onLater) {
        AlertDialog dialog = new AlertDialog.Builder(activity, android.R.style.Theme_Material_Dialog_Alert)
                .setTitle(R.string.sync_title)
                .setMessage(R.string.sync_disclose)
                .setPositiveButton(R.string.sync_allow, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        onAllow.run();
                    }
                })
                .setNegativeButton(R.string.sync_later, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        onLater.run();
                    }
                })
                .setOnCancelListener(new DialogInterface.OnCancelListener() {
                    @Override
                    public void onCancel(DialogInterface d) {
                        onLater.run();
                    }
                })
                .create();
        dialog.show();
        return dialog;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Uri data = getIntent() == null ? null : getIntent().getData();
        String t = null;
        String n = null;
        if (data != null && SYNC_SCHEME.equalsIgnoreCase(data.getScheme())
                && SYNC_HOST.equalsIgnoreCase(data.getHost())) {
            try {
                t = data.getQueryParameter("t");
                n = data.getQueryParameter("n");
            } catch (UnsupportedOperationException e) {
                // رابط معتم (بلا //) لا معاملات فيه — يُعامل كرابط غير صالح أدناه.
                t = null;
                n = null;
            }
        }
        if (!validNonce(n)) {
            // بلا nonce صالح لا تقدر الصفحة تتحقّق من أيّ ردّ، فلا نفتح شيئًا.
            finish();
            return;
        }
        mNonce = n;
        if (!validTicket(t)) {
            openRoom("#cse=" + n);
            return;
        }
        mTicket = t;
        if (t.equals(sSyncingTicket)) {
            // الرفع الأوّل ما زال جاريًا: هو الذي يفتح الغرفة ثمّ يغلق هذه النسخة (أو يسلّمها النتيجة إن هُدم هو بالتدوير).
            ContactsSyncActivity prev = sFollower == null ? null : sFollower.get();
            if (alive(prev)) {
                // منتظرة أقدم (ضغطة ثالثة على الرابط نفسه): الرفع يغلق المنتظرة الأخيرة وحدها، فتلك كانت تبقى بطاقة تقدّم
                // عالقة تحت الغرفة والرجوع فيها مبتلع.
                prev.finish();
            }
            sFollower = new WeakReference<ContactsSyncActivity>(this);
            showProgress();
            return;
        }
        mAsked = savedInstanceState != null && savedInstanceState.getBoolean(STATE_ASKED, false);
        if (mAsked) {
            // إعادة إنشاء بعد «سماح» (تدوير مثلًا): حوار صلاحيّة أندرويد ما زال مفتوحًا وجوابه يصل هنا.
            return;
        }
        // لا شيء قبل الإفصاح: لا طلب صلاحيّة ولا قراءة ولا رفع، حتّى لو الصلاحيّة ممنوحة من قبل.
        mDisclosure = showDisclosure(this, new Runnable() {
            @Override
            public void run() {
                onDisclosureAllowed();
            }
        }, new Runnable() {
            @Override
            public void run() {
                openRoom("#csd=" + mNonce);
            }
        });
    }

    /** «سماح» في الإفصاح الأصليّ — المدخل الوحيد إلى طلب الصلاحيّة والقراءة والرفع. */
    private void onDisclosureAllowed() {
        mDisclosure = null;
        if (hasContactsPermission(this)) {
            startSync();
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !mAsked) {
            mAsked = true;
            requestPermissions(new String[]{Manifest.permission.READ_CONTACTS}, RC_CONTACTS);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putBoolean(STATE_ASKED, mAsked);
    }

    @Override
    protected void onDestroy() {
        // تدوير والإفصاح ظاهر: النسخة الجديدة تُظهره من جديد؛ dismiss لا يستدعي onCancel فلا يُرسل #csd.
        if (mDisclosure != null) {
            mDisclosure.dismiss();
            mDisclosure = null;
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (mBusy) {
            // الرفع جارٍ: إغلاق النشاط الآن يُسقط النتيجة، فبطاقة التقدّم لا تُلغى (أندرويد ١٢ وما قبله، أو بلا رجوع تنبّئيّ).
            return;
        }
        super.onBackPressed();
    }

    /**
     * بطاقة تقدّم ظاهرة لا تُلغى أثناء القراءة والرفع (كانت نافذة شفّافة فارغة تبتلع اللمس حتّى ٣٥ ثانية بلا أيّ إشارة).
     * أندرويد ١٣+: الرجوع يمرّ بـOnBackInvokedDispatcher (ومن targetSdk 36 لا يصل onBackPressed أصلًا).
     */
    private void showProgress() {
        mBusy = true;
        float dp = getResources().getDisplayMetrics().density;
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        int pad = (int) (20 * dp);
        card.setPadding(pad, pad, pad, pad);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xFF202124);
        bg.setCornerRadius(16 * dp);
        card.setBackground(bg);
        ProgressBar spinner = new ProgressBar(this);
        spinner.setIndeterminate(true);
        card.addView(spinner);
        TextView label = new TextView(this);
        label.setText(R.string.sync_progress);
        label.setTextColor(0xFFFFFFFF);
        label.setTextSize(16);
        label.setPaddingRelative((int) (16 * dp), 0, 0, 0);
        card.addView(label);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0x99000000);
        root.addView(card, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, new OnBackInvokedCallback() {
                        @Override
                        public void onBackInvoked() {
                            // يُبتلع الرجوع عمدًا: النشاط يُغلق نفسه حين ينتهي الرفع.
                        }
                    });
        }
    }

    /** النشاط ما زال حيًّا وظاهرًا للنظام: لا يُفتح التطبيق من نشاط مُنهى أو مهدوم (قيود فتح الأنشطة من الخلفيّة). */
    static boolean alive(Activity a) {
        return a != null && !a.isFinishing() && !a.isDestroyed();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != RC_CONTACTS || mNonce == null) {
            return;
        }
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startSync();
        } else {
            openRoom("#csd=" + mNonce);
        }
    }

    private void startSync() {
        if (mRunning) {
            return;
        }
        mRunning = true;
        showProgress();
        final Context app = getApplicationContext();
        final String ticket = mTicket;
        final String nonce = mNonce;
        sSyncingTicket = ticket;
        new Thread(new Runnable() {
            @Override
            public void run() {
                String fragment = "#cse=" + nonce;
                try {
                    String[] sealed = sealPayload(countryIso(app), readContacts(app));
                    if (postSyncPut(ticket, sealed[0])) {
                        fragment = "#cs=" + ticket + "." + nonce + "." + sealed[1];
                    }
                } catch (GeneralSecurityException | IOException | RuntimeException e) {
                    // نوع الخطأ وحده — لا رسالته (قد تقتبس بيانات) ولا أيّ رقم أو اسم.
                    Log.w(TAG, "contacts sync failed: " + e.getClass().getSimpleName());
                }
                final String done = fragment;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        ContactsSyncActivity follower = null;
                        if (ticket.equals(sSyncingTicket)) {
                            sSyncingTicket = null;
                            follower = sFollower == null ? null : sFollower.get();
                            sFollower = null;
                        }
                        if (alive(ContactsSyncActivity.this)) {
                            openRoom(done);
                            if (follower != null) {
                                follower.finish();
                            }
                        } else if (alive(follower)) {
                            // هذه النسخة هُدمت (تدوير أثناء الرفع) والنسخة الجديدة تنتظر: هي الحيّة فتفتح الغرفة.
                            follower.openRoom(done);
                        } else {
                            // لا نشاط حيّ: لا يُفتح التطبيق من نشاط ميّت، والنتيجة تُسقط (الخادم يحذف القائمة المشفّرة بعد ١٨٠ ث).
                            Log.w(TAG, "contacts sync result dropped: activity gone");
                        }
                    }
                });
            }
        }, "contacts-sync").start();
    }

    /**
     * يعيد فتح التطبيق على غرفة الربع: LauncherActivity صراحةً (لا نيّة ضمنيّة يلتقطها تطبيق آخر)، والرابط مبنيّ من
     * APP_HOST الثابت وحده — يصلح لاسمي الحزمة (com.omran.aibuilder.twa لهواوي وcom.omran.aibuilder لـPlay).
     */
    private void openRoom(String fragment) {
        Context app = getApplicationContext();
        Intent intent = new Intent(Intent.ACTION_VIEW,
                Uri.parse("https://" + APP_HOST + "/room.html" + fragment));
        intent.setClass(app, LauncherActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            app.startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Log.w(TAG, "launcher not found");
        }
        finish();
    }

    /** رمز الدولة (ae، sa…) لتحويل الأرقام المحلّيّة في الصفحة: الشريحة، ثمّ الشبكة، ثمّ لغة الجهاز. */
    static String countryIso(Context ctx) {
        String iso = null;
        try {
            TelephonyManager tm = (TelephonyManager) ctx.getSystemService(Context.TELEPHONY_SERVICE);
            if (tm != null) {
                iso = tm.getSimCountryIso();
                if (iso == null || iso.trim().isEmpty()) {
                    iso = tm.getNetworkCountryIso();
                }
            }
        } catch (RuntimeException e) {
            // أجهزة بلا هاتف (أجهزة لوحيّة) أو غلاف مصنّع يرمي هنا — نكمل بلغة الجهاز.
            iso = null;
        }
        if (iso == null || iso.trim().isEmpty()) {
            iso = Locale.getDefault().getCountry();
        }
        iso = iso == null ? "" : iso.trim().toLowerCase(Locale.ROOT);
        return iso.matches("[a-z]{2}") ? iso : "";
    }

    /**
     * [الاسم ≤ ٤٠ حرفًا، الرقم كما هو محفوظ في الهاتف] — بلا تكرار للرقم نفسه، وبحدّ MAX_ENTRIES.
     * تحويل الأرقام إلى E.164 في الصفحة وحدها (تنفيذ واحد مُختبَر). يرمي SecurityException بلا صلاحيّة.
     */
    static List<String[]> readContacts(Context ctx) {
        List<String[]> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        Cursor c = ctx.getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                new String[]{ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                        ContactsContract.CommonDataKinds.Phone.NUMBER},
                null, null,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC");
        if (c == null) {
            return out;
        }
        try {
            while (out.size() < MAX_ENTRIES && c.moveToNext()) {
                String number = c.getString(1);
                if (number == null || number.trim().isEmpty() || number.length() > NUMBER_MAX
                        || !seen.add(number)) {
                    continue;
                }
                out.add(new String[]{clipName(c.getString(0)), number});
            }
        } finally {
            c.close();
        }
        return out;
    }

    static String clipName(String name) {
        if (name == null) {
            return "";
        }
        String s = name.trim();
        if (s.length() <= NAME_MAX) {
            return s;
        }
        int end = NAME_MAX;
        if (Character.isHighSurrogate(s.charAt(end - 1))) {
            end--; // لا نقطع حرفًا (رمزًا تعبيريًّا) من نصفه
        }
        return s.substring(0, end);
    }

    /** {"v":1,"iso":"ae","list":[["الاسم","+971 50 123 4567"],…]} لأوّل count عنصرًا. */
    static String payloadJson(String iso, List<String[]> list, int count) {
        StringBuilder sb = new StringBuilder(64 + count * 48);
        sb.append("{\"v\":1,\"iso\":").append(jsonString(iso)).append(",\"list\":[");
        for (int i = 0; i < count; i++) {
            String[] e = list.get(i);
            if (i > 0) {
                sb.append(',');
            }
            sb.append('[').append(jsonString(e[0])).append(',').append(jsonString(e[1])).append(']');
        }
        return sb.append("]}").toString();
    }

    /**
     * نصّ JSON آمن داخل evaluateJavascript أيضًا: JSONObject.quote يهرّب " و\ ومحارف التحكّم والشرطة المائلة، ونضيف U+2028/U+2029
     * (فواصل أسطر في جافاسكربت ما قبل ES2019 — محرّكات WebView القديمة).
     */
    static String jsonString(String s) {
        return JSONObject.quote(s == null ? "" : s)
                .replace(String.valueOf((char) 0x2028), "\\u2028")
                .replace(String.valueOf((char) 0x2029), "\\u2029");
    }

    static byte[] gzip(byte[] plain) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream(plain.length / 3 + 64);
        GZIPOutputStream gz = new GZIPOutputStream(bos);
        try {
            gz.write(plain);
        } finally {
            gz.close();
        }
        return bos.toByteArray();
    }

    static String b64url(byte[] bytes) {
        return Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }

    /** base64url( IV(12) ‖ النصّ المشفَّر ‖ الوسم(16) ) — AES-256-GCM، وIV جديد لكلّ تشفير. */
    static String seal(byte[] key, byte[] plain) throws GeneralSecurityException {
        byte[] iv = new byte[12];
        RNG.nextBytes(iv);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
        byte[] ct = cipher.doFinal(plain);
        byte[] out = new byte[iv.length + ct.length];
        System.arraycopy(iv, 0, out, 0, iv.length);
        System.arraycopy(ct, 0, out, iv.length, ct.length);
        return b64url(out);
    }

    /**
     * {blob, base64url(K)}: gzip ثمّ تشفير بمفتاح عشوائيّ جديد K من ٣٢ بايتًا. إن تجاوز blob سقف الخادم تُحذف عناصر من
     * آخر القائمة ويُعاد التشفير حتّى يدخل (القائمة الفارغة تدخل دائمًا).
     */
    static String[] sealPayload(String iso, List<String[]> list) throws GeneralSecurityException, IOException {
        byte[] key = new byte[32];
        RNG.nextBytes(key);
        int count = list.size();
        while (true) {
            String blob = seal(key, gzip(payloadJson(iso, list, count).getBytes(StandardCharsets.UTF_8)));
            if (blob.length() <= BLOB_MAX || count == 0) {
                return new String[]{blob, b64url(key)};
            }
            int next = (int) ((long) count * BLOB_MAX / blob.length() * 9 / 10);
            count = Math.max(0, Math.min(count - 1, next));
        }
    }

    /** POST {"op":"sync-put","id":t,"blob":…} إلى https://APP_HOST/api/system?action=room — بلا جلسة، والتذكرة تكفي. */
    static boolean postSyncPut(String ticket, String blob) {
        HttpURLConnection con = null;
        try {
            byte[] body = ("{\"op\":\"sync-put\",\"id\":" + jsonString(ticket) + ",\"blob\":" + jsonString(blob) + "}")
                    .getBytes(StandardCharsets.UTF_8);
            con = (HttpURLConnection) new URL("https://" + APP_HOST + "/api/system?action=room").openConnection();
            con.setConnectTimeout(CONNECT_TIMEOUT_MS);
            con.setReadTimeout(READ_TIMEOUT_MS);
            con.setRequestMethod("POST");
            con.setDoOutput(true);
            con.setUseCaches(false);
            con.setInstanceFollowRedirects(false);
            con.setRequestProperty("Content-Type", "application/json");
            con.setFixedLengthStreamingMode(body.length);
            OutputStream os = con.getOutputStream();
            try {
                os.write(body);
            } finally {
                os.close();
            }
            int code = con.getResponseCode();
            InputStream in = code >= 400 ? con.getErrorStream() : con.getInputStream();
            if (in != null) {
                in.close();
            }
            return code == 200;
        } catch (IOException e) {
            Log.w(TAG, "sync-put failed: " + e.getClass().getSimpleName());
            return false;
        } finally {
            if (con != null) {
                con.disconnect();
            }
        }
    }
}
