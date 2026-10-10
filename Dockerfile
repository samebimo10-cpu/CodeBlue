# For Railway, Fly.io or any Docker host. Mount a volume at /var/data.
FROM node:22-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production \
    CODEBLUE_DB=/var/data/codeblue.db \
    PORT=3000
EXPOSE 3000
CMD ["npm", "run", "start:all"]
