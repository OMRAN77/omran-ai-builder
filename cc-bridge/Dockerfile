# check=skip=all
# cc-bridge: raw Claude Code for the app owner, on his own server (see README.md).
# Build:  docker build -t omran-cc-bridge cc-bridge
# Run:    see cc-bridge/README.md (variables and the persistent volume).
FROM node:22-bookworm-slim

# Same tools as the owner's web session: git, gh (pull requests and checks), curl, jq, ripgrep, python.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl gnupg jq ripgrep python3 python3-pip \
  && mkdir -p -m 755 /etc/apt/keyrings \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/* \
  && useradd -m agent && mkdir -p /work/repo /work/state && chown -R agent:agent /work

# Chromium + Playwright (same as the owner's web session) so Claude Code can run the repo's
# scripts/*-probe.mjs and take screenshots. Browsers live outside the repo; the entrypoint adds
# the matching playwright package to the repo (no-save) so `import 'playwright'` resolves.
ARG PW_VERSION=1.56.1
ENV PW_VERSION=${PW_VERSION} \
    PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
RUN npm i -g --no-audit --no-fund playwright@${PW_VERSION} \
  && npx --yes playwright@${PW_VERSION} install --with-deps chromium \
  && rm -rf /var/lib/apt/lists/* \
  && chmod -R a+rX /opt/pw-browsers

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && chown -R agent:agent /app
COPY policy.mjs git.mjs watch.mjs server.mjs entrypoint.sh ./
RUN chmod +x entrypoint.sh

# No USER here on purpose: entrypoint.sh starts as root only to take ownership of the mounted
# volume (Railway mounts it as root), then drops to the "agent" user before anything else runs.
# Claude Code sessions live on the persistent volume (CLAUDE_CONFIG_DIR).
ENV HOME=/home/agent \
    CC_REPO_DIR=/work/repo \
    CC_STATE_DIR=/work/state \
    CLAUDE_CONFIG_DIR=/work/claude \
    PORT=8787
EXPOSE 8787
ENTRYPOINT ["./entrypoint.sh"]
