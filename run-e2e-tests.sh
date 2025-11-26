#!/bin/bash

# E2E Test Runner for Claim Submission
# Automates setup and execution of Playwright tests

set -e

echo "╔═══════════════════════════════════════════════════╗"
echo "║  E2E TEST SUITE - CLAIM SUBMISSION                ║"
echo "║  Testing: Trupanion, Nationwide, Healthy Paws     ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# Check if Playwright is installed
if ! npx playwright --version > /dev/null 2>&1; then
    echo "❌ Playwright not found. Installing..."
    npm install -D @playwright/test
    npx playwright install chromium
fi

# Check if setup has been run
if [ ! -f ".playwright-mcp/gmail-session/state.json" ]; then
    echo "⚠️  First-time setup required"
    echo ""
    read -p "Run setup script now? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Running setup..."
        npx ts-node test/e2e/setup-test-environment.ts
    else
        echo "❌ Setup required before running tests"
        echo "   Run: npx ts-node test/e2e/setup-test-environment.ts"
        exit 1
    fi
fi

# Run tests
echo ""
echo "🧪 Running E2E tests..."
echo ""

if [ "$1" == "local" ]; then
    echo "Testing against: http://localhost:5173"
    TEST_ENV=local npx playwright test test/e2e/claim-submission-full.spec.ts
else
    echo "Testing against: https://pet-claim-helper.vercel.app"
    npx playwright test test/e2e/claim-submission-full.spec.ts
fi

# Show report
echo ""
echo "✅ Tests complete!"
echo ""
read -p "Open HTML report? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npx playwright show-report
fi

echo ""
echo "Screenshots: .playwright-mcp/"
echo "HTML Report: playwright-report/"
echo ""
