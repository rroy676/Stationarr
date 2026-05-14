FROM node:22-alpine3.23 AS frontend-builder
WORKDIR /build/frontend
RUN apk upgrade --no-cache
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Separate stage to compile native modules (better-sqlite3 needs python3/make/g++)
# Build tools stay here and never reach the final image
FROM node:22-alpine3.23 AS backend-builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY backend/package*.json ./
RUN npm install --omit=dev

FROM node:22-alpine3.23
WORKDIR /app

# Upgrade Alpine packages + add docker-cli for optional EPG scraper feature
RUN apk upgrade --no-cache && apk add --no-cache docker-cli
ENV DOCKER_API_VERSION=1.41

# Copy pre-compiled node_modules — no build tools needed in final image
COPY --from=backend-builder /app/node_modules ./node_modules
COPY backend/src ./src
COPY backend/package.json ./package.json
COPY --from=frontend-builder /build/public ./public

# Create data dir owned by the node user (non-root)
RUN mkdir -p /app/data && chown -R node:node /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

EXPOSE 3000
USER node
CMD ["node", "src/index.js"]