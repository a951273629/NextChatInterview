#!/bin/bash

# 数据库初始化脚本
# 用于在CentOS Docker环境下初始化SQLite数据库

set -e

echo "=== NextChat SQLite Database Initialization ==="

# 设置变量
DATA_DIR="./nextchat-data"
DB_FILE="$DATA_DIR/nextchat.db"
BACKUP_DIR="./database-backups"

# 创建数据目录
if [ ! -d "$DATA_DIR" ]; then
    echo "Creating data directory: $DATA_DIR"
    mkdir -p "$DATA_DIR"
    chmod 755 "$DATA_DIR"
else
    echo "Data directory already exists: $DATA_DIR"
fi

# 创建备份目录
if [ ! -d "$BACKUP_DIR" ]; then
    echo "Creating backup directory: $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
    chmod 755 "$BACKUP_DIR"
else
    echo "Backup directory already exists: $BACKUP_DIR"
fi

# 检查是否存在旧的数据库文件需要迁移
OLD_DB="./database/nextchat.db"
if [ -f "$OLD_DB" ] && [ ! -f "$DB_FILE" ]; then
    echo "Found existing database, migrating to new location..."
    cp "$OLD_DB" "$DB_FILE"
    echo "Database migrated successfully"
    
    # 备份旧数据库
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    cp "$OLD_DB" "$BACKUP_DIR/nextchat_backup_$TIMESTAMP.db"
    echo "Backup created: $BACKUP_DIR/nextchat_backup_$TIMESTAMP.db"
fi

# 设置正确的文件权限
if [ -f "$DB_FILE" ]; then
    chmod 644 "$DB_FILE"
    echo "Database file permissions set: $DB_FILE"
fi

# 输出当前状态
echo "=== Database Status ==="
echo "Data directory: $(realpath $DATA_DIR)"
echo "Database file: $(realpath $DB_FILE 2>/dev/null || echo 'Not created yet')"
echo "Backup directory: $(realpath $BACKUP_DIR)"

if [ -f "$DB_FILE" ]; then
    echo "Database size: $(du -h $DB_FILE | cut -f1)"
else
    echo "Database will be created on first application start"
fi

echo "=== Initialization Complete ==="
echo "You can now start the Docker containers with: docker-compose up -d" 