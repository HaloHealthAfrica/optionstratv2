#!/bin/bash
# Setup Fly.io Postgres Database for Optionstrat

set -e

echo "🗄️  Setting up Fly.io Postgres database..."

# Check if flyctl is installed
if ! command -v flyctl &> /dev/null; then
    echo "❌ flyctl is not installed. Please install it first:"
    echo "   https://fly.io/docs/hands-on/install-flyctl/"
    exit 1
fi

# App name
APP_NAME="optionstrat-backend"
DB_NAME="optionstrat-db"

echo "📦 Creating Postgres database: $DB_NAME"

# Create Postgres cluster
flyctl postgres create \
  --name $DB_NAME \
  --region iad \
  --initial-cluster-size 1 \
  --vm-size shared-cpu-1x \
  --volume-size 1

echo "✅ Database created successfully!"

# Attach database to app
echo "🔗 Attaching database to app: $APP_NAME"
flyctl postgres attach $DB_NAME --app $APP_NAME

echo "✅ Database attached successfully!"

# Get connection string
echo "📝 Getting database connection string..."
flyctl postgres connect -a $DB_NAME

echo ""
echo "✅ Database setup complete!"
echo ""
echo "Next steps:"
echo "1. Run migrations: ./scripts/run-migrations.sh"
echo "2. Deploy app: flyctl deploy"
