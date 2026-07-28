#!/bin/bash

set -e

BACKUP_FILE="${1:-dumpall.sql}"
./stop.sh
docker-compose  up -d db_postgres

docker-compose exec -T db_postgres pg_dumpall -U postgres > "$BACKUP_FILE"


echo "Backup completed: $BACKUP_FILE"
