/* المرحلة ٣ · الشريحة ٧أ — بنية المودالات، منقولة حرفيًّا من index.html.
   تُدرَج عند نفس نقطة التحليل، فترتيب DOM مطابق بايت-ببايت.
   sha256(المحتوى) = 3439992f8071f21b0a80db2183148b0b */
(function(){
  var S = document.currentScript;
  var H = String.raw`<div id="authOverlay" style="position:fixed; inset:0; z-index:9999; background:var(--bg,#111); display:flex; align-items:center; justify-content:center; padding:20px;">
  <div style="max-width:380px; width:100%; background:var(--panel,#1a1a1a); border-radius:var(--r-4); padding:26px; box-shadow:var(--sh-3); position:relative;">
    <h2 style="margin-top:0; text-align:center;" data-i18n="authTitle">🔐 مرحبًا بك</h2>
    <p style="text-align:center; font-size: var(--fs-3); color:var(--muted); margin-top:-8px;" data-i18n="authSubtitle">سجّل الدخول أو أنشئ حسابًا جديدًا للمتابعة</p>
    <div style="display:flex; gap:8px; margin:14px 0;">
      <button type="button" class="btn" id="authTabLogin" style="flex:1;" data-i18n="authTabLogin">تسجيل الدخول</button>
      <button type="button" class="btn" id="authTabSignup" style="flex:1;" data-i18n="authTabSignup">حساب جديد</button>
    </div>
    <form id="authForm" autocomplete="on" onsubmit="return false;">
    <label style="display:flex; flex-direction:column; gap:4px; margin-bottom:10px;">
      <span data-i18n="authUsernameLabel">اسم المستخدم</span>
      <input type="text" id="authUsername" name="username" autocomplete="username" style="height:40px; padding:0 10px; border-radius:var(--r-2);">
    </label>
    <label id="authEmailRow" style="display:none; flex-direction:column; gap:4px; margin-bottom:10px;">
      <span data-i18n="authEmailLabel">📧 الإيميل (اختياري - لاسترجاع الحساب)</span>
      <input type="email" id="authEmail" name="email" autocomplete="email" style="height:40px; padding:0 10px; border-radius:var(--r-2); direction:ltr;">
    </label>
    <label id="authRecoveryRow" style="display:none; flex-direction:column; gap:4px; margin-bottom:10px;">
      <span data-i18n="authRecoveryLabel">رمز الاسترجاع</span>
      <input type="text" id="authRecoveryCode" autocomplete="off" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" style="height:40px; padding:0 10px; border-radius:var(--r-2); direction:ltr; text-align:center;">
    </label>
    <label id="authPasswordRow" style="display:flex; flex-direction:column; gap:4px; margin-bottom:6px;">
      <span id="authPasswordLabelText" data-i18n="authPasswordLabel">كلمة المرور</span>
      <div style="position:relative;">
        <input type="password" id="authPassword" name="password" autocomplete="current-password" style="height:40px; padding:0 40px 0 10px; border-radius:var(--r-2); width:100%; box-sizing:border-box;">
        <button type="button" id="authTogglePassBtn" title="👁" style="position:absolute; inset-inline-end:2px; top:2px; height:36px; width:36px; border:none; background:transparent; cursor:pointer; font-size:16px; color:var(--muted); display:flex; align-items:center; justify-content:center;">🙈</button>
      </div>
    </label>
    <label id="authRememberRow" style="display:flex; align-items:center; gap:6px; margin-bottom:6px; font-size: var(--fs-3); cursor:pointer; user-select:none;">
      <input type="checkbox" id="authRememberMe" checked style="width:16px; height:16px; cursor:pointer;">
      <span data-i18n="authRememberMe">تذكرني</span>
    </label>
    <div id="authInfoMsg" style="display:none; font-size:12px; color:var(--accent,#6b7280); margin-bottom:6px; text-align:center;"></div>
    <div style="text-align:end; margin-bottom:6px;">
      <a href="#" id="authForgotLink" style="font-size:12px; color:var(--accent,#6b7280); text-decoration:none;" data-i18n="authForgotLink">نسيت كلمة المرور؟</a>
      <a href="#" id="authUseCodeLink" style="font-size:12px; color:var(--accent,#6b7280); text-decoration:none; display:none;" data-i18n="authUseCodeLink">لدي رمز استرجاع بدلًا من ذلك</a>
      <a href="#" id="authBackToLoginLink" style="font-size:12px; color:var(--accent,#6b7280); text-decoration:none; display:none;" data-i18n="authBackToLogin">رجوع لتسجيل الدخول</a>
    </div>
    <div id="authError" style="color:#ef4444; font-size: var(--fs-3); min-height:18px; margin-bottom:6px;"></div>
    <button type="submit" class="btn primary" id="authSubmitBtn" style="width:100%; height:44px; font-weight:bold;" data-i18n="authSubmitLogin">دخول</button>
    </form>
    <div style="display:flex; align-items:center; gap:8px; margin:14px 0;">
      <div style="flex:1; height:1px; background:var(--border,#333);"></div>
      <span style="font-size:12px; color:var(--muted);" data-i18n="authOrDivider">أو</span>
      <div style="flex:1; height:1px; background:var(--border,#333);"></div>
    </div>
    <button type="button" id="authGoogleBtn" title="Continue with Google" style="width:100%; height:44px; border-radius:var(--r-2); border:1px solid var(--border,#333); background:#fff; display:flex; align-items:center; justify-content:center; gap:10px; cursor:pointer; font-size: var(--fs-3); font-weight: var(--w-bold); color:#3c4043;">
      <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/></svg>
      <span data-i18n="authGoogleBtn">المتابعة بجوجل</span>
    </button>
  </div>
</div>

<div id="authRecoveryModal" style="position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.7); display:none; align-items:center; justify-content:center; padding:20px;">
  <div style="max-width:420px; width:100%; background:var(--panel,#1a1a1a); border-radius:var(--r-4); padding:26px; box-shadow:var(--sh-3); text-align:center;">
    <h3 style="margin-top:0;" data-i18n="authRecoveryModalTitle">🔑 احتفظ برمز الاسترجاع هذا</h3>
    <p style="font-size: var(--fs-3); color:var(--muted);" data-i18n="authRecoveryModalDesc">هذا هو الرمز الوحيد الذي يمكنك استخدامه لاستعادة حسابك إذا نسيت كلمة المرور. احفظه في مكان آمن — لن يظهر مرة أخرى.</p>
    <div id="authRecoveryCodeDisplay" style="font-family:monospace; font-size:18px; direction:ltr; background:var(--bg,#111); border-radius:var(--r-2); padding:14px; margin:14px 0; letter-spacing:1px; word-break:break-all;"></div>
    <div style="display:flex; gap:8px;">
      <button type="button" class="btn" id="authCopyRecoveryBtn" style="flex:1;" data-i18n="authCopyBtn">📋 نسخ</button>
      <button type="button" class="btn primary" id="authAckRecoveryBtn" style="flex:1;" data-i18n="authAckBtn">✅ حفظته، متابعة</button>
    </div>
  </div>
</div>

<div id="omranEduModal" style="position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.85); display:none; align-items:stretch; justify-content:stretch; padding:0;">
  <div style="width:100%; height:100%; display:flex; flex-direction:column; background:var(--panel,#1a1a1a);">
    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.08); flex:0 0 auto;">
      <h3 style="margin:0; font-size:15px;" data-i18n="omranEduModalTitle">🎓 التعليم</h3>
      <button type="button" class="btn iconBtn" id="omranEduCloseBtn" style="padding:4px 10px;">✕</button>
    </div>
    <iframe id="omranEduFrame" src="about:blank" style="flex:1 1 auto; width:100%; border:none; background:#0b0b0f;" allow="clipboard-write; microphone"></iframe>
  </div>
</div>

<div id="videoMakerModal" style="position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.7); display:none; align-items:center; justify-content:center; padding:20px;">
  <div style="max-width:520px; width:100%; max-height:90vh; overflow-y:auto; background:var(--panel,#1a1a1a); border-radius:var(--r-4); padding:26px; box-shadow:var(--sh-3);">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <h3 style="margin:0;" data-i18n="videoMakerModalTitle">🎬 صانع الفيديو بالذكاء الاصطناعي</h3>
      <button type="button" class="btn iconBtn" id="videoMakerCloseBtn" style="padding:4px 10px;">✕</button>
    </div>
    <p style="font-size:12.5px; color:var(--muted); margin-top:2px;" data-i18n="videoMakerDesc">اكتب وصف الفيديو الذي تريده، واختر الستايل والمدة. الميزة قيد التجربة وبها حد أقصى قليل من الفيديوهات يوميًا لكل حساب.</p>

    <div class="mini-mic-field-row" style="margin-top:12px;">
    <textarea id="videoMakerPrompt" rows="4" style="width:100%; resize:vertical;" data-i18n-placeholder="videoMakerPromptPlaceholder" placeholder="صف الفيديو الذي تريد إنشاءه... مثال: قطة صغيرة تلعب في حديقة مشمسة"></textarea>
    <button type="button" class="mini-mic-btn" data-target="videoMakerPrompt" title="🎤" data-i18n-title="micTitle">🎤</button>
    </div>

    <div style="margin-top:12px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="videoModeLabel">وضع الإنشاء</label>
      <select id="videoMakerMode" style="width:100%;">
        <option value="canvas" data-i18n="videoModeCanvasOnly">🎨 كانفا فقط (بدون AI)</option>
        <option value="runway" selected data-i18n="videoModeRunwayOnly">🤖 فيديو AI فقط (Runway)</option>
        <option value="hybrid" data-i18n="videoModeHybrid">🔗 دمج الاثنين (الأفضل)</option>
        <option value="veo" data-i18n="videoModeVeo">🚀 Veo 3 — جوجل (أعلى جودة + صوت)</option>
        <option value="actor" data-i18n="videoModeActor">🗣️ ممثل يتكلم — لهجة إماراتية (Veo 3)</option>
      </select>
    </div>



    <div class="mini-mic-field-row" id="videoMakerActorRow" style="margin-top:12px; display:none;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="videoActorSpeechLabel">🗣️ شو يقول الممثل؟ (بالحرف)</label>
      <textarea id="videoMakerActorSpeech" rows="2" style="width:100%;" maxlength="300" data-i18n-placeholder="videoActorSpeechPlaceholder" placeholder="مثال: هلا والله! حياكم في تطبيق عمران AI، أقوى منصة ذكاء اصطناعي"></textarea>
      <button type="button" class="mini-mic-btn" data-target="videoMakerActorSpeech" title="🎤" data-i18n-title="micTitle">🎤</button>
    </div>

    <div class="mini-mic-field-row" id="videoMakerSignatureRow" style="margin-top:12px; display:none;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="videoSignatureLabel">التوقيع (اسمك)</label>
      <input type="text" id="videoMakerSignature" style="width:100%;" maxlength="40" data-i18n-placeholder="videoSignaturePlaceholder" placeholder="اكتب اسمك أو أي نص ليظهر كتوقيع ثابت على الفيديو">
      <button type="button" class="mini-mic-btn" data-target="videoMakerSignature" title="🎤" data-i18n-title="micTitle">🎤</button>
    </div>

    <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap;">
      <div style="flex:1; min-width:130px;">
        <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="videoMakerStyleLabel">الستايل</label>
        <select id="videoMakerStyle" style="width:100%;">
          <option value="realistic" data-i18n="videoMakerStyleRealistic">🎥 واقعي</option>
          <option value="anime" data-i18n="videoMakerStyleAnime">🎨 أنيمي / كارتون</option>
        </select>
      </div>
      <div style="flex:1; min-width:110px;">
        <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="videoMakerDurationLabel">المدة (ثانية)</label>
        <select id="videoMakerDuration" style="width:100%;">
          <option value="5" selected>5</option>
          <option value="8">8</option>
          <option value="10">10</option>
          <option value="long20" data-i18n="videoMakerDurationLong">20 (⛓️ مشهدين)</option>
          <option value="film" data-i18n="videoMakerDurationFilm">🎬 فيلم متكامل (سيناريو + مشاهد + سرد)</option>

        </select>
      </div>
      <div style="flex:1; min-width:110px;">
        <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="videoMakerRatioLabel">الشكل</label>
        <select id="videoMakerRatio" style="width:100%;">
          <option value="1280:720" data-i18n="videoMakerRatioLandscape">🖥️ عرضي 16:9</option>
          <option value="720:1280" data-i18n="videoMakerRatioPortrait">📱 طولي 9:16</option>
        </select>
      </div>
    </div>

    <div id="videoMakerLongMinutesRow" style="display:none; margin-top:12px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="videoMakerLongMinutesLabel">مدة الفيديو الكاملة (دقائق، ١-١٠)</label>
      <input type="number" id="videoMakerLongMinutesInput" min="1" max="10" value="1" style="width:100%;">
      <p style="font-size:11.5px; color:var(--muted); margin-top:6px;" data-i18n="videoMakerLongMinutesNote">⚠️ ميزة مخصصة لحساب المالك فقط. كل دقيقة تعني حوالي ٧-٨ مشاهد منفصلة تُولَّد وتُدمج تلقائيًا؛ التكلفة الفعلية تُخصم من رصيد Runway الخاص بك وتزيد بشكل كبير مع طول الفيديو. راح يظهر لك تقدير التكلفة قبل البدء الفعلي.</p>
    </div>

    <div id="videoMakerHeroRow" style="display:none; margin-top:12px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="videoMakerHeroLabel">📸 صورتك بطل الفيلم (اختياري)</label>
      <div style="display:flex; align-items:center; gap:10px;">
        <button type="button" id="videoMakerHeroBtn" style="padding:8px 14px; border-radius:var(--r-2); cursor:pointer;" data-i18n="videoMakerHeroBtn">📸 اختر صورة البطل</button>
        <img id="videoMakerHeroPreview" style="display:none; width:52px; height:52px; object-fit:cover; border-radius:var(--r-2);" alt="">
        <button type="button" id="videoMakerHeroClear" style="display:none; cursor:pointer; background:none; border:none; font-size:16px;">✖</button>
      </div>
      <input type="file" id="videoMakerHeroInput" accept="image/*" style="display:none;">
      <p style="font-size: var(--fs-5); color:var(--muted); margin-top:6px;" data-i18n="videoMakerHeroNote">ارفع صورتك أو صورة أي شخص — راح يكون بطل كل مشاهد الفيلم.</p>
    </div>
    <p id="videoMakerHeroVeoNote" style="display:none; font-size:11.5px; color:#e8a13c; margin-top:10px;" data-i18n="videoMakerHeroVeoNote">ℹ️ صورة البطل متاحة مع محرك Runway فقط — Veo 3 لا يقبل صورة في وضع الفيلم.</p>

    <label style="display:flex; align-items:center; gap:8px; margin-top:14px; font-size: var(--fs-3); cursor:pointer;">
      <input type="checkbox" id="videoMakerNarrationToggle">
      <span data-i18n="videoMakerNarrationToggleLabel">🎙️ إضافة تعليق صوتي (صوت مُولّد)</span>
    </label>
    <div class="mini-mic-field-row" id="videoMakerNarrationRow" style="margin-top:6px; display:none;">
    <textarea id="videoMakerNarrationText" rows="2" style="width:100%; resize:vertical;" data-i18n-placeholder="videoMakerNarrationPlaceholder" placeholder="اكتب نص التعليق الصوتي الذي سيُقرأ فوق الفيديو (اختياري - إن تُرك فارغًا يُستخدم وصف الفيديو)"></textarea>
    <button type="button" class="mini-mic-btn" data-target="videoMakerNarrationText" title="🎤" data-i18n-title="micTitle">🎤</button>
    </div>

    <label style="display:flex; align-items:center; gap:8px; margin-top:10px; font-size: var(--fs-3); cursor:pointer;" id="videoMakerQualityRow">
      <input type="checkbox" id="videoMakerQualityToggle">
      <span data-i18n="videoMakerQualityToggleLabel">🔎 جودة أعلى (ترقية دقة الفيديو، متاحة فقط للفيديو القصير)</span>
    </label>

    <button type="button" class="btn primary" id="videoMakerGenerateBtn" style="width:100%; margin-top:14px;" data-i18n="videoMakerGenerateBtn">✨ إنشاء الفيديو</button>

    <div id="videoMakerStatus" style="display:none; margin-top:14px; text-align:center; font-size: var(--fs-3); color:var(--muted);"></div>
    <video id="videoMakerResult" controls autoplay playsinline style="display:none; width:100%; margin-top:14px; border-radius:var(--r-2); background:#000;"></video>
    <a id="videoMakerDownloadLink" style="display:none; margin-top:8px; text-align:center;" class="btn primary" download="omran-ai-video.mp4" data-i18n="videoMakerDownloadBtn">⬇️ تحميل الفيديو</a>
  </div>
</div>

<div id="designAiModal" style="position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.7); display:none; align-items:center; justify-content:center; padding:20px;">
  <div style="max-width:520px; width:100%; max-height:90vh; overflow-y:auto; background:var(--panel,#1a1a1a); border-radius:var(--r-4); padding:26px; box-shadow:var(--sh-3);">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <h3 style="margin:0;" data-i18n="designAiModalTitle">🏠 ديكور بالذكاء الاصطناعي</h3>
      <button type="button" class="btn iconBtn" id="designAiCloseBtn" style="padding:4px 10px;">✕</button>
    </div>
    <p style="font-size:12.5px; color:var(--muted); margin-top:2px;" data-i18n="designAiDesc">ارفع صورة لغرفتك واختر نمط الديكور، وسيقوم الذكاء الاصطناعي بإعادة تصميمها. ميزة قيد التجربة بحد أقصى قليل يوميًا لكل حساب.</p>

    <div style="margin-top:12px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="designAiPlaceLabel">نوع المكان</label>
      <select id="designAiPlace" style="width:100%;">
        <option value="" data-en="📷 From my photo" data-i18n="designAiPlaceFromPhoto">📷 من صورتي</option>
        <option value="restaurant" data-en="🍽️ Restaurant" data-i18n="designAiPlaceRestaurant">🍽️ مطعم</option>
        <option value="cafe" data-en="☕ Cafe" data-i18n="designAiPlaceCafe">☕ كافيه</option>
        <option value="bedroom" data-en="🛏️ Bedroom" data-i18n="designAiPlaceBedroom">🛏️ غرفة نوم</option>
        <option value="majlis" data-en="🪑 Majlis" data-i18n="designAiPlaceMajlis">🪑 مجلس</option>
        <option value="living" data-en="🛋️ Living room" data-i18n="designAiPlaceLiving">🛋️ صالة</option>
        <option value="kitchen" data-en="🍳 Kitchen" data-i18n="designAiPlaceKitchen">🍳 مطبخ</option>
        <option value="office" data-en="💼 Office" data-i18n="designAiPlaceOffice">💼 مكتب</option>
        <option value="shop" data-en="🛍️ Shop" data-i18n="designAiPlaceShop">🛍️ محل</option>
        <option value="bath" data-en="🛁 Bathroom" data-i18n="designAiPlaceBath">🛁 حمام</option>
        <option value="kids" data-en="🧸 Kids room" data-i18n="designAiPlaceKids">🧸 غرفة أطفال</option>
        <option value="entrance" data-en="🚪 Entrance" data-i18n="designAiPlaceEntrance">🚪 مدخل</option>
        <option value="garden" data-en="🌳 Garden" data-i18n="designAiPlaceGarden">🌳 حديقة</option>
      </select>
    </div>

    <input type="file" id="designAiFileInput" accept="image/*" style="display:none;">
    <div style="display:flex; align-items:center; gap:10px; margin-top:12px;">
      <button type="button" class="btn" id="designAiFileBtn" style="width:auto; white-space:nowrap;" data-i18n="fileChooseBtn">📁 اختيار ملف</button>
      <span id="designAiFileName" style="font-size:12px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" data-i18n="fileNoneChosen">لم يتم اختيار ملف</span>
    </div>
    <img id="designAiSourcePreview" style="display:none; width:100%; margin-top:10px; border-radius:var(--r-2); max-height:220px; object-fit:contain; background:#000;">

    <div style="margin-top:12px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="designAiStyleLabel">نمط الديكور</label>
      <select id="designAiStyle" style="width:100%;">
        <option value="modern" data-i18n="designAiStyleModern">✨ عصري</option>
        <option value="simple" data-i18n="designAiStyleSimple">🤍 بسيط</option>
        <option value="bohemian" data-i18n="designAiStyleBohemian">🌿 بوهيمي</option>
        <option value="luxury" data-i18n="designAiStyleLuxury">💎 فخم</option>
        <option value="arabic" data-i18n="designAiStyleArabic">🕌 مجلس عربي</option>
        <option value="classic" data-i18n="designAiStyleClassic">🪵 كلاسيكي</option>
        <option value="najdi" data-en="🏜️ Najdi" data-i18n="designAiStyleNajdi">🏜️ نجدي</option>
        <option value="islamic" data-en="✳️ Modern Islamic" data-i18n="designAiStyleIslamic">✳️ إسلامي معاصر</option>
        <option value="andalusi" data-en="🏛️ Andalusian" data-i18n="designAiStyleAndalusi">🏛️ أندلسي</option>
      </select>
    </div>

    <button type="button" class="btn" id="designAiSuggestBtn" style="width:100%; margin-top:12px;" data-i18n="designAiSuggestBtn">💡 اقترح لي أفكار</button>
    <div id="designAiSuggestBox" style="display:none; margin-top:10px; padding:10px 12px; border-radius:var(--r-2); background:rgba(255,255,255,0.05); font-size:12.5px; line-height:1.8;">
      <div style="font-weight:bold; margin-bottom:6px;" data-i18n="designAiSuggestTitle">💡 أفكار مقترحة من الذكاء الاصطناعي</div>
      <div id="designAiSuggestList"></div>
    </div>

    <p style="font-size: var(--fs-5); color:var(--muted); margin:14px 0 6px;" data-i18n="designAiOptionalHint">الخيارات التالية اختيارية — اختر ما يناسبك فقط</p>

    <div style="margin-top:8px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="designAiLightingLabel">💡 الإضاءة</label>
      <select id="designAiLighting" style="width:100%;">
        <option value="" data-i18n="designAiOptionNone">بدون تغيير</option>
        <option value="warm" data-i18n="designAiLightingWarm">دافئة</option>
        <option value="cool" data-i18n="designAiLightingCool">باردة</option>
        <option value="bright" data-i18n="designAiLightingBright">ساطعة</option>
        <option value="dim" data-i18n="designAiLightingDim">خافتة/ليلية</option>
      </select>
    </div>

    <div style="margin-top:10px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="designAiFurnitureLabel">🛋️ نوع الأثاث</label>
      <select id="designAiFurniture" style="width:100%;">
        <option value="" data-i18n="designAiOptionNone">بدون تغيير</option>
        <option value="modern" data-i18n="designAiFurnitureModern">مودرن</option>
        <option value="classic" data-i18n="designAiFurnitureClassic">كلاسيكي</option>
        <option value="simple" data-i18n="designAiFurnitureSimple">بسيط</option>
        <option value="luxury" data-i18n="designAiFurnitureLuxury">فاخر</option>
        <option value="bohemian" data-i18n="designAiFurnitureBohemian">بوهيمي</option>
      </select>
    </div>

    <div style="margin-top:10px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="designAiFlooringLabel">🧱 الأرضيات</label>
      <select id="designAiFlooring" style="width:100%;">
        <option value="" data-i18n="designAiOptionNone">بدون تغيير</option>
        <option value="parquet" data-i18n="designAiFlooringParquet">باركيه</option>
        <option value="marble" data-i18n="designAiFlooringMarble">رخام</option>
        <option value="ceramic" data-i18n="designAiFlooringCeramic">سيراميك</option>
        <option value="carpet" data-i18n="designAiFlooringCarpet">سجاد</option>
      </select>
    </div>

    <div style="margin-top:10px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="designAiFabricLabel">🎨 ألوان الأقمشة</label>
      <select id="designAiFabric" style="width:100%;">
        <option value="" data-i18n="designAiOptionNone">بدون تغيير</option>
        <option value="light" data-i18n="designAiFabricLight">فاتحة</option>
        <option value="dark" data-i18n="designAiFabricDark">داكنة</option>
        <option value="neutral" data-i18n="designAiFabricNeutral">محايدة</option>
        <option value="bold" data-i18n="designAiFabricBold">جريئة</option>
      </select>
    </div>

    <div style="margin-top:10px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="designAiWallColorLabel">🖼️ لون الحوائط</label>
      <select id="designAiWallColor" style="width:100%;">
        <option value="" data-i18n="designAiOptionNone">بدون تغيير</option>
        <option value="white" data-i18n="designAiWallColorWhite">أبيض</option>
        <option value="beige" data-i18n="designAiWallColorBeige">بيج</option>
        <option value="gray" data-i18n="designAiWallColorGray">رمادي</option>
        <option value="bold" data-i18n="designAiWallColorBold">جريئة</option>
      </select>
    </div>

    <div style="margin-top:10px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="designAiCurtainsLabel">🪟 الستائر</label>
      <select id="designAiCurtains" style="width:100%;">
        <option value="" data-i18n="designAiOptionNone">بدون تغيير</option>
        <option value="simple" data-i18n="designAiCurtainsSimple">بسيطة</option>
        <option value="luxury" data-i18n="designAiCurtainsLuxury">فخمة</option>
        <option value="remove" data-i18n="designAiCurtainsRemove">بدون ستائر</option>
      </select>
    </div>

    <label style="display:flex; align-items:center; gap:8px; margin-top:12px; font-size:12.5px; cursor:pointer;">
      <input type="checkbox" id="designAiRearrange">
      <span data-i18n="designAiRearrangeLabel">📐 أعد ترتيب قطع الأثاث</span>
    </label>

    <div style="margin-top:10px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="designAiDecorLabel">🌿 لمسات ديكورية إضافية</label>
      <div style="display:flex; flex-wrap:wrap; gap:12px; font-size:12.5px;">
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
          <input type="checkbox" id="designAiDecorPlants"><span data-i18n="designAiDecorPlants">نباتات</span>
        </label>
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
          <input type="checkbox" id="designAiDecorArt"><span data-i18n="designAiDecorArt">لوحات فنية</span>
        </label>
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
          <input type="checkbox" id="designAiDecorAccessories"><span data-i18n="designAiDecorAccessories">إكسسوارات فخمة</span>
        </label>
      </div>
    </div>

    <div style="margin-top:12px;">
      <label id="designAiNotesLbl" style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="dsNotesLabel">✍️ اكتب تفاصيلك بكلماتك (اختياري)</label>
      <textarea id="designAiNotes" rows="3" maxlength="400" style="width:100%; resize:vertical; font-family:inherit;" placeholder="مثال: مطعم إيطالي ٤٠ كرسي، سقف عالي، طابع صناعي" data-i18n-placeholder="dsNotesPh"></textarea>
    </div>

    <button type="button" class="btn primary" id="designAiGenerateBtn" style="width:100%; margin-top:14px;" data-i18n="designAiGenerateBtn">✨ صمم الغرفة</button>

    <div id="designAiStatus" style="display:none; margin-top:14px; text-align:center; font-size: var(--fs-3); color:var(--muted);"></div>
    <img id="designAiResult" style="display:none; width:100%; margin-top:14px; border-radius:var(--r-2); background:#000;">
    <div id="designAiGrid" style="display:none; grid-template-columns:1fr 1fr; gap:8px; margin-top:14px;"></div>
    <a id="designAiDownloadLink" style="display:none; margin-top:8px; text-align:center;" class="btn primary" download="omran-design-ai.png" data-i18n="designAiDownloadBtn">⬇️ تحميل الصورة</a>
  </div>
</div>

<div id="portraitStyleModal" style="position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.7); display:none; align-items:center; justify-content:center; padding:20px;">
  <div style="max-width:520px; width:100%; max-height:90vh; overflow-y:auto; background:var(--panel,#1a1a1a); border-radius:var(--r-4); padding:26px; box-shadow:var(--sh-3);">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <h3 style="margin:0;" data-i18n="portraitModalTitle">🎨 أنماط الصور الشخصية</h3>
      <button type="button" class="btn iconBtn" id="portraitStyleCloseBtn" style="padding:4px 10px;">✕</button>
    </div>
    <p style="font-size:12.5px; color:var(--muted); margin-top:2px;" data-i18n="portraitDesc">ارفع صورتك الشخصية واختر ستايل رسم، وسيحوّلها الذكاء الاصطناعي لهذا الأسلوب. ميزة قيد التجربة بحد أقصى قليل يوميًا لكل حساب.</p>

    <input type="file" id="portraitStyleFileInput" accept="image/*" style="display:none;">
    <div style="display:flex; align-items:center; gap:10px; margin-top:12px;">
      <button type="button" class="btn" id="portraitStyleFileBtn" style="width:auto; white-space:nowrap;" data-i18n="fileChooseBtn">📁 اختيار ملف</button>
      <span id="portraitStyleFileName" style="font-size:12px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" data-i18n="fileNoneChosen">لم يتم اختيار ملف</span>
    </div>
    <img id="portraitStyleSourcePreview" style="display:none; width:100%; margin-top:10px; border-radius:var(--r-2); max-height:220px; object-fit:contain; background:#000;">

    <div style="margin-top:12px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
        <label style="font-size:12px; color:var(--muted); display:block;" data-i18n="portraitStyleLabel">ستايل الرسم</label>
        <button type="button" id="portraitFavStarBtn" title="⭐" style="background:none; border:none; cursor:pointer; font-size: var(--fs-2); padding:2px 4px; line-height:1;">☆</button>
      </div>
      <select id="portraitStyleSelect" style="width:100%;">
        <optgroup id="portraitFavGroup" label="⭐ المفضلة" data-i18n="[label]portraitFavGroupLabel" style="display:none;"></optgroup>
        <option value="anime" data-i18n="portraitStyleAnime">🎬 أنيمي ياباني</option>
        <option value="cartoon" data-i18n="portraitStyleCartoon">🖼️ كارتون واقعي</option>
        <option value="oil" data-i18n="portraitStyleOil">🎨 لوحة زيتية</option>
        <option value="sketch" data-i18n="portraitStyleSketch">✏️ رسم بالقلم الرصاص</option>
        <option value="pixel" data-i18n="portraitStylePixel">🕹️ بيكسل آرت</option>
        <option value="comic" data-i18n="portraitStyleComic">🦸 كومكس/مانجا</option>
        <option value="pop" data-i18n="portraitStylePop">🌈 بوب آرت</option>
        <option value="gulf" data-i18n="portraitStyleGulf">🏺 إماراتي/خليجي تراثي</option>
        <option value="caricature" data-i18n="portraitStyleCaricature">🧑‍🎨 كاريكاتير</option>
        <option value="cinematic" data-i18n="portraitStyleCinematic">🖤 سينمائي دراماتيكي</option>
        <option value="disney" data-i18n="portraitStyleDisney">🌸 ديزني/بيكسار 3D</option>
        <option value="flat" data-i18n="portraitStyleFlat">🧊 فيكتور مسطح</option>
        <option value="fantasy" data-i18n="portraitStyleFantasy">🧙 فانتازيا ملحمية</option>
        <option value="western" data-i18n="portraitStyleWestern">🤠 وسترن قديم</option>
        <option value="cyberpunk" data-i18n="portraitStyleCyberpunk">🚀 سايبربانك نيون</option>
        <option value="abstract" data-i18n="portraitStyleAbstract">🎭 فن تجريدي</option>
        <option value="watercolor" data-i18n="portraitStyleWatercolor">🖌️ ألوان مائية</option>
        <option value="ottoman" data-i18n="portraitStyleOttoman">🗿 منمنمات إسلامية</option>
        <option value="gameposter" data-i18n="portraitStyleGamePoster">🎮 بوستر شخصية لعبة</option>
        <option value="newspaper" data-i18n="portraitStyleNewspaper">📰 كاريكاتير صحفي قديم</option>
        <option value="horror" data-i18n="portraitStyleHorror">🧛 رعب/هالوين</option>
        <option value="shonen" data-i18n="portraitStyleShonen">🐉 أنيمي حركة شونين</option>
        <option value="royal" data-i18n="portraitStyleRoyal">👑 لوحة كلاسيكية تاريخية</option>
        <option value="calligraphy" data-i18n="portraitStyleCalligraphy">🧵 خط عربي زخرفي</option>
        <option value="removebg" data-i18n="portraitStyleRemoveBg">🖼️ إزالة الخلفية + خلفية جاهزة</option>
        <option value="linkedin" data-i18n="portraitStyleLinkedin">👔 صورة شخصية احترافية (LinkedIn/CV)</option>
        <option value="beautify" data-i18n="portraitStyleBeautify">✨ فلاتر تجميل خفيفة</option>
        <option value="eid" data-i18n="portraitStyleEid">🌙 إطار عيد</option>
        <option value="national" data-i18n="portraitStyleNational">🇦🇪 إطار وطني</option>
        <option value="ramadan" data-i18n="portraitStyleRamadan">🕌 إطار رمضان</option>
        <option value="ageshift" data-i18n="portraitStyleAgeShift">🕰️ تصغير/تكبير العمر</option>
        <option value="sportshero" data-i18n="portraitStyleSportsHero">🏆 رياضي/بطل</option>
        <option value="hairstyle" data-i18n="portraitStyleHairstyle">💇 تسريحة/لون شعر جديد</option>
        <option value="wedding" data-i18n="portraitStyleWedding">💍 ستايل زفاف</option>
        <option value="graduation" data-i18n="portraitStyleGraduation">🎓 ستايل تخرج</option>
        <option value="adposter" data-i18n="portraitStyleAdPoster">📢 بوستر إعلاني شخصي</option>
        <option value="timeshift" data-i18n="portraitStyleTimeShift">🕰️ صورة بزمن مختلف</option>
        <option value="familystyle" data-i18n="portraitStyleFamily">👨‍👩‍👧‍👦 ستايل عائلي موحّد</option>
        <option value="merge2" data-i18n="portraitStyleMerge2">🧑‍🤝‍🧑 دمج شخصين بصورة واحدة</option>
        <option value="avatargif" data-i18n="portraitStyleAvatarGif">🎞️ أفاتار متحرك بسيط (GIF)</option>
        <optgroup label="🛠️ أدوات عملية" data-i18n="[label]portraitGrpTools">
        <option value="passport" data-i18n="portraitStylePassport">🫎 صورة جواز/هوية رسمية</option>
        <option value="restore" data-i18n="portraitStyleRestore">🔧 ترميم صورة قديمة</option>
        <option value="colorize" data-i18n="portraitStyleColorize">🎨 تلوين أبيض وأسود</option>
        <option value="upscale" data-i18n="portraitStyleUpscale">🔍 رفع الدقة والوضوح</option>
        <option value="objectremove" data-i18n="portraitStyleObjectremove">🧹 إزالة شخص أو عنصر</option>
        <option value="outfit" data-i18n="portraitStyleOutfit">👕 تبديل الملابس</option>
        <option value="productshot" data-i18n="portraitStyleProductshot">📦 تصوير منتج احترافي</option>
        </optgroup>
        <optgroup label="🎉 مناسبات" data-i18n="[label]portraitGrpOccasions">
        <option value="hajj" data-i18n="portraitStyleHajj">🕋 تهنئة حج وعمرة</option>
        <option value="birthday" data-i18n="portraitStyleBirthday">🎂 إطار عيد ميلاد</option>
        <option value="newborn" data-i18n="portraitStyleNewborn">👶 تهنئة مولود جديد</option>
        </optgroup>
        <optgroup label="🆕 ستايلات جديدة" data-i18n="[label]portraitGrpNew">
        <option value="claymation" data-i18n="portraitStyleClaymation">🏺 صلصال متحرك (كلاي)</option>
        <option value="lowpoly" data-i18n="portraitStyleLowpoly">🔷 ثلاثي الأبعاد هندسي (Low Poly)</option>
        <option value="graffiti" data-i18n="portraitStyleGraffiti">🎨 جرافيتي شوارع</option>
        <option value="mosaic" data-i18n="portraitStyleMosaic">🧩 فسيفساء</option>
        <option value="stainedglass" data-i18n="portraitStyleStainedglass">🪟 زجاج معشّق</option>
        <option value="papercraft" data-i18n="portraitStylePapercraft">📄 فن الورق الطبقي</option>
        <option value="crochet" data-i18n="portraitStyleCrochet">🧶 دمية كروشيه</option>
        <option value="inflatable" data-i18n="portraitStyleInflatable">🎈 مجسّم بالون لامع</option>
        <option value="ukiyoe" data-i18n="portraitStyleUkiyoe">🌊 طباعة يابانية قديمة</option>
        <option value="sandart" data-i18n="portraitStyleSandart">🏜️ رسم بالرمل الخليجي</option>
        <option value="neonsign" data-i18n="portraitStyleNeonsign">💡 نيون مضيء</option>
        <option value="doubleexposure" data-i18n="portraitStyleDoubleexposure">🌆 تعريض مزدوج فني</option>
        </optgroup>
        <optgroup label="🔥 رائجة" data-i18n="[label]portraitGrpTrending">
        <option value="figurine" data-i18n="portraitStyleFigurine">🧸 مجسّم أكشن في علبة</option>
        <option value="ghibli" data-i18n="portraitStyleGhibli">🍃 ستايل جيبلي</option>
        <option value="lego" data-i18n="portraitStyleLego">🧱 شخصية ليغو</option>
        <option value="stickerpack" data-i18n="portraitStyleStickerpack">💬 ملصقات واتساب (٦ تعبيرات)</option>
        <option value="chibi" data-i18n="portraitStyleChibi">🐣 شيبي لطيف</option>
        <option value="statue" data-i18n="portraitStyleStatue">🗿 تمثال رخامي</option>
        <option value="polaroid" data-i18n="portraitStylePolaroid">📸 بولارويد قديمة</option>
        <option value="celebtoon" data-i18n="portraitStyleCelebtoon">🦸 شخصية كرتونية مفضلة</option>
        </optgroup>
        <optgroup label="🎭 تلبيس" data-i18n="[label]portraitGrpDressup">
        <option value="profession" data-i18n="portraitStyleProfession">👩‍⚕️ مهنة (طبيب · طيار · شرطي...)</option>
        <option value="superhero" data-i18n="portraitStyleSuperhero">🦸‍♂️ بطل خارق بزي كامل</option>
        <option value="astronaut" data-i18n="portraitStyleAstronaut">🚀 رائد فضاء</option>
        </optgroup>
      </select>
    </div>
    <div id="portraitMultiWrap" style="margin-top:10px; display:none;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" id="portraitMultiLabel" data-i18n="portraitMultiLabelFamily">أضف صور باقي أفراد العائلة (حتى 3 صور إضافية)</label>
      <input type="file" id="portraitMultiFileInput" accept="image/*" multiple style="display:none;">
      <button type="button" class="btn" id="portraitMultiFileBtn" style="width:auto; white-space:nowrap;" data-i18n="portraitMultiChooseBtn">📁 اختيار الصور الإضافية</button>
      <div id="portraitMultiPreviewWrap" style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;"></div>
    </div>
    <div id="portraitEraWrap" style="margin-top:10px; display:none;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="portraitEraLabel">اختر الحقبة الزمنية</label>
      <select id="portraitEraSelect" style="width:100%;">
        <option value="1920s" data-i18n="portraitEra1920s">🎩 عشرينيات القرن الماضي</option>
        <option value="1950s" data-i18n="portraitEra1950s">📻 خمسينيات القرن الماضي</option>
        <option value="1980s" data-i18n="portraitEra1980s">📼 ثمانينيات القرن الماضي</option>
        <option value="1990s" data-i18n="portraitEra1990s">💿 تسعينيات القرن الماضي</option>
        <option value="medieval" data-i18n="portraitEraMedieval">🏰 العصور الوسطى</option>
        <option value="future" data-i18n="portraitEraFuture">🚀 المستقبل</option>
      </select>
    </div>
    <div id="portraitCelebWrap" style="margin-top:10px; display:none;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="portraitCelebLabel">اكتب اسم الشخصية الكرتونية المفضلة لديك</label>
      <div class="mini-mic-field-row">
      <input type="text" id="portraitCelebInput" maxlength="60" style="width:100%; padding:8px; border-radius:var(--r-2);" data-i18n-placeholder="portraitCelebPlaceholder" placeholder="مثال: بطل كرتوني مغامر بملابس ملونة">
      <button type="button" class="mini-mic-btn" data-target="portraitCelebInput" title="🎤" data-i18n-title="micTitle">🎤</button>
      </div>
      <div style="font-size: var(--fs-5); color:var(--muted); margin-top:4px;" data-i18n="portraitCelebNote">ملاحظة: أنت المسؤول عن اختيار اسم لا يخالف حقوق الملكية الفكرية.</div>
    </div>
    <div id="portraitAdWrap" style="margin-top:10px; display:none;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="portraitAdTextLabel">نص الإعلان (اختياري)</label>
      <div class="mini-mic-field-row">
      <input type="text" id="portraitAdTextInput" maxlength="60" style="width:100%; padding:8px; border-radius:var(--r-2);" data-i18n-placeholder="portraitAdTextPlaceholder" placeholder="مثال: تواصل معي للتصميم">
      <button type="button" class="mini-mic-btn" data-target="portraitAdTextInput" title="🎤" data-i18n-title="micTitle">🎤</button>
      </div>
    </div>
    <div id="portraitHairWrap" style="margin-top:10px; display:none;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="portraitHairLabel">اختر التسريحة/اللون</label>
      <select id="portraitHairSelect" style="width:100%;">
        <option value="short_black" data-i18n="portraitHairShortBlack">✂️ قصير أسود</option>
        <option value="long_wavy" data-i18n="portraitHairLongWavy">🌊 طويل مموّج</option>
        <option value="curly_afro" data-i18n="portraitHairCurly">🌀 مجعد كثيف</option>
        <option value="blonde" data-i18n="portraitHairBlonde">💛 أشقر</option>
        <option value="red" data-i18n="portraitHairRed">❤️ أحمر ناري</option>
        <option value="silver" data-i18n="portraitHairSilver">🩶 فضي/رمادي</option>
        <option value="bald" data-i18n="portraitHairBald">🧑‍🦲 حليق تمامًا</option>
        <option value="mohawk" data-i18n="portraitHairMohawk">🎸 موهوك</option>
        <option value="beard_full" data-i18n="portraitHairBeard">🧔 لحية كاملة</option>
      </select>
    </div>
    <div id="portraitAgeWrap" style="margin-top:10px; display:none;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="portraitAgeLabel">اختر التغيير</label>
      <select id="portraitAgeSelect" style="width:100%;">
        <option value="younger_child" data-i18n="portraitAgeChild">👶 طفل صغير</option>
        <option value="younger_teen" data-i18n="portraitAgeTeen">🧒 مراهق</option>
        <option value="younger_20s" data-i18n="portraitAgeYoung" selected>🧑 أصغر بعشرين سنة</option>
        <option value="older_middle" data-i18n="portraitAgeMiddle">🧔 منتصف العمر</option>
        <option value="older_senior" data-i18n="portraitAgeSenior">👴 كبير في السن</option>
      </select>
    </div>
    <div id="portraitBeautifyWrap" style="margin-top:10px; display:none;">
      <label style="display:flex; align-items:center; gap:8px; font-size: var(--fs-3); margin-bottom:6px;">
        <input type="checkbox" id="portraitBeautifySkin" checked> <span data-i18n="portraitBeautifySkin">🧴 تنعيم البشرة</span>
      </label>
      <label style="display:flex; align-items:center; gap:8px; font-size: var(--fs-3); margin-bottom:6px;">
        <input type="checkbox" id="portraitBeautifyLight" checked> <span data-i18n="portraitBeautifyLight">💡 تحسين الإضاءة</span>
      </label>
      <label style="display:flex; align-items:center; gap:8px; font-size: var(--fs-3); margin-bottom:6px;">
        <input type="checkbox" id="portraitBeautifyTeeth" checked> <span data-i18n="portraitBeautifyTeeth">😁 تبييض الأسنان</span>
      </label>
    </div>
    <div id="portraitRemoveWrap" style="margin-top:10px; display:none;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="rmWhatLabel">ماذا تريد إزالته من الصورة؟</label>
      <input type="text" id="portraitRemoveInput" maxlength="80" style="width:100%; padding:8px; border-radius:var(--r-2);" placeholder="مثال: الشخص الذي خلفي · السيارة · العمود" data-i18n-placeholder="rmWhatPh">
    </div>
    <div id="portraitOutfitWrap" style="margin-top:10px; display:none;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="pickOutfitLabel">اختر الملابس</label>
      <select id="portraitOutfitSelect" style="width:100%;">
        <option value="kandura" data-i18n="portraitOutfitKandura">👔 كندورة إماراتية + غترة</option>
        <option value="abaya" data-i18n="portraitOutfitAbaya">🧕 عباية + شيلة</option>
        <option value="thobe" data-i18n="portraitOutfitThobe">🧣 ثوب خليجي + شماغ</option>
        <option value="suit" data-i18n="portraitOutfitSuit">🧵 بدلة رسمية</option>
        <option value="dress" data-i18n="portraitOutfitDress">👗 فستان سهرة</option>
        <option value="casual" data-i18n="portraitOutfitCasual">🧥 كاجوال أنيق</option>
        <option value="sport" data-i18n="portraitOutfitSport">🎽️ ملابس رياضية</option>
        <option value="winter" data-i18n="portraitOutfitWinter">🧤 معطف شتوي</option>
      </select>
    </div>
    <div id="portraitProfWrap" style="margin-top:10px; display:none;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="pickProfessionLabel">اختر المهنة</label>
      <select id="portraitProfSelect" style="width:100%;">
        <option value="doctor" data-i18n="portraitProfDoctor">👩‍⚕️ طبيب</option>
        <option value="pilot" data-i18n="portraitProfPilot">🧑‍✈️ طيار</option>
        <option value="police" data-i18n="portraitProfPolice">👮 شرطي</option>
        <option value="chef" data-i18n="portraitProfChef">🧑‍🍳 طبّاخ</option>
        <option value="engineer" data-i18n="portraitProfEngineer">👷 مهندس موقع</option>
        <option value="teacher" data-i18n="portraitProfTeacher">🧑‍🏫 معلم</option>
        <option value="firefighter" data-i18n="portraitProfFirefighter">🧑‍🚒 إطفائي</option>
        <option value="scientist" data-i18n="portraitProfScientist">🧑‍🔬 عالم مختبر</option>
      </select>
    </div>
    <div id="portraitBackdropWrap" style="margin-top:10px; display:none;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="portraitBackdropLabel">اختر الخلفية</label>
      <select id="portraitBackdropSelect" style="width:100%;">
        <option value="studio_white" data-i18n="portraitBackdropWhite">⬜ استوديو أبيض</option>
        <option value="studio_gray" data-i18n="portraitBackdropGray">🌫️ استوديو رمادي</option>
        <option value="studio_black" data-i18n="portraitBackdropBlack">⬛ استوديو أسود</option>
        <option value="gradient_blue" data-i18n="portraitBackdropBlue">🔵 تدرج أزرق</option>
        <option value="gradient_sunset" data-i18n="portraitBackdropSunset">🌇 تدرج غروب</option>
        <option value="nature_park" data-i18n="portraitBackdropPark">🌳 حديقة طبيعية</option>
        <option value="beach" data-i18n="portraitBackdropBeach">🏖️ شاطئ بحر</option>
        <option value="city_night" data-i18n="portraitBackdropCity">🌃 مدينة ليلاً</option>
        <option value="office" data-i18n="portraitBackdropOffice">🏢 مكتب عمل</option>
        <option value="marble" data-i18n="portraitBackdropMarble">🏛️ رخام فاخر</option>
      </select>
    </div>

    <button type="button" class="btn primary" id="portraitStyleGenerateBtn" style="width:100%; margin-top:14px;" data-i18n="portraitGenerateBtn">✨ حوّلها</button>

    <div id="portraitStyleStatus" style="display:none; margin-top:14px; text-align:center; font-size: var(--fs-3); color:var(--muted);"></div>
    <div id="portraitCompareWrap" style="display:none; position:relative; margin-top:14px; border-radius:var(--r-2); overflow:hidden; background:#000; width:100%; user-select:none;">
      <img id="portraitCompareBefore" style="display:block; width:100%;">
      <div id="portraitCompareAfterWrap" style="position:absolute; top:0; left:0; height:100%; overflow:hidden; width:50%;">
        <img id="portraitStyleResult" style="position:absolute; top:0; left:0; height:100%;">
      </div>
      <div id="portraitCompareDivider" style="position:absolute; top:0; bottom:0; left:50%; width:2px; margin-left:-1px; background:#fff; box-shadow:0 0 6px rgba(0,0,0,.7); pointer-events:none;"></div>
      <span style="position:absolute; top:6px; left:8px; font-size: var(--fs-5); background:rgba(0,0,0,.55); color:#fff; padding:2px 7px; border-radius:var(--r-1);" data-i18n="portraitCompareBeforeLabel">قبل</span>
      <span style="position:absolute; top:6px; right:8px; font-size: var(--fs-5); background:rgba(0,0,0,.55); color:#fff; padding:2px 7px; border-radius:var(--r-1);" data-i18n="portraitCompareAfterLabel">بعد</span>
    </div>
    <input type="range" id="portraitCompareSlider" min="0" max="100" value="50" style="width:100%; margin-top:8px; display:none;">
    <a id="portraitStyleDownloadLink" style="display:none; margin-top:8px; text-align:center;" class="btn primary" download="omran-portrait-style.png" data-i18n="portraitDownloadBtn">⬇️ تحميل الصورة</a>
    <button type="button" id="portraitShareBtn" style="display:none; margin-top:8px; width:100%;" class="btn" data-i18n="portraitShareBtn">↗️ مشاركة (واتساب/ستوري)</button>
  </div>
</div>

<div id="fashionAiModal" style="position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.7); display:none; align-items:center; justify-content:center; padding:20px;">
  <div style="max-width:520px; width:100%; max-height:90vh; overflow-y:auto; background:var(--panel,#1a1a1a); border-radius:var(--r-4); padding:26px; box-shadow:var(--sh-3);">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <h3 style="margin:0;" data-i18n="fashionAiModalTitle">👗 تصميم أزياء بالذكاء الاصطناعي</h3>
      <button type="button" class="btn iconBtn" id="fashionAiCloseBtn" style="padding:4px 10px;">✕</button>
    </div>
    <p style="font-size:12.5px; color:var(--muted); margin-top:2px;" data-i18n="fashionAiDesc">اختر: ارفع صورة وغيّر الزي، أو اكتب وصف تصميم واتركه يبتكر صورة من الصفر. ميزة قيد التجربة بحد أقصى قليل يوميًا لكل حساب.</p>

    <div style="display:flex; gap:8px; margin-top:12px;">
      <button type="button" class="btn primary" id="fashionAiTabImage" style="flex:1;" data-i18n="fashionAiTabImage">📷 من صورة</button>
      <button type="button" class="btn" id="fashionAiTabText" style="flex:1;" data-i18n="fashionAiTabText">✍️ من وصف نصي</button>
    </div>

    <div id="fashionAiImagePane">
      <input type="file" id="fashionAiFileInput" accept="image/*" style="display:none;">
      <div style="display:flex; align-items:center; gap:10px; margin-top:12px;">
        <button type="button" class="btn" id="fashionAiFileBtn" style="width:auto; white-space:nowrap;" data-i18n="fileChooseBtn">📁 اختيار ملف</button>
        <span id="fashionAiFileName" style="font-size:12px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" data-i18n="fileNoneChosen">لم يتم اختيار ملف</span>
      </div>
      <img id="fashionAiSourcePreview" style="display:none; width:100%; margin-top:10px; border-radius:var(--r-2); max-height:220px; object-fit:contain; background:#000;">
    </div>

    <div id="fashionAiTextPane" style="display:none;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px; margin-top:12px;" data-i18n="fashionAiDescLabel">وصف التصميم</label>
      <div class="mini-mic-field-row">
      <textarea id="fashionAiDescription" rows="3" style="width:100%; resize:vertical;" data-i18n-placeholder="fashionAiDescPlaceholder" placeholder="مثال: فستان سهرة أزرق طويل بأكمام مطرزة"></textarea>
      <button type="button" class="mini-mic-btn" data-target="fashionAiDescription" title="🎤" data-i18n-title="micTitle">🎤</button>
      </div>
    </div>

    <details style="margin-top:12px; border:1px solid var(--border,#333); border-radius:var(--r-2); padding:6px 10px;">
      <summary style="cursor:pointer; font-size:12.5px; color:var(--muted);" data-i18n="fashionProfileTitle">👤 ملفي (المقاسات)</summary>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px;">
        <div>
          <label style="font-size: var(--fs-5); color:var(--muted); display:block; margin-bottom:3px;" data-i18n="fashionProfileHeight">الطول (سم)</label>
          <input type="number" id="fashionProfileHeight" style="width:100%;" min="100" max="230">
        </div>
        <div>
          <label style="font-size: var(--fs-5); color:var(--muted); display:block; margin-bottom:3px;" data-i18n="fashionProfileWeight">الوزن (كغ)</label>
          <input type="number" id="fashionProfileWeight" style="width:100%;" min="30" max="200">
        </div>
        <div>
          <label style="font-size: var(--fs-5); color:var(--muted); display:block; margin-bottom:3px;" data-i18n="fashionProfileSkin">لون البشرة</label>
          <input type="text" id="fashionProfileSkin" style="width:100%;">
        </div>
        <div>
          <label style="font-size: var(--fs-5); color:var(--muted); display:block; margin-bottom:3px;" data-i18n="fashionProfileHair">لون الشعر</label>
          <input type="text" id="fashionProfileHair" style="width:100%;">
        </div>
      </div>
      <button type="button" class="btn" id="fashionProfileSaveBtn" style="width:100%; margin-top:8px;" data-i18n="fashionProfileSave">💾 حفظ الملف</button>
    </details>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px;">
      <div>
        <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="fashionOccasionLabel">📅 المناسبة</label>
        <select id="fashionAiOccasion" style="width:100%;">
          <option value="wedding" data-i18n="fashionOccasionWedding">💍 زفاف</option>
          <option value="work" data-i18n="fashionOccasionWork">💼 عمل</option>
          <option value="casual" selected data-i18n="fashionOccasionCasual">👕 كاجوال</option>
          <option value="sport" data-i18n="fashionOccasionSport">🏃 رياضة</option>
          <option value="travel" data-i18n="fashionOccasionTravel">✈️ سفر</option>
          <option value="formal" data-i18n="fashionOccasionFormal">🎩 رسمية</option>
          <option value="graduation" data-en="🎓 Graduation" data-i18n="fashionAiOccasionGraduation">🎓 تخرج</option>
          <option value="religious" data-en="🕌 Religious" data-i18n="fashionAiOccasionReligious">🕌 مناسبة دينية</option>
        </select>
      </div>
      <div>
        <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="fashionSeasonLabel">🌦️ الموسم</label>
        <select id="fashionAiSeason" style="width:100%;">
          <option value="summer" data-i18n="fashionSeasonSummer">☀️ صيفي</option>
          <option value="autumn" data-en="🍂 Autumn" data-i18n="fashionAiSeasonAutumn">🍂 خريفي</option>
          <option value="winter" data-i18n="fashionSeasonWinter">❄️ شتوي</option>
          <option value="spring" data-en="🌸 Spring" data-i18n="fashionAiSeasonSpring">🌸 ربيعي</option>
        </select>
      </div>
    </div>

    <button type="button" class="btn" id="fashionAiSuggestBtn" style="width:100%; margin-top:10px;" data-i18n="fashionSuggestBtn">💡 اقترح لي إطلالة</button>
    <div id="fashionAiSuggestions" style="display:none; margin-top:10px; display:flex; flex-direction:column; gap:8px;"></div>

    <div style="margin-top:12px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="fashionAiStyleLabel">النمط/المناسبة</label>
      <select id="fashionAiStyle" style="width:100%;">
        <option value="evening" data-i18n="fashionAiStyleEvening">✨ سهرة</option>
        <option value="formal" data-i18n="fashionAiStyleFormal">👔 رسمي</option>
        <option value="casual" data-i18n="fashionAiStyleCasual">👕 كاجوال</option>
        <option value="abaya" data-i18n="fashionAiStyleAbaya">🖤 عباية</option>
        <option value="wedding" data-i18n="fashionAiStyleWedding">💍 فستان زفاف</option>
        <option value="traditional" data-i18n="fashionAiStyleTraditional">🌴 خليجي تقليدي</option>
      </select>
    </div>

    <label style="display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--muted); margin-top:10px; cursor:pointer;">
      <input type="checkbox" id="fashionAiMultiAngle">
      <span data-i18n="fashionMultiAngleLabel">🕶️ عرض من زوايا متعددة (أمام / جانب / خلف)</span>
    </label>

    <button type="button" class="btn primary" id="fashionAiGenerateBtn" style="width:100%; margin-top:14px;" data-i18n="fashionAiGenerateBtn">✨ صمم التصميم</button>

    <div id="fashionAiStatus" style="display:none; margin-top:14px; text-align:center; font-size: var(--fs-3); color:var(--muted);"></div>

    <div id="fashionAiResultWrap" style="display:none; position:relative; margin-top:14px; border-radius:var(--r-2); overflow:hidden; background:#000;">
      <img id="fashionAiResult" style="display:block; width:100%; border-radius:var(--r-2); background:#000;">
      <div id="fashionAiBeforeWrap" style="display:none; position:absolute; top:0; left:0; height:100%; overflow:hidden; border-right:2px solid #fff;">
        <img id="fashionAiBeforeImg" style="display:block; height:100%; max-width:none;">
      </div>
      <input type="range" id="fashionAiSliderRange" min="0" max="100" value="50" style="display:none; position:absolute; bottom:8px; left:8px; right:8px; width:calc(100% - 16px); z-index:5;">
    </div>
    <a id="fashionAiDownloadLink" style="display:none; margin-top:8px; text-align:center;" class="btn primary" download="omran-fashion-ai.png" data-i18n="fashionAiDownloadBtn">⬇️ تحميل الصورة</a>
    <button type="button" class="btn" id="fashionAiFavoriteSaveBtn" style="display:none; width:100%; margin-top:8px;" data-i18n="fashionFavoriteSaveBtn">🤍 حفظ في المفضلة</button>

    <hr style="border-color:var(--border,#333); margin:16px 0;">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <strong style="font-size:13px;" data-i18n="fashionCompareTitle">📊 قارن بين إطلالات</strong>
      <button type="button" class="btn" id="fashionAiFavoritesBtn" style="padding:4px 10px; font-size:12px;" data-i18n="fashionFavoritesBtn">❤️ المفضلة</button>
    </div>
    <p style="font-size: var(--fs-5); color:var(--muted); margin:4px 0 8px;" data-i18n="fashionCompareHint">اختر إطلالتين أو ثلاث لمقارنتها جنبًا إلى جنب</p>
    <div id="fashionAiCompareChecks" style="display:flex; flex-wrap:wrap; gap:6px;"></div>
    <button type="button" class="btn" id="fashionAiCompareBtn" style="width:100%; margin-top:8px;" data-i18n="fashionCompareBtn">📊 قارن الإطلالات</button>
    <div id="fashionAiCompareStatus" style="display:none; margin-top:10px; text-align:center; font-size: var(--fs-3); color:var(--muted);"></div>
    <div id="fashionAiCompareResults" style="display:none; margin-top:10px; display:grid; grid-template-columns:1fr 1fr; gap:8px;"></div>

    <div id="fashionAiFavoritesPanel" style="display:none; margin-top:10px; flex-direction:column; gap:8px;"></div>
  </div>
</div>

<div id="studioAiModal" style="position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.7); display:none; align-items:center; justify-content:center; padding:20px;">
  <div style="max-width:460px; width:100%; max-height:90vh; overflow-y:auto; background:var(--panel,#1a1a1a); border-radius:var(--r-4); padding:26px; box-shadow:var(--sh-3);">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <h3 style="margin:0;" data-i18n="studioAiModalTitle">💄 ستايل الذكاء الاصطناعي</h3>
      <button type="button" class="btn iconBtn" id="studioAiCloseBtn" style="padding:4px 10px;">✕</button>
    </div>
    <p style="font-size:12.5px; color:var(--muted); margin-top:2px;" data-i18n="studioAiDesc">اختر ميزة، ارفع صورتك (أو صورتين للدمج)، واختر الخيار المناسب. ميزة قيد التجربة بحد أقصى قليل يوميًا لكل حساب.</p>

    <div id="studioAiTabs" style="display:flex; gap:6px; overflow-x:auto; margin-top:12px; padding-bottom:4px;">
      <button type="button" class="btn studioAiTabBtn active" data-feature="hair" style="white-space:nowrap;" data-i18n="studioAiTabHair">💇 الشعر</button>
      <button type="button" class="btn studioAiTabBtn" data-feature="nails" style="white-space:nowrap;" data-i18n="studioAiTabNails">💅 الأظافر</button>
      <button type="button" class="btn studioAiTabBtn" data-feature="makeup" style="white-space:nowrap;" data-i18n="studioAiTabMakeup">💄 مكياج</button>
      <button type="button" class="btn studioAiTabBtn" data-feature="beard" style="white-space:nowrap;" data-i18n="studioAiTabBeard">🧔 لحية</button>
      <button type="button" class="btn studioAiTabBtn" data-feature="skin" style="white-space:nowrap;" data-i18n="studioAiTabSkin">✨ بشرة</button>
      <button type="button" class="btn studioAiTabBtn" data-feature="glasses" style="white-space:nowrap;" data-i18n="studioAiTabGlasses">👓 نظارات</button>
      <button type="button" class="btn studioAiTabBtn" data-feature="tattoo" style="white-space:nowrap;" data-i18n="studioAiTabTattoo">🎨 تاتو</button>
      <button type="button" class="btn studioAiTabBtn" data-feature="anime" style="white-space:nowrap;" data-i18n="studioAiTabAnime">🎭 أنمي</button>
      <button type="button" class="btn studioAiTabBtn" data-feature="heritage" style="white-space:nowrap;" data-i18n="studioAiTabHeritage">🏛️ تراثي/تقليدي</button>
      <button type="button" class="btn studioAiTabBtn" data-feature="merge" style="white-space:nowrap;" data-i18n="studioAiTabMerge">🖼️ دمج صور</button>
    </div>

    <details style="margin-top:12px; border:1px solid var(--border,#333); border-radius:var(--r-2); padding:6px 10px;">
      <summary style="cursor:pointer; font-size:12.5px; color:var(--muted);" data-i18n="studioProfileTitle">👤 بروفايل الوجه (اختياري)</summary>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px;">
        <div>
          <label style="font-size: var(--fs-5); color:var(--muted); display:block; margin-bottom:3px;" data-i18n="studioProfileFaceShape">شكل الوجه</label>
          <input type="text" id="studioProfileFaceShape" style="width:100%;">
        </div>
        <div>
          <label style="font-size: var(--fs-5); color:var(--muted); display:block; margin-bottom:3px;" data-i18n="studioProfileSkin">لون البشرة</label>
          <input type="text" id="studioProfileSkin" style="width:100%;">
        </div>
        <div>
          <label style="font-size: var(--fs-5); color:var(--muted); display:block; margin-bottom:3px;" data-i18n="studioProfileHair">لون الشعر</label>
          <input type="text" id="studioProfileHair" style="width:100%;">
        </div>
      </div>
      <button type="button" class="btn" id="studioProfileSaveBtn" style="width:100%; margin-top:8px;" data-i18n="studioProfileSave">💾 حفظ البروفايل</button>
    </details>

    <div style="margin-top:12px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="studioOccasionLabel">📅 المناسبة (اختياري)</label>
      <select id="studioAiOccasion" style="width:100%;">
        <option value="daily" selected data-i18n="studioOccasionDaily">☀️ يومي</option>
        <option value="work" data-i18n="studioOccasionWork">💼 عمل</option>
        <option value="evening" data-i18n="studioOccasionEvening">✨ سهرة</option>
        <option value="wedding" data-i18n="studioOccasionWedding">💍 عرس</option>
        <option value="sport" data-i18n="studioOccasionSport">🏃 رياضة</option>
      </select>
    </div>

    <button type="button" class="btn" id="studioAiSuggestBtn" style="width:100%; margin-top:10px;" data-i18n="studioSuggestBtn">💡 اقترح لي ستايل</button>
    <div id="studioAiSuggestions" style="display:none; margin-top:10px; display:flex; flex-direction:column; gap:8px;"></div>

    <div id="studioAiImageAWrap" style="margin-top:14px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" id="studioAiImageALabelEl" data-i18n="studioAiImageALabel">الصورة الأولى</label>
      <input type="file" id="studioAiFileInputA" accept="image/*" style="display:none;">
      <div style="display:flex; align-items:center; gap:8px;">
        <button type="button" class="btn" id="studioAiFileBtnA" style="width:auto; white-space:nowrap;" data-i18n="fileChooseBtn">📁 اختيار ملف</button>
        <span id="studioAiFileNameA" style="font-size:12px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" data-i18n="fileNoneChosen">لم يتم اختيار ملف</span>
      </div>
      <img id="studioAiSourcePreviewA" style="display:none; width:100%; margin-top:8px; border-radius:var(--r-2); max-height:180px; object-fit:contain; background:#000;">
    </div>

    <div id="studioAiImageBWrap" style="display:none; margin-top:14px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="studioAiImageBLabel">الصورة الثانية</label>
      <input type="file" id="studioAiFileInputB" accept="image/*" style="display:none;">
      <div style="display:flex; align-items:center; gap:8px;">
        <button type="button" class="btn" id="studioAiFileBtnB" style="width:auto; white-space:nowrap;" data-i18n="fileChooseBtn">📁 اختيار ملف</button>
        <span id="studioAiFileNameB" style="font-size:12px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" data-i18n="fileNoneChosen">لم يتم اختيار ملف</span>
      </div>
      <img id="studioAiSourcePreviewB" style="display:none; width:100%; margin-top:8px; border-radius:var(--r-2); max-height:180px; object-fit:contain; background:#000;">
    </div>

    <div id="studioAiStyleWrap" style="margin-top:14px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="studioAiStyleLabel">اختر الخيار</label>
      <select id="studioAiStyle" style="width:100%;"></select>
    </div>

    <div style="margin-top:12px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="studioAiDescLabel">وصف إضافي (اختياري)</label>
      <div class="mini-mic-field-row">
      <textarea id="studioAiDescription" rows="2" style="width:100%; resize:vertical;" data-i18n-placeholder="studioAiDescPlaceholder" placeholder="أضف تفاصيل إضافية إذا أردت..."></textarea>
      <button type="button" class="mini-mic-btn" data-target="studioAiDescription" title="🎤" data-i18n-title="micTitle">🎤</button>
      </div>
    </div>

    <label style="display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--muted); margin-top:10px; cursor:pointer;">
      <input type="checkbox" id="studioAiMultiAngle">
      <span data-i18n="studioMultiAngleLabel">🕶️ عرض من زوايا متعددة (أمام / جانب / خلف)</span>
    </label>

    <button type="button" class="btn primary" id="studioAiGenerateBtn" style="width:100%; margin-top:14px;" data-i18n="studioAiGenerateBtn">✨ ولّد الصورة</button>

    <div id="studioAiHeritageCompareWrap" style="display:none; margin-top:8px;">
      <button type="button" class="btn" id="studioAiHeritageCompareBtn" style="width:100%;" data-i18n="studioHeritageCompareBtn">📊 قارن كاجوال ⟷ رسمي</button>
      <div id="studioAiHeritageCompareStatus" style="display:none; margin-top:8px; text-align:center; font-size: var(--fs-3); color:var(--muted);"></div>
      <div id="studioAiHeritageCompareResults" style="display:none; margin-top:8px; display:grid; grid-template-columns:1fr 1fr; gap:8px;"></div>
    </div>

    <div id="studioAiStatus" style="display:none; margin-top:14px; text-align:center; font-size: var(--fs-3); color:var(--muted);"></div>

    <div id="studioAiResultWrap" style="display:none; position:relative; margin-top:14px; border-radius:var(--r-2); overflow:hidden; background:#000;">
      <img id="studioAiResult" style="display:block; width:100%; border-radius:var(--r-2); background:#000;">
      <div id="studioAiBeforeWrap" style="display:none; position:absolute; top:0; left:0; height:100%; overflow:hidden; border-right:2px solid #fff;">
        <img id="studioAiBeforeImg" style="display:block; height:100%; max-width:none;">
      </div>
      <input type="range" id="studioAiSliderRange" min="0" max="100" value="50" style="display:none; position:absolute; bottom:8px; left:8px; right:8px; width:calc(100% - 16px); z-index:5;">
    </div>

    <a id="studioAiDownloadLink" style="display:none; margin-top:8px; text-align:center;" class="btn primary" download="omran-studio-ai.png" data-i18n="studioAiDownloadBtn">⬇️ تحميل الصورة</a>
    <button type="button" class="btn" id="studioAiFavoriteSaveBtn" style="display:none; width:100%; margin-top:8px;" data-i18n="studioFavoriteSaveBtn">🤍 حفظ في المفضلة</button>

    <hr style="border-color:var(--border,#333); margin:16px 0;">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <strong style="font-size:13px;" data-i18n="studioCompareTitle">📊 قارن بين ستايلات</strong>
      <button type="button" class="btn" id="studioAiFavoritesBtn" style="padding:4px 10px; font-size:12px;" data-i18n="studioFavoritesBtn">❤️ المفضلة</button>
    </div>
    <p style="font-size: var(--fs-5); color:var(--muted); margin:4px 0 8px;" data-i18n="studioCompareHint">اختر ستايلين أو ثلاثة لمقارنتها جنبًا إلى جنب</p>
    <div id="studioAiCompareChecks" style="display:flex; flex-wrap:wrap; gap:6px;"></div>
    <button type="button" class="btn" id="studioAiCompareBtn" style="width:100%; margin-top:8px;" data-i18n="studioCompareBtn">📊 قارن الستايلات</button>
    <div id="studioAiCompareStatus" style="display:none; margin-top:10px; text-align:center; font-size: var(--fs-3); color:var(--muted);"></div>
    <div id="studioAiCompareResults" style="display:none; margin-top:10px; display:grid; grid-template-columns:1fr 1fr; gap:8px;"></div>

    <div id="studioAiFavoritesPanel" style="display:none; margin-top:10px; flex-direction:column; gap:8px;"></div>
  </div>
</div>

<div id="religionModal" style="position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.7); display:none; align-items:center; justify-content:center; padding:20px;">
  <div style="max-width:520px; width:100%; max-height:90vh; overflow-y:auto; background:var(--panel,#1a1a1a); border-radius:var(--r-4); padding:26px; box-shadow:var(--sh-3);">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <h3 style="margin:0;" data-i18n="religionModalTitle">🕌 التفسير الديني</h3>
      <button type="button" class="btn iconBtn" id="religionCloseBtn" style="padding:4px 10px;">✕</button>
    </div>

    <div id="religionTabs" style="display:flex; gap:6px; overflow-x:auto; margin-top:12px; padding-bottom:4px;">
      <button type="button" class="btn religionTabBtn active" data-tool="verse" style="white-space:nowrap;" data-i18n="religionTabVerse">🕌 تفسير آية</button>
      <button type="button" class="btn religionTabBtn" data-tool="hadith" style="white-space:nowrap;" data-i18n="religionTabHadith">📖 بحث حديث</button>
      <button type="button" class="btn religionTabBtn" data-tool="dream" style="white-space:nowrap;" data-i18n="religionTabDream">🌙 تفسير الأحلام</button>
    </div>

    <div style="margin-top:14px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" id="religionInputLabel" data-i18n="religionInputLabelVerse">اكتب الآية أو رقمها (مثال: البقرة 255)</label>
      <div class="mini-mic-field-row">
      <textarea id="religionInput" rows="3" style="width:100%; resize:vertical;" data-i18n-placeholder="religionInputPlaceholderVerse" placeholder="مثال: سورة البقرة آية 255 (آية الكرسي)"></textarea>
      <button type="button" class="mini-mic-btn" data-target="religionInput" title="🎤" data-i18n-title="micTitle">🎤</button>
      </div>
    </div>

    <button type="button" class="btn primary" id="religionGenerateBtn" style="width:100%; margin-top:14px;" data-i18n="religionGenerateBtn">✨ فسّر</button>

    <div id="religionStatus" style="display:none; margin-top:14px; text-align:center; font-size: var(--fs-3); color:var(--muted);"></div>
    <div id="religionResult" style="display:none; margin-top:14px; white-space:pre-wrap; line-height:1.9; font-size: var(--fs-3); background:var(--panel2,#111); border:1px solid var(--border,#333); border-radius:var(--r-2); padding:14px;"></div>
  </div>
</div>

<div id="emailAssistModal" style="position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.7); display:none; align-items:center; justify-content:center; padding:20px;">
  <div style="max-width:560px; width:100%; max-height:90vh; overflow-y:auto; background:var(--panel,#1a1a1a); border-radius:var(--r-4); padding:26px; box-shadow:var(--sh-3);">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <h3 style="margin:0;" id="emailAssistHeaderTitle" data-i18n="emailAssistTitle">📧 مساعد البريد الذكي</h3>
      <button type="button" class="btn iconBtn" id="emailAssistCloseBtn" style="padding:4px 10px;">✕</button>
    </div>

    <div id="emailAssistConnectBox" style="margin-top:16px; text-align:center;">
      <p id="emailAssistConnectText" style="font-size: var(--fs-3); color:var(--muted);" data-i18n="emailConnectHint">اربط حساب Gmail الخاص بك ليقرأ الذكاء الاصطناعي إيميلاتك ويقترح ردودًا جاهزة تعتمدها قبل الإرسال.</p>
      <button type="button" class="btn primary" id="emailAssistConnectBtn" data-i18n="eaConnectBtn" style="width:100%; margin-top:10px;">🔗 ربط Gmail</button>
    </div>

    <div id="emailAssistConnectedBox" style="display:none; margin-top:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
        <span id="emailAssistGmailLabel" style="font-size:12.5px; color:var(--muted);"></span>
        <button type="button" class="btn" id="emailAssistVoiceBtn" data-i18n="eaVoiceBtn" style="padding:6px 12px; font-size:12.5px;">🔊 <span id="emailAssistVoiceLabel" data-i18n="voiceSummaryBtn">ملخص صوتي</span></button>
        <button type="button" class="btn" id="emailAssistRefreshBtn" data-i18n="eaRefreshBtn" style="padding:6px 12px; font-size:12.5px;">🔄 <span id="emailAssistRefreshLabel" data-i18n="refreshBtn">تحديث</span></button>
      </div>
      <div id="emailAssistStatus" style="display:none; margin-top:14px; text-align:center; font-size: var(--fs-3); color:var(--muted);"></div>
      <div id="emailAssistList" style="margin-top:14px; display:flex; flex-direction:column; gap:14px;"></div>
    </div>
  </div>
</div>


<div id="stocksModal" style="position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.7); display:none; align-items:center; justify-content:center; padding:20px;">
  <div style="max-width:560px; width:100%; max-height:90vh; overflow-y:auto; background:var(--panel,#1a1a1a); border-radius:var(--r-4); padding:26px; box-shadow:var(--sh-3);">
    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px;">
      <h3 style="margin:0; font-size:15px; line-height:1.3;" data-i18n="stocksTitle">📈 سوق الأسهم العالمي</h3>
      <div style="display:flex; gap:6px;">
        <button type="button" class="btn iconBtn" id="stocksGlobalBtn" title="الأسواق العالمية" data-i18n-title="worldMarketsTitle" style="padding:4px 8px;">🌍</button>
        <button type="button" class="btn iconBtn" id="stocksSearchBtn" title="اختيار سهم" data-i18n-title="pickStockTitle" style="padding:4px 8px;">🔍</button>
        <button type="button" class="btn iconBtn" id="stocksLearnBtn" data-i18n-title="stocksLearnTitle" title="تعلم التداول" style="padding:4px 8px;">🎓</button>
        <button type="button" class="btn iconBtn" id="stocksFullBtn" data-i18n-title="stocksFullTitle" title="وضع شاشة البورصة" style="padding:4px 8px;">🖥️</button>
        <button type="button" class="btn iconBtn" id="stocksCloseBtn" style="padding:4px 8px;">✕</button>
      </div>
    </div>
    <p style="font-size:12.5px; color:var(--muted); margin-top:2px;" data-i18n="stocksDesc">أسعار الأسهم العالمية مع رسم بياني مباشر.</p>

    <div id="stockGlobalWrap" style="display:none; margin-top:14px;">
      <div style="font-size:14px; font-weight:500; margin-bottom:8px;" data-i18n="globalMktTitle">🌍 الأسواق العالمية</div>
      <div id="goldCard" style="display:none; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:6px;">
          <div style="font-size:13.5px; font-weight:500;" data-i18n="goldNowTitle">🥇 الذهب الآن</div>
          <div><span id="goldOz" style="font-size: var(--fs-2); font-weight: var(--w-bold);"></span> <span id="goldChg" style="font-size:12px;"></span></div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:8px; font-size: var(--fs-3); text-align:center;">
          <span>24K: <b id="goldG24"></b> AED/g</span>
          <span>22K: <b id="goldG22"></b> AED/g</span>
          <span>21K: <b id="goldG21"></b> AED/g</span>
        </div>
      </div>
      <div id="globalChips" style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
        <button type="button" class="btn" data-tv="OANDA:XAUUSD" style="padding:4px 10px; font-size:12px;">🥇 Gold</button>
        <button type="button" class="btn" data-tv="TVC:USOIL" style="padding:4px 10px; font-size:12px;">🛢️ Oil</button>
        <button type="button" class="btn" data-tv="DJ:DJI" style="padding:4px 10px; font-size:12px;">Dow Jones</button>
        <button type="button" class="btn" data-tv="NASDAQ:IXIC" style="padding:4px 10px; font-size:12px;">NASDAQ</button>
        <button type="button" class="btn" data-tv="SP:SPX" style="padding:4px 10px; font-size:12px;">S&amp;P 500</button>
        <button type="button" class="btn" data-tv="XETR:DAX" style="padding:4px 10px; font-size:12px;">DAX</button>
        <button type="button" class="btn" data-tv="BITSTAMP:BTCUSD" style="padding:4px 10px; font-size:12px;">₿ BTC</button>
        <button type="button" class="btn" data-tv="FX:EURUSD" style="padding:4px 10px; font-size:12px;">EUR/USD</button>
      </div>
      <iframe id="tvChart" style="width:100%; height:420px; border:0; border-radius:var(--r-2); background:#000;" allowtransparency="true"></iframe>
      <iframe id="tvOverview" style="width:100%; height:420px; border:0; border-radius:var(--r-2); margin-top:10px; background:transparent;" allowtransparency="true"></iframe>
    </div>

    <div id="stockSearchWrap" style="display:none;">
    <div style="display:flex; gap:8px; margin-top:12px;">
      <input id="stockSymbolInput" type="text" style="flex:1;" placeholder="مثال: AAPL أو TSLA" data-i18n-placeholder="stocksSymbolPh">
      <button type="button" class="btn primary" id="stockLoadBtn" data-i18n="stocksLoadBtn">عرض</button>
    </div>
    <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px;" id="stockChips">
      <button type="button" class="btn" data-sym="AAPL" style="padding:4px 10px; font-size:12px;">AAPL</button>
      <button type="button" class="btn" data-sym="TSLA" style="padding:4px 10px; font-size:12px;">TSLA</button>
      <button type="button" class="btn" data-sym="MSFT" style="padding:4px 10px; font-size:12px;">MSFT</button>
      <button type="button" class="btn" data-sym="NVDA" style="padding:4px 10px; font-size:12px;">NVDA</button>
      <button type="button" class="btn" data-sym="AMZN" style="padding:4px 10px; font-size:12px;">AMZN</button>
      <button type="button" class="btn" data-sym="GOOGL" style="padding:4px 10px; font-size:12px;">GOOGL</button>
      <button type="button" class="btn" data-sym="META" style="padding:4px 10px; font-size:12px;">META</button>
    </div>
    <div style="margin-top:10px;">
      <select id="stockInterval" style="width:100%;">
        <option value="1day" selected data-i18n="stocksIntDay">يومي (3 أشهر)</option>
        <option value="1h" data-i18n="stocksIntHour">كل ساعة</option>
        <option value="15min" data-i18n="stocksInt15">كل 15 دقيقة</option>
        <option value="1week" data-i18n="stocksIntWeek">أسبوعي</option>
      </select>
    </div>
    <div id="stockStatus" style="display:none; margin-top:14px; text-align:center; font-size: var(--fs-3); color:var(--muted);"></div>

    <div id="stockQuoteCard" style="display:none; margin-top:14px;">
      <div style="display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:6px;">
        <div>
          <div id="stockName" style="font-size: var(--fs-2); font-weight: var(--w-bold);"></div>
          <div id="stockExchange" style="font-size: var(--fs-5); color:var(--muted);"></div>
        </div>
        <div style="text-align:end;">
          <div id="stockPrice" style="font-size: var(--fs-1); font-weight: var(--w-bold);"></div>
          <div id="stockChange" style="font-size: var(--fs-3);"></div>
        </div>
      </div>
      <div id="stockDetails" style="display:flex; gap:14px; flex-wrap:wrap; margin-top:8px; font-size:12px; color:var(--muted);"></div>
    </div>

    <canvas id="stockChart" width="1000" height="440" style="display:none; width:100%; margin-top:14px; border-radius:var(--r-2); background:rgba(0,0,0,0.25);"></canvas>

    <div id="stockAnalyzeWrap" style="display:none; margin-top:12px;">
      <div style="display:flex; gap:8px;">
        <input id="stockQuestion" type="text" style="flex:1;" placeholder="سؤال اختياري: شرايك بالسهم؟" data-i18n-placeholder="stocksQuestionPh">
        <button type="button" class="btn primary" id="stockAnalyzeBtn" data-i18n="stocksAnalyzeBtn">🤖 حلل السهم</button>
      </div>
      <div id="stockAnalysis" style="display:none; margin-top:12px; font-size: var(--fs-3); line-height:1.8; white-space:pre-wrap; border-radius:var(--r-2); background:rgba(0,0,0,0.25); padding:14px;"></div>
    </div>
    </div>

    <div id="stockLearnWrap" style="display:none; margin-top:14px;">
      <div style="font-size:14px; font-weight:500; margin-bottom:8px;" data-i18n="stocksLearnTitle">🎓 تعلم التداول — دروس على السوق الحي</div>
      <div id="stockLearnChips" style="display:flex; gap:6px; flex-wrap:wrap;">
        <button type="button" class="btn" data-topic="ما هو السهم وكيف يعمل سوق الأسهم" style="padding:4px 10px; font-size:12px;">1️⃣ <span data-i18n="stkL1">ما هو السهم؟</span></button>
        <button type="button" class="btn" data-topic="كيف أقرأ سعر السهم: السعر، التغير، الافتتاح والإغلاق، الحجم" style="padding:4px 10px; font-size:12px;">2️⃣ <span data-i18n="stkL2">قراءة السعر</span></button>
        <button type="button" class="btn" data-topic="الشموع اليابانية وقراءة الرسم البياني" style="padding:4px 10px; font-size:12px;">3️⃣ <span data-i18n="stkL3">الشموع والشارت</span></button>
        <button type="button" class="btn" data-topic="الدعم والمقاومة وكيف أحددها" style="padding:4px 10px; font-size:12px;">4️⃣ <span data-i18n="stkL4">الدعم والمقاومة</span></button>
        <button type="button" class="btn" data-topic="مؤشر RSI: ماذا يعني التشبع الشرائي والبيعي" style="padding:4px 10px; font-size:12px;">5️⃣ RSI</button>
        <button type="button" class="btn" data-topic="مؤشر MACD وكيف أستخدمه" style="padding:4px 10px; font-size:12px;">6️⃣ MACD</button>
        <button type="button" class="btn" data-topic="المتوسطات المتحركة SMA وكيف تحدد الاتجاه" style="padding:4px 10px; font-size:12px;">7️⃣ <span data-i18n="stkL7">المتوسطات</span></button>
        <button type="button" class="btn" data-topic="إدارة المخاطر: وقف الخسارة وحجم الصفقة" style="padding:4px 10px; font-size:12px;">8️⃣ <span data-i18n="stkL8">إدارة المخاطر</span></button>
      </div>
      <div style="display:flex; gap:8px; margin-top:10px;">
        <input id="stockLearnQ" type="text" style="flex:1;" placeholder="أو اكتب سؤالك عن التداول..." data-i18n-placeholder="stocksLearnQPh">
        <button type="button" class="btn primary" id="stockLearnAskBtn" data-i18n="stocksLearnAsk">اشرح لي</button>
      </div>
      <div id="stockLesson" style="display:none; margin-top:12px; font-size: var(--fs-3); line-height:1.8; white-space:pre-wrap; border-radius:var(--r-2); background:rgba(0,0,0,0.25); padding:14px;"></div>
    </div>

    <p style="margin-top:14px; font-size:11.5px; color:var(--muted); text-align:center;" data-i18n="stocksDisclaimer">⚠️ بيانات تقريبية وقد تتأخر — ليست نصيحة استثمارية.</p>
  </div>
</div>

<style id="cxSkin">
#constructionModal .cx-head{margin:-26px -26px 16px; padding:16px 22px; background:linear-gradient(135deg,#0f766e 0%,#134e4a 100%); border-radius:var(--r-4) var(--r-4) 0 0;}
#constructionModal .cx-head h3{color:#fff;}
#constructionModal .cx-quota{margin-inline-start:auto; margin-inline-end:10px; font-size:11.5px; padding:4px 11px; border-radius:999px; background:rgba(255,255,255,.18); color:#fff; white-space:nowrap;}
#constructionModal .cx-sec{border:1px solid var(--border,#333); border-radius:14px; padding:14px 14px 16px; margin-top:14px; background:rgba(255,255,255,.025);}
#constructionModal .cx-h{margin:0 0 10px; font-size:12.5px; opacity:.92; letter-spacing:.2px;}
#constructionModal .cx-pill{display:flex; align-items:center; gap:8px; padding:9px 12px; border:1px solid var(--border,#333); border-radius:999px; cursor:pointer; font-size:12.5px; background:var(--panel2,#141414); transition:border-color .15s, background .15s;}
#constructionModal .cx-pill:hover{border-color:#2E9E6B;}
#constructionModal .cx-pill input{accent-color:#2E9E6B; flex:none;}
#constructionModal .cx-pill:has(input:checked){border-color:#2E9E6B; background:rgba(46,158,107,.14);}
#constructionModal select,#constructionModal textarea,#constructionModal input[type=number],#constructionModal input[type=text]{border-radius:10px; padding:9px 10px;}
#constructionModal optgroup{font-size:11.5px; opacity:.75;}
#constructionModal .cx-out{border:1px solid var(--border,#333); border-radius:14px; overflow:hidden;}
#constructionModal #constructionRunBtn{border-radius:12px; padding:12px; font-weight:600;}
@media(max-width:640px){#constructionModal .cx-pill{padding:8px 10px;}}
</style>
<div id="constructionModal" style="position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.7); display:none; align-items:center; justify-content:center; padding:20px;">
  <div style="max-width:760px; width:100%; max-height:92vh; overflow-y:auto; background:var(--panel,#1a1a1a); border-radius:var(--r-4); padding:26px; box-shadow:var(--sh-3);">
    <div class="cx-head" style="display:flex; align-items:center;">
      <h3 style="margin:0;" data-i18n="constructionTitle">🏗️ تصاميم المقاولات والبناء</h3>
      <span class="cx-quota" id="constructionQuotaBadge" style="display:none;"></span>
      <button type="button" class="btn iconBtn" id="constructionCloseBtn" style="padding:4px 10px;">✕</button>
    </div>
    <p style="font-size:12.5px; color:var(--muted); margin-top:2px;" data-i18n="constructionDesc">صف مشروع البناء، وسيولّد الذكاء الاصطناعي تصورًا معماريًا أوليًا + قائمة مواد + تقدير تكلفة تقريبي. تصور أولي فقط، لا يغني عن مهندس مرخّص.</p>

    <div class="cx-sec">
      <h4 class="cx-h" data-i18n="cnProjectData">📋 بيانات المشروع</h4>
    <div style="margin-top:12px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="constructionTypeLabel">نوع المبنى</label>
      <select id="constructionType" style="width:100%;">
        <optgroup label="🏠 سكني" data-i18n="[label]constructionGrpResidential">
        <option value="villa" data-i18n="constructionTypeVilla">🏡 فيلا سكنية</option>
        <option value="apartment" data-i18n="constructionTypeApartment">🏢 عمارة سكنية</option>
        <option value="rest" data-i18n="constructionTypeRest">🌴 استراحة</option>
        <option value="farm" data-i18n="constructionTypeFarm">🌾 مزرعة</option>
        <option value="annexhome" data-i18n="constructionTypeAnnexhome">🏘️ ملحق سكني</option>
        </optgroup>
        <optgroup label="🏢 تجاري وإداري" data-i18n="[label]constructionGrpCommercial">
        <option value="office" data-i18n="constructionTypeOffice">🏬 مبنى مكاتب</option>
        <option value="shop" data-i18n="constructionTypeShop">🏪 محل تجاري</option>
        <option value="mall" data-i18n="constructionTypeMall">🛍️ مجمّع تجاري</option>
        <option value="warehouse" data-i18n="constructionTypeWarehouse">🏭 مستودع</option>
        </optgroup>
        <optgroup label="🕌 عام وخدمي" data-i18n="[label]constructionGrpPublic">
        <option value="mosque" data-i18n="constructionTypeMosque">🕌 مسجد</option>
        <option value="school" data-i18n="constructionTypeSchool">🏫 مدرسة</option>
        <option value="hall" data-i18n="constructionTypeHall">💒 صالة أفراح</option>
        </optgroup>
      </select>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px;">
      <div>
        <label style="font-size: var(--fs-5); color:var(--muted); display:block; margin-bottom:3px;" data-i18n="constructionFloors">عدد الأدوار</label>
        <input type="number" id="constructionFloors" style="width:100%;" min="1" max="60" value="1">
      </div>
      <div>
        <label style="font-size: var(--fs-5); color:var(--muted); display:block; margin-bottom:3px;" data-i18n="constructionArea">المساحة (م²)</label>
        <input type="number" id="constructionArea" style="width:100%;" min="20" max="100000" value="300">
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px;">
      <div>
        <label style="font-size: var(--fs-5); color:var(--muted); display:block; margin-bottom:3px;" data-i18n="cnLandArea">مساحة الأرض (م²) — اختياري</label>
        <input type="number" id="constructionPlot" style="width:100%;" min="50" max="200000" placeholder="مثال: 500" data-i18n-placeholder="cnLandAreaPh">
      </div>
      <div>
        <label style="font-size: var(--fs-5); color:var(--muted); display:block; margin-bottom:3px;" data-i18n="cnEmirateOpt">الإمارة — اختياري</label>
        <select id="constructionEmirate" style="width:100%;">
          <option value="" data-i18n="constructionEmirateNone">— بدون —</option>
          <option value="dubai" data-i18n="constructionEmirateDubai">دبي</option>
          <option value="abudhabi" data-i18n="constructionEmirateAbudhabi">أبوظبي</option>
          <option value="sharjah" data-i18n="constructionEmirateSharjah">الشارقة</option>
          <option value="ajman" data-i18n="constructionEmirateAjman">عجمان</option>
          <option value="ummalquwain" data-i18n="constructionEmirateUmmalquwain">أم القيوين</option>
          <option value="rasalkhaimah" data-i18n="constructionEmirateRasalkhaimah">رأس الخيمة</option>
          <option value="fujairah" data-i18n="constructionEmirateFujairah">الفجيرة</option>
        </select>
      </div>
    </div>

    <div style="margin-top:10px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="constructionStyleLabel">الطراز المعماري</label>
      <select id="constructionStyle" style="width:100%;">
        <option value="modern" data-i18n="constructionStyleModern">✨ عصري</option>
        <option value="classic" data-i18n="constructionStyleClassic">🪵 كلاسيكي</option>
        <option value="gulf" data-i18n="constructionStyleGulf">🕌 خليجي تراثي</option>
        <option value="luxury" data-i18n="constructionStyleLuxury">💎 فخم</option>
        <option value="industrial" data-i18n="constructionStyleIndustrial">🏭 صناعي</option>
        <option value="andalusi" data-i18n="constructionStyleAndalusi">🕌 أندلسي</option>
        <option value="islamic" data-i18n="constructionStyleIslamic">🌙 إسلامي معاصر</option>
        <option value="mediterranean" data-i18n="constructionStyleMediterranean">🏖️ متوسطي</option>
        <option value="najdi" data-i18n="constructionStyleNajdi">🏜️ نجدي</option>
        <option value="neoclassic" data-i18n="constructionStyleNeoclassic">🏛️ نيو كلاسيك</option>
      </select>
    </div>
    </div>

    <div class="cx-sec">
      <h4 class="cx-h" data-i18n="cnDetailsAnnexes">🏠 التفاصيل والملاحق</h4>
    <div style="margin-top:12px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="constructionNotesLabel">ملاحظات إضافية (اختياري)</label>
      <div class="mini-mic-field-row">
      <textarea id="constructionNotes" rows="2" style="width:100%; resize:vertical;" data-i18n-placeholder="constructionNotesPh" placeholder="مثال: مسبح، حديقة، واجهة زجاجية"></textarea>
      <button type="button" class="mini-mic-btn" data-target="constructionNotes" title="🎤" data-i18n-title="micTitle">🎤</button>
      </div>
    </div>

    <div style="margin-top:12px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:6px;" data-i18n="constructionAnnexesLabel">🏠 الملاحق (اختياري)</label>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12.5px;">
        <label class="cx-pill"><input type="checkbox" class="constructionAnnex" value="majlis"><span data-i18n="constructionAnnexMajlis">مجلس رجال منفصل</span></label>
        <label class="cx-pill"><input type="checkbox" class="constructionAnnex" value="servant"><span data-i18n="constructionAnnexServant">ملحق خادمة/سائق</span></label>
        <label class="cx-pill"><input type="checkbox" class="constructionAnnex" value="pool"><span data-i18n="constructionAnnexPool">مسبح</span></label>
        <label class="cx-pill"><input type="checkbox" class="constructionAnnex" value="carport"><span data-i18n="constructionAnnexCarport">مواقف سيارات مغطاة</span></label>
        <label class="cx-pill"><input type="checkbox" class="constructionAnnex" value="garden"><span data-i18n="constructionAnnexGarden">حديقة/برجولة</span></label>
        <label class="cx-pill"><input type="checkbox" class="constructionAnnex" value="laundry"><span data-i18n="constructionAnnexLaundry">غرفة غسيل/تخزين</span></label>
        <label class="cx-pill"><input type="checkbox" class="constructionAnnex" value="elevator"><span data-i18n="cnExElevator">مصعد داخلي</span></label>
        <label class="cx-pill"><input type="checkbox" class="constructionAnnex" value="storage"><span data-i18n="cnExStore">مخزن خارجي</span></label>
        <label class="cx-pill"><input type="checkbox" class="constructionAnnex" value="tank"><span data-i18n="cnExWaterTank">خزان مياه</span></label>
        <label class="cx-pill"><input type="checkbox" class="constructionAnnex" value="solar"><span data-i18n="cnExSolar">ألواح شمسية</span></label>
        <label class="cx-pill"><input type="checkbox" class="constructionAnnex" value="playground"><span data-i18n="cnExPlayground">ملعب خارجي</span></label>
        <label class="cx-pill"><input type="checkbox" class="constructionAnnex" value="carport2"><span data-i18n="cnExCarport">مظلة سيارات إضافية</span></label>
      </div>
    </div>
    </div>

    <div class="cx-sec">
      <h4 class="cx-h" data-i18n="cnBudgetOutputs">💰 الميزانية والمخرجات</h4>
    <label class="cx-pill" style="margin-top:2px;">
      <input type="checkbox" id="constructionIncludeInterior">
      <span data-i18n="constructionIncludeInteriorLabel">🛋️ ولّد أيضًا صورة تصميم داخلي</span>
    </label>

    <div style="margin-top:10px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="constructionBudgetLabel">💰 مستوى الميزانية</label>
      <select id="constructionBudget" style="width:100%;">
        <option value="b1" data-i18n="constructionBudgetB1">💵 حتى 300 ألف درهم</option>
        <option value="b2" selected data-i18n="constructionBudgetB2">💰 300 - 600 ألف درهم</option>
        <option value="b3" data-i18n="constructionBudgetB3">💎 600 ألف - 1 مليون درهم</option>
        <option value="b4" data-i18n="constructionBudgetB4">👑 أكثر من 1 مليون درهم</option>
      </select>
      <div style="font-size: var(--fs-5); color:var(--muted); margin-top:4px;" data-i18n="constructionBudgetDisclaimer">* هذا المبلغ تقريبي فقط ولا يشمل أجرة المقاول.</div>
    </div>

    <div style="margin-top:10px;">
      <label style="font-size:12px; color:var(--muted); display:block; margin-bottom:4px;" data-i18n="constructionOutputModeLabel">📄 نوع النتيجة</label>
      <label class="cx-pill" style="margin-bottom:6px;">
        <input type="checkbox" id="constructionModePlan" checked>
        <span data-i18n="constructionModePlanLabel">📐 مخطط 2D بالمقاسات</span>
      </label>
      <label class="cx-pill">
        <input type="checkbox" id="constructionModePhoto">
        <span data-i18n="constructionModePhotoLabel">🖼️ صورة فوتوغرافية للتصميم (اختياري بالذكاء الاصطناعي)</span>
      </label>
    </div>
    </div>

    <button type="button" class="btn" id="constructionLibraryBtn" style="width:100%; margin-top:12px;" data-i18n="constructionLibraryBtn">📚 تصفح تصاميم مشابهة محفوظة</button>
    <div id="constructionLibraryWrap" style="display:none; margin-top:10px; max-height:220px; overflow-y:auto; grid-template-columns:1fr 1fr 1fr; gap:6px;"></div>
    <div id="constructionLibraryEmpty" style="display:none; font-size:12px; color:var(--muted); text-align:center; margin-top:8px;" data-i18n="constructionLibraryEmpty">لا توجد تصاميم محفوظة مشابهة بعد — كن أول من يولّد!</div>

    <button type="button" class="btn primary" id="constructionRunBtn" style="width:100%; margin-top:14px;" data-i18n="constructionRunBtn">✨ ولّد التصميم</button>
    <button type="button" class="btn" id="constructionEditorBtn" style="width:100%; margin-top:8px; background:#2E9E6B; border-color:#2E9E6B; color:#fff;" data-i18n="constructionEditorBtn">📐 محرّر المخططات التفاعلي — اسحب وعدّل بنفسك</button>
    <div style="font-size: var(--fs-5); color:var(--muted); margin-top:4px; text-align:center;" data-i18n="constructionEditorHint">مخطط بمساحات محسوبة رياضيًا، تعدّله بأصبعك، ثم تولّد صور الواجهة والمجلس منه</div>

    <div id="constructionStatus" style="display:none; margin-top:14px; text-align:center; font-size: var(--fs-3); color:var(--muted);"></div>
    <div id="constructionResultImageWrap" class="cx-out" style="display:none; margin-top:14px;">
      <p style="font-size:11.5px; color:var(--muted); margin:0 0 4px;" data-i18n="constructionPlanImageLabel">📐 المخطط 2D بالمقاسات</p>
      <img id="constructionResultImage" style="display:block; width:100%; border-radius:var(--r-2); background:#000;">
      <a id="constructionDownloadLink" style="display:block; margin-top:8px; text-align:center;" class="btn primary" download="omran-construction-plan.png" data-i18n="portraitDownloadBtn">⬇️ تحميل الصورة</a>
    </div>
    <div id="constructionPhotoImageWrap" class="cx-out" style="display:none; margin-top:14px;">
      <p style="font-size:11.5px; color:var(--muted); margin:0 0 4px;" data-i18n="constructionExteriorLabel">🖼️ صورة فوتوغرافية للتصميم</p>
      <img id="constructionPhotoImage" style="display:block; width:100%; border-radius:var(--r-2); background:#000;">
      <a id="constructionPhotoDownloadLink" style="display:block; margin-top:8px; text-align:center;" class="btn primary" download="omran-construction-photo.png" data-i18n="portraitDownloadBtn">⬇️ تحميل الصورة</a>
    </div>
    <div id="constructionInteriorImageWrap" style="display:none; margin-top:14px;">
      <p style="font-size:11.5px; color:var(--muted); margin:0 0 4px;" data-i18n="constructionInteriorLabel">🛋️ التصميم الداخلي</p>
      <img id="constructionInteriorImage" style="display:block; width:100%; border-radius:var(--r-2); background:#000;">
      <a id="constructionInteriorDownloadLink" style="display:block; margin-top:8px; text-align:center;" class="btn primary" download="omran-construction-interior.png" data-i18n="portraitDownloadBtn">⬇️ تحميل الصورة</a>
    </div>
    <div id="constructionBoqWrap" style="display:none; margin-top:12px; overflow-x:auto;"></div>
    <div id="constructionExportRow" style="display:none; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px;">
      <button type="button" class="btn" id="constructionBoqBtn" data-i18n="cnDownloadBoq">📊 تنزيل جدول الكميات</button>
      <button type="button" class="btn" id="constructionPdfBtn" data-i18n="cnPdfReport">📄 تقرير PDF</button>
    </div>
    <div id="constructionPlanText" style="display:none; margin-top:14px; white-space:pre-wrap; line-height:1.9; font-size: var(--fs-3); background:var(--panel2,#111); border:1px solid var(--border,#333); border-radius:var(--r-2); padding:14px;"></div>

    <div id="constructionViewsSection" style="display:none; margin-top:18px; border-top:1px solid var(--border,#333); padding-top:14px;">
      <p style="font-size:12.5px; color:var(--muted); margin:0 0 8px;" data-i18n="constructionAnglesLabel">📷 شاهد المبنى من زوايا أخرى</p>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <button type="button" class="btn" data-angle="front" data-i18n="constructionAngleFront">⬅️ أمامي</button>
        <button type="button" class="btn" data-angle="side" data-i18n="constructionAngleSide">↔️ جانبي</button>
        <button type="button" class="btn" data-angle="back" data-i18n="constructionAngleBack">➡️ خلفي</button>
        <button type="button" class="btn" data-angle="aerial" data-i18n="constructionAngleAerial">🚁 جوي</button>
      </div>
      <div id="constructionAngleStatus" style="display:none; margin-top:8px; font-size:12.5px; color:var(--muted);"></div>
      <div id="constructionAngleImageWrap" style="display:none; margin-top:10px;">
        <img id="constructionAngleImage" style="display:block; width:100%; border-radius:var(--r-2); background:#000;">
        <a id="constructionAngleDownloadLink" style="display:block; margin-top:8px; text-align:center;" class="btn primary" download="omran-construction-angle.png" data-i18n="portraitDownloadBtn">⬇️ تحميل الصورة</a>
      </div>

      <p style="font-size:12.5px; color:var(--muted); margin:16px 0 8px;" data-i18n="constructionRoomsLabel">🛋️ شاهد الغرف من الداخل</p>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
        <select id="constructionRoomSelect" style="width:100%;">
          <option value="living" data-i18n="constructionRoomLiving">🛋️ الصالة</option>
          <option value="majlis" data-i18n="constructionRoomMajlis">🪑 المجلس</option>
          <option value="bedroom" data-i18n="constructionRoomBedroom">🛏️ غرفة النوم</option>
          <option value="kitchen" data-i18n="constructionRoomKitchen">🍽️ المطبخ</option>
          <option value="bathroom" data-i18n="constructionRoomBathroom">🚿 الحمام</option>
          <option value="dining" data-i18n="constructionRoomDining">🍽️ غرفة الطعام</option>
          <option value="office" data-i18n="constructionRoomOffice">🧑‍💻 مكتب منزلي</option>
          <option value="kids" data-i18n="constructionRoomKids">🧸 غرفة أطفال</option>
          <option value="stairs" data-i18n="constructionRoomStairs">🪜 الدرج والمدخل</option>
          <option value="roof" data-i18n="constructionRoomRoof">🌇 السطح</option>
        </select>
        <input type="text" id="constructionRoomColor" data-i18n-placeholder="constructionRoomColorPh" placeholder="لون الديكور (مثال: بيج وذهبي)">
      </div>
      <button type="button" class="btn primary" id="constructionRoomViewBtn" style="width:100%; margin-top:8px;" data-i18n="constructionRoomViewBtn">👁️ شاهد الغرفة</button>
      <div id="constructionRoomStatus" style="display:none; margin-top:8px; font-size:12.5px; color:var(--muted);"></div>
      <div id="constructionRoomImageWrap" style="display:none; margin-top:10px;">
        <img id="constructionRoomImage" style="display:block; width:100%; border-radius:var(--r-2); background:#000;">
        <a id="constructionRoomDownloadLink" style="display:block; margin-top:8px; text-align:center;" class="btn primary" download="omran-construction-room.png" data-i18n="portraitDownloadBtn">⬇️ تحميل الصورة</a>
      </div>
    </div>
  </div>
</div>

<div id="shareModal" style="position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.7); display:none; align-items:center; justify-content:center; padding:20px;">
  <div style="max-width:440px; width:100%; background:var(--panel,#1a1a1a); border-radius:var(--r-4); padding:26px; box-shadow:var(--sh-3);">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <h3 style="margin:0;" data-i18n="shareModalTitle">🔗 مشاركة المشروع</h3>
      <button type="button" class="btn iconBtn" id="shareModalCloseBtn" style="padding:4px 10px;">✕</button>
    </div>
    <p style="font-size:12.5px; color:var(--muted); margin-top:2px;" data-i18n="shareModalDesc">أنشئ رابطًا عامًا لمشروعك. يقدر أي شخص فتحه ومعاينته بدون تسجيل دخول.</p>

    <label style="display:flex; align-items:flex-start; gap:8px; margin-top:14px; font-size: var(--fs-3); cursor:pointer;">
      <input type="radio" name="sharePublicOpt" id="sharePublicYes" checked style="margin-top:3px;">
      <span data-i18n="sharePublicLabel">اعرضه أيضًا في صفحة 🔍 استكشف (يشوفه الجميع)</span>
    </label>
    <label style="display:flex; align-items:flex-start; gap:8px; margin-top:8px; font-size: var(--fs-3); cursor:pointer;">
      <input type="radio" name="sharePublicOpt" id="sharePublicNo" style="margin-top:3px;">
      <span data-i18n="sharePrivateLabel">رابط خاص فقط (لمن تشاركه معهم)</span>
    </label>

    <button type="button" class="btn primary" id="shareCreateBtn" style="width:100%; margin-top:16px;" data-i18n="shareCreateBtn">إنشاء الرابط</button>

    <div id="shareResultBox" style="display:none; margin-top:14px;">
      <input type="text" id="shareResultUrl" readonly style="width:100%; padding:10px; border-radius:var(--r-2); background:var(--panel2); border:1px solid var(--border); color:var(--text); font-size:12.5px; direction:ltr; text-align:left;">
      <button type="button" class="btn primary" id="shareCopyBtn" style="width:100%; margin-top:8px;" data-i18n="shareCopyBtn">نسخ الرابط</button>
    </div>
    <div id="shareStatusMsg" style="display:none; margin-top:10px; text-align:center; font-size:12.5px; color:var(--muted);"></div>
  </div>
</div>`;
  if (document.readyState === 'loading') { document.write(H); return; }
  var d = document.createElement('div'); d.innerHTML = H;
  var f = document.createDocumentFragment();
  while (d.firstChild) f.appendChild(d.firstChild);
  (S && S.parentNode ? S.parentNode : document.body).insertBefore(f, S || null);
})();
