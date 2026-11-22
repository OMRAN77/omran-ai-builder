// Achievements: small goals read from what the game already counts. Each is told once, with a few points
// of experience, and is kept in this browser.

import { levelOf } from './status.js';

export const FEATS = [
  ['dig1', 'أول ضربة', 'اكسر أول مكعب', (s) => s.broken >= 1],
  ['dig50', 'حفّار', 'اكسر 50 مكعب', (s) => s.broken >= 50],
  ['build20', 'بنّاء', 'حط 20 مكعب', (s) => s.placed >= 20],
  ['hunt', 'صيّاد', 'صيد أول حيوان', (s) => s.kills.animal >= 1],
  ['slay', 'قاهر الوحوش', 'اقضِ على 3 وحوش', (s) => s.kills.monster >= 3],
  ['eat', 'شبعان', 'كل لحم', (s) => s.eaten >= 1],
  ['craft', 'صانع', 'اصنع أول غرض', (s) => s.crafted >= 1],
  ['armor', 'مدرّع', 'البس الأربع قطع', (s) => !!(s.gear.head && s.gear.chest && s.gear.legs && s.gear.feet)],
  ['chest', 'أمين المخزن', 'افتح صندوق', (s) => s.opened >= 1],
  ['fly', 'طيّار', 'طِر عشر ثواني', (s) => s.flown >= 10],
  ['swim', 'سبّاح', 'اسبح عشر ثواني', (s) => s.swum >= 10],
  ['night', 'سهران', 'عش دقيقة في الليل', (s) => s.nightTime >= 60],
  ['level3', 'خبير', 'وصّل المستوى 3', (s) => levelOf(s.xp || 0).level >= 3],
];

export function createFeats({ play }) {
  const st = play.state, done = new Set();
  try { for (const k of JSON.parse(window.localStorage.getItem('bw-feats') || '[]')) done.add(k); } catch (e) { /* storage may be closed or hold something else */ }
  st.nightTime = 0;
  let last = st.time, wait = 0;
  const api = {
    done,
    level: () => levelOf(st.xp || 0).level,
    list: () => FEATS.map(([key, name, how]) => ({ key, name, how, done: done.has(key) })),
    /** Called every frame; looks once in a while. */
    check() {
      const dt = Math.max(0, st.time - last); last = st.time;
      if (window.__GAME_SKY && window.__GAME_SKY.night) st.nightTime += dt;
      if ((wait -= dt) > 0) return;
      wait = 0.5;
      for (const [key, name, , test] of FEATS) {
        if (done.has(key) || !test(st)) continue;
        done.add(key); st.xp = (st.xp || 0) + 5;
        try { window.localStorage.setItem('bw-feats', JSON.stringify([...done])); } catch (e) { /* not kept */ }
        play.notice('إنجاز جديد: ' + name + ' (+5 خبرة)', false, 4200);
        if (play.sound && play.sound.level) play.sound.level();
        break;                                        // one at a time, so each is read
      }
    },
  };
  window.__GAME_FEATS = api;
  return api;
}
