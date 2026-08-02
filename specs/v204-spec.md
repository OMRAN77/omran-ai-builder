# v204 Spec — bug fixes batch

App: /tasklet/agent/home/apps/aidark-clone/index.html (SPA). Deploy = SW v204.

## Fix 1 — مها floating icon start position
Currently the draggable مها icon starts overlapping the header (top center), covering the عمران AI logo.
Required: on first load (no saved position in localStorage), مها icon must start at the CENTER of the screen (50% width, 50% height, adjusted for icon size). It stays draggable and saved position in localStorage still wins on later loads. Also clamp any saved/loaded position so the icon can never sit on top of the header (min top = header height + provider strip height + 8px) nor outside the viewport.

## Fix 2 — copy button hides conversation
Bug: pressing the copy icon (message action bar or the small copy icon under user message) makes the whole conversation disappear/blank.
Investigate the copy handler(s): likely an exception thrown (e.g., navigator.clipboard unavailable / element selection code wiping innerHTML) or event bubbling triggering another handler (e.g., clearing chat or re-render). Find root cause and fix. Copy must: copy text, show ✅ for 1.5s, and change NOTHING else in the DOM. Wrap clipboard in try/catch with textarea fallback.

## Fix 3 — remove provider-switch toast
The toast «✅ أسئلتك القادمة ستذهب إلى: [provider] فقط» that appears above the input when switching provider must be REMOVED entirely (no toast at all on provider switch). Remove the call, keep switching behavior itself unchanged.

## Fix 4 — vague video/image requests must ask first
Bug: user typed just «اريد فيديو» and the app generated a random (coffee) video, spending 60 Runway points.
Required: before triggering video generation (Runway/Veo) or image generation from the main chat, if the user request lacks a concrete subject/description (e.g., just «اريد فيديو», «سوي فيديو», «أبي صورة», «اريد صورة» with no subject), the app must NOT call the generation API. Instead reply in chat asking one question: «فيديو عن شو؟ وصفلي المشهد اللي تبيه 🎬» (or للصورة: «صورة عن شو؟ وصفلي اللي تبيه 🎨»).
Implement where the video/image routing decision happens (frontend routing in index.html and/or api/ai.js router — check where «اريد فيديو» got routed). Heuristic: after removing trigger keywords (اريد/ابي/ابغي/سوي/اعمل/اصنع/فيديو/صورة/مقطع/لي/لى/انا + punctuation), if remaining meaningful description < 2 words → ask, don't generate. Applies to main chat only; does not affect image-attached flows (image+«سوي فيديو» keeps working since the image is the subject).

## Rules
- ONE write_file edit at a time (parallel writes corrupt files).
- No emoji icons in any UI you touch; SVG line icons only.
- Bump sw.js cache name to omran-ai-builder-v204 and any SW_VERSION/APP_VERSION constant in index.html to v204.
- Do NOT touch عبدالله files. Do not change anything else.
