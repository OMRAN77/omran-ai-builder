# check=skip=all
# call-relay: phone call relay for the app owner's call agent (see README.md).
# Phone line (Twilio Media Streams, mu-law 8 kHz) <-> live voice session. No audio is recorded or stored.
# Build:  docker build -t omran-call-relay call-relay
# Run:    docker run -p 8080:8080 --env-file relay.env omran-call-relay
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=8080 \
    CALL_STATE_DIR=/tmp/calls

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY lib.mjs server.mjs ./

# Unprivileged user. State (outcome + short text only) lives in /tmp/calls for 24 hours; no volume is needed.
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
