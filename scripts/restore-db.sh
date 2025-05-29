#!/bin/bash

# SQLite数据库恢复脚本

set -e

# 配置变量
DATA_DIR="./nextchat-data"
DB_FILE="$DATA_DIR/nextchat.db"
BACKUP_DIR="./database-backups"
CONTAINER_NAME="interviewSheep"

# 显示用法
show_usage() {
    echo "Usage: $0 [backup_file]"
    echo ""
    echo "If no backup_file is specified, the script will show available backups."
    echo ""
    echo "Examples:"
    echo "  $0                                    # List available backups"
    echo "  $0 nextchat_backup_20241227_143022.db # Restore from specific backup"
    echo ""
}

# 列出可用备份
list_backups() {
    echo "=== Available Backups ==="
    if [ -d "$BACKUP_DIR" ] && [ "$(ls -A $BACKUP_DIR/nextchat_backup_*.db 2>/dev/null)" ]; then
        echo "Backup files in $BACKUP_DIR:"
        ls -lah "$BACKUP_DIR"/nextchat_backup_*.db | awk '{print $9, $5, $6, $7, $8}' | column -t
        echo ""
        echo "To restore a backup, run:"
        echo "$0 <backup_filename>"
    else
        echo "No backup files found in $BACKUP_DIR"
        echo "Create a backup first using: ./scripts/backup-db.sh"
    fi
}

# 检查容器状态
check_container() {
    if docker ps --format 'table {{.Names}}' | grep -q "^$CONTAINER_NAME$"; then
        echo "Warning: Container $CONTAINER_NAME is currently running."
        echo "It's recommended to stop the container before restoring the database."
        echo ""
        echo "Stop container? (y/n): "
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            echo "Stopping container..."
            docker stop "$CONTAINER_NAME"
            CONTAINER_STOPPED=true
        else
            echo "Continuing with container running (may cause issues)..."
            CONTAINER_STOPPED=false
        fi
    else
        echo "Container is not running."
        CONTAINER_STOPPED=false
    fi
}

# 恢复数据库
restore_database() {
    local backup_file="$1"
    local backup_path
    
    # 确定备份文件的完整路径
    if [ -f "$backup_file" ]; then
        backup_path="$backup_file"
    elif [ -f "$BACKUP_DIR/$backup_file" ]; then
        backup_path="$BACKUP_DIR/$backup_file"
    else
        echo "Error: Backup file not found: $backup_file"
        echo "Please check the filename and try again."
        exit 1
    fi
    
    echo "=== Database Restore ==="
    echo "Source backup: $backup_path"
    echo "Target database: $DB_FILE"
    echo ""
    
    # 备份当前数据库（如果存在）
    if [ -f "$DB_FILE" ]; then
        CURRENT_BACKUP="$BACKUP_DIR/current_backup_$(date +%Y%m%d_%H%M%S).db"
        echo "Backing up current database to: $CURRENT_BACKUP"
        cp "$DB_FILE" "$CURRENT_BACKUP"
    fi
    
    # 执行恢复
    echo "Restoring database..."
    mkdir -p "$DATA_DIR"
    cp "$backup_path" "$DB_FILE"
    chmod 644 "$DB_FILE"
    
    echo "Database restored successfully!"
    echo ""
    
    # 验证恢复的数据库
    echo "Verifying restored database..."
    if command -v sqlite3 >/dev/null 2>&1; then
        echo "Database integrity check:"
        sqlite3 "$DB_FILE" "PRAGMA integrity_check;" || echo "Warning: Database integrity check failed"
        
        echo "Database tables:"
        sqlite3 "$DB_FILE" ".tables" || echo "Warning: Could not list tables"
    else
        echo "sqlite3 command not found, skipping verification"
    fi
    
    # 重启容器（如果之前停止了）
    if [ "$CONTAINER_STOPPED" = true ]; then
        echo ""
        echo "Restart container? (y/n): "
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            echo "Starting container..."
            docker-compose up -d
        fi
    fi
    
    echo "=== Restore Complete ==="
}

# 主逻辑
main() {
    if [ $# -eq 0 ]; then
        list_backups
        exit 0
    fi
    
    if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        show_usage
        exit 0
    fi
    
    # 确认恢复操作
    echo "This will restore the database from backup: $1"
    echo "Current database will be backed up before restore."
    echo ""
    echo "Continue? (y/n): "
    read -r response
    
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "Restore cancelled."
        exit 0
    fi
    
    check_container
    restore_database "$1"
}

# 运行主函数
main "$@" 