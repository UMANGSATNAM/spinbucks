# Ad server — deploys to Railway. Auction package is built first, server imports
# its compiled dist. node:sqlite needs the --experimental-sqlite flag (start script).
FROM node:22-slim AS build
WORKDIR /app
COPY packages/auction/package*.json packages/auction/
RUN cd packages/auction && npm ci || npm install
COPY packages/auction packages/auction
RUN cd packages/auction && npm run build || npx tsc

COPY packages/server/package*.json packages/server/
RUN cd packages/server && npm ci || npm install
COPY packages/server packages/server
RUN cd packages/server && npx tsc

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/packages/auction/dist packages/auction/dist
COPY --from=build /app/packages/auction/node_modules packages/auction/node_modules
COPY --from=build /app/packages/server packages/server
WORKDIR /app/packages/server
ENV PORT=8080
# Set SERVER_SECRET and a persistent DB_PATH (Railway volume) in the environment.
EXPOSE 8080
CMD ["node", "--experimental-sqlite", "dist/index.js"]
