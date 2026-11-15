# صورة متعددة المراحل لـ NestJS API. يحمّل Chromium لتوليد روشتات PDF (القسم 9).
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @cliniccare/api... || pnpm install

FROM deps AS build
COPY . .
RUN pnpm gen:prisma
RUN pnpm --filter @cliniccare/shared build || true
RUN pnpm --filter @cliniccare/api build

FROM base AS runtime
ENV NODE_ENV=production
# الاعتماديات المطلوبة لتشغيل Chromium (Playwright) داخل الحاوية
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 libpango-1.0-0 \
    ca-certificates fonts-noto \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd --system app && useradd --system --gid app --create-home app
WORKDIR /repo
COPY --from=build /repo /repo
RUN npx playwright install chromium --with-deps || true
USER app

EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
