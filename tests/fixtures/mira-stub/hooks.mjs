// playwright بديل لاختبار مسلسل ميرا (يرسم الطبقات ملفّات وهميّة).
export async function resolve(specifier, context, next) {
  if (specifier === 'playwright') return { url: new URL('./playwright-stub.mjs', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
