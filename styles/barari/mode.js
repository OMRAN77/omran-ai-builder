// Which world the endless engine of "barari" draws: 'barari' (the lands of the earth) or 'dino' (the world of the
// dinosaurs, styles/dino/). styles/dino/main.js sets window.__BW_MODE before it loads this engine; the launcher sets
// window.__GAME = { key } before it loads any world. Anything else is barari, exactly as it always was.
const m = window.__BW_MODE || (window.__GAME && window.__GAME.key) || 'barari';
export const MODE = m === 'dino' ? 'dino' : 'barari';
export const DINO = MODE === 'dino';
