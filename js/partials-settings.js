/* المرحلة ٣ · الشريحة ٧ب — بنية المودالات، منقولة حرفيًّا من index.html.
   تُدرَج عند نفس نقطة التحليل، فترتيب DOM مطابق بايت-ببايت.
   sha256(المحتوى) = f9958a3957e3b1a29d24822d6639ade8 */
(function(){
  var S = document.currentScript;
  var H = String.raw`<dialog id="settingsDialog">
  <h3 id="settingsDlgTitle" data-i18n-title="settingsDlgMaxTitle" style="display:none; margin-top:0; cursor:zoom-in; user-select:none;" title="دبل كلك للتكبير/التصغير" data-i18n="settingsTitle">إعدادات الاتصال بالذكاء الاصطناعي</h3>

<div id="settingsHomeView">
  <div id="settingsCmdBox" style="display:flex; align-items:center; gap:6px; background:var(--panel2); border:1px solid var(--border); border-radius:var(--r-4); padding:6px 8px; margin:6px 0 16px;">
    <button type="button" id="settingsCmdMicBtn" title="تسجيل صوتي" data-i18n-title="micTitle" style="flex:0 0 auto; background:none; border:none; cursor:pointer; color:var(--muted); display:flex; align-items:center; justify-content:center; padding:6px; border-radius:50%;"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="18" x2="12" y2="22"></line><line x1="8" y1="22" x2="16" y2="22"></line></svg></button>
    <input type="text" id="settingsCmdInput" data-i18n-placeholder="settingsCmdPh" placeholder="اكتب ما تريد تغييره… مثال: خط أكبر وخلفية بحرية" style="flex:1 1 auto; min-width:0; border:none; background:none; outline:none; color:var(--text); font-size: var(--fs-3); padding:6px 2px;">
    <button type="button" id="settingsCmdSendBtn" title="تنفيذ" data-i18n-title="settingsCmdSend" style="flex:0 0 auto; background:none; border:none; cursor:pointer; color:var(--accent); display:flex; align-items:center; justify-content:center; padding:6px; border-radius:50%;"><svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button>
  </div>
  <div id="settingsNavList"></div>
  <div id="appVersionLabel" style="text-align:center; color:var(--muted); font-size:12px; opacity:.7; margin-top:22px; padding-bottom:6px; user-select:text;"></div>
</div>
<div id="settingsPageHeader" style="display:none; align-items:center; gap:10px; margin-top:26px; margin-bottom:14px;">
  <button type="button" id="settingsPageBackBtn" title="رجوع" data-i18n-title="back" style="background:none; border:none; cursor:pointer; color:var(--text); display:flex; align-items:center; justify-content:center; padding:4px; border-radius:50%;"><svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" id="settingsBackSvg"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg></button>
  <h3 id="settingsPageTitle" style="margin:0; font-size: var(--fs-2);"></h3>
</div>



  <div id="langSection" class="settingsPageSection" style="padding:14px; margin-bottom:18px;">
    <div class="settingsSectionHeader" onclick="toggleSettingsSection('langSection')" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;"><h3 style="margin:0; font-size:14px;" data-i18n="langSectionTitle">🌐 اللغة</h3><span class="settingsSectionArrow" id="langSectionArrow" style="font-size:13px; transition:transform .2s; margin-inline-start:8px;">▶</span></div><div id="langSectionContent" class="settingsSectionContent" style="display:none; margin-top:12px;">
    <div id="langListWrap" style="display:flex; flex-direction:column; gap:2px;">
      <button type="button" class="langFlagBtn" id="btnLangEn" title="English" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:11px 12px; font-size:14px; background:none; border:none; cursor:pointer; color:var(--text); text-align:start; border-radius:var(--r-2);"><span>English</span><svg class="langCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="display:none; color:var(--accent);"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
      <button type="button" class="langFlagBtn" id="btnLangZh" title="中文" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:11px 12px; font-size:14px; background:none; border:none; cursor:pointer; color:var(--text); text-align:start; border-radius:var(--r-2);"><span>中文</span><svg class="langCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="display:none; color:var(--accent);"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
      <button type="button" class="langFlagBtn" id="btnLangHi" title="हिन्दी" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:11px 12px; font-size:14px; background:none; border:none; cursor:pointer; color:var(--text); text-align:start; border-radius:var(--r-2);"><span>हिन्दी</span><svg class="langCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="display:none; color:var(--accent);"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
      <button type="button" class="langFlagBtn" id="btnLangEs" title="Español" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:11px 12px; font-size:14px; background:none; border:none; cursor:pointer; color:var(--text); text-align:start; border-radius:var(--r-2);"><span>Español</span><svg class="langCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="display:none; color:var(--accent);"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
      <button type="button" class="langFlagBtn" id="btnLangFr" title="Français" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:11px 12px; font-size:14px; background:none; border:none; cursor:pointer; color:var(--text); text-align:start; border-radius:var(--r-2);"><span>Français</span><svg class="langCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="display:none; color:var(--accent);"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
      <button type="button" class="langFlagBtn" id="btnLangAr" title="العربية" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:11px 12px; font-size:14px; background:none; border:none; cursor:pointer; color:var(--text); text-align:start; border-radius:var(--r-2);"><span>العربية</span><svg class="langCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="display:none; color:var(--accent);"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
      <button type="button" class="langFlagBtn" id="btnLangBn" title="বাংলা" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:11px 12px; font-size:14px; background:none; border:none; cursor:pointer; color:var(--text); text-align:start; border-radius:var(--r-2);"><span>বাংলা</span><svg class="langCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="display:none; color:var(--accent);"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
      <button type="button" class="langFlagBtn" id="btnLangRu" title="Русский" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:11px 12px; font-size:14px; background:none; border:none; cursor:pointer; color:var(--text); text-align:start; border-radius:var(--r-2);"><span>Русский</span><svg class="langCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="display:none; color:var(--accent);"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
      <button type="button" class="langFlagBtn" id="btnLangUr" title="اردو" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:11px 12px; font-size:14px; background:none; border:none; cursor:pointer; color:var(--text); text-align:start; border-radius:var(--r-2);"><span>اردو</span><svg class="langCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="display:none; color:var(--accent);"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
      <button type="button" class="langFlagBtn" id="btnLangId" title="Bahasa Indonesia" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:11px 12px; font-size:14px; background:none; border:none; cursor:pointer; color:var(--text); text-align:start; border-radius:var(--r-2);"><span>Bahasa Indonesia</span><svg class="langCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="display:none; color:var(--accent);"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
      <button type="button" class="langFlagBtn" id="btnLangFil" title="Filipino" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:11px 12px; font-size:14px; background:none; border:none; cursor:pointer; color:var(--text); text-align:start; border-radius:var(--r-2);"><span>Filipino</span><svg class="langCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="display:none; color:var(--accent);"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
      <button type="button" class="langFlagBtn" id="btnLangTr" title="Türkçe" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:11px 12px; font-size:14px; background:none; border:none; cursor:pointer; color:var(--text); text-align:start; border-radius:var(--r-2);"><span>Türkçe</span><svg class="langCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="display:none; color:var(--accent);"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
      <button type="button" class="langFlagBtn" id="btnLangNe" title="नेपाली" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:11px 12px; font-size:14px; background:none; border:none; cursor:pointer; color:var(--text); text-align:start; border-radius:var(--r-2);"><span>नेपाली</span><svg class="langCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="display:none; color:var(--accent);"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
      <button type="button" class="langFlagBtn" id="btnLangMl" title="മലയാളം" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:11px 12px; font-size:14px; background:none; border:none; cursor:pointer; color:var(--text); text-align:start; border-radius:var(--r-2);"><span>മലയാളം</span><svg class="langCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="display:none; color:var(--accent);"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
    </div>
  </div></div>

  <div id="accountSection" class="settingsPageSection" style="padding:14px; margin-bottom:18px;">
    <div class="settingsSectionHeader" onclick="toggleSettingsSection('accountSection')" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;"><h3 style="margin:0; font-size:14px;" data-i18n="acctSectionTitle">👤 حسابي</h3><span class="settingsSectionArrow" id="accountSectionArrow" style="font-size:13px; transition:transform .2s; margin-inline-start:8px;">▶</span></div><div id="accountSectionContent" class="settingsSectionContent" style="display:none; margin-top:12px;"><div style="display:flex; flex-direction:column; width:100%;">
    <div style="display:flex; flex-direction:column; align-items:center; gap:8px; margin-bottom:14px;">
      <div style="position:relative;">
        <img id="acctAvatarPreview" src="" alt="" style="width:72px; height:72px; border-radius:50%; object-fit:cover; background:var(--bg); border:1px solid var(--border); display:none;">
        <div id="acctAvatarPlaceholder" style="width:72px; height:72px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:34px; background:var(--bg); border:1px solid var(--border);">👤</div>
        <input type="file" id="acctAvatarInput" accept="image/*" style="display:none;">
      </div>
      <button type="button" id="acctAvatarBtn" style="background:none; border:none; cursor:pointer; color:var(--accent); font-size:13px; font-weight:500; padding:2px 8px;" data-i18n="acctAvatarBtn">📷 تغيير الصورة</button>
    </div>
    <div><button type="button" onclick="acctToggleRow('acctRowUser',this)" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:13px 8px; background:none; border:none; border-bottom:1px solid rgba(128,128,128,.15); cursor:pointer; color:var(--text); font-size: var(--fs-3); text-align:start;"><span data-i18n="acctUsernameLabel">اسم المستخدم</span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition:transform .2s; color:var(--muted); flex-shrink:0;"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
    <div id="acctRowUser" style="display:none; padding:8px 8px 12px;">
      <div style="display:flex; gap:8px;">
        <input type="text" id="acctUsername" style="flex:1;" autocomplete="username">
        <button type="button" class="btn" id="acctUsernameSaveBtn" style="width:auto; white-space:nowrap;" data-i18n="acctSaveBtn">حفظ</button>
      </div>
      <div id="acctUsernameMsg" style="font-size:12px; min-height:16px; margin-top:4px;"></div>
    </div></div>
    <div><button type="button" onclick="acctToggleRow('acctRowPass',this)" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:13px 8px; background:none; border:none; border-bottom:1px solid rgba(128,128,128,.15); cursor:pointer; color:var(--text); font-size: var(--fs-3); text-align:start;"><span data-i18n="acctPasswordRow">كلمة المرور</span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition:transform .2s; color:var(--muted); flex-shrink:0;"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
    <div id="acctRowPass" style="display:none; padding:8px 8px 12px;">
      <label data-i18n="acctCurrentPasswordLabel">كلمة المرور الحالية</label>
      <input type="password" id="acctCurrentPassword" autocomplete="current-password">
      <label data-i18n="acctNewPasswordLabel2">كلمة المرور الجديدة</label>
      <div style="display:flex; gap:8px;">
        <input type="password" id="acctNewPassword" style="flex:1;" autocomplete="new-password">
        <button type="button" class="btn" id="acctPasswordSaveBtn" style="width:auto; white-space:nowrap;" data-i18n="acctSaveBtn">حفظ</button>
      </div>
      <div id="acctPasswordMsg" style="font-size:12px; min-height:16px; margin-top:4px;"></div>
    </div></div>
    <div><button type="button" onclick="acctToggleRow('acctRowEmail',this)" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:13px 8px; background:none; border:none; border-bottom:1px solid rgba(128,128,128,.15); cursor:pointer; color:var(--text); font-size: var(--fs-3); text-align:start;"><span data-i18n="acctEmailLabel">📧 الإيميل الاحتياطي (لاسترجاع كلمة المرور)</span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition:transform .2s; color:var(--muted); flex-shrink:0;"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
    <div id="acctRowEmail" style="display:none; padding:8px 8px 12px;">
      <div style="display:flex; gap:8px;">
        <input type="email" id="acctEmail" style="flex:1; direction:ltr;" autocomplete="email">
        <button type="button" class="btn" id="acctEmailSaveBtn" style="width:auto; white-space:nowrap;" data-i18n="acctSaveBtn">حفظ</button>
      </div>
      <div id="acctEmailMsg" style="font-size:12px; min-height:16px; margin-top:4px;"></div>
    </div></div>
    <div><button type="button" onclick="acctToggleRow('acctRowRef',this)" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:13px 8px; background:none; border:none; border-bottom:1px solid rgba(128,128,128,.15); cursor:pointer; color:var(--text); font-size: var(--fs-3); text-align:start;"><span data-i18n="acctReferralLabel">🔗 رابط دعوة أصدقائك</span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition:transform .2s; color:var(--muted); flex-shrink:0;"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
    <div id="acctRowRef" style="display:none; padding:8px 8px 12px;">
      <div style="display:flex; gap:8px;">
        <input type="text" id="acctReferralLink" readonly style="flex:1;">
        <button type="button" class="btn" id="acctReferralCopyBtn" style="width:auto; white-space:nowrap;" data-i18n="acctCopyBtn">📋 نسخ</button>
      </div>
      <div id="acctReferralMsg" style="font-size:12px; min-height:16px; margin-top:4px; color:var(--muted);" data-i18n="acctReferralHint">لكل صديق يسجّل برابطك، تحصلان أنت وهو على 10 رسائل مجانية إضافية 🎁</div>
      <div id="acctReferralBonus" style="font-size: var(--fs-3); font-weight: var(--w-bold); margin-top:6px;"></div>
    </div></div>
    <div><button type="button" onclick="acctToggleRow('acctRowCleanup',this)" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:13px 8px; background:none; border:none; border-bottom:1px solid rgba(128,128,128,.15); cursor:pointer; color:#ef4444; font-size: var(--fs-3); text-align:start;"><span style="display:flex; align-items:center; gap:8px;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg><span data-i18n="acctCleanupLabel">تنظيف التطبيق</span></span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition:transform .2s; color:var(--muted); flex-shrink:0;"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
    <div id="acctRowCleanup" style="display:none; padding:8px 8px 12px;">
      <div style="font-size:12px; color:var(--muted); margin-bottom:8px;" data-i18n="acctCleanupHint">يحذف كل المحادثات والمشاريع نهائيًا من هذا الجهاز ومن السحابة. حسابك ولغتك يبقيان.</div>
      <button type="button" onclick="appFullCleanup()" style="width:100%; padding:10px; border-radius:var(--r-2); border:1px solid rgba(239,68,68,.5); background:rgba(239,68,68,.12); color:#ef4444; font-size: var(--fs-3); font-weight: var(--w-bold); cursor:pointer;" data-i18n="acctCleanupBtn">حذف الكل الآن</button>
    </div></div>
    </div>
    <script src="/js/themes.js?v=441"></script>
    <script>window.acctToggleRow=function(id,btn){var p=document.getElementById(id);var open=p.style.display==='none';p.style.display=open?'block':'none';var s=btn.querySelector('svg');if(s)s.style.transform=open?'rotate(90deg)':'';};</script>
  </div></div>

  <div id="statsSection" class="settingsPageSection" style="padding:14px; margin-bottom:18px;">
    <div class="settingsSectionHeader" onclick="toggleSettingsSection('statsSection')" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;"><h3 style="margin:0; font-size:14px;" data-i18n="statsSectionTitle">📊 إحصائياتي</h3><span class="settingsSectionArrow" id="statsSectionArrow" style="font-size:13px; transition:transform .2s; margin-inline-start:8px;">▶</span></div><div id="statsSectionContent" class="settingsSectionContent" style="display:none; margin-top:12px;">
    <div><div style="display:flex; align-items:center; justify-content:space-between; padding:13px 8px; border-bottom:1px solid rgba(128,128,128,.15); font-size: var(--fs-3);"><span data-i18n="statsProjectsLabel">عدد المشاريع</span><b id="statProjectsCount" style="font-size: var(--fs-2);">0</b></div><div style="display:flex; align-items:center; justify-content:space-between; padding:13px 8px; border-bottom:1px solid rgba(128,128,128,.15); font-size: var(--fs-3);"><span data-i18n="statsMessagesLabel">إجمالي الرسائل المُرسلة</span><b id="statMessagesCount" style="font-size: var(--fs-2);">0</b></div><div style="display:flex; align-items:center; justify-content:space-between; padding:13px 8px; border-bottom:1px solid rgba(128,128,128,.15); font-size: var(--fs-3);"><span data-i18n="statsFavProviderLabel">أكثر مزوّد تستخدمه</span><b id="statFavProvider" style="font-size: var(--fs-2);">—</b></div><button type="button" id="btnExportProjects" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:13px 8px; background:none; border:none; border-bottom:1px solid rgba(128,128,128,.15); cursor:pointer; color:var(--text); font-size: var(--fs-3); text-align:start;"><span data-i18n="statsExportBtn">تصدير المشاريع</span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--muted); flex-shrink:0;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></button><button type="button" id="btnImportProjects" style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:13px 8px; background:none; border:none; border-bottom:1px solid rgba(128,128,128,.15); cursor:pointer; color:var(--text); font-size: var(--fs-3); text-align:start;"><span data-i18n="statsImportBtn">استيراد مشاريع</span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--muted); flex-shrink:0;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg></button></div>
      <input type="file" id="importProjectsFile" accept="application/json" style="display:none;">
      </div>
    </div>
  </div></div>

  <!-- v-agent-settings: قسم «الوكيل» — زر التشغيل انتقل هنا من الشاشة الرئيسية (أمر عمران ٢٦ أغسطس ٢٠٢٦) -->
  <div id="agentSection" class="settingsPageSection" style="padding:14px; margin-bottom:18px;">
    <div class="settingsSectionHeader" onclick="toggleSettingsSection('agentSection')" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;"><h3 style="margin:0; font-size:14px;" data-i18n="agentSectionTitle">🤖 الوكيل</h3><span class="settingsSectionArrow" id="agentSectionArrow" style="font-size:13px; transition:transform .2s; margin-inline-start:8px;">▶</span></div><div id="agentSectionContent" class="settingsSectionContent" style="display:none; margin-top:12px;">
      <p style="margin:0 0 12px; font-size:12.5px; color:var(--muted); line-height:1.7;" data-i18n="agentSectionDesc">وضع الوكيل: يخطّط وينفّذ بنفسه — يبني ويعدّل ويختبر الكود قبل تسليمه، يبحث في الإنترنت، ويكمل عمله حتى لو أُغلقت الصفحة. شغّله من الزر ثم اكتب طلبك في المحادثة.</p>
      <div id="agentSettingsHost"></div>
      <p id="agentOnNote" style="display:none; margin:10px 0 0; font-size:12px; color:var(--accent-ink, var(--accent)); font-weight:600;" data-i18n="agentOnNote">الوكيل شغّال الآن — ارجع للمحادثة واكتب طلبك.</p>
    </div>
  </div>

  <div id="apiKeysSection" class="settingsPageSection" style="padding:14px; margin-bottom:18px;">
    <div class="settingsSectionHeader" onclick="toggleSettingsSection('apiKeysSection')" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;"><h3 style="margin:0; font-size:14px;" data-i18n="apiKeysSectionTitle">🔑 مفاتيح API لمزوّدي الخدمة</h3><span class="settingsSectionArrow" id="apiKeysSectionArrow" style="font-size:13px; transition:transform .2s; margin-inline-start:8px;">▶</span></div><div id="apiKeysSectionContent" class="settingsSectionContent" style="display:none; margin-top:12px;">
  <label data-i18n="provider">مزوّد الخدمة الافتراضي</label>
  <select id="provider">
    <option value="claude">Anthropic Claude (console.anthropic.com)</option>
    <option value="gemini">Google Gemini (aistudio.google.com)</option>
    <option value="openai">OpenAI (platform.openai.com)</option>
    <option value="groq">Groq (console.groq.com)</option>
  </select>
    <div style="margin-top:14px;">
  <div class="api-provider-card" style="border-inline-start:4px solid #10a37f; background:var(--panel2); border-radius:var(--r-2); padding:12px 14px; margin-bottom:12px;">
    <label style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
      <span data-i18n="apiKeyLabel" style="font-weight:bold; color:#10a37f;">مفتاح API</span>
      <span style="display:flex; align-items:center; gap:6px; font-weight:normal; font-size:0.85em;">
        <input type="checkbox" id="chkIncludeOpenAI" style="width:auto;"> <span data-i18n="includeInAskAll">ضِمن اسأل الكل</span>
      </span>
    </label>
    <input type="password" id="apiKey" placeholder="sk-...">
    <label data-i18n="modelLabel">اسم النموذج</label>
    <input type="text" id="modelName" placeholder="gpt-4o-mini">
  </div>
  <div class="api-provider-card" style="display:none; border-inline-start:4px solid var(--accent); background:var(--panel2); border-radius:var(--r-2); padding:12px 14px; margin-bottom:12px;">
    <label style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
      <span data-i18n="openrouterApiKeyLabel" style="font-weight:bold; color:var(--accent);">مفتاح API</span>
      <span style="display:flex; align-items:center; gap:6px; font-weight:normal; font-size:0.85em;">
        <input type="checkbox" id="chkIncludeOpenRouter" style="width:auto;"> <span data-i18n="includeInAskAll">ضِمن اسأل الكل</span>
      </span>
    </label>
    <input type="password" id="openrouterApiKey" placeholder="sk-or-...">
    <label data-i18n="openrouterModelLabel">اختر النموذج</label>
    <select id="openrouterModelSelect">
      <optgroup label="🆓 Free" data-i18n="[label]orFreeGroup">
        <option value="nvidia/nemotron-3-super-120b-a12b:free">Nemotron 3 Super 120B (free)</option>
        <option value="google/gemini-flash-1.5:free">Google Gemini Flash 1.5 (free)</option>
        <option value="mistralai/mistral-7b-instruct:free">Mistral 7B (free)</option>
      </optgroup>
      <optgroup label="💰 Paid" data-i18n="[label]orPaidGroup">
        <option value="openai/gpt-4o-mini">OpenAI GPT-4o mini</option>
        <option value="openai/gpt-4o">OpenAI GPT-4o</option>
        <option value="anthropic/claude-3.5-sonnet">Anthropic Claude 3.5 Sonnet</option>
        <option value="google/gemini-pro-1.5">Google Gemini Pro 1.5</option>
        <option value="meta-llama/llama-3.1-70b-instruct">Meta Llama 3.1 70B</option>
        <option value="deepseek/deepseek-chat">DeepSeek Chat</option>
      </optgroup>
      <option value="__custom__" data-i18n="orCustomOption">✏️ مخصص...</option>
    </select>
    <input type="text" id="openrouterModel" placeholder="openai/gpt-4o-mini" style="display:none; margin-top:6px;">
  </div>
  <div class="api-provider-card" style="display:none; border-inline-start:4px solid #20b8cd; background:var(--panel2); border-radius:var(--r-2); padding:12px 14px; margin-bottom:12px;">
    <label style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
      <span data-i18n="perplexityApiKeyLabel" style="font-weight:bold; color:#20b8cd;">مفتاح API</span>
      <span style="display:flex; align-items:center; gap:6px; font-weight:normal; font-size:0.85em;">
        <input type="checkbox" id="chkIncludePerplexity" style="width:auto;"> <span data-i18n="includeInAskAll">ضِمن اسأل الكل</span>
      </span>
    </label>
    <input type="password" id="perplexityApiKey" placeholder="pplx-...">
    <label data-i18n="perplexityModelLabel">اسم النموذج</label>
    <input type="text" id="perplexityModel" placeholder="sonar">
  </div>
  <div class="api-provider-card" style="display:none; border-inline-start:4px solid #fa500f; background:var(--panel2); border-radius:var(--r-2); padding:12px 14px; margin-bottom:12px;">
    <label style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
      <span data-i18n="mistralApiKeyLabel" style="font-weight:bold; color:#fa500f;">مفتاح API</span>
      <span style="display:flex; align-items:center; gap:6px; font-weight:normal; font-size:0.85em;">
        <input type="checkbox" id="chkIncludeMistral" style="width:auto;"> <span data-i18n="includeInAskAll">ضِمن اسأل الكل</span>
      </span>
    </label>
    <input type="password" id="mistralApiKey" placeholder="...">
    <label data-i18n="mistralModelLabel">اسم النموذج</label>
    <input type="text" id="mistralModel" placeholder="mistral-small-latest">
  </div>
  <div class="api-provider-card" style="display:none; border-inline-start:4px solid #4d6bfe; background:var(--panel2); border-radius:var(--r-2); padding:12px 14px; margin-bottom:12px;">
    <label style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
      <span data-i18n="deepseekApiKeyLabel" style="font-weight:bold; color:#4d6bfe;">مفتاح API</span>
      <span style="display:flex; align-items:center; gap:6px; font-weight:normal; font-size:0.85em;">
        <input type="checkbox" id="chkIncludeDeepSeek" style="width:auto;"> <span data-i18n="includeInAskAll">ضِمن اسأل الكل</span>
      </span>
    </label>
    <input type="password" id="deepseekApiKey" placeholder="sk-...">
    <label data-i18n="deepseekModelLabel">اسم النموذج</label>
    <input type="text" id="deepseekModel" placeholder="deepseek-chat">
  </div>
  <div class="api-provider-card" style="display:none; border-inline-start:4px solid #d18ee2; background:var(--panel2); border-radius:var(--r-2); padding:12px 14px; margin-bottom:12px;">
    <label style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
      <span data-i18n="cohereApiKeyLabel" style="font-weight:bold; color:#d18ee2;">مفتاح API</span>
      <span style="display:flex; align-items:center; gap:6px; font-weight:normal; font-size:0.85em;">
        <input type="checkbox" id="chkIncludeCohere" style="width:auto;"> <span data-i18n="includeInAskAll">ضِمن اسأل الكل</span>
      </span>
    </label>
    <input type="password" id="cohereApiKey" placeholder="...">
    <label data-i18n="cohereModelLabel">اسم النموذج</label>
    <input type="text" id="cohereModel" placeholder="command-r-plus">
  </div>
  <div class="api-provider-card" style="border-inline-start:4px solid #4285f4; background:var(--panel2); border-radius:var(--r-2); padding:12px 14px; margin-bottom:12px;">
    <label style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
      <span data-i18n="geminiApiKeyLabel" style="font-weight:bold; color:#4285f4;">مفتاح API</span>
      <span style="display:flex; align-items:center; gap:6px; font-weight:normal; font-size:0.85em;">
        <input type="checkbox" id="chkIncludeGemini" style="width:auto;"> <span data-i18n="includeInAskAll">ضِمن اسأل الكل</span>
      </span>
    </label>
    <input type="password" id="geminiApiKey" placeholder="AIza...">
    <label data-i18n="geminiModelLabel">اسم النموذج</label>
    <input type="text" id="geminiModel" placeholder="gemini-flash-latest">
  </div>
  <div class="api-provider-card" style="border-inline-start:4px solid #f55036; background:var(--panel2); border-radius:var(--r-2); padding:12px 14px; margin-bottom:12px;">
    <label style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
      <span data-i18n="groqApiKeyLabel" style="font-weight:bold; color:#f55036;">مفتاح API</span>
      <span style="display:flex; align-items:center; gap:6px; font-weight:normal; font-size:0.85em;">
        <input type="checkbox" id="chkIncludeGroq" style="width:auto;"> <span data-i18n="includeInAskAll">ضِمن اسأل الكل</span>
      </span>
    </label>
    <input type="password" id="groqApiKey" placeholder="gsk_...">
    <label data-i18n="groqModelLabel">اسم النموذج</label>
    <input type="text" id="groqModel" placeholder="llama-3.3-70b-versatile">
  </div>
  <div class="api-provider-card" style="border-inline-start:4px solid #d97757; background:var(--panel2); border-radius:var(--r-2); padding:12px 14px; margin-bottom:12px;">
    <label style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
      <span data-i18n="claudeApiKeyLabel" style="font-weight:bold; color:#d97757;">مفتاح API</span>
      <span style="display:flex; align-items:center; gap:6px; font-weight:normal; font-size:0.85em;">
        <input type="checkbox" id="chkIncludeClaude" style="width:auto;"> <span data-i18n="includeInAskAll">ضِمن اسأل الكل</span>
      </span>
    </label>
    <input type="password" id="claudeApiKey" placeholder="sk-ant-...">
    <label data-i18n="claudeModelLabel">اسم نموذج Claude</label>
    <div style="display:flex; gap:6px;">
      <input type="text" id="claudeModel" placeholder="claude-sonnet-4-20250514" style="flex:1;">
      <button type="button" id="fetchClaudeModelsBtn" style="white-space:nowrap; padding:6px 10px;" data-i18n="fetchModelsBtn">جلب الموديلات المتاحة</button>
    </div>
    <select id="claudeModelList" style="display:none; margin-top:6px;"></select>
  </div>
    </div>
  <small class="hint" data-i18n="settingsHint" style="display:block; margin-top:10px;">
    🔒 يُحفظ مفتاحك محليًا في متصفحك فقط (localStorage) ولا يُرسل إلى أي خادم تابع لنا. كل طلب توليد يُرسَل مباشرة من متصفحك إلى مزوّد الذكاء الاصطناعي الذي اخترته باستخدام مفتاحك الخاص.<br><br>
    <b data-i18n="keyHowToTitle">📝 كيف تحصل على مفتاح لكل مزوّد:</b><br><br>
    🔹 <b>OpenAI</b>: احصل على مفتاح من platform.openai.com/api-keys<br>
    🔹 <b>Gemini</b>: احصل على مفتاح مجاني من aistudio.google.com/app/apikey<br>
    🔹 <b>Groq</b>: احصل على مفتاح مجاني من console.groq.com/keys<br>
    🔹 <b>Claude</b>: احصل على مفتاح من console.anthropic.com/settings/keys<br>
  </small>
  </div></div>


  <div id="themeSection" class="settingsPageSection" style="padding:14px; margin-bottom:18px;">
    <div class="settingsSectionHeader" onclick="toggleSettingsSection('themeSection')" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;"><h3 style="margin:0; font-size:14px;" data-i18n="themeSectionLabel">🎨 تخصيص الألوان والمظهر</h3><span class="settingsSectionArrow" id="themeSectionArrow" style="font-size:13px; transition:transform .2s; margin-inline-start:8px;">▶</span></div><div id="themeSectionContent" class="settingsSectionContent" style="display:none; margin-top:12px;">

  <div style="display:flex; flex-direction:column; gap:0; padding:10px 12px; margin-bottom:14px; background:var(--panel2); border-radius:var(--r-2);">
    <div onclick="toggleSubRow('bg3dSub')" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;"><span data-i18n="bg3dSectionLabel" style="font-size:13px;">🌌 خلفية ثلاثية الأبعاد متحركة</span><span id="bg3dSubArrow" style="font-size:12px; transition:transform .2s; margin-inline-start:8px;">▶</span></div>
    <div id="bg3dSubContent" style="display:none; padding-top:10px;">
  <div id="bg3dGrid" class="bg3dGrid"></div>
  <label style="display:flex; align-items:center; gap:8px; margin-top:10px;">
    <input type="checkbox" id="chkBg3dAuto" style="width:auto;">
    <span data-i18n="bg3dAutoLabel">🔀 تبديل تلقائي بين الخلفيات كل دقيقة</span>
  </label>
    </div>
  </div>
  </div></div>

  <div id="fontFamilySection" class="settingsPageSection" style="padding:14px; margin-bottom:18px;">
    <div class="settingsSectionHeader" onclick="toggleSettingsSection('fontFamilySection')" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;"><h3 style="margin:0; font-size:var(--fs-3);" data-i18n="fontFamilySectionLabel">نوع الخط</h3><span class="settingsSectionArrow" id="fontFamilySectionArrow" style="font-size:13px; transition:transform .2s; margin-inline-start:8px;">▶</span></div><div id="fontFamilySectionContent" class="settingsSectionContent" style="display:none; margin-top:12px;">
      <p class="fontFamilyHint" data-i18n="fontFamilyHint">يغيّر خط رسائل المحادثة على الكمبيوتر والجوال، ولا يغيّر خط الأكواد أو تخطيط الواجهة.</p>
      <div id="omranFontPicker" class="ofp-grid" aria-live="polite"></div>
    </div></div>

  <div id="fontSizeSection" class="settingsPageSection" style="padding:14px; margin-bottom:18px;">
    <div class="settingsSectionHeader" onclick="toggleSettingsSection('fontSizeSection')" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;"><h3 style="margin:0; font-size: var(--fs-3);" data-i18n="fontSizeSectionLabel">حجم الخط</h3><span class="settingsSectionArrow" id="fontSizeSectionArrow" style="font-size:13px; transition:transform .2s; margin-inline-start:8px;">▶</span></div><div id="fontSizeSectionContent" class="settingsSectionContent" style="display:none; margin-top:12px;">
      <div id="fontSizeBtns" style="display:flex; flex-direction:column; gap:2px;">
        <button type="button" class="fontSizeBtn" data-fs="small"><span data-i18n="fontSizeSmall">صغير</span><svg class="fsCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
        <button type="button" class="fontSizeBtn" data-fs="normal"><span data-i18n="fontSizeNormal">عادي</span><svg class="fsCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
        <button type="button" class="fontSizeBtn" data-fs="large"><span data-i18n="fontSizeLarge">كبير</span><svg class="fsCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
        <button type="button" class="fontSizeBtn" data-fs="xlarge"><span data-i18n="fontSizeXLarge">كبير جدًا</span><svg class="fsCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
      </div>
    </div></div>

  <div id="memorySection" class="settingsPageSection" style="padding:14px; margin-bottom:18px;">
    <div class="settingsSectionHeader" onclick="toggleSettingsSection('memorySection')" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;"><h3 style="margin:0; font-size: var(--fs-3);" data-i18n="memorySectionLabel">ذاكرتي</h3><span class="settingsSectionArrow" id="memorySectionArrow" style="font-size:13px; transition:transform .2s; margin-inline-start:8px;">&#9654;</span></div><div id="memorySectionContent" class="settingsSectionContent" style="display:none; margin-top:12px;">
      <p style="margin:0 0 10px; opacity:.75; font-size:var(--fs-6); line-height:1.7;" data-i18n="memoryIntro">ما يتذكّره التطبيق عنك وعن مشاريعك وأسلوبك. محفوظ في حسابك ويتزامن بين أجهزتك، ويمكنك تعديله أو حذفه.</p>
      <textarea id="memoryBox" dir="auto" maxlength="6000" spellcheck="true" aria-label="الذاكرة المحفوظة" style="display:block; width:100%; box-sizing:border-box; white-space:pre-wrap; line-height:1.9; font:inherit; font-size:var(--fs-6); color:inherit; background:rgba(127,127,127,.08); border:1px solid rgba(127,127,127,.18); border-radius:12px; padding:12px; min-height:150px; max-height:360px; resize:vertical;"></textarea>
      <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-top:12px;">
        <button type="button" id="memorySaveBtn" style="padding:9px 16px; border-radius:10px; border:1px solid var(--accent); background:var(--accent); color:#fff; cursor:pointer; font-size:var(--fs-6);" data-i18n="memorySaveBtn">حفظ التعديلات</button>
        <button type="button" id="memoryClearBtn" style="padding:9px 16px; border-radius:10px; border:1px solid rgba(220,70,70,.45); background:transparent; color:#e05555; cursor:pointer; font-size:var(--fs-6);" data-i18n="memoryClearBtn">حذف ذاكرتي</button>
        <span id="memoryStatus" role="status" aria-live="polite" style="font-size:var(--fs-6); opacity:.75;"></span>
      </div>
    </div></div>

  <div id="voiceSection" class="settingsPageSection" style="padding:14px; margin-bottom:18px;">
    <div class="settingsSectionHeader" onclick="toggleSettingsSection('voiceSection')" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;"><h3 style="margin:0; font-size: var(--fs-3);" data-i18n="voiceSectionLabel">الصوت</h3><span class="settingsSectionArrow" id="voiceSectionArrow" style="font-size:13px; transition:transform .2s; margin-inline-start:8px;">▶</span></div><div id="voiceSectionContent" class="settingsSectionContent" style="display:none; margin-top:12px;">
  <label data-i18n="voiceGenderLabel">نوع الصوت المفضل</label>
  <div id="voiceGenderBtns" style="display:flex; gap:12px; margin-top:10px;">
    <button type="button" class="voiceGenderBtn" data-gender="male"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg><span data-i18n="voiceGenderMale">صوت رجل</span></button>
    <button type="button" class="voiceGenderBtn" data-gender="female"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"></circle><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><path d="M8 3.5C9 2.5 10.4 2 12 2s3 .5 4 1.5"></path></svg><span data-i18n="voiceGenderFemale">صوت امرأة</span></button>
  </div>
  <button type="button" class="btn" id="btnTestVoice" style="margin-top:16px; display:inline-flex; align-items:center; gap:8px;"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg><span data-i18n="testVoiceBtn">تجربة الصوت</span></button>
  </div></div>

  <div id="toneSection" class="settingsPageSection" style="padding:14px; margin-bottom:18px;">
    <div class="settingsSectionHeader" onclick="toggleSettingsSection('toneSection')" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;"><h3 style="margin:0; font-size: var(--fs-3);" data-i18n="toneSectionLabel">النبرة</h3><span class="settingsSectionArrow" id="toneSectionArrow" style="font-size:13px; transition:transform .2s; margin-inline-start:8px;">▶</span></div><div id="toneSectionContent" class="settingsSectionContent" style="display:none; margin-top:12px;">
      <style>.toneBtn{display:flex;align-items:center;justify-content:space-between;width:100%;padding:11px 14px;border:none;background:transparent;color:var(--text,#eee);cursor:pointer;font-size:var(--fs-4,14px);font-family:inherit;border-radius:10px;transition:background .15s;}.toneBtn:hover{background:rgba(212,175,55,.08);}.toneBtn.active{background:rgba(212,175,55,.12);}.toneBtn .toneCheck{display:none;color:#d4af37;}.toneBtn.active .toneCheck{display:block;}</style>
      <p style="font-size:var(--fs-6); opacity:.7; margin:0 0 10px;" data-i18n="toneHint">اختر أسلوب الرد المفضّل — أو خلّ الذكاء الاصطناعي يتأقلم معك تلقائيًا.</p>
      <div id="toneBtns" style="display:flex; flex-direction:column; gap:2px;">
        <button type="button" class="toneBtn" data-tone="auto"><span data-i18n="toneAuto">على راحتك</span><svg class="toneCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
        <button type="button" class="toneBtn" data-tone="warm"><span data-i18n="toneWarm">ودود</span><svg class="toneCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
        <button type="button" class="toneBtn" data-tone="direct"><span data-i18n="toneDirect">مباشر</span><svg class="toneCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
        <button type="button" class="toneBtn" data-tone="formal"><span data-i18n="toneFormal">رسمي</span><svg class="toneCheck" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
      </div>
    </div></div>

  <div id="pricingSection" class="settingsPageSection" style="padding:14px; margin-bottom:18px;">
    <div class="settingsSectionHeader" onclick="toggleSettingsSection('pricingSection')" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;"><h3 style="margin:0; font-size:14px;" data-i18n="pricingSectionTitle">💳 خطط الأسعار</h3><span class="settingsSectionArrow" id="pricingSectionArrow" style="font-size:13px; transition:transform .2s; margin-inline-start:8px;">▶</span></div><div id="pricingSectionContent" class="settingsSectionContent" style="display:none; margin-top:12px;">
  <a href="/pricing.html" target="_blank" rel="noopener" id="openFullPricing" style="display:flex; align-items:center; justify-content:center; gap:8px; margin:2px 0 14px; padding:12px 14px; border:1px solid var(--line,rgba(128,128,128,.22)); border-radius:14px; background:var(--panel2); color:inherit; text-decoration:none; font-size:13px; font-weight:600;"><span data-i18n="showAllPlansCur">عرض كل الباقات والأسعار بعملتك</span><span style="font-size:12px;">↗</span></a>
  <div id="pricingWalletRow" style="display:none; align-items:center; gap:8px; padding:10px 4px; font-size: var(--fs-3);">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:var(--accent);" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
    <span data-i18n="pricingWalletLabel">رصيدك من النقاط</span>
    <b id="pricingWalletValue" style="margin-inline-start:auto; font-size: var(--fs-2);">—</b>
  </div>
  <style>
  .planGrid{display:grid; grid-template-columns:repeat(auto-fit,minmax(178px,1fr)); gap:12px; align-items:stretch; margin-top:6px;}
  .pcard{position:relative; background:var(--panel2); border:1px solid var(--line,rgba(128,128,128,.18)); border-radius:16px; padding:20px 16px 16px; display:flex; flex-direction:column;}
  .pcard.feat{border-color:rgba(201,162,39,.45);}
  .pcard .ptag{position:absolute; top:-10px; inset-inline-start:16px; background:#c9a227; color:#0a0a0a; font-size:10px; font-weight:700; padding:3px 9px; border-radius:999px;}
  .pcard .pname{font-size:12px; font-weight:600; color:var(--muted); letter-spacing:.6px; text-transform:uppercase;}
  .pcard .pprice{display:flex; align-items:baseline; gap:5px; margin:12px 0 2px;}
  .pcard .pnum{font-size:32px; font-weight:300; line-height:1;}
  .pcard .pcur{font-size:15px; color:var(--muted);}
  .pcard .pper{font-size:11.5px; color:var(--muted); min-height:15px;}
  .pcard .ppts{margin:14px 0 12px; padding:9px 11px; background:var(--panel,rgba(128,128,128,.10)); border-radius:10px; display:flex; align-items:baseline; justify-content:space-between; gap:6px;}
  .pcard .ppts b{font-size:18px;}
  .pcard.feat .ppts b{color:#c9a227;}
  .pcard .ppts span{font-size:11px; color:var(--muted); text-align:end;}
  .pcard ul{list-style:none; display:flex; flex-direction:column; gap:9px; flex:1; padding:0; margin:0;}
  .pcard li{font-size:13px; line-height:1.5; color:var(--text);}
  .pcard li::before{content:"✓"; color:var(--muted); margin-inline-end:7px; font-size:12px;}
  .pcard.feat li::before{color:#c9a227;}
  .pcard li.off{opacity:.5;}
  .pcard li.off::before{content:"×";}
  .pcard .pbtn{margin-top:18px; width:100%; padding:11px; border-radius:10px; font-size:13px; font-weight:600; cursor:pointer; border:1px solid var(--line2,rgba(128,128,128,.30)); background:transparent; color:var(--text); font-family:inherit;}
  .pcard .pbtn.primary{background:#c9a227; border-color:#c9a227; color:#0a0a0a;}
  .pcard .pbtn.ghost{opacity:.45; cursor:default;}
  </style>
  <div id="setCurBox" style="display:flex; align-items:center; gap:8px; margin:0 0 12px;"><span style="font-size:12.5px; color:var(--muted); flex:0 0 auto;" data-i18n="currencyLabel">العملة</span><select id="setCurSel" aria-label="اختر الدولة" style="flex:1 1 auto; min-width:0; padding:8px 10px; border-radius:10px; border:1px solid var(--line,rgba(128,128,128,.22)); background:var(--panel2); color:var(--text); font-family:inherit; font-size:13px;"></select></div><div class="planGrid">
    <div class="pcard">
      <div class="pname" data-i18n="pricingFreeTitle">مجاني</div>
      <div class="pprice"><span class="pnum" data-usd="0">0</span><span class="pcur cursym">$</span></div>
      <div class="pper" data-i18n="planFreePer">للتجربة</div>
      <div class="ppts"><b>70</b><span data-i18n="planPtsFree">نقطة ترحيب — مرّة واحدة</span></div>
      <ul data-i18n="planFreeFeats"><li data-i18n="plFreeMsgs">20 رسالة يوميًا</li><li data-i18n="plFreeVoice">دقيقة واحدة محادثة صوتية</li><li data-i18n="plFreeImgs">3 صور بالذكاء الاصطناعي</li><li class="off" data-i18n="plFreeNoVideo">بلا فيديو</li></ul>
      <button type="button" class="pbtn ghost" disabled data-i18n="planCurrentBtn">باقتك الحالية</button>
    </div>
    <div class="pcard">
      <div class="pname">Plus</div>
      <div class="pprice"><span class="pnum" data-usd="10">10</span><span class="pcur cursym">$</span></div>
      <div class="pper" data-i18n="planPer">شهريًا</div>
      <div class="ppts"><b>300</b><span data-i18n="planPtsMo">نقطة كل شهر</span></div>
      <ul data-i18n="planPlusFeats"><li data-i18n="plStMsgs">300 رسالة شهريًا</li><li data-i18n="plStVoice">30 دقيقة محادثة صوتية</li><li data-i18n="plStImgs">15 صورة</li><li data-i18n="plStVideos">5 مقاطع فيديو</li></ul>
      <button type="button" class="pbtn" onclick="openCheckout('basic')" data-i18n="pricingSubscribeBtn">اشترك الآن</button>
    </div>
    <div class="pcard feat"><span class="ptag" data-i18n="planTag">الأكثر اختيارًا</span>
      <div class="pname">Pro</div>
      <div class="pprice"><span class="pnum" data-usd="20">20</span><span class="pcur cursym">$</span></div>
      <div class="pper" data-i18n="planPer">شهريًا</div>
      <div class="ppts"><b>800</b><span data-i18n="planPtsMo">نقطة كل شهر</span></div>
      <ul data-i18n="planProFeats"><li data-i18n="plProMsgs">رسائل بلا حدود</li><li data-i18n="plProVoice">80 دقيقة محادثة صوتية</li><li data-i18n="plProMedia">40 صورة · 13 فيديو · 2 سينمائي</li><li data-i18n="plProAgent">الوكيل الذكي</li><li data-i18n="plProPriority">أولوية في السرعة · شارة ذهبية</li></ul>
      <button type="button" class="pbtn primary" onclick="openCheckout('pro')" data-i18n="pricingSubscribeBtn">اشترك الآن</button>
    </div>
    <div class="pcard">
      <div class="pname">Max</div>
      <div class="pprice"><span class="pnum" data-usd="100">100</span><span class="pcur cursym">$</span></div>
      <div class="pper" data-i18n="planPer">شهريًا</div>
      <div class="ppts"><b>5,000</b><span data-i18n="planPtsMo">نقطة كل شهر</span></div>
      <ul data-i18n="planMaxFeats"><li data-i18n="plMaxAllPro">كل مزايا Pro</li><li data-i18n="plMaxVoice">500 دقيقة محادثة صوتية</li><li data-i18n="plMaxMedia">250 صورة · 83 فيديو · 12 سينمائي</li><li data-i18n="plMaxSupport">دعم مخصّص</li></ul>
      <button type="button" class="pbtn" onclick="openCheckout('max')" data-i18n="pricingSubscribeBtn">اشترك الآن</button>
    </div>
  </div>
  <div style="margin-top:16px;">
    <div style="font-weight: var(--w-bold); font-size: var(--fs-3);" data-i18n="pricingPointsTitle">باقات النقاط</div>
    <div style="font-size:12.5px; color:var(--muted); margin-top:4px; line-height:1.6;" data-i18n="pricingPointsDesc">النقاط عملة موحدة — تُصرف على مها الصوتية والفيديو والصور، بدون اشتراك. مها: 10 نقاط/دقيقة • فيديو: 60 • Veo 3: ‏400 • صورة: 10</div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px;">
      <button type="button" class="btn pointsPackBtn" onclick="buyPointsPack(100)" style="padding:10px 8px; border-radius:var(--r-2); background:var(--panel2); border:none; cursor:pointer; text-align:center;"><b style="font-size: var(--fs-3);">100</b> <span data-i18n="pricingPointsUnit">نقطة</span><br><span style="font-size:12px; color:var(--muted);"><span class="pn" data-usd="4.99">4.99</span> <span class="cursym">$</span></span></button>
      <button type="button" class="btn pointsPackBtn" onclick="buyPointsPack(300)" style="padding:10px 8px; border-radius:var(--r-2); background:var(--panel2); border:none; cursor:pointer; text-align:center;"><b style="font-size: var(--fs-3);">300</b> <span data-i18n="pricingPointsUnit">نقطة</span><br><span style="font-size:12px; color:var(--muted);"><span class="pn" data-usd="12.99">12.99</span> <span class="cursym">$</span></span></button>
      <button type="button" class="btn pointsPackBtn" onclick="buyPointsPack(700)" style="padding:10px 8px; border-radius:var(--r-2); background:var(--panel2); border:none; cursor:pointer; text-align:center;"><b style="font-size: var(--fs-3);">700</b> <span data-i18n="pricingPointsUnit">نقطة</span><br><span style="font-size:12px; color:var(--muted);"><span class="pn" data-usd="24.99">24.99</span> <span class="cursym">$</span></span></button>
      <button type="button" class="btn pointsPackBtn" onclick="buyPointsPack(900)" style="padding:10px 8px; border-radius:var(--r-2); background:var(--panel2); border:none; cursor:pointer; text-align:center;"><b style="font-size: var(--fs-3);">900</b> <span data-i18n="pricingPointsUnit">نقطة</span><br><span style="font-size:12px; color:var(--muted);"><span class="pn" data-usd="34.99">34.99</span> <span class="cursym">$</span></span></button>
    </div>
  </div>
  
  <div style="margin-top:10px; display:flex; gap:14px; font-size:12px;">
    <a href="/terms.html" target="_blank" style="color:var(--accent,#3b82f6); text-decoration:none;" data-i18n="termsLink">📜 الشروط والأحكام</a>
    <a href="/privacy.html" target="_blank" style="color:var(--accent,#3b82f6); text-decoration:none;" data-i18n="privacyLink">🔒 سياسة الخصوصية</a>
  </div>
  </div></div>

  <div id="aboutSection" class="settingsPageSection" style="padding:14px; margin-bottom:18px;">
    <div class="settingsSectionHeader" onclick="toggleSettingsSection('aboutSection')" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;"><h3 style="margin:0; font-size:14px;" data-i18n="aboutSectionTitle">ℹ️ عن البرنامج والفيديوهات التعريفية</h3><span class="settingsSectionArrow" id="aboutSectionArrow" style="font-size:13px; transition:transform .2s; margin-inline-start:8px;">▶</span></div><div id="aboutSectionContent" class="settingsSectionContent" style="display:none; margin-top:12px;">
      <!-- v-about-lux: بطاقة الهوية -->
      <div style="position:relative; overflow:hidden; border:1px solid rgba(212,175,55,.4); border-radius:20px; padding:24px 16px 20px; text-align:center; background:radial-gradient(130% 100% at 50% 0%, rgba(212,175,55,.16), transparent 55%), var(--panel2,#161616); margin-bottom:14px;">
        <img src="/icons/omran-mark-64.png" alt="عمران AI" width="66" height="66" style="border-radius:17px; box-shadow:0 8px 28px rgba(212,175,55,.3);">
        <div style="font-size:20px; font-weight:800; margin-top:10px; letter-spacing:.3px;">عمران <span style="color:#d4af37;">AI</span></div>
        <div style="font-size:12.5px; color:var(--muted); margin-top:5px;" data-i18n="aboutTagline">منصة عربية لبناء التطبيقات بالذكاء الاصطناعي</div>
        <div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap; margin-top:13px;">
          <span style="font-size:11px; padding:4px 11px; border-radius:999px; border:1px solid rgba(212,175,55,.4); color:#d4af37;">صُنع في الإمارات 🇦🇪</span>
          <span style="font-size:11px; padding:4px 11px; border-radius:999px; border:1px solid var(--border,#3a3a3a); color:var(--muted);">تطبيق PWA</span>
          <span style="font-size:11px; padding:4px 11px; border-radius:999px; border:1px solid var(--border,#3a3a3a); color:var(--muted);">٧ لغات</span>
        </div>
      </div>

      <!-- v-about-lux: شبكة المزايا -->
      <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:8px; margin-bottom:14px;">
        <div style="border:1px solid var(--border,#333); border-radius:14px; padding:12px 10px; text-align:center; background:var(--panel2,rgba(255,255,255,.02));"><div style="font-size:22px;">💬</div><div style="font-size:11.5px; margin-top:6px; line-height:1.5;">بناء تطبيقات كاملة بالمحادثة</div></div>
        <div style="border:1px solid var(--border,#333); border-radius:14px; padding:12px 10px; text-align:center; background:var(--panel2,rgba(255,255,255,.02));"><div style="font-size:22px;">🧠</div><div style="font-size:11.5px; margin-top:6px; line-height:1.5;">٩ مزودي ذكاء + «اسأل الكل»</div></div>
        <div style="border:1px solid var(--border,#333); border-radius:14px; padding:12px 10px; text-align:center; background:var(--panel2,rgba(255,255,255,.02));"><div style="font-size:22px;">🎙️</div><div style="font-size:11.5px; margin-top:6px; line-height:1.5;">مها — مساعدتك الصوتية الحية</div></div>
        <div style="border:1px solid var(--border,#333); border-radius:14px; padding:12px 10px; text-align:center; background:var(--panel2,rgba(255,255,255,.02));"><div style="font-size:22px;">🎨</div><div style="font-size:11.5px; margin-top:6px; line-height:1.5;">٧ استوديوهات إبداعية للصور</div></div>
        <div style="border:1px solid var(--border,#333); border-radius:14px; padding:12px 10px; text-align:center; background:var(--panel2,rgba(255,255,255,.02));"><div style="font-size:22px;">📈</div><div style="font-size:11.5px; margin-top:6px; line-height:1.5;">سوق الأسهم ومحفظة تعليمية</div></div>
        <div style="border:1px solid var(--border,#333); border-radius:14px; padding:12px 10px; text-align:center; background:var(--panel2,rgba(255,255,255,.02));"><div style="font-size:22px;">🔒</div><div style="font-size:11.5px; margin-top:6px; line-height:1.5;">خصوصيتك أولوية — مفاتيحك عندك</div></div>
      </div>

      <!-- v-about-lux: نبذة قابلة للطي -->
      <details style="border:1px solid var(--border,#333); border-radius:14px; padding:12px 14px; margin-bottom:16px; background:var(--panel2,rgba(255,255,255,.02));">
        <summary style="cursor:pointer; font-size:13px; font-weight:700; user-select:none;">📖 المزيد عن المنصة</summary>
        <div style="font-size: var(--fs-3); line-height:1.9; color:var(--text); margin-top:10px;" data-i18n="aboutText">
    <b>عمران AI Builder</b> هو منصة عربية بالكامل لبناء التطبيقات بالذكاء الاصطناعي، طوّرها فريق عمران AI. يتيح لك التحدث مع الذكاء الاصطناعي بالعربية أو الإنجليزية للحصول فورًا على كود تطبيق كامل، مع محرر كود ومعاينة حيّة جنبًا إلى جنب.<br><br>
    يدعم البرنامج 4 مزوّدين للذكاء الاصطناعي (Claude، Gemini، OpenAI، Groq)، ويمكنك اختيار أكثر من مزوّد في نفس الوقت لطرح سؤال واحد والحصول على إجابات من الجميع للمقارنة بينها.<br><br>
    يعمل البرنامج كتطبيق PWA قابل للتثبيت على أندرويد وآيفون مثل أي تطبيق عادي، ويدعم المحادثة الصوتية (تحويل الكلام إلى نص والاستماع للردود)، مع نظام حسابات كامل (تسجيل دخول/تسجيل حساب/استرجاع كلمة المرور)، ووضع ضيف يتيح تجربة 20 رسالة مجانية دون تسجيل.<br><br>
    كل إعدادات المظهر والألوان قابلة للتخصيص بالكامل، ومفاتيح API الخاصة بك تُحفظ في متصفحك فقط ولا تُرسل لأي خادم خارجي — خصوصيتك أولوية.
        </div>
      </details>

      <!-- v-about-lux: الفيديوهات التعريفية -->
      <div style="display:flex; align-items:center; gap:8px; font-weight:800; font-size:13.5px; margin:0 0 10px;"><span style="width:4px; height:16px; border-radius:2px; background:#d4af37; display:inline-block;"></span><span data-i18n="videosGroupTitle">🎬 الفيديوهات التعريفية</span></div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px;">
        <div class="lang-videos-ar" style="border:1px solid rgba(212,175,55,.28); border-radius:16px; overflow:hidden; background:var(--panel2,rgba(255,255,255,.02));">
          <div style="display:flex; align-items:center; justify-content:space-between; padding:9px 12px;"><span style="font-weight:700; font-size:12.5px;" data-i18n="videoArShortTitle">جولة سريعة بالعربي</span><span style="font-size:10.5px; padding:2px 9px; border-radius:999px; background:rgba(212,175,55,.15); color:#d4af37;">قصير</span></div>
          <video controls preload="none" playsinline style="width:100%; display:block; background:#000; aspect-ratio:16/9; object-fit:cover;"><source src="https://6tfgxvttzyoiavtu.public.blob.vercel-storage.com/omran_ai_builder_ar_short.mp4" type="video/mp4"></video>
        </div>
        <div class="lang-videos-ar" style="border:1px solid rgba(212,175,55,.28); border-radius:16px; overflow:hidden; background:var(--panel2,rgba(255,255,255,.02));">
          <div style="display:flex; align-items:center; justify-content:space-between; padding:9px 12px;"><span style="font-weight:700; font-size:12.5px;" data-i18n="videoArLongTitle">الشرح الكامل بالعربي</span><span style="font-size:10.5px; padding:2px 9px; border-radius:999px; background:rgba(212,175,55,.15); color:#d4af37;">كامل</span></div>
          <video controls preload="none" playsinline style="width:100%; display:block; background:#000; aspect-ratio:16/9; object-fit:cover;"><source src="https://6tfgxvttzyoiavtu.public.blob.vercel-storage.com/omran_ai_builder_ar_long.mp4" type="video/mp4"></video>
        </div>
        <div class="lang-videos-en" style="border:1px solid rgba(212,175,55,.28); border-radius:16px; overflow:hidden; background:var(--panel2,rgba(255,255,255,.02));">
          <div style="display:flex; align-items:center; justify-content:space-between; padding:9px 12px;"><span style="font-weight:700; font-size:12.5px;" data-i18n="videoEnShortTitle">Quick English tour</span><span style="font-size:10.5px; padding:2px 9px; border-radius:999px; background:rgba(212,175,55,.15); color:#d4af37;">Short</span></div>
          <video controls preload="none" playsinline style="width:100%; display:block; background:#000; aspect-ratio:16/9; object-fit:cover;"><source src="https://6tfgxvttzyoiavtu.public.blob.vercel-storage.com/omran_ai_builder_en_short.mp4" type="video/mp4"></video>
        </div>
        <div class="lang-videos-en" style="border:1px solid rgba(212,175,55,.28); border-radius:16px; overflow:hidden; background:var(--panel2,rgba(255,255,255,.02));">
          <div style="display:flex; align-items:center; justify-content:space-between; padding:9px 12px;"><span style="font-weight:700; font-size:12.5px;" data-i18n="videoEnLongTitle">Full English walkthrough</span><span style="font-size:10.5px; padding:2px 9px; border-radius:999px; background:rgba(212,175,55,.15); color:#d4af37;">Full</span></div>
          <video controls preload="none" playsinline style="width:100%; display:block; background:#000; aspect-ratio:16/9; object-fit:cover;"><source src="https://6tfgxvttzyoiavtu.public.blob.vercel-storage.com/omran_ai_builder_en_long.mp4" type="video/mp4"></video>
        </div>
      </div>

      <!-- AppGallery 6.4: معلومات خدمة العملاء ظاهرة داخل التطبيق (v-about-lux) -->
      <div id="supportContactBox" style="border:1px solid var(--border,#333); border-radius:16px; padding:14px; margin-top:16px; background:var(--panel2,rgba(255,255,255,.02));">
        <div style="display:flex; align-items:center; gap:8px; font-weight:800; font-size:13.5px; margin-bottom:8px;"><span style="width:4px; height:16px; border-radius:2px; background:#d4af37; display:inline-block;"></span>📞 خدمة العملاء والدعم</div>
        <div style="font-size:12.5px; color:var(--muted); line-height:1.9;">نرد على استفساراتك خلال ٢٤-٤٨ ساعة.</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
          <a href="mailto:ommntr77@gmail.com" style="text-decoration:none; font-size:12px; padding:8px 14px; border-radius:999px; border:1px solid rgba(212,175,55,.45); color:#d4af37; direction:ltr; unicode-bidi:isolate;">✉️ ommntr77@gmail.com</a>
          <a href="/privacy.html" target="_blank" rel="noopener" style="text-decoration:none; font-size:12px; padding:8px 14px; border-radius:999px; border:1px solid var(--border,#3a3a3a); color:var(--text);">🔒 سياسة الخصوصية</a>
          <a href="/terms.html" target="_blank" rel="noopener" style="text-decoration:none; font-size:12px; padding:8px 14px; border-radius:999px; border:1px solid var(--border,#3a3a3a); color:var(--text);">📄 شروط الاستخدام</a>
        </div>
      </div>

      <!-- v-about-lux: التواصل -->
      <div style="margin-top:16px; text-align:center;">
        <div style="font-weight:700; font-size:12.5px; margin-bottom:10px; color:var(--muted);" data-i18n="socialTitle">تابعنا على منصات التواصل</div>
        <div style="display:flex; gap:14px; justify-content:center;">
      <a href="#" title="Instagram" style="text-decoration:none; display:flex; width:38px; height:38px; align-items:center; justify-content:center; border-radius:12px; background:linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M12 2.2c3.2 0 3.6 0 4.9.07 1.2.06 2 .25 2.6.5.7.28 1.2.6 1.7 1.1.5.5.9 1 1.1 1.7.25.6.44 1.4.5 2.6.06 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.06 1.2-.25 2-.5 2.6-.28.7-.6 1.2-1.1 1.7-.5.5-1 .9-1.7 1.1-.6.25-1.4.44-2.6.5-1.3.06-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.2-.06-2-.25-2.6-.5-.7-.28-1.2-.6-1.7-1.1-.5-.5-.9-1-1.1-1.7-.25-.6-.44-1.4-.5-2.6C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.06-1.2.25-2 .5-2.6.28-.7.6-1.2 1.1-1.7.5-.5 1-.9 1.7-1.1.6-.25 1.4-.44 2.6-.5C8.4 2.2 8.8 2.2 12 2.2zm0 1.8c-3.14 0-3.5 0-4.75.07-1 .05-1.6.2-1.98.35-.5.2-.85.42-1.22.8-.38.37-.6.72-.8 1.22-.15.38-.3.98-.35 1.98C2.8 8.5 2.8 8.86 2.8 12s0 3.5.07 4.75c.05 1 .2 1.6.35 1.98.2.5.42.85.8 1.22.37.38.72.6 1.22.8.38.15.98.3 1.98.35 1.25.07 1.61.07 4.75.07s3.5 0 4.75-.07c1-.05 1.6-.2 1.98-.35.5-.2.85-.42 1.22-.8.38-.37.6-.72.8-1.22.15-.38.3-.98.35-1.98.07-1.25.07-1.61.07-4.75s0-3.5-.07-4.75c-.05-1-.2-1.6-.35-1.98-.2-.5-.42-.85-.8-1.22-.37-.38-.72-.6-1.22-.8-.38-.15-.98-.3-1.98-.35C15.5 4 15.14 4 12 4zm0 3.4a4.6 4.6 0 110 9.2 4.6 4.6 0 010-9.2zm0 1.8a2.8 2.8 0 100 5.6 2.8 2.8 0 000-5.6zm4.8-2.2a1.08 1.08 0 110 2.16 1.08 1.08 0 010-2.16z"/></svg>
      </a>
      <a href="#" title="X / Twitter" style="text-decoration:none; display:flex; width:38px; height:38px; align-items:center; justify-content:center; border-radius:12px; background:#000;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M18.9 2H22l-7.6 8.7L23.3 22h-6.9l-5.4-6.9L4.7 22H1.6l8.2-9.3L1 2h7.1l4.9 6.4L18.9 2zm-1.2 18h1.9L7.4 4H5.4l12.3 16z"/></svg>
      </a>
      <a href="#" title="TikTok" style="text-decoration:none; display:flex; width:38px; height:38px; align-items:center; justify-content:center; border-radius:12px; background:#000;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M16.6 2h-3.3v13.5a3 3 0 11-2.1-2.9V9.2a6.1 6.1 0 104.4 5.9V8.5a7.8 7.8 0 004.6 1.5V6.8a4.6 4.6 0 01-3.6-4.8z"/></svg>
      </a>
      <a href="#" title="YouTube" style="text-decoration:none; display:flex; width:38px; height:38px; align-items:center; justify-content:center; border-radius:12px; background:#FF0000;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 00.5 6.2 31 31 0 000 12a31 31 0 00.5 5.8 3 3 0 002.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 002.1-2.1A31 31 0 0024 12a31 31 0 00-.5-5.8zM9.6 15.5v-7l6.3 3.5-6.3 3.5z"/></svg>
      </a>
      <a href="#" title="WhatsApp" style="text-decoration:none; display:flex; width:38px; height:38px; align-items:center; justify-content:center; border-radius:12px; background:#25D366;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M17.5 14.4c-.3-.1-1.7-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.6-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.3-.5.1-.2 0-.4 0-.5C10 9 9.4 7.6 9.2 7c-.2-.5-.4-.5-.6-.5h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3 4.8 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.5-.3zM12 2a10 10 0 00-8.6 15L2 22l5.1-1.3A10 10 0 1012 2zm0 18.3c-1.6 0-3.2-.4-4.5-1.2l-.3-.2-3 .8.8-3-.2-.3A8.3 8.3 0 1120.3 12 8.3 8.3 0 0112 20.3z"/></svg>
      </a>
        </div>
        <div style="font-size:11px; color:var(--muted); opacity:.75; margin-top:16px;">© فريق عمران AI — صُنع بحب في الإمارات 🇦🇪</div>
      </div>
  </div></div>


  <div id="adminSectionWrap" style="display:none;">
    <div class="settingsSectionHeader" onclick="toggleSettingsSection('adminSection')" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none;"><h3 style="margin:0; font-size:14px;">🛠️ لوحة التحكم (خاص بالمالك)</h3><span class="settingsSectionArrow" id="adminSectionArrow" style="font-size:13px; transition:transform .2s; margin-inline-start:8px;">▶</span></div>
    <div id="adminSectionContent" class="settingsSectionContent" style="display:none; margin-top:12px;">
      <button type="button" id="adminStatsRefreshBtn" onclick="loadAdminStats()" style="padding:8px 14px; border-radius:var(--r-2); border:1px solid var(--accent); background:var(--panel2); color:var(--text); font-size:13px; cursor:pointer; margin-bottom:10px;">🔄 تحديث الإحصائيات</button>
      <div id="adminStatsBox" style="font-size: var(--fs-3); line-height:1.9; background:var(--panel2); border-radius:var(--r-2); padding:12px 14px; white-space:pre-wrap;">اضغط "تحديث" لعرض الإحصائيات...</div>
      <div style="margin-top:14px; font-size:13px; font-weight:700; opacity:.8;">👤 إدارة المستخدمين (حظر / حذف / رسالة)</div>
      <div id="adminUsersTable" style="margin-top:8px; background:var(--panel2); border-radius:var(--r-2); padding:6px 10px; max-height:320px; overflow-y:auto;"></div>

      <div style="margin-top:18px; font-size:13px; font-weight:700; opacity:.8;">⭐ صلاحيات VIP (بلا حدود)</div>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <input type="text" id="vipInput" placeholder="إيميل أو اسم مستخدم" style="flex:1; min-width:0; padding:8px 10px; border-radius:var(--r-2); border:1px solid var(--border); background:var(--panel2); color:var(--text); font-size:12.5px;">
        <button type="button" id="vipAddBtn" onclick="addVipUser()" style="padding:8px 14px; border-radius:var(--r-2); border:1px solid var(--accent); background:var(--panel2); color:var(--text); font-size:12px; cursor:pointer;">➕ إضافة</button>
      </div>
      <div id="vipListBox" style="margin-top:8px; background:var(--panel2); border-radius:var(--r-2); padding:6px 10px; max-height:240px; overflow-y:auto;"></div>


      <div style="margin-top:18px; font-size:13px; font-weight:700; opacity:.8;">🩺 فحص النظام</div>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <button type="button" id="adminHealthBtn" onclick="runHealthCheck()" style="flex:1; padding:8px 10px; border-radius:var(--r-2); border:1px solid var(--accent); background:var(--panel2); color:var(--text); font-size:12px; cursor:pointer;">🩺 افحص الآن</button>
        <button type="button" id="adminHealthClearBtn" onclick="clearClientErrors()" style="flex:1; padding:8px 10px; border-radius:var(--r-2); border:1px solid var(--accent); background:var(--panel2); color:var(--text); font-size:12px; cursor:pointer;">🧹 مسح سجل الأخطاء</button>
      </div>
      <div id="adminHealthBox" style="margin-top:10px; font-size:12.5px; line-height:1.9; background:var(--panel2); border-radius:var(--r-2); padding:12px 14px; white-space:pre-wrap;">اضغط "افحص الآن" لتشغيل الفحص...</div>
    </div>
  </div>

  <button type="button" id="settingsLogoutBtn" style="display:none !important; width:100%; margin-top:18px; padding:12px; border-radius:var(--r-2); border:none; background:none; color:#fff; font-weight:700; font-size:14px; cursor:pointer;">🔑 <span id="settingsLogoutBtnLabel" data-i18n="loginAction">دخول</span></button>

  <div style="height:24px;"></div>

  <div id="checkoutModalOverlay" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:9999; align-items:center; justify-content:center;">
    <div style="background:var(--panel); border-radius:var(--r-3); padding:20px; width:min(420px, 92vw); max-height:88vh; overflow-y:auto; position:relative;">
      <button type="button" onclick="closeCheckout()" style="position:absolute; inset-inline-end:12px; top:12px; background:none; border:none; font-size:20px; cursor:pointer; color:var(--text);">✕</button>
      <h3 style="margin:0 0 4px;" data-i18n="checkoutTitle">إتمام الاشتراك</h3>
      <div id="checkoutPlanLabel" style="font-size: var(--fs-3); color:var(--muted); margin-bottom:14px;"></div>


      <div style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
        

        <button type="button" onclick="clickGooglePay()" style="display:flex; align-items:center; justify-content:center; gap:8px; padding:12px 14px; border-radius:10px; border:1px solid #dadce0; background:#fff; color:#3c4043; cursor:pointer; font-size: var(--fs-3); font-weight:600;">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.66-.22-2.44H12v4.62h6.47c-.28 1.5-1.13 2.77-2.4 3.63v3.02h3.89c2.27-2.09 3.56-5.17 3.56-8.83z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.89-3.02c-1.08.72-2.46 1.15-4.06 1.15-3.12 0-5.76-2.11-6.7-4.94H1.28v3.11C3.26 21.3 7.31 24 12 24z"/>
            <path fill="#FBBC05" d="M5.3 14.29A7.2 7.2 0 0 1 4.91 12c0-.79.14-1.56.39-2.29V6.6H1.28A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l4.02-3.11z"/>
            <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.28 6.6l4.02 3.11c.94-2.83 3.58-4.94 6.7-4.94z"/>
          </svg>
          <span data-i18n="checkoutGooglePay">Google Pay</span>
        </button>

        <button type="button" onclick="startStripeCheckout()" style="display:flex; align-items:center; gap:10px; padding:12px 14px; border-radius:10px; border:2px solid #c9a227; background:var(--panel2); cursor:pointer; font-size: var(--fs-3); color:var(--text); font-weight:600;">
          <span style="font-size:20px;">💳</span>
          <span data-i18n="checkoutCardOption">بطاقة</span>
        </button>

        <div id="paypalButtonContainer" style="min-height:45px;"></div>
        <button type="button" id="paypalFallbackBtn" onclick="startPaypalCheckout()" style="display:none; align-items:center; justify-content:center; gap:8px; padding:12px 14px; border-radius:10px; border:none; background:#0070ba; color:#fff; cursor:pointer; font-size: var(--fs-3); font-weight:600;">
          <span style="font-size:20px;">🅿️</span>
          <span>PayPal</span>
        </button>
      </div>
      <div id="checkoutStatusMsg" style="margin-top:12px; font-size: var(--fs-3); text-align:center;"></div>
    </div>
  </div>

  <div class="dlg-actions">
    <button class="btn" id="btnCancelSettings" style="background:none; border:none; box-shadow:none;">✖️ <span data-i18n="cancel">إلغاء</span></button>
    <button class="btn primary" id="btnSaveSettings" style="background:none; border:none; box-shadow:none; color:var(--accent);">💾 <span data-i18n="save">حفظ</span></button>
  </div>
</dialog>

<dialog id="clockDialog" style="width:480px;">
  <h3 style="margin-top:0;" data-i18n="clockDialogTitle">🕌🕐 التقويم والوقت</h3>

  <div id="clockMainBox" style="border:1px solid var(--border); border-radius:var(--r-3); padding:16px; margin-bottom:16px; background:var(--panel2); text-align:center;">
    <div id="clockGregorianTime" style="font-size:32px; font-weight:700; letter-spacing:1px; direction:ltr;">--:--:--</div>
    <div id="clockGregorianDate" style="font-size: var(--fs-3); color:var(--muted); margin-top:6px;">--</div>
    <div style="height:1px; background:var(--border); margin:12px 0;"></div>
    <div id="clockHijriDate" style="font-size: var(--fs-2); font-weight: var(--w-bold);">--</div>
    <div style="font-size: var(--fs-5); color:var(--muted); margin-top:2px;" data-i18n="clockLocalTZ">توقيتك المحلي</div>
  </div>

  <label data-i18n="clockSelectCountry">اختر الدولة / المدينة</label>
  <select id="clockTZSelect"></select>

  <div id="clockSelectedBox" style="border:1px solid var(--border); border-radius:var(--r-3); padding:14px; margin:10px 0 16px; background:var(--panel2); text-align:center;">
    <div id="clockSelectedTime" style="font-size:26px; font-weight:700; direction:ltr;">--:--:--</div>
    <div id="clockSelectedMeta" style="font-size:12px; color:var(--muted); margin-top:4px;">--</div>
  </div>

  <label data-i18n="clockWorldLabel">🌍 الساعة العالمية</label>
  <div id="clockWorldStrip" style="display:flex; flex-direction:column; gap:8px; margin-top:6px;"></div>

  <div class="dlg-actions">
    <button class="btn" id="btnCloseClock">✖️ <span data-i18n="cancel">إلغاء</span></button>
    <button class="btn primary" id="btnSaveClock">💾 <span data-i18n="save">حفظ</span></button>
  </div>
</dialog>

<!-- Templates gallery modal -->
<dialog id="templatesModal" style="border:1px solid #262b36; border-radius:var(--r-4); background:#000000; color:#eef0f6; max-width:920px; width:92vw; max-height:85vh; padding:0;">
  <div style="display:flex; align-items:center; justify-content:space-between; padding:calc(18px + env(safe-area-inset-top, 0px)) 22px 18px; border-bottom:1px solid #262b36;">
    <h3 style="margin:0; font-size:18px;" data-i18n="templatesModalTitle">🧩 اختر قالبًا جاهزًا</h3>
    <button type="button" id="btnCloseTemplates" style="width:38px; height:38px; min-width:38px; border-radius:50%; background:#fff; color:#12141d; border:none; font-size:18px; font-weight:700; cursor:pointer; box-shadow:var(--sh-1); display:flex; align-items:center; justify-content:center; padding:0;">✕</button>
  </div>
  <div id="templatesGrid" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:14px; padding:22px; overflow-y:auto; max-height:calc(85vh - 60px);"></div>
  <div id="templatePreviewWrap" style="display:none; position:relative; height:calc(85vh - 60px);">
    <button type="button" id="btnClosePreviewTpl" style="position:absolute; top:calc(12px + env(safe-area-inset-top, 0px)); inset-inline-start:12px; z-index:5; width:38px; height:38px; border-radius:50%; background:#fff; color:#12141d; border:none; font-size:18px; font-weight:700; cursor:pointer; box-shadow:var(--sh-1); display:flex; align-items:center; justify-content:center; padding:0;">✕</button>
    <iframe id="templatePreviewFrame" style="width:100%; height:100%; border:0; background:#fff;"></iframe>
    <div style="position:absolute; bottom:0; inset-inline:0; padding:14px 22px; background:linear-gradient(0deg,#12141d,transparent); display:flex; justify-content:flex-end;">
      <button type="button" class="btn primary" id="btnUseThisTemplate" data-i18n="useThisTemplate">✅ استخدام هذا القالب</button>
    </div>
  </div>
</dialog>`;
  // — توحيد العملة: يحمّل المحرّك المشترك ويركّبه على شاشة الباقات —
  function __mountCur() {
    function go() {
      var root = document.getElementById('settingsDialog');
      var sel = document.getElementById('setCurSel');
      if (root && sel && window.OmranCur) { try { window.OmranCur.mount(root, sel); } catch (e) {} } // guard-ok: تعثّر منتقي العملة يجب ألّا يُسقط شاشة الإعدادات كلّها
    }
    function loadCur() {
      if (window.OmranCur) { go(); return; }
      var sc = document.querySelector('script[data-omran-cur]');
      if (!sc) {
        sc = document.createElement('script');
        sc.src = '/js/currency.js?v=2';
        sc.charset = 'utf-8';
        sc.setAttribute('data-omran-cur', '1');
        sc.addEventListener('load', go);
        document.head.appendChild(sc);
      } else { sc.addEventListener('load', go); }
    }
    if (window.OmranGeo) { loadCur(); return; }
    var g = document.querySelector('script[data-omran-geo]');
    if (!g) {
      g = document.createElement('script');
      g.src = '/js/geo.js?v=589';
      g.charset = 'utf-8';
      g.setAttribute('data-omran-geo', '1');
      g.addEventListener('load', loadCur);
      g.addEventListener('error', loadCur);
      document.head.appendChild(g);
    } else { g.addEventListener('load', loadCur); }
  }
  if (document.readyState === 'loading') { document.write(H); __mountCur(); return; }
  var d = document.createElement('div'); d.innerHTML = H;
  var f = document.createDocumentFragment();
  while (d.firstChild) f.appendChild(d.firstChild);
  (S && S.parentNode ? S.parentNode : document.body).insertBefore(f, S || null);
  __mountCur();
})();
