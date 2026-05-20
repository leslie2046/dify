#!/bin/bash

set -e

BACKUP_FILE="${1:-dumpall.sql}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE"
  echo "Usage: $0 [backup_file]"
  exit 1
fi

docker-compose down
docker-compose up -d db_postgres

cat "$BACKUP_FILE" | docker-compose exec -T db_postgres psql -U postgres
