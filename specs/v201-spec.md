# v201 Spec — omran-ai-builder input area cleanup

File: /tasklet/agent/home/apps/aidark-clone/index.html (large single-file SPA, Arabic RTL).
Edit via Python scripts (read file, targeted string replace, assert counts, write back). NEVER parallel writes.

## 1) Replace ➕ button with ⋮
- The input bar has a plus button (search for `btnPlusTools` / `plusToolsPopup` / ➕ around the composer, near line ~1815-1845) that opens the extras/attach menu.
- Replace its ➕ emoji/text content with a professional thin-line vertical-ellipsis SVG icon (three dots, stroke currentColor, no fill background, ~20-22px). Same click behavior (opens the same popup).

## 2) Attach/extras menu (plusToolsPopup) — professional SVG icons
- Every item in that popup currently uses emoji (📎 إرفاق, 💡 أفكار/قوالب, 😊, 🎧, 🎨, 🖼️ etc.).
- Replace each emoji with a thin-line SVG icon (stroke="currentColor", stroke-width 1.8, 20px, viewBox 24) matching the meaning: paperclip, lightbulb, smiley, headphones, palette, image, etc. Keep Arabic labels and all handlers unchanged.
- Also replace the 🎤 mic button in the input bar with a thin-line microphone SVG (same id/handlers).
- Match the ChatGPT-style icon language already used in the settings dialog (see renderSettingsNavList icons for style reference).

## 3) New item in the same ⋮ popup: «المتصفح» (preview/browser toggle)
- Add a menu item with a thin-line globe/monitor SVG labeled «المتصفح» with a small on/off state (e.g., toggle switch or ✓ indicator drawn in CSS — no emoji).
- Behavior: toggle stored in localStorage key `previewEnabled` (default 'on').
  - When ON and user taps it while a project/preview exists → open the code/preview panel (find existing function that opens the preview drawer/panel, e.g. the ☰ drawer logic on mobile / code panel on desktop) — reuse it, do not build a new panel.
  - When toggled OFF → the preview/code panel must never auto-open; hide/close it if open. Find where the app auto-opens the preview (after build responses) and guard those calls with `localStorage.getItem('previewEnabled')!=='off'`.
  - Tapping the item toggles state; visual state updates immediately.
- Normal chat behavior unchanged otherwise.

## 4) Remove «↕️ عمودي» layout button permanently
- Search for `عمودي` / `layoutVertical` / `toggleAskAllLayout` / `askAllLayoutBtn` — remove the button element and its handlers/CSS references (leftover of cancelled اسأل الكل). Ensure no JS errors from removed ids (guard or delete all usages).

## Rules
- RTL Arabic UI, no emoji in any of the touched UI, no borders/boxes beyond existing style language.
- Do not touch عبدالله files or anything outside index.html.
- After edits run: `node -e "require('fs').readFileSync('/tasklet/agent/home/apps/aidark-clone/index.html','utf8')"` and a quick sanity grep that old strings are gone.
- Do NOT deploy; parent handles deploy + SW bump.
