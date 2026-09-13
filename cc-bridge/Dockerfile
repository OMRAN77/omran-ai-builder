# cc-bridge — Claude Code الخام لمالك تطبيق عمران على خادمه.
# البناء:  docker build -t omran-cc-bridge cc-bridge
# التشغيل: انظر cc-bridge/README.md (المتغيّرات والمجلّد الدائم).
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates python3 \
  && rm -rf /var/lib/apt/lists/* \
  && useradd -m -u 1000 agent && mkdir -p /work/repo /work/state && chown -R agent:agent /work

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && chown -R agent:agent /app
COPY policy.mjs git.mjs server.mjs entrypoint.sh ./
RUN chmod +x entrypoint.sh

USER agent
ENV HOME=/home/agent \
    CC_REPO_DIR=/work/repo \
    CC_STATE_DIR=/work/state \
    PORT=8787
EXPOSE 8787
VOLUME ["/work"]
ENTRYPOINT ["./entrypoint.sh"]
