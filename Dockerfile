FROM node:22-alpine AS frontend-builder
WORKDIR /build/frontend
# Upgrade Alpine packages to get latest security fixes
RUN apk upgrade --no-cache
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM node:22-alpine
WORKDIR /app

# Upgrade Alpine packages to get latest security fixes
# wget removed — not used by application code
RUN apk upgrade --no-cache && apk add --no-cache docker-cli
ENV DOCKER_API_VERSION=1.41

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/src ./src
COPY --from=frontend-builder /build/public ./public

# Create data dir and give ownership to the node user (non-root)
RUN mkdir -p /app/data && chown -R node:node /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

EXPOSE 3000

USER node

CMD ["node", "src/index.js"]
