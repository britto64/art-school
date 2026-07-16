# Estágio 1: Build (backend + frontend)
FROM node:24-alpine AS builder

WORKDIR /app

# Dependências do servidor
COPY package*.json tsconfig.json ./
RUN npm ci

# Dependências do frontend
COPY web/package*.json ./web/
RUN npm ci --prefix web

# Código fonte
COPY src ./src
COPY web ./web

# Compila servidor (tsc) e frontend (vite)
RUN npm run build

# Estágio 2: Produção
FROM node:24-alpine AS runner

# ffmpeg para thumbnails, durações e remux de mkv
RUN apk add --no-cache ffmpeg

WORKDIR /app

ENV NODE_ENV=production
ENV COURSES_PATH=/courses
ENV DATA_PATH=/app/data

# Apenas dependências de produção
COPY package*.json ./
RUN npm ci --omit=dev

# Artefatos compilados
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist

EXPOSE 3000

CMD ["node", "dist/index.js"]
