#!/bin/bash

# PartyKit Deployment Verification Script
echo "🎈 PartyKit Deployment Verification"
echo "===================================="
echo ""

PARTYKIT_URL="https://ai-chat-collaboration.wnstnb.partykit.dev"

echo "Testing PartyKit server at: $PARTYKIT_URL"
echo ""

# Test 1: Health Check
echo "1. Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s -w "%{http_code}" "$PARTYKIT_URL/health" -o /tmp/health_response.json)
HTTP_CODE="${HEALTH_RESPONSE: -3}"

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Health check passed (HTTP $HTTP_CODE)"
    echo "   Response: $(cat /tmp/health_response.json)"
else
    echo "❌ Health check failed (HTTP $HTTP_CODE)"
    echo "   This might be normal if the domain is still provisioning..."
fi
echo ""

# Test 2: Document State Endpoint
echo "2. Testing document state endpoint..."
DOC_RESPONSE=$(curl -s -w "%{http_code}" "$PARTYKIT_URL/document-state" -o /tmp/doc_response.bin)
DOC_HTTP_CODE="${DOC_RESPONSE: -3}"

if [ "$DOC_HTTP_CODE" = "200" ]; then
    echo "✅ Document state endpoint accessible (HTTP $DOC_HTTP_CODE)"
    echo "   Response size: $(wc -c < /tmp/doc_response.bin) bytes"
else
    echo "❌ Document state endpoint failed (HTTP $DOC_HTTP_CODE)"
fi
echo ""

# Test 3: WebSocket Connection Test (basic)
echo "3. Testing WebSocket endpoint availability..."
WS_TEST=$(curl -s -w "%{http_code}" -H "Upgrade: websocket" -H "Connection: Upgrade" "$PARTYKIT_URL/parties/collaboration/test-room" -o /dev/null)
WS_HTTP_CODE="${WS_TEST: -3}"

if [ "$WS_HTTP_CODE" = "101" ] || [ "$WS_HTTP_CODE" = "400" ] || [ "$WS_HTTP_CODE" = "426" ]; then
    echo "✅ WebSocket endpoint responding (HTTP $WS_HTTP_CODE)"
    echo "   This indicates the server is handling WebSocket upgrade requests"
else
    echo "⚠️  WebSocket endpoint response: HTTP $WS_HTTP_CODE"
    echo "   This might be expected for a basic curl test"
fi
echo ""

# Test 4: Environment Variables Check
echo "4. Checking deployment info..."
echo "   Project URL: $PARTYKIT_URL"
echo "   Environment variables configured:"
npx partykit env list 2>/dev/null | grep "Deployed variables:" || echo "   Could not retrieve env vars"
echo ""

# Clean up temp files
rm -f /tmp/health_response.json /tmp/doc_response.bin

echo "🎉 Deployment verification complete!"
echo ""
echo "Next steps:"
echo "  1. Update your client app to use: $PARTYKIT_URL"
echo "  2. Test real-time collaboration in your app"
echo "  3. Monitor logs with: npx partykit tail"
echo "" 