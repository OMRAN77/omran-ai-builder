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
// غير مُتحقَّق حيًّا: لا بيئة بناء أندرويد ولا جهاز في جلسة التشخيص التي كتبت هذا الملفّ —
// يحتاج تجربة فعليّة بعد `Actions ← android-release` وتثبيت الـAPK. راجع
// knowledge/DECISIONS.md (v-maha-webview-mic) وstore/huawei/README.md قبل أي تعديل هنا.
package com.omran.aibuilder.twa;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
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

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
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

    private Uri mLaunchUrl;
    private int mStatusBarColor;
    private WebView mWebView;
    private List<Uri> mExtraOrigins = new ArrayList<>();
    private PermissionRequest mPendingMicRequest;

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

    private WebViewClient createWebViewClient() {
        return new WebViewClient() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                ViewGroup vg = (ViewGroup) view.getParent();
                vg.removeView(view);
                view.destroy();

                mWebView = new WebView(view.getContext());
                mWebView.setWebViewClient(this);
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
        };
    }

    @SuppressLint("SetJavaScriptEnabled")
    private static void setupWebSettings(WebSettings webSettings) {
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
            webSettings.setMediaPlaybackRequiresUserGesture(false);
        }
    }
}
