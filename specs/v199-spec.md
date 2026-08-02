# v199 Spec — omran-ai-builder

## App facts
- Main SPA: `/tasklet/agent/home/apps/aidark-clone/index.html` (~1.8MB single file, Arabic RTL app).
- SW: `/tasklet/agent/home/apps/aidark-clone/sw.js` — CACHE_NAME currently `omran-ai-builder-v198`. Deploy bumps to v199 (done by parent at the end — subagents must NOT deploy, NOT bump SW).
- API: `/tasklet/agent/home/apps/aidark-clone/api/` — Vercel serverless. HARD LIMIT 12 function files — do NOT add new files under api/ (files under api/_lib/ are fine, they are not functions).
- i18n: `t('key')` function; JSON files in `/tasklet/agent/home/i18n/` (14 languages). For NEW strings: use pattern `t('key') || 'نص عربي'` inline fallback, and add the key to `ar.json` + `en.json` only (script it; do not hand-copy all 14).
- CRITICAL: never make parallel write_file calls. For the huge index.html prefer Python scripted find/replace edits (exact unique anchors, verify match count == 1 before replacing, re-verify after).
- Design rules: NO letter-spacing on Arabic text; `dir="rtl"` respected; no childish emoji icons in the new UI — thin-line monochrome SVG icons (stroke="currentColor", fill="none", stroke-width≈1.8, like ChatGPT/iOS style).
- After edits: `node -e` or basic sanity check that file parses (no unbalanced template literal introduced), plus grep-verify anchors.

## Feature ① — Settings redesign (ChatGPT style)
Current: `<dialog id="settingsDialog">` (starts ~line 1888) with 8 accordion sections:
langSection, accountSection, statsSection, apiKeysSection, customizeSection(تخصيص), soundSection(الصوت), pricingSection(خطط الأسعار), aboutSection(عن البرنامج) — find exact IDs by grep `toggleSettingsSection`.
Rebuild UX into two-level navigation, WITHOUT rewriting the section contents:
1. **Home view** (default when dialog opens):
   - Top: smart command box — text input + mic button + send arrow. Placeholder: `t('settingsCmdPh') || 'اكتب ما تريد تغييره… مثال: خط أكبر وخلفية بحرية'`.
   - Below: clean list of 8 rows. Each row: thin-line SVG icon (globe, user, bar-chart, key, palette/sliders, speaker, credit-card, info-circle) + section title + chevron (‹ pointing correctly in RTL). Rows: padding 14px, subtle separator, hover/active bg, border-radius, NO heavy borders/boxes — clean like ChatGPT settings.
   - Then existing logout button stays at bottom of home view.
2. **Page view**: clicking a row hides home view, shows page: header row = back button (thin arrow SVG) + section title, then the EXISTING section content element (move the existing `*SectionContent` DOM node into the page container, keep all IDs/listeners intact). Slide-in animation (transform translateX, 0.25s, RTL-aware). Back returns to home.
- Remove old accordion headers/arrows from view (hide them; do not delete content).
- Keep dialog open/close, drag/maximize behaviors working.
3. **Smart command execution**: on submit, parse the command:
   - Local parser first (regex, Arabic+English) for: language change (14 names), font size (أكبر/أصغر/bigger/smaller → adjust a root font-size CSS var by ±10%, persist localStorage `uiFontScale`, apply on load), background change (map to existing 20 3D backgrounds picker — find its code by grep `setBackground|bg3d|backgroundPicker`; keywords like بحر/فضاء/مطر match background names), voice male/female + speed (find existing voice settings in soundSection), ticker on/off (feature ④), reset (رجع كل شي → clear these localStorage keys + reload).
   - If local parser finds nothing → fallback: POST to `/api/ai` the way the app normally calls it BUT with a tiny system instruction asking to return ONLY JSON `{"actions":[{"type":"...","value":"..."}]}` — inspect how frontend calls /api/ai (grep `api({`) and reuse minimal call; provider claude. If the call fails, show 'ما فهمت الطلب، جرب صياغة ثانية'.
   - After executing, show small toast ✓ with what changed. Changes apply LIVE without closing dialog.
   - Mic button: reuse existing STT recording flow (grep `/api/stt` usage in the main input) to fill the command box.

