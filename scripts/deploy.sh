#!/bin/bash
# Deploy Optionstrat Backend to Fly.io

set -e

echo "🚀 Deploying Optionstrat Backend to Fly.io..."

# Check if flyctl is installed
if ! command -v flyctl &> /dev/null; then
    echo "❌ flyctl is not installed. Please install it first:"
    echo "   https://fly.io/docs/hands-on/install-flyctl/"
    exit 1
fi

APP_NAME="optionstrat-backend"

# Check if app exists
if ! flyctl apps list | grep -q $APP_NAME; then
    echo "📦 Creating new Fly.io app: $APP_NAME"
    flyctl apps create $APP_NAME --org personal
else
    echo "✅ App $APP_NAME already exists"
fi

# Set secrets/environment variables
echo "🔐 Setting environment variables..."

# You'll need to set these manually or pass them as arguments
# flyctl secrets set DATABASE_URL="postgres://..." -a $APP_NAME
# flyctl secrets set SUPABASE_URL="your-supabase-url" -a $APP_NAME
# flyctl secrets set SUPABASE_ANON_KEY="your-anon-key" -a $APP_NAME

echo "⚠️  Remember to set your secrets:"
echo "   flyctl secrets set DATABASE_URL=<your-db-url> -a $APP_NAME"
echo "   flyctl secrets set ALPACA_API_KEY=<your-key> -a $APP_NAME"
echo "   flyctl secrets set ALPACA_SECRET_KEY=<your-secret> -a $APP_NAME"
echo "   flyctl secrets set TRADIER_API_KEY=<your-key> -a $APP_NAME"
echo "   flyctl secrets set TWELVEDATA_API_KEY=<your-key> -a $APP_NAME"
echo "   flyctl secrets set UNUSUAL_WHALES_API_KEY=<your-key> -a $APP_NAME"
echo ""

# Deploy
echo "🚀 Deploying application..."
flyctl deploy --app $APP_NAME

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Your app is available at: https://$APP_NAME.fly.dev"
echo ""
echo "Next steps:"
echo "1. Check logs: flyctl logs -a $APP_NAME"
echo "2. Check status: flyctl status -a $APP_NAME"
echo "3. Test health: curl https://$APP_NAME.fly.dev/health"
