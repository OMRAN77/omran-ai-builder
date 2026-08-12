'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlannerPrompt, validatePrayerPlan, authorPrayerPlan } = require('../api/_lib/prayer-plan');

const distinctPlan = {
  prayerText: 'اللهم أنزل على قلبي سكينتك، وبدّل قلقي طمأنينة، وافتح لي أبواب الأمل واليقين، واهدني إلى ما فيه خيري.',
  visualBrief: 'A quiet reading nook before dawn, with a folded wool blanket, a hand-shaped clay sculpture, and one beam of cool light crossing a warm earthen wall. Eye-level composition, muted cobalt and amber palette, generous uncluttered space along the bottom, no people and no writing.',
  topicLabel: 'الطمأنينة عند القلق',
};

test('planner instructions are dynamic rather than a fixed prayer list', () => {
  const prompt = buildPlannerPrompt('دعاء لمن يبدأ عملًا جديدًا', { directionIndex: 2, textPosition: 'top' });
  assert.match(prompt, /Understand any supplication topic dynamically/);
  assert.match(prompt, /دعاء لمن يبدأ عملًا جديدًا/);
  assert.match(prompt, /Keep the top region calm/);
  assert.match(buildPlannerPrompt('أريد شعرًا', { kind:'poetry' }), /original polished 2–4 line Arabic poem/);
  assert.doesNotMatch(prompt, /دعاء الصباح|دعاء المساء|دعاء الاستخارة/);
});

test('a complete topic-specific plan passes validation', () => {
  assert.deepEqual(validatePrayerPlan(distinctPlan, 'دعاء للطمأنينة عند القلق'), distinctPlan);
});

test('the transmitted istikhara prayer is complete even when the planner truncates it', () => {
  const result = validatePrayerPlan({ ...distinctPlan, prayerText: 'اللهم إني أستخيرك بعلمك وأستقدرك بقدرتك وأسألك من فضلك' }, 'دعاء الاستخارة');
  assert.match(result.prayerText, /فَاصْرِفْهُ عَنِّي وَاصْرِفْنِي عَنْهُ/);
  assert.match(result.prayerText, /ثُمَّ أَرْضِنِي بِهِ/);
});

test('generic sea, boat and sunset concepts are rejected unless requested', () => {
  const bad = { ...distinctPlan, visualBrief: 'A person praying in a boat at sea during sunset, with a warm horizon and empty lower composition for an overlay, rendered as a cinematic photograph with soft natural light.' };
  assert.throws(() => validatePrayerPlan(bad, 'دعاء للطمأنينة عند القلق'), /generic_visual_cliche/);
  assert.doesNotThrow(() => validatePrayerPlan(bad, 'صورة شخص يصلي في قارب عند غروب البحر'));
});

test('generic stock still-life props are rejected unless requested', () => {
  const mug = { ...distinctPlan, visualBrief: 'A quiet wooden desk with a steaming ceramic mug, an open notebook, a brass reading lamp, soft window light, muted beige palette, high angle camera view and a clean lower area for text.' };
  assert.throws(() => validatePrayerPlan(mug, 'دعاء للطمأنينة عند القلق'), /generic_visual_cliche/);
  assert.doesNotThrow(() => validatePrayerPlan(mug, 'دعاء مع كوب شاي ودفتر مفتوح ومصباح'));
});

test('planner retries rejected output and returns a valid second plan', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    const plan = calls === 1
      ? { ...distinctPlan, visualBrief: 'A boat at sea during sunset, with a praying person and a calm empty lower region, cinematic warm light and a centered composition for a spiritual poster.' }
      : distinctPlan;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }] }) };
  };
  const result = await authorPrayerPlan('test-key', 'دعاء للطمأنينة عند القلق', { fetchImpl, directionIndex: 0 });
  assert.equal(calls, 2);
  assert.deepEqual(result, distinctPlan);
});
