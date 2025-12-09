#!/bin/bash

# =============================================================================
# NanoBanana Pro LoRA Dataset Generator - Start Script
# =============================================================================

set -e  # Exit on error

# Configuration
PORT=3000
URL="http://localhost:$PORT"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Print banner
echo ""
echo -e "${YELLOW}🍌 NanoBanana Pro LoRA Dataset Generator${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if port is already in use
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${RED}❌ Error: Port $PORT is already in use${NC}"
    echo ""
    echo "To stop the existing server, run:"
    echo -e "  ${BLUE}lsof -ti:$PORT | xargs kill${NC}"
    echo ""
    exit 1
fi

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Error: Python 3 is not installed${NC}"
    echo ""
    echo "Please install Python 3:"
    echo -e "  ${BLUE}brew install python3${NC}  (macOS)"
    echo -e "  ${BLUE}apt install python3${NC}   (Linux)"
    echo ""
    exit 1
fi

# Get Python version
PYTHON_VERSION=$(python3 --version)

echo -e "${GREEN}✅ Starting local server...${NC}"
echo -e "   Python: $PYTHON_VERSION"
echo -e "   Port: $PORT"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Stopping server...${NC}"
    # Kill the Python server
    if [ ! -z "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null || true
    fi
    echo -e "${GREEN}✅ Server stopped${NC}"
    echo ""
    exit 0
}

# Trap Ctrl+C (SIGINT) and other termination signals
trap cleanup SIGINT SIGTERM

# Start Python HTTP server in background
python3 -m http.server $PORT > /dev/null 2>&1 &
SERVER_PID=$!

# Wait a moment for server to start
sleep 1

# Check if server started successfully
if ! ps -p $SERVER_PID > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Failed to start server${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Server running!${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "   🌐 URL: ${GREEN}$URL${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}📖 Opening browser...${NC}"

# Open browser (cross-platform)
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    open "$URL"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    if command -v xdg-open &> /dev/null; then
        xdg-open "$URL"
    elif command -v gnome-open &> /dev/null; then
        gnome-open "$URL"
    else
        echo -e "${YELLOW}⚠️  Could not auto-open browser. Please open manually:${NC}"
        echo -e "   $URL"
    fi
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    # Windows (Git Bash/Cygwin)
    start "$URL"
else
    echo -e "${YELLOW}⚠️  Could not auto-open browser. Please open manually:${NC}"
    echo -e "   $URL"
fi

echo ""
echo -e "${GREEN}🎉 Ready to use!${NC}"
echo ""
echo -e "🔒 ${YELLOW}Security Tips:${NC}"
echo -e "   • Click the 🛡️ button to configure encryption"
echo -e "   • Use session-only storage on shared computers"
echo -e "   • Enable auto-clear for added security"
echo ""
echo -e "${BLUE}Press Ctrl+C to stop the server${NC}"
echo ""

# Keep script running and wait for Ctrl+C
wait $SERVER_PID
