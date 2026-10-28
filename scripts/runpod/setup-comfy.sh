#!/usr/bin/env bash
# إعداد ComfyUI على جهاز RunPod مستأجر (RTX 5090، قالب PyTorch 2.8 · CUDA 12.8) لتجربة المحرّك الخاصّ:
#   FastH3 (صورة ← فيديو بصوت) وWan 2.2 14B (صورة ← فيديو بلا صوت).
# الملفّات منقولة حرفيًّا من قوالب ComfyUI الرسميّة (comfyui-workflow-templates-json 0.1.124:
#   video_fastvideo_fasth3_i2v.json و video_wan2_2_14B_i2v.json) — لا مفتاح ولا حساب.
# التنزيل بـhf_hub_download (يستأنف ويعيد المحاولة ويعيد طلب الرابط الموقَّع) لا wget المتوازي: أوّل تجربة
#   سقط فيها ٣ ملفّات كبيرة من ٥ (روابط CDN الموقَّعة لا تُستأنف بـwget). يُعاد تشغيله بأمان: ما اكتمل حجمه يُتخطّى.
# الاستعمال من طرفيّة Jupyter في الجهاز:
#   curl -fsSL https://raw.githubusercontent.com/OMRAN77/omran-ai-builder/claude/video-modes-h3-d8d435/scripts/runpod/setup-comfy.sh | bash
set -uo pipefail
W=/workspace
cd "$W"
[ -d ComfyUI ] || git clone --depth 1 https://github.com/comfyanonymous/ComfyUI
cd ComfyUI
df -h "$W" | tail -1
echo "▶ تنصيب ComfyUI…"
python3 -m pip install -q -r requirements.txt
python3 -m pip install -q "huggingface_hub>=0.34,<1.0" hf_xet

echo "▶ تنزيل الموديلات واحدًا واحدًا (يستأنف ويتخطّى المكتمل)…"
python3 - <<'PY'
import os
from huggingface_hub import hf_hub_download, hf_hub_url, get_hf_file_metadata
F = [
  ("vae", "Comfy-Org/MiniMax-H3", "vae/minimax_h3_video_vae_int8_convrot.safetensors"),
  ("vae", "Comfy-Org/MiniMax-H3", "vae/minimax_h3_audio_vae_fp32.safetensors"),
  ("text_encoders", "Comfy-Org/MiniMax-H3", "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"),
  ("diffusion_models", "FastVideo/FastVideo-FastH3-Comfy", "diffusion_models/fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors"),
  ("vae", "Comfy-Org/Wan_2.2_ComfyUI_Repackaged", "split_files/vae/wan_2.1_vae.safetensors"),
  ("text_encoders", "Comfy-Org/Wan_2.1_ComfyUI_repackaged", "split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors"),
  ("diffusion_models", "Comfy-Org/Wan_2.2_ComfyUI_Repackaged", "split_files/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors"),
  ("diffusion_models", "Comfy-Org/Wan_2.2_ComfyUI_Repackaged", "split_files/diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors"),
  ("loras", "Comfy-Org/Wan_2.2_ComfyUI_Repackaged", "split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors"),
  ("loras", "Comfy-Org/Wan_2.2_ComfyUI_Repackaged", "split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors"),
]
ok = 0
for d, repo, path in F:
    name = os.path.basename(path)
    dst = os.path.join("models", d, name)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    try:
        size = get_hf_file_metadata(hf_hub_url(repo, path)).size
    except Exception as e:
        size = None
    if size and os.path.exists(dst) and os.path.getsize(dst) == size:
        print(f"  ✓ {name} (موجود)", flush=True); ok += 1; continue
    if os.path.lexists(dst) and not os.path.islink(dst):
        os.remove(dst)  # بقايا wget الناقصة
    for attempt in range(1, 6):
        try:
            print(f"  … {name}" + (f" — {size/1e9:.1f} GB" if size else ""), flush=True)
            p = hf_hub_download(repo, path, local_dir="/workspace/hf")
            break
        except Exception as e:
            print(f"    محاولة {attempt} فشلت: {type(e).__name__}: {str(e)[:160]}", flush=True)
    else:
        print(f"  ✗ {name}", flush=True); continue
    if os.path.lexists(dst):
        os.remove(dst)
    os.symlink(p, dst)
    ok += 1
    print(f"  ✓ {name}", flush=True)
print(f"اكتمل {ok} من {len(F)}", flush=True)
PY
du -shL models

if curl -fs http://127.0.0.1:8188/ >/dev/null 2>&1; then echo "✅ ComfyUI شغّال أصلًا — افتح المنفذ 8188 من Connect"; exit 0; fi
echo "▶ تشغيل ComfyUI على المنفذ 8188…"
nohup python3 main.py --listen 0.0.0.0 --port 8188 > "$W/comfy.log" 2>&1 &
for i in $(seq 1 60); do
  if curl -fs http://127.0.0.1:8188/ >/dev/null 2>&1; then echo "✅ جاهز — افتح المنفذ 8188 من Connect"; exit 0; fi
  sleep 5
done
echo "⚠ ComfyUI لم يردّ بعد — آخر السجلّ:"; tail -n 30 "$W/comfy.log"
