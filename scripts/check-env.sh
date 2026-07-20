#!/bin/bash

echo "Checking configuration..."

if [ ! -f backend/.env ]; then
    echo "❌ backend/.env not found"
    exit 1
fi

source backend/.env

echo "✓ PORT: $PORT"
echo "✓ DB_HOST: $DB_HOST"
echo "✓ DB_NAME: $DB_NAME"
echo "✓ DB_USER: $DB_USER"

if command -v psql &> /dev/null; then
    if psql -U $DB_USER -d postgres -c "\q" 2>/dev/null; then
        echo "✓ Database connection: OK"
    else
        echo "❌ Database connection: Failed"
    fi
fi

