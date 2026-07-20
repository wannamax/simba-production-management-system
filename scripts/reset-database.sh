#!/bin/bash

echo "========================================"
echo "  DATABASE COMPLETE RESET"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

# Get DB config
if [ -f backend/.env ]; then
    DB_USER=$(grep DB_USER backend/.env | cut -d '=' -f2 | tr -d ' ')
    DB_NAME=$(grep DB_NAME backend/.env | cut -d '=' -f2 | tr -d ' ')
else
    DB_USER=$(whoami)
    DB_NAME="production_management"
fi

echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo ""

# Warning
echo -e "${RED}⚠️  WARNING: This will DELETE ALL DATA!${NC}"
echo ""
read -p "Are you absolutely sure? Type 'YES' to continue: " confirm

if [ "$confirm" != "YES" ]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "Step 1: Dropping existing database..."
psql -U $DB_USER -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Database dropped${NC}"
else
    echo -e "${YELLOW}! Database may not exist (that's OK)${NC}"
fi

echo ""
echo "Step 2: Creating new database..."
psql -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME;"

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Failed to create database${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Database created${NC}"

echo ""
echo "Step 3: Importing complete schema..."
psql -U $DB_USER -d $DB_NAME -f backend/database.sql

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Failed to import schema${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Schema imported${NC}"

echo ""
echo "Step 4: Verifying tables..."
TABLE_COUNT=$(psql -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")

echo "Tables created: $TABLE_COUNT"

if [ $TABLE_COUNT -ge 12 ]; then
    echo -e "${GREEN}✓ All tables created successfully${NC}"
else
    echo -e "${RED}✗ Some tables may be missing${NC}"
fi

echo ""
echo "Step 5: Checking critical columns..."

# Check employees.salary
if psql -U $DB_USER -d $DB_NAME -t -c "SELECT column_name FROM information_schema.columns WHERE table_name='employees' AND column_name='salary';" | grep -q "salary"; then
    echo -e "${GREEN}✓ employees.salary exists${NC}"
else
    echo -e "${RED}✗ employees.salary missing${NC}"
fi

# Check projects.priority
if psql -U $DB_USER -d $DB_NAME -t -c "SELECT column_name FROM information_schema.columns WHERE table_name='projects' AND column_name='priority';" | grep -q "priority"; then
    echo -e "${GREEN}✓ projects.priority exists${NC}"
else
    echo -e "${RED}✗ projects.priority missing${NC}"
fi

# Check project_products table
if psql -U $DB_USER -d $DB_NAME -t -c "SELECT table_name FROM information_schema.tables WHERE table_name='project_products';" | grep -q "project_products"; then
    echo -e "${GREEN}✓ project_products table exists${NC}"
else
    echo -e "${RED}✗ project_products table missing${NC}"
fi

echo ""
echo "========================================"
echo -e "${GREEN}  Database reset completed!${NC}"
echo "========================================"
echo ""
echo "Sample data included:"
echo "  - Admin user: admin / admin123"
echo "  - 3 customers"
echo "  - 5 employees"
echo "  - 5 materials"
echo "  - 1 project with full workflow"
echo ""
echo "Next steps:"
echo "  1. Restart backend: cd backend && npm start"
echo "  2. Refresh frontend: http://localhost:3001"
echo ""