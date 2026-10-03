#!/usr/bin/env python3
"""برنامج جهاز عمران (كمبيوتر) — v-device-control.

يربط هذا الكمبيوتر بوكيل عمران: الوكيل يرى الشاشة الرئيسيّة ويضغط ويكتب فيها.
  1. اطلب من الوكيل في التطبيق: «اربط جهازي» — يعطيك رمزًا مثل ABCD-EFGH.
  2. شغّل:  python omran_device.py   واكتب الرمز مرّة واحدة (يُحفظ المفتاح في ~/.omran_device.json).
  3. اترك النافذة مفتوحة. لإيقاف الوكيل فورًا: حرّك الفأرة إلى زاوية الشاشة العليا اليسرى، أو Ctrl+C.

خيارات:  --forget  يمسح الربط   ·   --server URL  خادم آخر   ·   --name اسم  اسم الجهاز.
"""
import argparse
import base64
import io
import json
import os
import platform
import sys
import time

try:
    import mss
    import pyautogui
    import pyperclip
    import requests
    from PIL import Image
except ImportError as e:  # رسالة واضحة بدل تتبّع طويل
    sys.exit('ناقص: %s — شغّل:  pip install -r requirements.txt' % e.name)

SERVER = 'https://omran-ai-builder.vercel.app'
CONF = os.path.join(os.path.expanduser('~'), '.omran_device.json')
MAX_SIDE = 1280
JPEG_Q = 60
ACTIVE_EVERY = 1.0
IDLE_EVERY = 6.0
ACTIVE_FOR = 90
PAUSE_AFTER = 30 * 60
MAC = platform.system() == 'Darwin'
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(errors='replace')
    except AttributeError:
        pass  # بايثون أقدم من 3.7

pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.05


def api(server, body, timeout=30):
    r = requests.post(server.rstrip('/') + '/api/system?action=device', json=body, timeout=timeout)
    try:
        data = r.json()
    except ValueError:
        data = {'error': 'HTTP %d' % r.status_code}
    return r.status_code, data


