# CentOS环境下NextChat部署说明

## 环境要求

- CentOS 7/8/9
- Docker 20.10+
- Docker Compose 2.0+

## 部署方案

### 方案A: 使用预构建镜像（推荐）

使用现有的 `coderunxiaoming/nextchat_interview:latest` 镜像

```bash
# 1. 启动服务
docker-compose up -d

# 2. 查看服务状态
docker-compose ps

# 3. 查看日志
docker-compose logs -f nextchat
```

### 方案B: 本地构建（如果方案A的镜像不包含WebSocket功能）

```bash
# 1. 使用本地构建配置
docker-compose -f docker-compose.local.yml up -d

# 2. 查看构建进度
docker-compose -f docker-compose.local.yml logs -f nextchat
```

## 环境变量配置

创建 `.env` 文件：

```bash
# NextChat 应用配置
OPENAI_API_KEY=your_openai_api_key_here
GOOGLE_API_KEY=your_google_api_key_here
CODE=your_access_code_here
BASE_URL=https://api.openai.com

# 可选配置
PROXY_URL=
ENABLE_MCP=
```

## CentOS环境优化

### 1. 防火墙配置

```bash
# 开放必要端口
firewall-cmd --permanent --add-port=3000/tcp
firewall-cmd --permanent --add-port=8080/tcp
firewall-cmd --permanent --add-port=80/tcp
firewall-cmd --permanent --add-port=443/tcp
firewall-cmd --reload
```

### 2. SELinux配置（如果启用）

```bash
# 允许Docker访问
setsebool -P container_manage_cgroup on
setsebool -P container_use_cgroup_namespace on
```

### 3. 系统资源优化

```bash
# 增加文件描述符限制
echo "* soft nofile 65536" >> /etc/security/limits.conf
echo "* hard nofile 65536" >> /etc/security/limits.conf

# 优化内核参数
echo "net.core.somaxconn = 1024" >> /etc/sysctl.conf
echo "net.ipv4.tcp_max_syn_backlog = 2048" >> /etc/sysctl.conf
sysctl -p
```

## 网络配置

### Docker网络

配置文件中已包含CentOS优化的网络设置：

```yaml
networks:
  default:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

### Nginx代理配置

如果使用域名访问，需要配置nginx upstream：

```nginx
# /nginx/conf.d/default.conf
upstream nextchat {
    server nextchat:3000;
}

upstream websocket {
    server nextchat:8080;
}

server {
    listen 80;
    server_name your-domain.com;
    
    # NextChat应用
    location / {
        proxy_pass http://nextchat;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # WebSocket代理
    location /ws {
        proxy_pass http://websocket;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

## 健康检查

### 检查服务状态

```bash
# 检查容器健康状态
docker-compose ps

# 检查应用响应
curl http://localhost:3000

# 检查WebSocket连接
curl -H "Connection: Upgrade" -H "Upgrade: websocket" http://localhost:8080
```

### 日志监控

```bash
# 实时查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f nextchat
docker-compose logs -f nginx
```

## 故障排除

### 常见问题

1. **端口占用**
   ```bash
   # 检查端口占用
   netstat -tlnp | grep :3000
   netstat -tlnp | grep :8080
   ```

2. **镜像拉取失败**
   ```bash
   # 手动拉取镜像
   docker pull coderunxiaoming/nextchat_interview:latest
   ```

3. **WebSocket连接失败**
   - 检查防火墙设置
   - 确认8080端口暴露
   - 验证nginx配置

### 重新部署

```bash
# 停止服务
docker-compose down

# 清理旧容器（可选）
docker-compose down --volumes --remove-orphans

# 重新启动
docker-compose up -d
```

## 访问地址

- **NextChat应用**: http://your-server:3000
- **WebSocket服务**: ws://your-server:8080
- **Nginx代理**: http://your-server (如果配置了域名)

## 注意事项

1. 确保CentOS系统已正确安装Docker和Docker Compose
2. 如果使用`docker-compose.local.yml`，首次构建会需要较长时间
3. 生产环境建议配置HTTPS和域名
4. 定期备份`./nextchat-data`目录中的数据 