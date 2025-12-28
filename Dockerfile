# Stage 1: Installa tutte le dipendenze (root + frontend)
FROM node:18-alpine AS deps
WORKDIR /app

# Copia il package.json root (contiene TUTTE le dipendenze)
COPY package.json ./
# Installa tutto (incluse devDependencies, necessarie per react-scripts)
RUN npm install

# Stage 2: Build client PWA
FROM node:18-alpine AS client-builder
WORKDIR /app
# Copia dipendenze già installate
COPY --from=deps /app/node_modules ./node_modules
# Copia codice client
COPY client-webapp/ ./client-webapp/
# Copia package.json root (per gli script e env)
COPY package.json ./

# Build con PUBLIC_URL corretto
ENV PUBLIC_URL=/client/
RUN npm run client:build   # usa lo script che hai definito: set PUBLIC_URL=/client && npm run build --prefix client-webapp

# Stage 3: Build admin frontend
FROM node:18-alpine AS admin-builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY admin-frontend/ ./admin-frontend/
COPY package.json ./

RUN npm run admin:build    # npm run build --prefix admin-frontend

# Stage 4: Immagine finale leggera (runtime)
FROM node:18-alpine

WORKDIR /usr/src/app

# Copia solo le dipendenze necessarie al server (production)
COPY package.json ./
RUN npm install --omit=dev   # react-scripts non serve più a runtime

# Copia codice server
COPY server/ ./server/
COPY start.sh ./

# Copia le build pronte dei frontend
# ATTENZIONE: Create React App genera la cartella /build dentro ogni frontend
COPY --from=client-builder /app/client-webapp/build ./client-webapp/build
COPY --from=admin-builder /app/admin-frontend/build ./admin-frontend/build

# Installa ngrok
RUN apk add --no-cache curl \
    && curl -s https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz -o ngrok.tgz \
    && tar -xzf ngrok.tgz \
    && mv ngrok /usr/local/bin/ngrok \
    && rm ngrok.tgz

# Installa qrcode-terminal globalmente (serve a start.sh)
RUN npm install -g qrcode-terminal

RUN chmod +x start.sh

EXPOSE 3000 4040

ENV NODE_ENV=production

CMD ["./start.sh"]