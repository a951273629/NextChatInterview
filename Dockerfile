# ===========================================
# 优化的 Next.js Docker 镜像
# 参考: Docker 镜像优化最佳实践
# ===========================================

FROM node:20-alpine AS base

# 安装必要的系统依赖
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ===========================================
# 阶段 1: 安装依赖
# ===========================================
FROM base AS deps

# 复制包管理文件
COPY package.json yarn.lock* package-lock.json* ./

# 设置环境变量跳过Husky安装
ENV HUSKY=0

# 配置镜像源并安装依赖
RUN if [ -f yarn.lock ]; then \
    yarn config set registry 'https://registry.npmmirror.com/' && \
    yarn install --frozen-lockfile --production=false; \
  elif [ -f package-lock.json ]; then \
    npm config set registry https://registry.npmmirror.com/ && \
    npm ci; \
  else \
    npm config set registry https://registry.npmmirror.com/ && \
    npm install; \
  fi

# ===========================================
# 阶段 2: 构建应用
# ===========================================
FROM base AS builder

WORKDIR /app

# 从依赖阶段复制 node_modules
COPY --from=deps /app/node_modules ./node_modules

# 复制源代码
COPY . .

# 设置构建环境变量
ENV OPENAI_API_KEY=""
ENV GOOGLE_API_KEY=""
ENV CODE=""
ENV NODE_ENV=production

# 接收构建参数
ARG NEXT_PUBLIC_AZURE_SPEECH_KEY
ENV NEXT_PUBLIC_AZURE_SPEECH_KEY=$NEXT_PUBLIC_AZURE_SPEECH_KEY

# 构建应用
RUN if [ -f yarn.lock ]; then yarn build; else npm run build; fi

# ===========================================
# 阶段 3: 生产运行时
# ===========================================
FROM base AS runner

WORKDIR /app

# 设置生产环境变量
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 运行时环境变量
ENV PROXY_URL=""
ENV OPENAI_API_KEY=""
ENV GOOGLE_API_KEY=""
ENV CODE=""
ENV ENABLE_MCP=""
ENV DB_PATH="/app/data/nextchat.db"
ENV WS_PORT="8080"
ENV WS_HOST="0.0.0.0"

# 复制构建产物（使用 standalone 输出）
COPY --from=builder /app/public ./public

# 复制 standalone 服务器
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# 复制 WebSocket 服务器
COPY --from=builder /app/websocket-server ./websocket-server

# 复制启动脚本
COPY --from=builder /app/scripts/start-services.js ./scripts/start-services.js

# 创建必要目录
RUN mkdir -p /app/app/mcp /app/data

# 复制配置文件
COPY --from=builder /app/app/mcp/mcp_config.default.json /app/app/mcp/mcp_config.json
COPY --from=builder /app/app/db/*.sql /app/app/db/

# 暴露端口
EXPOSE 3000
EXPOSE 8080

# 启动脚本（支持代理配置）
CMD if [ -n "$PROXY_URL" ]; then \
    apk add --no-cache proxychains-ng && \
    export HOSTNAME="0.0.0.0" && \
    protocol=$(echo $PROXY_URL | cut -d: -f1) && \
    host=$(echo $PROXY_URL | cut -d/ -f3 | cut -d: -f1) && \
    port=$(echo $PROXY_URL | cut -d: -f3) && \
    conf=/tmp/proxychains.conf && \
    echo "strict_chain" > $conf && \
    echo "proxy_dns" >> $conf && \
    echo "remote_dns_subnet 224" >> $conf && \
    echo "tcp_read_time_out 15000" >> $conf && \
    echo "tcp_connect_time_out 8000" >> $conf && \
    echo "localnet 127.0.0.0/255.0.0.0" >> $conf && \
    echo "localnet ::1/128" >> $conf && \
    echo "[ProxyList]" >> $conf && \
    echo "$protocol $host $port" >> $conf && \
    proxychains4 -f $conf node scripts/start-services.js; \
    else \
    node scripts/start-services.js; \
    fi
