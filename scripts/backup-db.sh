#!/bin/bash

# SQLite数据库备份脚本
# 支持定期备份和手动备份

set -e

# 配置变量
DATA_DIR="./nextchat-data"
DB_FILE="$DATA_DIR/nextchat.db"
BACKUP_DIR="./database-backups"
CONTAINER_NAME="interviewSheep"

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 生成备份文件名
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/nextchat_backup_$TIMESTAMP.db"

echo "=== NextChat Database Backup ==="
echo "Source: $DB_FILE"
echo "Backup: $BACKUP_FILE"

# 检查数据库文件是否存在
if [ ! -f "$DB_FILE" ]; then
    echo "Error: Database file not found at $DB_FILE"
    echo "Make sure the Docker container is running and the database has been created."
    exit 1
fi

# 执行备份
echo "Creating backup..."

# 如果容器正在运行，使用SQLite的.backup命令进行在线备份
if docker ps --format 'table {{.Names}}' | grep -q "^$CONTAINER_NAME$"; then
    echo "Container is running, performing online backup..."
    
    # 在容器内执行SQLite备份命令
    docker exec "$CONTAINER_NAME" sqlite3 /app/data/nextchat.db ".backup /app/data/backup_temp.db"
    
    # 将备份文件复制到宿主机
    docker cp "$CONTAINER_NAME:/app/data/backup_temp.db" "$BACKUP_FILE"
    
    # 清理容器内的临时备份文件
    docker exec "$CONTAINER_NAME" rm -f /app/data/backup_temp.db
else
    echo "Container is not running, performing file copy backup..."
    cp "$DB_FILE" "$BACKUP_FILE"
fi

# 验证备份文件
if [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "Backup completed successfully!"
    echo "Backup size: $BACKUP_SIZE"
    echo "Backup location: $BACKUP_FILE"
else
    echo "Error: Backup failed!"
    exit 1
fi

# 清理旧备份（保留最近7天的备份）
echo "Cleaning old backups (keeping last 7 days)..."
find "$BACKUP_DIR" -name "nextchat_backup_*.db" -type f -mtime +7 -delete 2>/dev/null || true

# 显示当前备份列表
echo ""
echo "Current backups:"
ls -lah "$BACKUP_DIR"/nextchat_backup_*.db 2>/dev/null | tail -5 || echo "No backups found"

echo "=== Backup Complete ===" 