FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production

# 依赖层单独缓存：package*.json 不变时不会重装
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 只复制运行需要的代码；public/ 与 data/ 通过 bind mount 覆盖
COPY server.js db.js config.js ./
COPY lib ./lib
COPY scripts ./scripts

RUN mkdir -p data && chown -R node:node /app

USER node

EXPOSE 3001

# 用 Node 自带的 fetch 做健康检查，无需安装 curl
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
