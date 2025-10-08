#!/bin/bash

# Quick k6 Cloud Test Runner
# This script helps you run k6 tests in Grafana Cloud with minimal setup

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  k6 Cloud Load Test - Quick Start                                ${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo -e "${RED}✗ k6 is not installed${NC}"
    echo ""
    echo "Install k6:"
    echo "  macOS:   brew install k6"
    echo "  Linux:   sudo apt-get install k6"
    echo "  Windows: choco install k6"
    echo ""
    echo "Or visit: https://k6.io/docs/get-started/installation/"
    exit 1
fi

echo -e "${GREEN}✓ k6 is installed${NC}"
echo ""

# Check if .env.k6 exists
if [ -f "k6/.env.k6" ]; then
    echo -e "${GREEN}✓ Found k6/.env.k6${NC}"
    source k6/.env.k6
else
    echo -e "${YELLOW}⚠ k6/.env.k6 not found${NC}"
    echo ""
    echo "Creating from template..."
    cp k6/.env.k6.example k6/.env.k6
    echo -e "${GREEN}✓ Created k6/.env.k6${NC}"
    echo ""
    echo -e "${YELLOW}Please edit k6/.env.k6 and add:${NC}"
    echo "  - CONVERSATION_ID"
    echo "  - JWT_TOKEN"
    echo "  - K6_CLOUD_TOKEN (from https://app.k6.io/account/api-token)"
    echo ""
    echo "Then run this script again."
    exit 1
fi

# Validate required variables
MISSING_VARS=()

if [ -z "$CONVERSATION_ID" ]; then
    MISSING_VARS+=("CONVERSATION_ID")
fi

if [ -z "$JWT_TOKEN" ]; then
    MISSING_VARS+=("JWT_TOKEN")
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${RED}✗ Missing required variables in k6/.env.k6:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
    echo ""
    echo "See k6/get-test-credentials.md for help getting these values"
    exit 1
fi

echo -e "${GREEN}✓ Required variables set${NC}"
echo ""

# Check if authenticated with k6 Cloud
if [ -n "$K6_CLOUD_TOKEN" ]; then
    echo -e "${GREEN}✓ K6_CLOUD_TOKEN is set${NC}"
    export K6_CLOUD_TOKEN
else
    echo -e "${YELLOW}⚠ K6_CLOUD_TOKEN not set${NC}"
    echo ""
    echo "To run tests in Grafana Cloud, you need an API token."
    echo ""
    echo "Get your token:"
    echo "  1. Sign up: https://grafana.com/auth/sign-up/create-user"
    echo "  2. Go to: https://app.k6.io/account/api-token"
    echo "  3. Create a new token"
    echo "  4. Add to k6/.env.k6: K6_CLOUD_TOKEN=your-token"
    echo ""
    read -p "Do you want to continue with local testing instead? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    USE_LOCAL=true
fi

# Show configuration
echo -e "${BLUE}Configuration:${NC}"
echo "  Backend:        ${BASE_URL:-wss://chat-service-production.up.railway.app}"
echo "  Conversation:   ${CONVERSATION_ID}"
echo "  JWT Token:      ${JWT_TOKEN:0:20}..."
echo ""

# Select test type
echo -e "${BLUE}Select test to run:${NC}"
echo "  1) Quick test (1 min, 10 users) - Verify setup"
echo "  2) Throughput test (~11 min, up to 200 users) - Realistic load"
echo "  3) Stress test (~4 min, up to 1000 users) - Find limits"
echo ""
read -p "Enter choice [1-3]: " TEST_CHOICE

case $TEST_CHOICE in
    1)
        TEST_NAME="Quick Verification Test"
        TEST_SCRIPT="k6/simple-stress.js"
        EXTRA_ARGS="--duration 1m --vus 10"
        ;;
    2)
        TEST_NAME="Message Throughput Test"
        TEST_SCRIPT="k6/message-throughput.js"
        EXTRA_ARGS=""
        ;;
    3)
        TEST_NAME="Stress Test"
        TEST_SCRIPT="k6/simple-stress.js"
        EXTRA_ARGS=""
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Running: ${TEST_NAME}${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Build k6 command
if [ "$USE_LOCAL" = true ]; then
    echo -e "${YELLOW}Running locally (no cloud token)${NC}"
    CMD="k6 run"
else
    echo -e "${GREEN}Running in Grafana Cloud${NC}"
    CMD="k6 cloud"
fi

CMD="$CMD -e CONVERSATION_ID=$CONVERSATION_ID -e JWT_TOKEN=$JWT_TOKEN $EXTRA_ARGS $TEST_SCRIPT"

echo "Command: $CMD"
echo ""

# Run the test
eval $CMD

# Show next steps
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Test completed!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
if [ "$USE_LOCAL" != true ]; then
    echo "View detailed results: https://app.k6.io/"
fi
echo ""
echo "Next steps:"
echo "  - Review metrics and identify bottlenecks"
echo "  - Check backend logs for errors"
echo "  - Optimize slow queries or services"
echo "  - Re-run test to verify improvements"
echo ""
