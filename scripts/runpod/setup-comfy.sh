#!/usr/bin/env bash
# إعداد ComfyUI على جهاز RunPod مستأجر (RTX 5090، قالب PyTorch 2.8 · CUDA 12.8) لتجربة المحرّك الخاصّ:
#   FastH3 (صورة ← فيديو بصوت) وWan 2.2 14B (صورة ← فيديو بلا صوت).
# روابط الملفّات منقولة حرفيًّا من قوالب ComfyUI الرسميّة (comfyui-workflow-templates-json 0.1.124:
#   video_fastvideo_fasth3_i2v.json و video_wan2_2_14B_i2v.json) — لا مفتاح ولا حساب.
# الاستعمال من طرفيّة Jupyter في الجهاز:
#   curl -fsSL https://raw.githubusercontent.com/OMRAN77/omran-ai-builder/claude/video-modes-h3-d8d435/scripts/runpod/setup-comfy.sh | bash
set -euo pipefail
W=/workspace
cd "$W"
[ -d ComfyUI ] || git clone --depth 1 https://github.com/comfyanonymous/ComfyUI
cd ComfyUI
echo "▶ تنصيب ComfyUI…"
python3 -m pip install -q -r requirements.txt

H=https://huggingface.co
FILES=(
  "vae|$H/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_int8_convrot.safetensors"
  "vae|$H/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors"
  "text_encoders|$H/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"
  "diffusion_models|$H/FastVideo/FastVideo-FastH3-Comfy/resolve/main/diffusion_models/fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors"
  "vae|$H/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors"
  "text_encoders|$H/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors"
  "diffusion_models|$H/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors"
  "diffusion_models|$H/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors"
  "loras|$H/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors"
  "loras|$H/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors"
)
echo "▶ تنزيل ${#FILES[@]} ملفّات بالتوازي (عدّة دقائق)…"
pids=()
for f in "${FILES[@]}"; do
  dir=${f%%|*}; url=${f#*|}; name=$(basename "$url")
  mkdir -p "models/$dir"
  ( wget -q -c -O "models/$dir/$name" "$url" && echo "  ✓ $name" || echo "  ✗ $name" ) &
  pids+=($!)
done
for p in "${pids[@]}"; do wait "$p"; done
du -sh models

echo "▶ تشغيل ComfyUI على المنفذ 8188…"
nohup python3 main.py --listen 0.0.0.0 --port 8188 > "$W/comfy.log" 2>&1 &
for i in $(seq 1 60); do
  if curl -fs http://127.0.0.1:8188/ >/dev/null 2>&1; then echo "✅ جاهز — افتح المنفذ 8188 من Connect"; exit 0; fi
  sleep 5
done
echo "⚠ ComfyUI لم يردّ بعد — آخر السجلّ:"; tail -n 30 "$W/comfy.log"
