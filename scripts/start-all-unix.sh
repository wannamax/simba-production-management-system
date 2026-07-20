#!/bin/bash

echo "========================================"
echo "  Starting Production Management"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Get script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}Project root: $PROJECT_ROOT${NC}"
echo ""

# Check if backend and frontend directories exist
if [ ! -d "$PROJECT_ROOT/backend" ]; then
    echo -e "${RED}ERROR: backend directory not found!${NC}"
    echo "Expected: $PROJECT_ROOT/backend"
    exit 1
fi

if [ ! -d "$PROJECT_ROOT/frontend" ]; then
    echo -e "${RED}ERROR: frontend directory not found!${NC}"
    echo "Expected: $PROJECT_ROOT/frontend"
    exit 1
fi

# Kill existing processes
echo "Checking for existing processes..."
pkill -f "node.*server.js" 2>/dev/null && echo "Killed existing backend process"
pkill -f "react-scripts start" 2>/dev/null && echo "Killed existing frontend process"
sleep 2

# Start Backend
echo ""
echo "Starting Backend API..."
cd "$PROJECT_ROOT/backend"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}WARNING: backend/.env not found!${NC}"
    echo "Please run ./scripts/setup-unix.sh first"
    exit 1
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo -e "${YELLOW}Installing backend dependencies...${NC}"
    npm install
fi

# Start backend in background
nohup npm start > "$PROJECT_ROOT/backend.log" 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}✓ Backend started (PID: $BACKEND_PID)${NC}"

# Wait for backend to start
echo "Waiting for backend to initialize..."
sleep 5

# Check if backend is running
if kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${GREEN}✓ Backend is running${NC}"
    
    # Check if API is responding
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Backend API is responding${NC}"
    else
        echo -e "${YELLOW}⚠ Backend started but API not responding yet${NC}"
        echo "Check logs: tail -f backend.log"
    fi
else
    echo -e "${RED}✗ Backend failed to start${NC}"
    echo "Check logs: cat backend.log"
    exit 1
fi

# Start Frontend
echo ""
echo "Starting Frontend..."
cd "$PROJECT_ROOT/frontend"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}WARNING: frontend/.env not found!${NC}"
    cp .env.example .env
    echo -e "${GREEN}✓ Created frontend/.env${NC}"
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo -e "${YELLOW}Installing frontend dependencies...${NC}"
    npm install
fi

# Start frontend in background
BROWSER=none nohup npm start > "$PROJECT_ROOT/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo -e "${GREEN}✓ Frontend started (PID: $FRONTEND_PID)${NC}"

# Wait for frontend to start
echo "Waiting for frontend to compile..."
sleep 10

# Check if frontend is running
if kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "${GREEN}✓ Frontend is running${NC}"
else
    echo -e "${RED}✗ Frontend failed to start${NC}"
    echo "Check logs: cat frontend.log"
    exit 1
fi

# Return to project root
cd "$PROJECT_ROOT"

# Save PIDs to file
echo $BACKEND_PID > .backend.pid
echo $FRONTEND_PID > .frontend.pid

echo ""
echo "========================================"
echo -e "${GREEN}  Application is running!${NC}"
echo "========================================"
echo ""
echo "📊 Services:"
echo "  Backend API:  http://localhost:3000"
echo "  Frontend:     http://localhost:3001"
echo ""
echo "📝 Logs:"
echo "  Backend:  tail -f backend.log"
echo "  Frontend: tail -f frontend.log"
echo ""
echo "🔧 Management:"
echo "  Stop all: ./scripts/stop-all-unix.sh"
echo "  Restart:  ./scripts/restart-unix.sh"
echo ""
echo "💾 Process IDs:"
echo "  Backend PID:  $BACKEND_PID"
echo "  Frontend PID: $FRONTEND_PID"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop (or run stop script)${NC}"

# Trap Ctrl+C
trap "echo ''; echo 'Stopping services...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; rm -f .backend.pid .frontend.pid; echo 'Services stopped.'; exit" INT TERM

# Wait for processes
wait $BACKEND_PID $FRONTEND_PID 2>/dev/null