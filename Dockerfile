FROM node:20-slim AS base
FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json yarn.lock ./

# 设置环境变量跳过Husky安装
ENV HUSKY=0
RUN yarn config set registry 'https://registry.npmmirror.com/'
RUN yarn install --ignore-optional

FROM base AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

ENV OPENAI_API_KEY=""
ENV GOOGLE_API_KEY=""
ENV CODE=""

# 接收从 docker build 命令传入的构建参数
ARG NEXT_PUBLIC_AZURE_SPEECH_KEY
# 将构建参数设置为环境变量，以便 next build 命令可以访问
ENV NEXT_PUBLIC_AZURE_SPEECH_KEY=$NEXT_PUBLIC_AZURE_SPEECH_KEY

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY websocket-server ./websocket-server

RUN yarn build

FROM base AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    proxychains4 \
    && rm -rf /var/lib/apt/lists/*

ENV PROXY_URL=""
ENV OPENAI_API_KEY=""
ENV GOOGLE_API_KEY=""
ENV CODE=""
ENV ENABLE_MCP=""
ENV NEXT_PUBLIC_AZURE_SPEECH_REGION=""

ENV DB_PATH="/app/data/nextchat.db"
ENV WS_PORT="8080"
ENV WS_HOST="0.0.0.0"

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.next/server ./.next/server

COPY --from=builder /app/websocket-server ./websocket-server
COPY --from=builder /app/scripts/start-services.js ./scripts/start-services.js

RUN mkdir -p /app/app/mcp && chmod 777 /app/app/mcp
COPY --from=builder /app/app/mcp/mcp_config.default.json /app/app/mcp/mcp_config.json

RUN mkdir -p /app/data && chmod 755 /app/data

COPY --from=builder /app/app/db/*.sql /app/app/db/

EXPOSE 3000
EXPOSE 8080

CMD if [ -n "$PROXY_URL" ]; then \
    export HOSTNAME="0.0.0.0"; \
    protocol=$(echo $PROXY_URL | cut -d: -f1); \
    host=$(echo $PROXY_URL | cut -d/ -f3 | cut -d: -f1); \
    port=$(echo $PROXY_URL | cut -d: -f3); \
    conf=/etc/proxychains.conf; \
    echo "strict_chain" > $conf; \
    echo "proxy_dns" >> $conf; \
    echo "remote_dns_subnet 224" >> $conf; \
    echo "tcp_read_time_out 15000" >> $conf; \
    echo "tcp_connect_time_out 8000" >> $conf; \
    echo "localnet 127.0.0.0/255.0.0.0" >> $conf; \
    echo "localnet ::1/128" >> $conf; \
    echo "[ProxyList]" >> $conf; \
    echo "$protocol $host $port" >> $conf; \
    cat /etc/proxychains.conf; \
    proxychains -f $conf node scripts/start-services.js; \
    else \
    node scripts/start-services.js; \
    fi
