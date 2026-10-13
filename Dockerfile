# Сервер BodyTrain + веб-сборка для Telegram Mini App в одном образе.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run server:build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 STATIC_DIR=dist
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/dist ./server/dist
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8787/api/health || exit 1
CMD ["node", "server/dist/index.mjs"]
