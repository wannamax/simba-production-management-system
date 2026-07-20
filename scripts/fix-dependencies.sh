#!/bin/bash

echo "========================================"
echo "  Fix Missing Dependencies"
echo "========================================"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Backend
echo "Fixing Backend Dependencies..."
cd backend

echo "Removing old dependencies..."
rm -rf node_modules package-lock.json

echo "Installing dependencies..."
npm install --legacy-peer-deps

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Backend dependencies installed${NC}"
else
    echo -e "${RED}✗ Failed to install backend dependencies${NC}"
    exit 1
fi

# Create upload directories
echo "Creating upload directories..."
mkdir -p uploads/csv
mkdir -p uploads/images
mkdir -p uploads/documents
echo -e "${GREEN}✓ Upload directories created${NC}"

cd ..

# Frontend
echo ""
echo "Fixing Frontend Dependencies..."
cd frontend

echo "Removing old dependencies..."
rm -rf node_modules package-lock.json

echo "Installing dependencies..."
npm install --legacy-peer-deps

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Frontend dependencies installed${NC}"
else
    echo -e "${RED}✗ Failed to install frontend dependencies${NC}"
    exit 1
fi

cd ..

echo ""
echo "========================================"
echo -e "${GREEN}  All dependencies fixed!${NC}"
echo "========================================"
echo ""
echo "You can now start the application:"
echo "  Backend:  cd backend && npm start"
echo "  Frontend: cd frontend && npm start"
echo ""