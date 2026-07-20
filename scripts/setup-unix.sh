#!/bin/bash

echo "========================================"
echo "  Production Management Setup"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo "Project root: $PROJECT_ROOT"
echo ""

# Change to project root
cd "$PROJECT_ROOT"

# Check directory structure
echo "Checking project structure..."
if [ ! -d "backend" ]; then
    echo -e "${RED}✗ backend/ directory not found${NC}"
    exit 1
fi

if [ ! -d "frontend" ]; then
    echo -e "${RED}✗ frontend/ directory not found${NC}"
    exit 1
fi

if [ ! -d "scripts" ]; then
    echo -e "${RED}✗ scripts/ directory not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Project structure OK${NC}"
echo ""

# Check Node.js
echo "[1/6] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js not installed${NC}"
    echo "Install from: https://nodejs.org/"
    exit 1
fi
echo -e "${GREEN}✓ Node.js: $(node --version)${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm: $(npm --version)${NC}"

# Check PostgreSQL
echo ""
echo "[2/6] Checking PostgreSQL..."
if ! command -v psql &> /dev/null; then
    echo -e "${RED}✗ PostgreSQL not installed${NC}"
    echo "Install with: brew install postgresql@14"
    exit 1
fi
echo -e "${GREEN}✓ PostgreSQL: $(psql --version | awk '{print $3}')${NC}"

# Check if PostgreSQL is running
echo ""
echo "[3/6] Checking PostgreSQL service..."
if pgrep -x postgres > /dev/null; then
    echo -e "${GREEN}✓ PostgreSQL is running${NC}"
else
    echo -e "${YELLOW}⚠ PostgreSQL not running. Starting...${NC}"
    if command -v brew &> /dev/null; then
        brew services start postgresql@14
        sleep 3
        if pgrep -x postgres > /dev/null; then
            echo -e "${GREEN}✓ PostgreSQL started${NC}"
        else
            echo -e "${RED}✗ Failed to start PostgreSQL${NC}"
            echo "Try manually: brew services start postgresql@14"
            exit 1
        fi
    else
        echo -e "${RED}✗ Please start PostgreSQL manually${NC}"
        exit 1
    fi
fi

# Detect PostgreSQL user
echo ""
echo "[4/6] Configuring database user..."
CURRENT_USER=$(whoami)
echo "System user: $CURRENT_USER"

# Try to connect with different users
DB_USER=""
DB_PASSWORD=""

# Try 'postgres' user first
if PGPASSWORD="" psql -U postgres -d postgres -c '\q' 2>/dev/null; then
    DB_USER="postgres"
    DB_PASSWORD=""
    echo -e "${GREEN}✓ Using user: postgres (no password)${NC}"
# Try 'postgres' with password 'postgres'
elif PGPASSWORD="postgres" psql -U postgres -d postgres -c '\q' 2>/dev/null; then
    DB_USER="postgres"
    DB_PASSWORD="postgres"
    echo -e "${GREEN}✓ Using user: postgres (with password)${NC}"
# Try current system user
elif psql -U $CURRENT_USER -d postgres -c '\q' 2>/dev/null; then
    DB_USER=$CURRENT_USER
    DB_PASSWORD=""
    echo -e "${GREEN}✓ Using user: $CURRENT_USER (no password)${NC}"
else
    echo -e "${YELLOW}⚠ No PostgreSQL user found${NC}"
    echo "Creating 'postgres' superuser..."
    
    # Try to create with current user
    if psql -d postgres -c "CREATE USER postgres WITH SUPERUSER PASSWORD 'postgres';" 2>/dev/null; then
        DB_USER="postgres"
        DB_PASSWORD="postgres"
        echo -e "${GREEN}✓ Created user: postgres${NC}"
    elif createuser -s postgres 2>/dev/null; then
        psql -d postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';" 2>/dev/null
        DB_USER="postgres"
        DB_PASSWORD="postgres"
        echo -e "${GREEN}✓ Created user: postgres${NC}"
    else
        echo -e "${RED}✗ Failed to create PostgreSQL user${NC}"
        echo ""
        echo "Manual fix required:"
        echo "1. Create user: createuser -s postgres"
        echo "2. Set password: psql -d postgres -c \"ALTER USER postgres PASSWORD 'postgres';\""
        echo "3. Or use your system user: $CURRENT_USER"
        exit 1
    fi
fi

# Setup Database
echo ""
echo "[5/6] Setting up database..."

