FROM node:20-alpine
WORKDIR /app

# Instala dependências primeiro (melhor cache de build)
COPY package.json ./
RUN npm install --omit=dev

# Copia o restante do código
COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