## Feature ③ — Reply action bar
Location: message render function ~line 14745-14800 (speak button + copyMsgBtn) — also a second copy icon around line 16401 (streaming bubble); update BOTH places to render the same unified bar.
Under every assistant reply, one row of thin-line SVG icon buttons (16-18px, color var(--muted), hover var(--accent2), background:none, border:none, gap ~14px):
1. **⋮ (more)** — opens small popup menu anchored to button: «تحويل إلى PDF» / «تحويل إلى Word» / «تحويل إلى صورة» / «تنزيل نص TXT». Implement client-side, no heavy libraries:
   - PDF: open hidden iframe/new window with clean RTL-styled HTML of the reply (Arabic font, padding, `dir="rtl"`) + `window.print()` (browser saves as PDF). Title = «عمران AI».
   - Word: Blob download `.doc` with `application/msword` + HTML content (RTL).
   - صورة: render reply text into canvas (white bg, dark text, RTL via ctx.direction='rtl', wrap lines, padding 40px) → PNG download.
   - TXT: plain Blob download.
   - Menu closes on outside click. Only ONE menu open at a time.
2. **Share** (share-2 style icon: 3 circles + lines): `navigator.share({text})`, fallback → copy + toast «تم النسخ».
3. **🔊 Listen** (speaker thin-line SVG): keep EXACT existing speak logic (speakSmart toggle) but replace the text button with the icon; icon state changes while speaking (e.g., turns accent color / stop icon).
4. **👍 / 👎** (thumbs thin-line SVG): on click fills current color (accent for 👍, muted red for 👎), toggles, mutually exclusive; store per-message in memory only.
5. **Copy**: keep existing copy behavior/icon (already thin-line, turns ✓ 1.5s).
Order RTL: ⋮ | share | listen | 👎 | 👍 | copy (mirror ChatGPT). Keep «استخدم هذا الإصدار» button logic untouched (it renders separately).
The old standalone speak text-button must be removed (replaced by icon).

## Feature ④ — Stock ticker calm toggle
- Ticker code ~line 24040 (`#stockTicker`, refreshTicker, tickerAnim).
- Add localStorage key `tickerEnabled` (default '1').
- In settings تخصيص section (customizeSection content, top): add a clean toggle row «شريط الأسهم المتحرك» with an iOS-style switch (pure CSS). Off → hide #stockTicker, cancel animation+interval; On → show + restart. Applies live + on page load.
- Also expose to smart command parser: «وقف شريط الأسهم» / «شغل شريط الأسهم».

## Feature ② — Search results ChatGPT style
Backend: `/tasklet/agent/home/apps/aidark-clone/api/_lib/search.js` (Tavily) + `api/ai.js` router.
- Add `include_images: true` to the Tavily call(s) used for informational/live search, and make the search path return structured `sources` (title, url) + `images` (urls) alongside the text answer. Inspect how ai.js returns search-based answers to the frontend (streamed or JSON) and extend the payload in a backward-compatible way (e.g., append a final JSON line/field `__sources`).
- Frontend: when a reply carries sources/images:
  - Above the reply text: horizontal scrollable strip of up to 4 images (border-radius 12px, height ~140px, object-fit cover, lazy, onerror→remove).
  - After the reply text: row of small source badges — pill with favicon (`https://www.google.com/s2/favicons?domain={host}&sz=32`) + domain name, click opens url in new tab. Max 6, wrap.
  - Persist sources/images with the message in chat history state so they re-render (find how messages are saved — `m.content` etc. — add `m.sources`, `m.images`).
- Do NOT change search routing rules/keywords. Do NOT add model-memory platforms — display only what Tavily returned.

## Acceptance
- All 4 features work on mobile layout (primary) and desktop.
- No console errors on load. Existing flows unbroken: sending messages, provider bar, projects, code panel, مها button, ⚙️ open/close.
