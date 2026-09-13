#!/bin/sh
# cc-bridge/entrypoint.sh — يستنسخ المستودع في أوّل تشغيل ثمّ يشغّل الجسر.
set -e
: "${CC_REPO:=OMRAN77/omran-ai-builder}"
: "${CC_BASE_BRANCH:=main}"
: "${CC_REPO_DIR:=/work/repo}"
if [ ! -d "$CC_REPO_DIR/.git" ]; then
  echo "[cc-bridge] cloning $CC_REPO into $CC_REPO_DIR"
  if [ -n "$GITHUB_TOKEN" ]; then
    git clone --quiet --branch "$CC_BASE_BRANCH" "https://x-access-token:${GITHUB_TOKEN}@github.com/${CC_REPO}.git" "$CC_REPO_DIR"
    git -C "$CC_REPO_DIR" remote set-url origin "https://github.com/${CC_REPO}.git"
  else
    git clone --quiet --branch "$CC_BASE_BRANCH" "https://github.com/${CC_REPO}.git" "$CC_REPO_DIR"
  fi
  (cd "$CC_REPO_DIR" && npm ci --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null 2>&1 || true)
fi
# بيانات الدخول لدفع Claude Code فروعه بنفسه (git push إلى غير main، وgh): مساعد اعتماد يقرأ
# الرمز من البيئة وقت الدفع — لا رمز في العنوان ولا في ملفّ.
if [ -n "$GITHUB_TOKEN" ]; then
  git config --global credential.https://github.com.helper '!f() { echo "username=x-access-token"; echo "password=${GITHUB_TOKEN}"; }; f'
  git config --global user.name "${CC_GIT_NAME:-Claude Code (omran-cc)}"
  git config --global user.email "${CC_GIT_EMAIL:-noreply@anthropic.com}"
fi
exec node /app/server.mjs
