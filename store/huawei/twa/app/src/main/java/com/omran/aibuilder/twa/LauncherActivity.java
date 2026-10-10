/*
 * Copyright 2020 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.omran.aibuilder.twa;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import com.google.androidbrowserhelper.trusted.LauncherActivityMetadata;
import com.google.androidbrowserhelper.trusted.TwaLauncher;
import com.google.androidbrowserhelper.trusted.WebViewFallbackActivity;



public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    // v-maha-webview-mic (٢١ سبتمبر ٢٠٢٦): نقطة توسيع رسميّة موثَّقة في مكتبة
    // androidbrowserhelper نفسها (تعليق getFallbackStrategy() الأصليّ: "Override this for
    // creating a custom fallback approach, such as launching a different WebView fallback
    // implementation"). WebViewFallbackActivity الأصليّ لا يمنح صلاحية المايك وقت التشغيل
    // إطلاقًا (لا onPermissionRequest في مصدره) فيفشل مها دائمًا على أجهزة بلا متصفّح يدعم TWA
    // (fallbackType=webview). MahaWebViewFallbackActivity نسخة محليّة كاملة + هذي الإضافة فقط.
    @Override
    protected TwaLauncher.FallbackStrategy getFallbackStrategy() {
        TwaLauncher.FallbackStrategy base = super.getFallbackStrategy();
        if (base != TwaLauncher.WEBVIEW_FALLBACK_STRATEGY) {
            return base; // custom tabs أو حوار الحظر — لا علاقة لهما بمسار WebView
        }
        return (Context context, androidx.browser.trusted.TrustedWebActivityIntentBuilder twaBuilder,
                String providerPackage, Runnable completionCallback) -> {
            Intent intent = WebViewFallbackActivity.createLaunchIntent(context,
                    twaBuilder.getUri(), LauncherActivityMetadata.parse(context));
            intent.setClass(context, MahaWebViewFallbackActivity.class);
            context.startActivity(intent);
            if (completionCallback != null) {
                completionCallback.run();
            }
        };
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Setting an orientation crashes the app due to the transparent background on Android 8.0
        // Oreo and below. We only set the orientation on Oreo and above. This only affects the
        // splash screen and Chrome will still respect the orientation.
        // See https://github.com/GoogleChromeLabs/bubblewrap/issues/496 for details.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }

    @Override
    protected Uri getLaunchingUrl() {
        // Get the original launch Url.
        Uri uri = super.getLaunchingUrl();

        

        return uri;
    }
}
