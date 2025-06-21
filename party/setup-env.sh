#!/bin/bash

# PartyKit Environment Setup Script
# This script helps you set up environment variables for your PartyKit deployment

echo "🎈 PartyKit Environment Setup"
echo "=============================="
echo ""

# Check if we're in the right directory
if [ ! -f "partykit.json" ]; then
    echo "❌ Error: partykit.json not found. Please run this script from the party directory."
    exit 1
fi

# Check if user is logged in
if ! npx partykit whoami > /dev/null 2>&1; then
    echo "❌ Error: Not logged into PartyKit. Please run 'npx partykit login' first."
    exit 1
fi

echo "✅ Found partykit.json and you're logged in!"
echo ""

# Function to set environment variable
set_env_var() {
    local key=$1
    local description=$2
    local example=$3
    
    echo "Setting up: $key"
    echo "Description: $description"
    if [ ! -z "$example" ]; then
        echo "Example: $example"
    fi
    echo ""
    
    # Check if variable already exists
    if npx partykit env list 2>/dev/null | grep -q "^$key"; then
        echo "⚠️  $key already exists. Do you want to update it? (y/N)"
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            echo "Skipping $key"
            echo ""
            return
        fi
    fi
    
    echo "Enter value for $key (input will be hidden):"
    read -s value
    
    if [ -z "$value" ]; then
        echo "❌ Empty value provided. Skipping $key"
        echo ""
        return
    fi
    
    # Set the environment variable
    if npx partykit env add "$key" --value "$value" > /dev/null 2>&1; then
        echo "✅ Successfully set $key"
    else
        echo "❌ Failed to set $key"
    fi
    echo ""
}

echo "We need to set up the following environment variables:"
echo ""

# Set up Supabase URL
set_env_var "SUPABASE_URL" "Your Supabase project URL" "https://your-project.supabase.co"

# Set up Supabase Service Role Key
set_env_var "SUPABASE_SERVICE_ROLE_KEY" "Your Supabase service role key (secret)" "eyJ..."

# Set up JWT Secret
set_env_var "SUPABASE_JWT_SECRET" "Your Supabase JWT secret for token verification" "your-jwt-secret"

# Set up CORS Origins
set_env_var "CORS_ORIGINS" "Comma-separated list of allowed origins" "https://your-app.com,https://localhost:3000"

echo "🎉 Environment setup complete!"
echo ""
echo "You can verify your environment variables with:"
echo "  npx partykit env list"
echo ""
echo "Next steps:"
echo "  1. Run 'npm run build' to build your PartyKit server"
echo "  2. Run 'npm run deploy' to deploy to Cloudflare"
echo "" 