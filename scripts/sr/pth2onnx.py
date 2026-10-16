# تحويل أوزان RealESRGAN_x4plus (.pth = zip + pickle) إلى ONNX بلا torch — مفكّك مقيّد لا يقبل إلّا الأنواع المتوقّعة.
import sys, zipfile, pickle, collections, numpy as np, onnx
from onnx import helper, TensorProto, numpy_helper
src, out = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(src)
pre = z.namelist()[0].split('/')[0]
class Storage:
    def __init__(self, key, dtype): self.key, self.dtype = key, dtype
def rebuild(storage, offset, size, stride, *a):
    raw = np.frombuffer(z.read(pre + '/data/' + storage.key), dtype=storage.dtype)
    n = int(np.prod(size)) if size else 1
    arr = np.lib.stride_tricks.as_strided(raw[offset:], shape=tuple(size), strides=tuple(s * raw.itemsize for s in stride)) if size else raw[offset:offset+1]
    return np.array(arr, dtype=np.float32)
class FloatStorage: pass
class U(pickle.Unpickler):
    def find_class(self, mod, name):
        ok = {('collections', 'OrderedDict'): collections.OrderedDict, ('torch._utils', '_rebuild_tensor_v2'): rebuild, ('torch', 'FloatStorage'): FloatStorage}
        if (mod, name) in ok: return ok[(mod, name)]
        raise pickle.UnpicklingError('ممنوع: %s.%s' % (mod, name))
    def persistent_load(self, pid):
        typ, kind, key, loc, numel = pid
        assert typ == 'storage' and kind is FloatStorage
        return Storage(key, np.float32)
sd = U(z.open(pre + '/data.pkl')).load()
sd = sd.get('params_ema', sd.get('params', sd))
print('موتّرات:', len(sd))
nodes, inits = [], []
cnt = [0]
def nm(p): cnt[0] += 1; return '%s_%d' % (p, cnt[0])
def conv(x, key):
    w, b = key + '.weight', key + '.bias'
    inits.append(numpy_helper.from_array(sd[w], w)); inits.append(numpy_helper.from_array(sd[b], b))
    o = nm('c'); nodes.append(helper.make_node('Conv', [x, w, b], [o], pads=[1, 1, 1, 1], kernel_shape=[3, 3])); return o
def lrelu(x): o = nm('l'); nodes.append(helper.make_node('LeakyRelu', [x], [o], alpha=0.2)); return o
def cat(xs): o = nm('cat'); nodes.append(helper.make_node('Concat', xs, [o], axis=1)); return o
inits.append(numpy_helper.from_array(np.array(0.2, dtype=np.float32), 'k02'))
def scale_add(x, res): m = nm('m'); nodes.append(helper.make_node('Mul', [x, 'k02'], [m])); o = nm('a'); nodes.append(helper.make_node('Add', [m, res], [o])); return o
def rdb(x, p):
    x1 = lrelu(conv(x, p + '.conv1')); x2 = lrelu(conv(cat([x, x1]), p + '.conv2')); x3 = lrelu(conv(cat([x, x1, x2]), p + '.conv3'))
    x4 = lrelu(conv(cat([x, x1, x2, x3]), p + '.conv4')); x5 = conv(cat([x, x1, x2, x3, x4]), p + '.conv5'); return scale_add(x5, x)
feat = conv('input', 'conv_first'); h = feat
for i in range(23):
    p = 'body.%d' % i; r = rdb(rdb(rdb(h, p + '.rdb1'), p + '.rdb2'), p + '.rdb3'); h = scale_add(r, h)
b = conv(h, 'conv_body'); s = nm('a'); nodes.append(helper.make_node('Add', [feat, b], [s]))
inits.append(numpy_helper.from_array(np.array([], dtype=np.float32), 'roi')); inits.append(numpy_helper.from_array(np.array([1, 1, 2, 2], dtype=np.float32), 'sc2'))
def up(x): o = nm('u'); nodes.append(helper.make_node('Resize', [x, 'roi', 'sc2'], [o], mode='nearest')); return o
x = lrelu(conv(up(s), 'conv_up1')); x = lrelu(conv(up(x), 'conv_up2')); x = lrelu(conv(x, 'conv_hr')); y = conv(x, 'conv_last')
nodes.append(helper.make_node('Identity', [y], ['output']))
g = helper.make_graph(nodes, 'rrdbnet_x4', [helper.make_tensor_value_info('input', TensorProto.FLOAT, [1, 3, None, None])], [helper.make_tensor_value_info('output', TensorProto.FLOAT, [1, 3, None, None])], inits)
m = helper.make_model(g, opset_imports=[helper.make_opsetid('', 17)]); m.ir_version = 8
onnx.save(m, out); print('عُقد:', len(nodes), 'موتّرات أوليّة:', len(inits))
