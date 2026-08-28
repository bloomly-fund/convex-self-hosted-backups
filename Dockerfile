ARG NODE_VERSION='22.11.0'

FROM node:${NODE_VERSION}-alpine AS build

ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_FUND=false

WORKDIR /app

COPY package*.json tsconfig.json ./
COPY src ./src

RUN npm ci && \
    npm run build && \
    npm prune --production

FROM node:${NODE_VERSION}-alpine

# Install shoutrrr with checksum verification
RUN apk add --no-cache curl && \
    SHOUTRRR_VERSION="0.8.0" && \
    ARCH="$(uname -m | sed 's/aarch64/arm64/' | sed 's/x86_64/amd64/')" && \
    cd /tmp && \
    curl -sSLf -o shoutrrr.tar.gz \
      "https://github.com/containrrr/shoutrrr/releases/download/v${SHOUTRRR_VERSION}/shoutrrr_linux_${ARCH}.tar.gz" && \
    curl -sSLf -o checksums.txt \
      "https://github.com/containrrr/shoutrrr/releases/download/v${SHOUTRRR_VERSION}/shoutrrr_${SHOUTRRR_VERSION}_checksums.txt" && \
    grep "shoutrrr_linux_${ARCH}.tar.gz" checksums.txt | \
      sed "s#shoutrrr_linux_${ARCH}.tar.gz#shoutrrr.tar.gz#" | sha256sum -c - && \
    tar xz -C /usr/local/bin -f shoutrrr.tar.gz shoutrrr && \
    rm -f shoutrrr.tar.gz checksums.txt && \
    apk del curl

# Non-root runtime user
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/package.json ./

USER app

CMD node dist/index.js
