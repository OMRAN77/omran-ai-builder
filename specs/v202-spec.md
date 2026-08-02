# v202 Spec — omran-ai-builder UI polish batch

App: /tasklet/agent/home/apps/aidark-clone/index.html (single-file SPA, Arabic RTL).
Bump SW cache version in sw.js AND any version string in index.html to v202.

## 1. Stock ticker ✕
- The stock ticker strip (شريط الأسهم) gets a small ✕ close button at its edge (subtle, gray, no box).
- Clicking ✕ hides ticker and saves `localStorage.tickerHidden='1'`.
- Ticker stays hidden on reload if flag set.
- Existing settings toggle for the ticker must re-enable it (clear the flag). Ensure settings toggle and ✕ use the same flag/state.

## 2. Sections menu (⋮ in header) — SVG icons
- Every item in the sections dropdown (⋮) currently uses emoji (🎨 أنماط، 🏗️ المقاولات، 📈 الأسهم، 🤖 وكيل, etc.).
- Replace ALL emoji in this menu with professional inline SVG line icons (stroke style, currentColor, 18-20px), consistent with the v201 attach-menu icons. No emoji anywhere in this menu.

## 3. Settings smart command box accuracy
- The settings dialog has a smart command input (type/speak a command like "غير الخلفية" / "كبر الخط" / "بدل اللغة").
- Improve matching: normalize Arabic (strip diacritics, unify أ/إ/آ→ا, ة→ه, ى→ي), add synonym lists per action (خلفية/ثيم/مظهر، خط/كتابة/حجم، لغة/ترجم، أسهم/تيكر/بورصة، صوت/تحدث/استماع، حساب/تسجيل/دخول), match on substrings, and if no confident match show closest suggestion instead of doing nothing.

## 4. Attach & suggestions menus — lighter, no box
- The ⋮ composer menu (formerly ➕) and the 💡 suggestions popup: remove background box/border/shadow frames — transparent/minimal panel.
- Reduce overall size: smaller padding, font-size ~13px, icon 16-18px, tighter row height. Must look light and tidy.

## 5. المتصفح row — chevron not toggle
- In the composer ⋮ menu, the "المتصفح" item: REMOVE the on/off toggle switch added in v201.
- It becomes a normal row: SVG globe/browser icon + "المتصفح" + a chevron arrow (‹ pointing, RTL-appropriate) at the row end, ChatGPT style.
- Clicking it opens the code/preview panel for the current project (if no project, show a brief toast "لا يوجد مشروع مفتوح").
- Keep the rule that previews never auto-open for plain Q&A.

## 6. Owner dashboard font
- In settings, the owner-only "لوحة التحكم" section: reduce font sizes (~15-20% smaller) so it fits cleanly; tighten spacing.

## 7. Project delete via ⋮
- In the project list (sidebar/projects), remove any visible delete (🗑️/red) button per project.
- Each project row: clean name only + small ⋮ at row end (visible on hover on desktop, always on mobile) opening a tiny menu: "إعادة تسمية" and "حذف".
- حذف asks confirmation before deleting. إعادة تسمية uses existing rename logic or inline prompt.
- Use SVG icons, no emoji.

## 8. Smaller composer + send/stop
- Reduce composer (input box) height/padding slightly — more compact.
- Reduce send (⬆) and stop (⏹) button sizes (~15-20% smaller). Keep behavior identical (send hidden when empty, stop during generation).

## 9. مها button — smaller + draggable
- Make the floating مها button smaller (~20% smaller), keep pulsing purple glow.
- Default position on first open: vertical middle of the screen edge (same side it currently uses).
- Make it draggable (pointerdown/pointermove/pointerup + touch, with preventDefault on move); distinguish drag from tap (move threshold ~8px — tap still opens مها).
- Persist position in localStorage `mahaBtnPos`; restore on load; clamp within viewport on resize.

## Rules
- ONE write_file edit at a time (never parallel).
- Do not touch عبدالله files. Do not change chat logic, providers, or API files.
- No emoji icons anywhere you touch — professional SVG line icons only.
- Keep everything RTL-correct.