def load_conf():
    try:
        with open(CONF, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_conf(c):
    with open(CONF, 'w', encoding='utf-8') as f:
        json.dump(c, f)
    try:
        os.chmod(CONF, 0o600)
    except OSError:
        pass  # ويندوز لا يدعم صلاحيّات يونكس


class Screen:
    """اللقطة تُصغَّر إلى MAX_SIDE؛ الوكيل يعطي إحداثيّات بمقاسها، وهنا تُعاد إلى نقاط الفأرة."""

    def __init__(self):
        try:
            self.sct = (getattr(mss, 'MSS', None) or mss.mss)()
        except Exception:  # بعض شاشات لينكس الافتراضيّة يرفضها mss — نلتقط بـPillow
            self.sct = None
        self.shot_w = self.shot_h = 0

    def grab(self):
        if self.sct:
            try:
                raw = self.sct.grab(self.sct.monitors[1])
                return Image.frombytes('RGB', raw.size, raw.bgra, 'raw', 'BGRX')
            except Exception:
                self.sct = None
        from PIL import ImageGrab
        return ImageGrab.grab().convert('RGB')

    def capture(self):
        img = self.grab()
        scale = min(1.0, float(MAX_SIDE) / max(img.size))
        if scale < 1.0:
            img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
        self.shot_w, self.shot_h = img.size
        buf = io.BytesIO()
        img.save(buf, 'JPEG', quality=JPEG_Q, optimize=True)
        return base64.b64encode(buf.getvalue()).decode('ascii')

    def size(self):
        if not self.shot_w:
            self.capture()
        return self.shot_w, self.shot_h

    def point(self, x, y):
        """من مقاس اللقطة إلى نقاط pyautogui (على ماك الشاشة الشبكيّة ضعف النقاط)."""
        sw, sh = self.size()
        pw, ph = pyautogui.size()
        px = max(0, min(pw - 1, round(float(x) * pw / sw)))
        py = max(0, min(ph - 1, round(float(y) * ph / sh)))
        return px, py


KEYS = {
    'back': ['command', '['] if MAC else ['alt', 'left'],
    'home': ['command', 'space'] if MAC else ['win'],
    'recents': ['command', 'tab'] if MAC else ['alt', 'tab'],
    'enter': ['enter'], 'tab': ['tab'], 'esc': ['esc'], 'escape': ['esc'], 'backspace': ['backspace'],
    'delete': ['delete'], 'space': ['space'], 'up': ['up'], 'down': ['down'], 'left': ['left'], 'right': ['right'],
    'pageup': ['pageup'], 'pagedown': ['pagedown'],
}
ALIASES = {'cmd': 'command', 'control': 'ctrl', 'option': 'alt', 'return': 'enter', 'windows': 'win', 'super': 'win'}


def key_combo(name):
    name = str(name or '').strip().lower()
    if name in KEYS:
        return KEYS[name]
    parts = [ALIASES.get(p.strip(), p.strip()) for p in name.split('+') if p.strip()]
    bad = [p for p in parts if p not in pyautogui.KEYBOARD_KEYS]
    if not parts or bad:
        raise ValueError('زرّ غير معروف: %s' % name)
    return parts


def type_text(text):
    """الكتابة بالحافظة: pyautogui.write لا يكتب العربيّة."""
    old = None
    try:
        old = pyperclip.paste()
    except pyperclip.PyperclipException:
        pass  # حافظة غير متاحة — لا شيء نعيده
    pyperclip.copy(text)
    pyautogui.hotkey('command' if MAC else 'ctrl', 'v')
    time.sleep(0.3)
    if old is not None:
        pyperclip.copy(old)


def run_action(screen, name, inp):
    if name == 'screenshot':
        return 'لقطة'
    if name == 'tap':
        x, y = screen.point(inp.get('x', 0), inp.get('y', 0))
        button = 'right' if inp.get('right') else 'left'
        pyautogui.click(x, y, clicks=2 if inp.get('double') else 1, interval=0.12, button=button)
        return '%s %s،%s' % ('ضغطت مرّتين' if inp.get('double') else 'ضغطت', inp.get('x'), inp.get('y'))
    if name == 'swipe':
        x1, y1 = screen.point(inp.get('x1', 0), inp.get('y1', 0))
        x2, y2 = screen.point(inp.get('x2', 0), inp.get('y2', 0))
        ms = max(100, min(5000, int(inp.get('ms') or 400)))
        # ضغط ثمّ مهلة ثمّ حركة متدرّجة: dragTo السريع لا يحرّك النوافذ في بعض مديري النوافذ
        pyautogui.moveTo(x1, y1)
        pyautogui.mouseDown(button='left')
        time.sleep(0.12)
        pyautogui.moveTo(x2, y2, duration=ms / 1000.0)
        time.sleep(0.12)
        pyautogui.mouseUp(button='left')
        return 'سحبت من %s،%s إلى %s،%s' % (inp.get('x1'), inp.get('y1'), inp.get('x2'), inp.get('y2'))
    if name == 'type':
        text = str(inp.get('text') or '')
        type_text(text)
        return 'كتبت %d حرفًا' % len(text)
    if name == 'key':
        combo = key_combo(inp.get('key'))
        pyautogui.hotkey(*combo)
        return 'ضغطت ' + '+'.join(combo)
    raise ValueError('أمر غير معروف: %s' % name)


def pair(server, name, code=None):
    code = code or input('رمز الربط من الوكيل (مثل ABCD-EFGH): ').strip()
    status, data = api(server, {'op': 'claim', 'code': code, 'type': 'desktop', 'name': name})
    if status != 200 or not data.get('key'):
        sys.exit('✗ الربط فشل: %s — اطلب رمزًا جديدًا من الوكيل (يعيش ١٠ دقائق ولمرّة واحدة).' % data.get('error'))
    save_conf({'server': server, 'key': data['key'], 'name': name})
    print('✓ رُبط «%s». الوكيل يرى هذه الشاشة الآن.' % name)
    return data['key']


def main():
    ap = argparse.ArgumentParser(description='برنامج جهاز عمران — يربط هذا الكمبيوتر بوكيله')
    ap.add_argument('--server', default=None)
    ap.add_argument('--name', default=platform.node() or 'كمبيوتري')
    ap.add_argument('--code', default=None)
    ap.add_argument('--forget', action='store_true')
    a = ap.parse_args()

    if a.forget:
        try:
            os.remove(CONF)
        except OSError:
            pass  # لا ربط محفوظ أصلًا
        print('مُسح الربط.')
        return

    conf = load_conf()
    server = a.server or conf.get('server') or SERVER
    key = conf.get('key') if conf.get('server', SERVER) == server and not a.code else None
    if not key:
        key = pair(server, a.name, a.code)

    screen = Screen()
    last_action = time.time()
    backoff = 1.0
    print('… متّصل. أوقف الوكيل بتحريك الفأرة إلى الزاوية العليا اليسرى، أو Ctrl+C.')
    while True:
        idle = time.time() - last_action
        if idle > PAUSE_AFTER:
            input('⏸ متوقّف بعد ٣٠ دقيقة بلا أوامر (لا استهلاك). اضغط Enter للمتابعة… ')
            last_action = time.time()
            continue
        try:
            w, h = screen.size()
            status, data = api(server, {'op': 'poll', 'key': key, 'w': w, 'h': h})
        except requests.RequestException as e:
            print('شبكة متعثّرة (%s) — أعيد بعد %ds' % (type(e).__name__, backoff))
            time.sleep(backoff)
            backoff = min(30.0, backoff * 2)
            continue
        backoff = 1.0
        if status == 403:
            print('✗ الخادم لا يعرف هذا الجهاز — يلزم ربط جديد.')
            key = pair(server, a.name)
            continue
        act = data.get('action') if status == 200 else None
        if act:
            last_action = time.time()
            name, inp = act.get('name'), act.get('input') or {}
            print('← %s %s' % (name, json.dumps({k: v for k, v in inp.items() if k != 'step_title'}, ensure_ascii=False)))
            try:
                out = run_action(screen, name, inp)
            except pyautogui.FailSafeException:
                out = '✗ أوقفه المالك (الفأرة في الزاوية)'
            except Exception as e:  # أيّ فشل يعود للوكيل نصًّا ولا يُسقط البرنامج
                out = '✗ ' + str(e)
            time.sleep(0.2 if name == 'screenshot' else 0.7)
            image = screen.capture()
            try:
                api(server, {'op': 'result', 'key': key, 'id': act.get('id'), 'output': out,
                             'image': image, 'mime': 'image/jpeg', 'w': screen.shot_w, 'h': screen.shot_h}, timeout=60)
            except requests.RequestException as e:
                print('✗ لم يصل الناتج: %s' % type(e).__name__)
            print('→ ' + out)
            continue
        time.sleep(ACTIVE_EVERY if idle < ACTIVE_FOR else IDLE_EVERY)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\nأُوقف.')
