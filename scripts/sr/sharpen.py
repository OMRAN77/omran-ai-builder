# scripts/sr/sharpen.py — v-sharp (المالك ١٦ أكتوبر: «الصور بعدها مغبّشة»): توضيح صور التطبيق الثابتة مرّة واحدة بـReal-ESRGAN x4
# على المعالج (onnxruntime، بلا torch ولا مفتاح ولا رصيد). يشغّله .github/workflows/design-thumbs-free.yml بوضع sr:<مجموعة>[:<جزء>/<أجزاء>].
#
#   python3 scripts/sr/sharpen.py sr:decor model.onnx out/        كلّ ملفّات المجموعة
#   python3 scripts/sr/sharpen.py sr:portrait:1/2 model.onnx out/  النصف الأوّل (تشغيلات متوازية)
#
# لكلّ صورة: (اختياريًّا) تصغير إلى دقّة مصدرها المصمَّمة ← ×٤ ← تصغير LANCZOS إلى المقاس الهدف بالنسبة نفسها ← الصيغة نفسها.
# المخرج في out/ بالمسار النسبيّ نفسه؛ الأصل لا يُمسّ هنا (الورك فلو ينسخه فوقه في فرع البوت).
import sys, os, json, glob, numpy as np, onnxruntime as ort
from PIL import Image

SETS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sets.json'), encoding='utf-8'))

def files_of(mode):
    parts = mode.split(':')
    name = parts[1] if len(parts) > 1 else ''
    if name not in SETS or name == '_':
        sys.exit('مجموعة غير معروفة: %r — المتاح: %s' % (name, ', '.join(k for k in SETS if k != '_')))
    s = SETS[name]
    fs = sorted(set(f for g in s['globs'] for f in glob.glob(g)))
    if len(parts) > 2:
        try:
            k, n = map(int, parts[2].split('/'))
        except ValueError:
            k = n = 0
        if not 1 <= k <= n:
            sys.exit('جزء غير صالح: %r — الصيغة ج/ن و١ ≤ ج ≤ ن (مثل 2/3)' % parts[2])
        fs = fs[k - 1::n]
    if not fs:
        sys.exit('%s: لا ملفّات تطابق المجموعة — لا شيء للتوضيح' % mode)
    return s, fs

def esrgan(sess, a, T=160, P=16, S=4):
    H, W, _ = a.shape
    out = np.zeros((H * S, W * S, 3), dtype=np.float32)
    for y in range(0, H, T):
        for x in range(0, W, T):
            y0, x0, y1, x1 = max(y - P, 0), max(x - P, 0), min(y + T + P, H), min(x + T + P, W)
            r = sess.run(None, {'input': a[y0:y1, x0:x1].transpose(2, 0, 1)[None]})[0][0].transpose(1, 2, 0)
            ty, tx = (y - y0) * S, (x - x0) * S
            hh, ww = min(T, H - y) * S, min(T, W - x) * S
            out[y * S:y * S + hh, x * S:x * S + ww] = r[ty:ty + hh, tx:tx + ww]
    return np.clip(out, 0, 1)

def main():
    mode, model, outdir = sys.argv[1:4]
    s, fs = files_of(mode)
    so = ort.SessionOptions(); so.intra_op_num_threads = os.cpu_count() or 4
    sess = ort.InferenceSession(model, so, providers=['CPUExecutionProvider'])
    print('%s: %d ملفًّا' % (mode, len(fs)), flush=True)
    for i, f in enumerate(fs):
        im = Image.open(f); im.load()
        W, H = im.size
        alpha = im.getchannel('A') if im.mode in ('RGBA', 'LA') else None
        rgb = im.convert('RGB')
        pre = (s.get('prescale_to') or {}).get(f)
        if pre: rgb = rgb.resize(tuple(pre), Image.LANCZOS)
        elif s.get('prescale'): rgb = rgb.resize((round(W * s['prescale']), round(H * s['prescale'])), Image.LANCZOS)
        up = Image.fromarray((esrgan(sess, np.asarray(rgb, dtype=np.float32) / 255.0) * 255 + 0.5).astype(np.uint8))
        if s.get('width'): tw = s['width']; th = round(H * tw / W)
        else: tw, th = round(W * s['scale']), round(H * s['scale'])
        res = up.resize((tw, th), Image.LANCZOS)
        if alpha is not None:
            res = res.convert('RGBA'); res.putalpha(alpha.resize((tw, th), Image.LANCZOS))
        dst = os.path.join(outdir, f); os.makedirs(os.path.dirname(dst), exist_ok=True)
        ext = f.rsplit('.', 1)[1].lower()
        if ext == 'webp': res.save(dst, 'WEBP', quality=s.get('q', 82), method=6)
        elif ext in ('jpg', 'jpeg'): res.convert('RGB').save(dst, 'JPEG', quality=s.get('q', 84), optimize=True, progressive=True)
        else: res.save(dst)
        print('%3d/%d ✓ %s %dx%d → %dx%d %dKB' % (i + 1, len(fs), f, W, H, tw, th, os.path.getsize(dst) // 1024), flush=True)

if __name__ == '__main__':
    main()
