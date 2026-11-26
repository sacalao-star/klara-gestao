FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p dados/documentos
EXPOSE 8787
ENV NODE_ENV=production
CMD ["node", "backend/server.js"]
