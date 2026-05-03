# syntax=docker/dockerfile:1
#
# Next.js image for collection-of-beauty.
# Built by .github/workflows/deploy.yml, pushed to GHCR, pulled by
# Coolify via docker-compose.yml. The final stage runs Next's standalone
# server because this app includes dynamic route handlers for the newsletter
# flow; a static nginx image cannot serve those routes.
#
# .env.production is committed to the repo dotenvx-encrypted. The
# build stage decrypts it via the dotenvx_private_key BuildKit secret
# (passed by .github/workflows/deploy.yml from the GH Actions secret
# DOTENV_PRIVATE_KEY_PRODUCTION) so `pnpm build` sees the plain values
# when it bakes them into the static output.
#
# Why BuildKit secrets and not ARG: ARG values land in `docker history`
# and the image manifest. BuildKit secrets are mounted as tmpfs at
# build time and never persist — `docker history` won't show them, the
# final image won't either. Requires BuildKit (default in modern
# Docker; the GH Actions workflow uses docker/setup-buildx-action
# which enables it).
#
# What ends up in the bundle: NEXT_PUBLIC_* / VITE_* / similar values
# that the framework explicitly inlines into client JS. Runtime secrets stay
# encrypted in .env.production and are decrypted by dotenvx only when the
# server process starts.
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && HUSKY=0 pnpm install --frozen-lockfile
COPY . .
# `--mount=type=secret,id=dotenvx_private_key,env=DOTENV_PRIVATE_KEY_PRODUCTION`
# exposes the secret value as the env var the wrapped command reads,
# only for the duration of each RUN it's mounted into. dotenvx picks
# it up, decrypts .env.production in memory, and re-exports each
# KEY=VALUE for `pnpm build`. If the secret is missing, dotenvx
# silently skips decryption and the build would bake `encrypted:...`
# strings into asset URLs — fail fast instead.
#
# Two separate RUN steps on purpose: BuildKit dumps the entire RUN
# command into the build error when ANY step in a chained `&&` fails,
# echo strings included. Splitting the secret check off means the
# "secret not supplied" message only shows up when that's actually
# what failed — a downstream `pnpm build` failure won't drag the
# misleading echo into its error context.
RUN --mount=type=secret,id=dotenvx_private_key,env=DOTENV_PRIVATE_KEY_PRODUCTION \
    test -n "$DOTENV_PRIVATE_KEY_PRODUCTION" || { \
      echo "ERROR: dotenvx_private_key build secret not supplied. The workflow at .github/workflows/deploy.yml should pass it via 'secrets:' from the GH Actions secret DOTENV_PRIVATE_KEY_PRODUCTION." >&2; \
      exit 1; \
    }
RUN --mount=type=secret,id=dotenvx_private_key,env=DOTENV_PRIVATE_KEY_PRODUCTION \
    pnpm dlx @dotenvx/dotenvx run -- pnpm build

FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Next's standalone output contains the traced production server files.
# public/ and .next/static are intentionally copied separately per Next's
# standalone deployment model.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/public ./public
COPY --from=build /app/.next/static ./.next/static

# Keep dotenvx available in the runner so encrypted runtime env values can be
# decrypted from .env.production without persisting plaintext secrets in a
# layer. The standalone trace does not include CLI-only dev dependencies.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.env.production ./.env.production

EXPOSE 3000
CMD ["node_modules/.bin/dotenvx", "run", "-f", ".env.production", "--", "node", "server.js"]
