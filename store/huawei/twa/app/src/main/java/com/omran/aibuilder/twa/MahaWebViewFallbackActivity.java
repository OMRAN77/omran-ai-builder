// v-maha-webview-mic (٢١ سبتمبر ٢٠٢٦): نسخة من
// com.google.androidbrowserhelper.trusted.WebViewFallbackActivity (٢٫٦٫٢) — تلك النسخة
// لا تُنفّذ WebChromeClient.onPermissionRequest إطلاقًا (تأكّدنا من المصدر مباشرة:
// GoogleChrome/android-browser-helper)، فيفشل getUserMedia(audio) داخلها دائمًا بغضّ النظر عن
// أي كود جافاسكربت — هذا سبب عطل مها («المايك مشغول ببرنامج ثاني») على كل جهاز بلا متصفّح
// يدعم TWA (fallbackType=webview في build.gradle، أغلب أجهزة هواوي). نسخة محليّة كاملة لازمة
// لأنّ الأصل بلا نقاط توسيع (كل الحقول/الدوال private) — الإضافة الوحيدة هنا onPermissionRequest
// + طلب صلاحية RECORD_AUDIO وقت التشغيل. LauncherActivity.getFallbackStrategy() يوجّه لهذا
// الكلاس بدل الأصل (نقطة توسيع رسميّة موثَّقة في مكتبة androidbrowserhelper نفسها).
//
// v-reply-export (٢٤ سبتمبر ٢٠٢٦): إضافة ثانية — الأصل لا يضبط DownloadListener، فكان كلّ تنزيل
// (أزرار «تحميل» في ورقة الملفّ/الصورة/PDF، الإطار الخفيّ، <a download>) يسقط صامتًا. روابط http(s)
// تذهب الآن لمنزّل النظام (attachDownloadListener أدناه).
//
// v-hw-file-chooser (رفض هواوي ٣٠ أكتوبر ٢٠٢٦، 1.3.14 بالقاعدة 3.1: «مساعد المستندات ← حلّل المستند ← لا يمكن
// تحميل ملف»): إضافة ثالثة — الأصل لا يُنفّذ onShowFileChooser، وWebView بلا تنفيذها يتجاهل كلّ <input type=file>
// صامتًا، فزرّ الرفع لا يفتح شيئًا في كلّ الأدوات (المستندات، الأزياء، الديكور، الصور، مرفقات المحادثة). صار يفتح
// منتقي النظام (ACTION_GET_CONTENT) بأنواع accept محوّلة إلى MIME، ويعيد الملفّات المختارة إلى الصفحة.
// ومعها (مراجعة WebView كاملة على مسارات المراجع): الموقع للقبلة والمواقيت (onGeolocationPermissionsShowPrompt
// + ACCESS_COARSE_LOCATION)، وحفظ تنزيلات blob:/data: في «التنزيلات» (كانت تسقط صامتة: صور الإعلانات، تقرير
// المقاولات وجدول الكمّيّات، الفيديو المجمَّع على الجهاز).
//
// غير مُتحقَّق حيًّا: لا بيئة بناء أندرويد ولا جهاز في جلسة التشخيص التي كتبت هذا الملفّ —
// يحتاج تجربة فعليّة بعد `Actions ← android-release` وتثبيت الـAPK. راجع
// knowledge/DECISIONS.md (v-maha-webview-mic) وstore/huawei/README.md قبل أي تعديل هنا.
package com.omran.aibuilder.twa;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.androidbrowserhelper.trusted.LauncherActivityMetadata;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class MahaWebViewFallbackActivity extends Activity {
    private static final String TAG = MahaWebViewFallbackActivity.class.getSimpleName();
    // نفس مفاتيح الإضافات (extras) حرفيًّا التي يستعملها
    // WebViewFallbackActivity.createLaunchIntent() الأصليّ — مطابقة نصّيّة لازمة لقراءة
    // الإضافات التي يبنيها ذلك الاستدعاء الثابت (راجع MahaFallbackStrategy في LauncherActivity).
    private static final String KEY_PREFIX =
            "com.google.browser.examples.twawebviewfallback.WebViewFallbackActivity.";
    private static final String KEY_LAUNCH_URI = KEY_PREFIX + "LAUNCH_URL";
    private static final String KEY_NAVIGATION_BAR_COLOR = KEY_PREFIX + "KEY_NAVIGATION_BAR_COLOR";
    private static final String KEY_STATUS_BAR_COLOR = KEY_PREFIX + "KEY_STATUS_BAR_COLOR";
    private static final String KEY_EXTRA_ORIGINS = KEY_PREFIX + "KEY_EXTRA_ORIGINS";

    private static final int RC_RECORD_AUDIO = 8421;
    private static final int RC_FILE_CHOOSER = 8422;
    private static final int RC_LOCATION = 8423;
    // v-hw-blob-save: سقف ملفّ واحد يُحفظ عبر الجسر (الفيديو المجمَّع على الجهاز أكبر ما يمرّ هنا).
    private static final long BLOB_MAX_BYTES = 300L * 1024 * 1024;

    private Uri mLaunchUrl;
    private int mStatusBarColor;
    private WebView mWebView;

    /* v-cpu-raster (فيديو المالك ٢٤ سبتمبر ١٧:٤٤، مكبَّرًا بدقّته الأصليّة): **الصفوف العليا من كلّ
     * نسيج في معالج الرسوم تتلف** — صور بطاقات الأدوات تظهر شريطًا علويًّا من خطوط أفقيّة
     * مبعثرة والباقي معتم مكعّب، وفي أطلس الحروف تختفي أكثر الحروف تكرارًا (م ا ن و ل) لأنّها
     * تُرسم أوّلًا فتقع في أعلى الأطلس: «صـع فيدي» بدل «صانع الفيديو»، «تص يم» بدل «تصميم».
     * نفس البطاقات في كلّ إطار، وفي الوضعين الداكن والفاتح، وبـ١١ م.ب صور ظاهرة فقط على جهاز
     * ٨ غ.ب — فليس ذاكرة ولا CSS ولا تغميقًا (التغميق ممنوع افتراضًا لـtargetSdk ≥ 33). هذا
     * عطل رفع أنسجة في تعريف معالج الرسوم، ولا تعالجه الصفحة. العلاج المعروف: أن يرسم WebView
     * بالمعالج المركزيّ (طبقة برمجيّة) فلا تمرّ الأنسجة بالتعريف المعطوب.
     * الفيديو المضمَّن يحتاج التسريع العتاديّ (توثيق WebView)، لذلك تعيد الصفحة معالج الرسوم
     * أثناء تشغيل أيّ <video> فقط عبر OmranRender.video(true/false) — التلفزيون وصانع الفيديو
     * يعملان كما كانا. هواوي وحدها: هذه حزمة متجر هواوي، والعطل على معالج رسوم كيرين. */
    private static final boolean CPU_RASTER = "HUAWEI".equalsIgnoreCase(Build.MANUFACTURER);
    private volatile boolean mVideoPlaying = false;

    private void applyRenderMode(WebView webView) {
        if (!CPU_RASTER || webView == null) return;
        try {
            webView.setLayerType(mVideoPlaying ? View.LAYER_TYPE_NONE : View.LAYER_TYPE_SOFTWARE, null);
        } catch (Throwable t) {
            Log.w(TAG, "setLayerType failed", t);
        }
    }

    /** جسر صغير للصفحة: يبدّل الرسم أثناء الفيديو، ويخبر «فحص النظام» بالوضع الحاليّ. */
    private final class RenderBridge {
        @JavascriptInterface
        public void video(final boolean playing) {
            runOnUiThread(() -> {
                if (mVideoPlaying == playing) return;
                mVideoPlaying = playing;
                applyRenderMode(mWebView);
            });
        }

        @JavascriptInterface
        public String mode() {
            if (!CPU_RASTER) return "gpu";
            return mVideoPlaying ? "gpu-video" : "cpu";
        }
    }

    private void attachRenderBridge(WebView webView) {
        webView.addJavascriptInterface(new RenderBridge(), "OmranRender");
        applyRenderMode(webView);
    }
    private List<Uri> mExtraOrigins = new ArrayList<>();
    private PermissionRequest mPendingMicRequest;
    // v-hw-file-chooser: نداء WebView المعلَّق حتّى يعود منتقي الملفّات (onActivityResult).
    private ValueCallback<Uri[]> mFileChooserCallback;
    // v-hw-geo: طلب الموقع المعلَّق حتّى يجيب المستخدم على صلاحيّة أندرويد.
    private String mGeoOrigin;
    private GeolocationPermissions.Callback mGeoCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        this.mLaunchUrl = this.getIntent().getParcelableExtra(KEY_LAUNCH_URI);
        if (!"https".equals(this.mLaunchUrl.getScheme())) {
            throw new IllegalArgumentException("launchUrl scheme must be 'https'");
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP &&
                Build.VERSION.SDK_INT <= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            if (getIntent().hasExtra(KEY_NAVIGATION_BAR_COLOR)) {
                int navigationBarColor = this.getIntent().getIntExtra(KEY_NAVIGATION_BAR_COLOR, 0);
                getWindow().setNavigationBarColor(navigationBarColor);
            }
        }

        if (getIntent().hasExtra(KEY_STATUS_BAR_COLOR)) {
            mStatusBarColor = this.getIntent().getIntExtra(KEY_STATUS_BAR_COLOR, 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP &&
                    Build.VERSION.SDK_INT <= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                getWindow().setStatusBarColor(mStatusBarColor);
            }
        } else {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP &&
                    Build.VERSION.SDK_INT <= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                mStatusBarColor = getWindow().getStatusBarColor();
            } else {
                mStatusBarColor = Color.WHITE;
            }
        }

        if (getIntent().hasExtra(KEY_EXTRA_ORIGINS)) {
            List<String> extraOrigins = getIntent().getStringArrayListExtra(KEY_EXTRA_ORIGINS);
            if (extraOrigins != null) {
                for (String extraOrigin : extraOrigins) {
                    Uri extraOriginUri = Uri.parse(extraOrigin);
                    if (!"https".equalsIgnoreCase(extraOriginUri.getScheme())) {
                        Log.w(TAG, "Only 'https' origins are accepted. Ignoring extra origin: "
                                + extraOrigin);
                        continue;
                    }
                    mExtraOrigins.add(extraOriginUri);
                }
            }
        }

        mWebView = new WebView(this);
        mWebView.setWebViewClient(createWebViewClient());
        mWebView.setWebChromeClient(createWebViewChromeClient());
        attachDownloadListener(mWebView);
        paintOpaque(mWebView);
        attachRenderBridge(mWebView);

        WebSettings webSettings = mWebView.getSettings();
        setupWebSettings(webSettings);

        ViewGroup.LayoutParams layoutParams = new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);

        setContentView(mWebView, layoutParams);
        if (savedInstanceState != null) {
            mWebView.restoreState(savedInstanceState);
            return;
        }

        Map<String, String> headers = new HashMap<>();
        headers.put("Referer", "android-app://" + getPackageName() + "/");
        mWebView.loadUrl(mLaunchUrl.toString(), headers);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if ((keyCode == KeyEvent.KEYCODE_BACK) && mWebView.canGoBack()) {
            mWebView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (mWebView != null) {
            mWebView.onPause();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (mWebView != null) {
            mWebView.onResume();
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        if (mWebView != null) {
            mWebView.saveState(outState);
        }
    }

    @Override
    public void onConfigurationChanged(@NonNull Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
    }

    // طلب صلاحية المايك وقت التشغيل يعود هنا؛ النتيجة تُطبَّق على طلب WebView المعلَّق
    // (mPendingMicRequest) الذي حفظناه في onPermissionRequest أدناه.
    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                            @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        // v-hw-geo: جواب صلاحيّة الموقع يُطبَّق على طلب الصفحة المعلَّق (القبلة والمواقيت).
        if (requestCode == RC_LOCATION) {
            GeolocationPermissions.Callback geo = mGeoCallback;
            String origin = mGeoOrigin;
            mGeoCallback = null;
            mGeoOrigin = null;
            if (geo != null) {
                geo.invoke(origin, grantResults.length > 0
                        && grantResults[0] == PackageManager.PERMISSION_GRANTED, false);
            }
            return;
        }
        if (requestCode != RC_RECORD_AUDIO || mPendingMicRequest == null) {
            return;
        }
        PermissionRequest request = mPendingMicRequest;
        mPendingMicRequest = null;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            request.deny();
        }
    }

    // v-hw-file-chooser: منتقي الملفّات يعود هنا. النداء يُستدعى دائمًا (null عند الإلغاء) — بلا ذلك
    // يرفض WebView كلّ منتقٍ بعده في الصفحة نفسها.
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != RC_FILE_CHOOSER) {
            return;
        }
        ValueCallback<Uri[]> callback = mFileChooserCallback;
        mFileChooserCallback = null;
        if (callback != null) {
            callback.onReceiveValue(pickedUris(resultCode, data));
        }
    }

    /** الملفّ في getData()، وبعض المنتقيات تعيده في ClipData حتّى للاختيار الواحد. */
    static Uri[] pickedUris(int resultCode, Intent data) {
        if (resultCode != Activity.RESULT_OK || data == null) {
            return null;
        }
        ClipData clip = data.getClipData();
        if (clip != null && clip.getItemCount() > 0) {
            List<Uri> uris = new ArrayList<>();
            for (int i = 0; i < clip.getItemCount(); i++) {
                Uri uri = clip.getItemAt(i).getUri();
                if (uri != null) {
                    uris.add(uri);
                }
            }
            if (!uris.isEmpty()) {
                return uris.toArray(new Uri[0]);
            }
        }
        Uri single = data.getData();
        return single == null ? null : new Uri[]{single};
    }

    /**
     * v-hw-file-chooser: نيّة منتقي النظام من accept الحقل. ‎.pdf وأمثالها امتدادات لا أنواع MIME —
     * تمريرها كما هي لا يطابق أيّ تطبيق فيفتح منتقيًا فارغًا، فتُحوَّل عبر MimeTypeMap. امتداد لا يُعرف
     * نوعه يلغي التصفية كلّها (كلّ الملفّات) بدل أن يخفي ملفًّا صالحًا عن المستخدم.
     * ملفّ واحد في كلّ اختيار حتّى لحقل multiple: معرض هواوي بالاختيار المتعدّد (عدّاد 0/50) يعيد
     * «تمّ» بلا ملفّات (فيديو المالك ٢٠ سبتمبر، v-attach-huawei في الصفحة) — والصفحة تجمع ملفًّا بعد ملفّ.
     */
    static Intent buildFileChooserIntent(WebChromeClient.FileChooserParams params) {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        List<String> mimes = acceptToMimeTypes(params == null ? null : params.getAcceptTypes());
        if (mimes.size() == 1) {
            intent.setType(mimes.get(0));
        } else {
            intent.setType("*/*");
            if (!mimes.isEmpty()) {
                intent.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0]));
            }
        }
        return intent;
    }

    static List<String> acceptToMimeTypes(String[] acceptTypes) {
        List<String> mimes = new ArrayList<>();
        if (acceptTypes == null) {
            return mimes;
        }
        for (String accept : acceptTypes) {
            if (accept == null) {
                continue;
            }
            for (String part : accept.split(",")) {
                String type = part.trim().toLowerCase(Locale.ROOT);
                if (type.isEmpty()) {
                    continue;
                }
                String mime = null;
                if (type.contains("/")) {
                    mime = type;
                } else if (type.startsWith(".")) {
                    mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(type.substring(1));
                }
                if (mime == null) {
                    mimes.clear();
                    return mimes;
                }
                if (!mimes.contains(mime)) {
                    mimes.add(mime);
                }
            }
        }
        return mimes;
    }

    private WebViewClient createWebViewClient() {
        return new WebViewClient() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                ViewGroup vg = (ViewGroup) view.getParent();
                vg.removeView(view);
                view.destroy();

                mWebView = new WebView(view.getContext());
                mWebView.setWebViewClient(this);
                // v-hw-file-chooser: الأصل لا يعيد WebChromeClient بعد انهيار المُرسِم، فكان WebView
                // الجديد بلا منتقي ملفّات ولا مايك حتّى يُغلق التطبيق.
                mWebView.setWebChromeClient(createWebViewChromeClient());
                attachDownloadListener(mWebView);
                paintOpaque(mWebView);
                attachRenderBridge(mWebView);
                WebSettings webSettings = mWebView.getSettings();
                setupWebSettings(webSettings);
                vg.addView(mWebView);

                Toast.makeText(view.getContext(), "Recovering from crash",
                        Toast.LENGTH_LONG).show();
                mWebView.loadUrl(mLaunchUrl.toString());
                return true;
            }

            private boolean shouldOverrideUrlLoading(Uri navigationUrl) {
                Uri launchUrl = MahaWebViewFallbackActivity.this.mLaunchUrl;
                if (!"data".equals(navigationUrl.getScheme()) &&
                        !uriOriginsMatch(navigationUrl, launchUrl) &&
                        !matchExtraOrigins(navigationUrl)) {
                    try {
                        CustomTabsIntent intent = new CustomTabsIntent.Builder()
                                .setToolbarColor(mStatusBarColor)
                                .build();
                        intent.launchUrl(MahaWebViewFallbackActivity.this, navigationUrl);
                        return true;
                    } catch (ActivityNotFoundException ex) {
                        Log.e(TAG, String.format(
                                "ActivityNotFoundException while launching '%s'", navigationUrl));
                        return false;
                    }
                }
                return false;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return this.shouldOverrideUrlLoading(Uri.parse(url));
            }

            @RequiresApi(api = Build.VERSION_CODES.LOLLIPOP)
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return this.shouldOverrideUrlLoading(request.getUrl());
            }

            private boolean matchExtraOrigins(Uri navigationUri) {
                for (Uri uri : mExtraOrigins) {
                    if (uriOriginsMatch(uri, navigationUri)) {
                        return true;
                    }
                }
                return false;
            }

            private boolean uriOriginsMatch(Uri uriA, Uri uriB) {
                return uriA.getScheme().equalsIgnoreCase(uriB.getScheme()) &&
                        uriA.getHost().equalsIgnoreCase(uriB.getHost()) &&
                        uriA.getPort() == uriB.getPort();
            }
        };
    }

    private WebChromeClient createWebViewChromeClient() {
        return new WebChromeClient() {
            private View fullScreenView;
            private int originalOrientation;

            @Override
            public void onShowCustomView(View paramView, CustomViewCallback paramCustomViewCallback) {
                if (this.fullScreenView != null) {
                    onHideCustomView();
                }
                this.fullScreenView = paramView;
                this.originalOrientation = getRequestedOrientation();

                getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
                getWindow().addContentView(this.fullScreenView,
                        new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER));
            }

            @Override
            public void onHideCustomView() {
                if (fullScreenView == null) {
                    return;
                }
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
                ((ViewGroup) fullScreenView.getParent()).removeView(fullScreenView);
                this.fullScreenView = null;
                setRequestedOrientation(this.originalOrientation);
            }

            // v-maha-webview-mic: الإضافة الوحيدة عن الأصل — الأصل لا يُنفّذ هذي الدالّة
            // إطلاقًا فيرفض أندرويد getUserMedia(audio) صامتًا وفورًا. نمنح صوت الميكروفون
            // فقط (لا كاميرا — غير مُستعمَلة عبر getUserMedia في مها) وفقط بعد صلاحية
            // RECORD_AUDIO الحقيقيّة (مُعلَنة في AndroidManifest.xml ومطلوبة هنا وقت التشغيل).
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                boolean wantsAudio = false;
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                        wantsAudio = true;
                        break;
                    }
                }
                if (!wantsAudio) {
                    request.deny();
                    return;
                }
                if (ContextCompat.checkSelfPermission(MahaWebViewFallbackActivity.this,
                        Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    return;
                }
                mPendingMicRequest = request;
                ActivityCompat.requestPermissions(MahaWebViewFallbackActivity.this,
                        new String[]{Manifest.permission.RECORD_AUDIO}, RC_RECORD_AUDIO);
            }

            // v-hw-file-chooser: بلا هذي الدالّة يتجاهل WebView كلّ <input type=file>. true = سنستدعي
            // النداء لاحقًا (onActivityResult)؛ false = لم نفتح شيئًا، فلا يُستدعى النداء أبدًا.
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback,
                                             FileChooserParams fileChooserParams) {
                if (mFileChooserCallback != null) {
                    mFileChooserCallback.onReceiveValue(null);
                }
                mFileChooserCallback = filePathCallback;
                try {
                    startActivityForResult(Intent.createChooser(
                            buildFileChooserIntent(fileChooserParams), null), RC_FILE_CHOOSER);
                    return true;
                } catch (ActivityNotFoundException e) {
                    Log.e(TAG, "No app to pick files", e);
                    mFileChooserCallback = null;
                    return false;
                }
            }

            // v-hw-geo: الأصل لا يُنفّذ هذي الدالّة، فلا يعود getCurrentPosition بموقع أبدًا داخل WebView —
            // القبلة والمواقيت تبقى على المدينة الافتراضيّة. موقع تقريبيّ يكفي (الصفحة تطلب
            // enableHighAccuracy:false)، ولنطاق التطبيق وحده.
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin,
                                                           GeolocationPermissions.Callback callback) {
                Uri o = origin == null ? null : Uri.parse(origin);
                if (o == null || o.getHost() == null
                        || !o.getHost().equalsIgnoreCase(mLaunchUrl.getHost())) {
                    callback.invoke(origin, false, false);
                    return;
                }
                if (ContextCompat.checkSelfPermission(MahaWebViewFallbackActivity.this,
                        Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                    return;
                }
                if (mGeoCallback != null) {
                    mGeoCallback.invoke(mGeoOrigin, false, false);
                }
                mGeoOrigin = origin;
                mGeoCallback = callback;
                ActivityCompat.requestPermissions(MahaWebViewFallbackActivity.this,
                        new String[]{Manifest.permission.ACCESS_COARSE_LOCATION}, RC_LOCATION);
            }
        };
    }

    // v-reply-export: بلا هذا المستمع يرمي WebView كلّ تنزيل صامتًا. روابط http(s) (روابط الخادم
    // /f/ و/p/ و/i/ برأس attachment) تذهب لمنزّل النظام مع الكوكيز ووكيل المستخدم نفسيهما؛
    // blob:/data: لا يقدر النظام يجلبها فتُترك (الموقع لا يرسلها هنا داخل التطبيق).
    private void attachDownloadListener(final WebView webView) {
        webView.addJavascriptInterface(new BlobSaveBridge(), "OmranBlobSave");
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimetype, long contentLength) {
                if (url != null && url.startsWith("blob:")) {
                    webView.evaluateJavascript(String.format(BLOB_SAVE_JS,
                            JSONObject.quote(url), JSONObject.quote(mimetype == null ? "" : mimetype)), null);
                    return;
                }
                if (url != null && url.startsWith("data:")) {
                    saveDataUrl(url, mimetype);
                    return;
                }
                startSystemDownload(url, userAgent, contentDisposition, mimetype);
            }
        });
    }

    /* v-hw-blob-save: blob: لا يجلبه منزّل النظام (عنوان داخل الصفحة)، فكانت تنزيلات الصور والتقارير
     * والفيديو المجمَّع على الجهاز تسقط صامتة. الصفحة نفسها تقرأ الـblob وتمرّره أجزاءً (٧٦٨ ك.ب) إلى
     * OmranBlobSave فيُكتب في «التنزيلات». الاسم من خاصيّة download لرابط الضغط إن بقي في الصفحة. */
    private static final String BLOB_SAVE_JS =
            "(function(u,mt){var B=window.OmranBlobSave;if(!B)return;var n='';"
            + "try{var as=document.querySelectorAll('a[download]');for(var i=0;i<as.length;i++)"
            + "{if(as[i].href===u){n=as[i].getAttribute('download')||'';break;}}}catch(e){}"
            + "fetch(u).then(function(r){return r.blob();}).then(function(b){"
            + "var id=B.begin(n,b.type||mt||'',b.size);if(id<0)return;var CH=786432,off=0;"
            + "(function next(){if(off>=b.size){B.end(id);return;}var fr=new FileReader();"
            + "fr.onload=function(){var s=String(fr.result);B.chunk(id,s.slice(s.indexOf(',')+1));"
            + "off+=CH;next();};fr.onerror=function(){B.fail(id);};"
            + "fr.readAsDataURL(b.slice(off,off+CH));})();"
            + "}).catch(function(){B.fail(-1);});})(%s,%s);";

    /** ملفّ مفتوح للكتابة في «التنزيلات»: MediaStore من أندرويد ١٠، ومجلّد التطبيق قبله. */
    private final class SaveTarget {
        final String name;
        final OutputStream out;
        final Uri uri;
        final File file;

        SaveTarget(String name, OutputStream out, Uri uri, File file) {
            this.name = name;
            this.out = out;
            this.uri = uri;
            this.file = file;
        }

        void finish() throws IOException {
            out.close();
            if (uri != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues done = new ContentValues();
                done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                getContentResolver().update(uri, done, null, null);
            }
        }

        void abort() {
            try {
                out.close();
            } catch (IOException e) {
                Log.w(TAG, "close after failed save", e);
            }
            if (uri != null) {
                getContentResolver().delete(uri, null, null);
            } else if (file != null && !file.delete()) {
                Log.w(TAG, "could not delete partial " + file);
            }
        }
    }

    private SaveTarget openDownload(String name, String mime) throws IOException {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            if (mime != null && !mime.isEmpty()) {
                values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            }
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) {
                throw new IOException("MediaStore insert returned null");
            }
            OutputStream out = getContentResolver().openOutputStream(uri);
            if (out == null) {
                getContentResolver().delete(uri, null, null);
                throw new IOException("MediaStore stream is null");
            }
            return new SaveTarget(name, out, uri, null);
        }
        File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) {
            dir = getFilesDir();
        }
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IOException("cannot create " + dir);
        }
        File file = new File(dir, name);
        return new SaveTarget(name, new FileOutputStream(file), null, file);
    }

    /** اسم آمن لملفّ التنزيل: بلا محارف ممنوعة، وبامتداد نوعه إن غاب. */
    static String downloadFileName(String name, String mime) {
        String n = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        String base = mime == null ? "" : mime.split(";")[0].trim().toLowerCase(Locale.ROOT);
        String ext = base.isEmpty() ? null : MimeTypeMap.getSingleton().getExtensionFromMimeType(base);
        if (n.isEmpty()) {
            n = "omran-" + System.currentTimeMillis();
        }
        if (n.indexOf('.') < 0 && ext != null) {
            n = n + "." + ext;
        }
        if (n.length() > 120) {
            n = n.substring(n.length() - 120);
        }
        return n;
    }

    /** محتوى رابط data: ونوعه — null لرابط غير صالح. */
    static byte[] dataUrlBytes(String url) {
        int comma = url == null ? -1 : url.indexOf(',');
        if (comma < 0 || !url.startsWith("data:")) {
            return null;
        }
        String meta = url.substring(5, comma);
        String payload = url.substring(comma + 1);
        try {
            if (meta.endsWith(";base64")) {
                return Base64.decode(payload, Base64.DEFAULT);
            }
            return Uri.decode(payload).getBytes(StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    static String dataUrlMime(String url) {
        int comma = url == null ? -1 : url.indexOf(',');
        if (comma < 5) {
            return "";
        }
        String meta = url.substring(5, comma);
        int semi = meta.indexOf(';');
        return (semi < 0 ? meta : meta.substring(0, semi)).trim();
    }

    private void saveDataUrl(final String url, final String fallbackMime) {
        new Thread(() -> {
            String mime = dataUrlMime(url);
            if (mime.isEmpty() && fallbackMime != null) {
                mime = fallbackMime;
            }
            byte[] bytes = dataUrlBytes(url);
            if (bytes == null) {
                Log.e(TAG, "Malformed data: download");
                toastSave(null);
                return;
            }
            SaveTarget target = null;
            try {
                target = openDownload(downloadFileName(null, mime), mime);
                target.out.write(bytes);
                target.finish();
                toastSave(target.name);
            } catch (IOException | RuntimeException e) {
                Log.e(TAG, "data: download failed", e);
                if (target != null) {
                    target.abort();
                }
                toastSave(null);
            }
        }).start();
    }

    /** إشعار قصير بلا كلمات (لا نصّ جديد يحتاج ١٤ لغة): ⬇️ والاسم عند النجاح، ⬇️ ✕ عند الفشل. */
    private void toastSave(final String savedName) {
        runOnUiThread(() -> Toast.makeText(MahaWebViewFallbackActivity.this,
                savedName == null ? "⬇️ ✕" : "⬇️ " + savedName, Toast.LENGTH_SHORT).show());
    }

    /** v-hw-blob-save: جسر الصفحة — begin يفتح الملفّ، chunk يكتب جزء base64، end يغلقه ويُظهره. */
    private final class BlobSaveBridge {
        private int mNextId = 1;
        private final Map<Integer, SaveTarget> mOpen = new HashMap<>();

        @JavascriptInterface
        public synchronized int begin(String name, String mime, double size) {
            if (size > BLOB_MAX_BYTES) {
                Log.w(TAG, "Blob too large to save: " + size);
                toastSave(null);
                return -1;
            }
            try {
                SaveTarget target = openDownload(downloadFileName(name, mime), mime);
                int id = mNextId++;
                mOpen.put(id, target);
                return id;
            } catch (IOException | RuntimeException e) {
                Log.e(TAG, "Cannot open download", e);
                toastSave(null);
                return -1;
            }
        }

        @JavascriptInterface
        public synchronized void chunk(int id, String base64) {
            SaveTarget target = mOpen.get(id);
            if (target == null) {
                return;
            }
            try {
                target.out.write(Base64.decode(base64, Base64.DEFAULT));
            } catch (IOException | IllegalArgumentException e) {
                Log.e(TAG, "Blob chunk failed", e);
                mOpen.remove(id);
                target.abort();
                toastSave(null);
            }
        }

        @JavascriptInterface
        public synchronized void end(int id) {
            SaveTarget target = mOpen.remove(id);
            if (target == null) {
                return;
            }
            try {
                target.finish();
                toastSave(target.name);
            } catch (IOException | RuntimeException e) {
                Log.e(TAG, "Blob finish failed", e);
                target.abort();
                toastSave(null);
            }
        }

        @JavascriptInterface
        public synchronized void fail(int id) {
            SaveTarget target = mOpen.remove(id);
            if (target != null) {
                target.abort();
            }
            toastSave(null);
        }
    }

    private void startSystemDownload(String url, String userAgent, String contentDisposition,
                                     String mimetype) {
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme();
        if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) {
            Log.w(TAG, "Download scheme not supported by DownloadManager: " + scheme);
            return;
        }
        String fileName = URLUtil.guessFileName(url, contentDisposition, mimetype);
        try {
            DownloadManager.Request request = new DownloadManager.Request(uri);
            if (mimetype != null && !mimetype.isEmpty()) {
                request.setMimeType(mimetype);
            }
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) {
                request.addRequestHeader("Cookie", cookies);
            }
            if (userAgent != null) {
                request.addRequestHeader("User-Agent", userAgent);
            }
            request.setTitle(fileName);
            request.setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            dm.enqueue(request);
            Toast.makeText(this, "⬇️ " + fileName, Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            // أندرويد ٦–٩ بلا صلاحيّة التخزين، أو منزّل معطَّل: متصفّح النظام ينزّل الرابط نفسه.
            Log.e(TAG, "DownloadManager failed, opening in browser: " + url, e);
            try {
                new CustomTabsIntent.Builder().setToolbarColor(mStatusBarColor).build()
                        .launchUrl(this, uri);
            } catch (ActivityNotFoundException ex) {
                Log.e(TAG, "No browser to open " + url, ex);
            }
        }
    }

    /**
     * v-webview-opaque: WebView نفسه يُرسم بخلفيّة معتمة بلون التطبيق (‎#000000‎، وهو
     * background_color في manifest.json و meta theme-color في index.html). الافتراضيّ أبيض،
     * فكلّ إطار لم تكتمل رسمته كان يخرج ومضة بيضاء داخل تطبيق أسود؛ ومع نافذة شفّافة (كانت
     * السمة الموروثة) لا يوجد سطح معتم تحته إطلاقًا فيخرج ما في المخزن ضجيجًا. السمة المعتمة
     * في res/values/styles.xml تحلّ النافذة، وهذا السطر يحلّ سطح WebView نفسه — الاثنان معًا.
     */
    private static void paintOpaque(WebView webView) {
        webView.setBackgroundColor(0xFF000000);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private static void setupWebSettings(WebSettings webSettings) {
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        /* v-no-force-dark (المالك ٢٤ سبتمبر): التغميق الخوارزميّ في WebView يعيد تلوين صفحة
         * لا تعلن color-scheme، فيطال SVG السطريّ والصور والنصّ — وهذا شكل «الأيقونة الممتلئة»
         * و«الصورة الخضراء» و«النصّ المخدوش» في فيديو المالك. الصفحة صارت تعلنها (v-color-scheme)،
         * وهذا إيقاف صريح من جهة الغلاف أيضًا: التطبيق داكن أصلًا فلا يحتاج تغميقًا من أحد.
         * setForceDark متاحة من API 29 ومهملة من 33 (حيث الإيقاف هو الافتراض لأنّ targetSdk 36)،
         * لكنّ أغلفة المصنّعين لا تلتزم دائمًا بالافتراض — فالإعلان الصريح تأمين بلا كلفة. */
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try { webSettings.setForceDark(WebSettings.FORCE_DARK_OFF); }
            catch (Throwable t) { Log.w(TAG, "setForceDark unavailable", t); }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
            webSettings.setMediaPlaybackRequiresUserGesture(false);
        }
    }
}
