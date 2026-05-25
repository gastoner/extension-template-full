FROM node:24-slim AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

COPY . /app
WORKDIR /app
RUN npm install --frozen-lockfile
RUN npm run build

FROM scratch

LABEL org.opencontainers.image.title="Chaos Lab" \
        org.opencontainers.image.description="Chaos engineering toolkit for Podman Desktop" \
        org.opencontainers.image.vendor="Your Org / Username" \
        io.podman-desktop.api.version=">= 1.12.0"

LABEL org.opencontainers.image.title="Podman Desktop Chaos Lab Extension" \
        org.opencontainers.image.description="Containers durability harness tool" \
        org.opencontainers.image.vendor="DevConf Podman Desktop / Extension demo" \
        io.podman-desktop.api.version=">= 1.22.0"