# Check if database exists
if PGPASSWORD="$DB_PASSWORD" psql -U $DB_USER -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw production_management; then
    echo -e "${YELLOW}⚠ Database 'production_management' already exists${NC}"
    read -p "Drop and recreate? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Dropping database..."
        PGPASSWORD="$DB_PASSWORD" psql -U $DB_USER -d postgres -c "DROP DATABASE IF EXISTS production_management;" 2>/dev/null
        echo "Creating database..."
        PGPASSWORD="$DB_PASSWORD" psql -U $DB_USER -d postgres -c "CREATE DATABASE production_management;"
    else
        echo "Using existing database"
    fi
else
    echo "Creating database..."
    PGPASSWORD="$DB_PASSWORD" psql -U $DB_USER -d postgres -c "CREATE DATABASE production_management;"
fi

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Database ready${NC}"
else
    echo -e "${RED}✗ Failed to create database${NC}"
    exit 1
fi

# Import schema
echo "Importing schema..."
if [ -f "backend/database.sql" ]; then
    PGPASSWORD="$DB_PASSWORD" psql -U $DB_USER -d production_management -f backend/database.sql > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Schema imported${NC}"
    else
        echo -e "${RED}✗ Failed to import schema${NC}"
        echo "You can import manually later:"
        echo "psql -U $DB_USER -d production_management -f backend/database.sql"
    fi
else
    echo -e "${RED}✗ backend/database.sql not found${NC}"
    exit 1
fi

# Setup Backend
echo ""
echo "[6/6] Setting up application..."
echo ""
echo "Backend setup..."

cd "$PROJECT_ROOT/backend"

if [ ! -f "package.json" ]; then
    echo -e "${RED}✗ backend/package.json not found${NC}"
    exit 1
fi

# Create .env file
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${GREEN}✓ Created .env from template${NC}"
    else
        echo -e "${YELLOW}⚠ .env.example not found, creating new .env${NC}"
        cat > .env << EOF
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=production_management
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

JWT_SECRET=$(openssl rand -base64 32)

UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
EOF
    fi
    
    # Update .env with detected credentials
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/DB_USER=.*/DB_USER=$DB_USER/" .env
        sed -i '' "s/DB_PASSWORD=.*/DB_PASSWORD=$DB_PASSWORD/" .env
    else
        # Linux
        sed -i "s/DB_USER=.*/DB_USER=$DB_USER/" .env
        sed -i "s/DB_PASSWORD=.*/DB_PASSWORD=$DB_PASSWORD/" .env
    fi
    
    echo -e "${GREEN}✓ Configured .env${NC}"
else
    echo -e "${YELLOW}⚠ .env already exists (not modified)${NC}"
fi

# Install backend dependencies
echo "Installing backend dependencies..."
npm install --silent

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Backend dependencies installed${NC}"
else
    echo -e "${RED}✗ Failed to install backend dependencies${NC}"
    exit 1
fi

# Setup Frontend
echo ""
echo "Frontend setup..."

cd "$PROJECT_ROOT/frontend"

if [ ! -f "package.json" ]; then
    echo -e "${RED}✗ frontend/package.json not found${NC}"
    exit 1
fi

# Create .env file
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
    else
        cat > .env << EOF
REACT_APP_API_URL=http://localhost:3000/api
EOF
    fi
    echo -e "${GREEN}✓ Created .env${NC}"
else
    echo -e "${YELLOW}⚠ .env already exists (not modified)${NC}"
fi

# Install frontend dependencies
echo "Installing frontend dependencies..."
npm install --silent

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Frontend dependencies installed${NC}"
else
    echo -e "${RED}✗ Failed to install frontend dependencies${NC}"
    exit 1
fi

# Back to project root
cd "$PROJECT_ROOT"

# Create uploads directory
mkdir -p backend/uploads
echo -e "${GREEN}✓ Created uploads directory${NC}"

# Summary
echo ""
echo "========================================"
echo -e "${GREEN}  ✅ Setup Completed Successfully!${NC}"
echo "========================================"
echo ""
echo "Database Configuration:"
echo "  Host: localhost"
echo "  Port: 5432"
echo "  Database: production_management"
echo "  User: $DB_USER"
if [ -n "$DB_PASSWORD" ]; then
    echo "  Password: $DB_PASSWORD"
else
    echo "  Password: (none)"
fi
echo ""
echo "Next steps:"
echo "  1. Start the application:"
echo "     cd $PROJECT_ROOT"
echo "     ./scripts/start-all-unix.sh"
echo ""
echo "  2. Or start services separately:"
echo "     Terminal 1: cd backend && npm start"
echo "     Terminal 2: cd frontend && npm start"
echo ""
echo "  3. Access the application:"
echo "     Backend: http://localhost:3000"
echo "     Frontend: http://localhost:3001"
echo ""