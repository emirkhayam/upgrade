FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p uploads/qr uploads/champion
EXPOSE 3000
CMD ["node", "server.js"]
