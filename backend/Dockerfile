FROM node:24-alpine
ENV NODE_ENV=production
ENV HOST=0.0.0.0
WORKDIR /app
COPY backend/server.js ./server.js
USER node
EXPOSE 8787
CMD ["node", "server.js"]
