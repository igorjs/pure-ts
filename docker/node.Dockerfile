# Node: install + build + test
ARG NODE_VERSION=24
ARG VARIANT=bookworm-slim
FROM node:${NODE_VERSION}-${VARIANT}

WORKDIR /app

RUN (command -v corepack >/dev/null 2>&1 || npm install -g --force corepack) && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

ENTRYPOINT ["node", "scripts/test-matrix.mjs", "--verbose", "--runtime", "node"]
