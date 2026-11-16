FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY web ./web
COPY server.js ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 SCENES_DIR=/app/data/scenes
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server.js ./
RUN mkdir -p /app/data/scenes && chown -R node:node /app
USER node
EXPOSE 8080
CMD ["node", "server.js"]
