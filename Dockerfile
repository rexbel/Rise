# Rise as one long-running Node server, for the Cloudflare Container behind cloudflare/worker.ts.
# One instance on purpose: the session board, crew, and SSE stream live in this process's memory (lib/sessions.ts).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
# Due dates are local-midnight timestamps (lib/cadence.ts dueOn): compute them in the clinic's timezone, the same one
# the demo's patients and console use, not the container's UTC default.
ENV TZ=America/New_York
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./
EXPOSE 8080
CMD ["npx", "next", "start", "-p", "8080", "-H", "0.0.0.0"]
