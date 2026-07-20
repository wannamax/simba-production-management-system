#!/bin/bash

echo "========================================"
echo "  BACKUP DATABASE"
echo "========================================"
echo ""

# Get DB info from .env
if [ -f backend/.env ]; then
    DB_USER=$(grep DB_USER backend/.env | cut -d '=' -f2 | tr -d ' ')
    DB_NAME=$(grep DB_NAME backend/.env | cut -d '=' -f2 | tr -d ' ')
else
    DB_USER=$(whoami)
    DB_NAME="production_management"
fi

# Create backup directory
BACKUP_DIR="./backups"
mkdir -p $BACKUP_DIR

# Generate filename
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_before_tasks_$DATE.dump"

echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo "Backup file: $BACKUP_FILE"
echo ""

# Backup
pg_dump -U $DB_USER -d $DB_NAME -F c -b -v -f $BACKUP_FILE

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Backup completed successfully!"
    echo "File: $BACKUP_FILE"
    
    # Compress
    gzip $BACKUP_FILE
    echo "Compressed: ${BACKUP_FILE}.gz"
    
    # File size
    SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
    echo "Size: $SIZE"
else
    echo "❌ Backup failed!"
    exit 1
fi

echo ""
echo "To restore: pg_restore -U $DB_USER -d $DB_NAME ${BACKUP_FILE}.gz"
echo ""// JavaScript Document