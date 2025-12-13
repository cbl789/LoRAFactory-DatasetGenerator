#!/bin/bash

# =============================================================================
# NanoBanana Pro LoRA Dataset Generator - Stop Script
# =============================================================================

# Configuration
PORT=3100

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo -e "${YELLOW}🛑 Stopping NanoBanana Server...${NC}"
echo ""

# Find process using the port
PID=$(lsof -ti:$PORT 2>/dev/null)

if [ -z "$PID" ]; then
    echo -e "${YELLOW}⚠️  No server running on port $PORT${NC}"
    echo ""
    exit 0
fi

# Kill the process
kill $PID 2>/dev/null

# Wait a moment and check if it's really stopped
sleep 1

if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${RED}❌ Failed to stop gracefully, forcing...${NC}"
    kill -9 $PID 2>/dev/null
    sleep 1
fi

# Final check
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${RED}❌ Error: Could not stop server${NC}"
    echo ""
    exit 1
else
    echo -e "${GREEN}✅ Server stopped successfully${NC}"
    echo ""
fi
