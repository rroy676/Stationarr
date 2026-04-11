FROM node:20-alpine AS frontend-builder
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

FROM node:20-alpine
WORKDIR /app

# Install docker CLI so we can exec into the epg container
RUN apk add --no-cache wget docker-cli
ENV DOCKER_API_VERSION=1.41

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/src ./src
COPY --from=frontend-builder /build/public ./public

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

EXPOSE 3000

CMD ["node", "src/index.js"]
