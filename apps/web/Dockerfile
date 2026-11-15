# صورة متعددة المراحل لواجهة Next.js.
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @cliniccare/web... || pnpm install

FROM deps AS build
COPY . .
RUN pnpm --filter @cliniccare/shared build || true
RUN pnpm --filter @cliniccare/web build

FROM base AS runtime
ENV NODE_ENV=production
RUN groupadd --system app && useradd --system --gid app --create-home app
WORKDIR /repo
COPY --from=build /repo/apps/web/.next ./apps/web/.next
COPY --from=build /repo/apps/web/public ./apps/web/public
COPY --from=build /repo/apps/web/package.json ./apps/web/package.json
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/web/node_modules ./apps/web/node_modules
USER app

WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
