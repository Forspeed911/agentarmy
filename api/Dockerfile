FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build && ls -la dist/ && echo "BUILD OK"
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh
EXPOSE 3000
CMD ["sh", "entrypoint.sh"]
