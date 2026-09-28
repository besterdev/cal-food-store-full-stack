FROM node:22-alpine AS build

WORKDIR /src
RUN corepack enable && corepack prepare pnpm@10.17.0 --activate
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile=false
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY migrations ./migrations
RUN pnpm run build && pnpm prune --prod

FROM node:22-alpine

WORKDIR /app
# The runtime only needs `node`; drop the bundled package managers and their CVE surface.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    && addgroup -S app && adduser -S -G app app
COPY --from=build /src/package.json /src/pnpm-lock.yaml* ./
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/dist ./dist
COPY --from=build /src/migrations ./migrations
USER app
EXPOSE 8080
ENV NODE_ENV=production
ENTRYPOINT ["node", "dist/server.js"]
