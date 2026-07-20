#!/bin/bash

echo "========================================"
echo "  Database Schema Fix"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Get database user from .env
if [ -f backend/.env ]; then
    DB_USER=$(grep DB_USER backend/.env | cut -d '=' -f2)
    DB_NAME=$(grep DB_NAME backend/.env | cut -d '=' -f2)
else
    DB_USER=$(whoami)
    DB_NAME="production_management"
fi

echo "Database User: $DB_USER"
echo "Database Name: $DB_NAME"
echo ""

# Ask user
echo "Choose option:"
echo "1) Add missing columns only (Quick)"
echo "2) Recreate entire database (Clean)"
echo ""
read -p "Enter choice (1 or 2): " choice

if [ "$choice" = "2" ]; then
    echo ""
    echo -e "${YELLOW}WARNING: This will delete ALL data!${NC}"
    read -p "Are you sure? Type 'yes' to continue: " confirm
    
    if [ "$confirm" = "yes" ]; then
        echo ""
        echo "Dropping database..."
        psql -U $DB_USER -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
        
        echo "Creating database..."
        psql -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME;"
        
        echo "Importing schema..."
        psql -U $DB_USER -d $DB_NAME -f backend/database.sql
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Database recreated successfully!${NC}"
        else
            echo -e "${RED}✗ Failed to import schema${NC}"
            exit 1
        fi
    else
        echo "Cancelled."
        exit 0
    fi
else
    echo ""
    echo "Adding missing columns..."
    
    psql -U $DB_USER -d $DB_NAME << EOF
-- Add missing columns to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tax_code VARCHAR(50);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS district VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add missing columns to employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary DECIMAL(15,2);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS id_number VARCHAR(50);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add missing columns to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS actual_end_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'Trung bình';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS actual_cost DECIMAL(15,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'Chưa thanh toán';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(15,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add missing columns to schedules
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS location_address TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS location_contact VARCHAR(100);
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS location_phone VARCHAR(20);
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'Trung bình';
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS estimated_hours DECIMAL(5,2);
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS actual_hours DECIMAL(5,2);
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add missing columns to work_reports
ALTER TABLE work_reports ADD COLUMN IF NOT EXISTS title VARCHAR(200);
ALTER TABLE work_reports ADD COLUMN IF NOT EXISTS solutions TEXT;
ALTER TABLE work_reports ADD COLUMN IF NOT EXISTS quality_rating INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 5);
ALTER TABLE work_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Create update timestamp function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS \$\$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
\$\$ LANGUAGE plpgsql;

-- Add triggers
DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_employees_updated_at ON employees;
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_schedules_updated_at ON schedules;
CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_work_reports_updated_at ON work_reports;
CREATE TRIGGER update_work_reports_updated_at BEFORE UPDATE ON work_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

EOF
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Columns added successfully!${NC}"
    else
        echo -e "${RED}✗ Failed to add columns${NC}"
        exit 1
    fi
fi

echo ""
echo "Verifying schema..."
psql -U $DB_USER -d $DB_NAME -c "\d customers" | grep -E "tax_code|city|district"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Schema verified!${NC}"
else
    echo -e "${YELLOW}Warning: Could not verify schema${NC}"
fi

echo ""
echo "========================================"
echo -e "${GREEN}  Fix completed!${NC}"
echo "========================================"
echo ""
echo "Restart your application:"
echo "  cd backend && npm start"
echo ""