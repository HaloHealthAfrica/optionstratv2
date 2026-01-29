#!/bin/bash
# Run all database migrations on Fly.io Postgres

set -e

echo "🔄 Running database migrations..."

# Check if flyctl is installed
if ! command -v flyctl &> /dev/null; then
    echo "❌ flyctl is not installed. Please install it first:"
    echo "   https://fly.io/docs/hands-on/install-flyctl/"
    exit 1
fi

DB_NAME="optionstrat-db"

# Get database connection string
echo "📝 Getting database connection..."
DB_URL=$(flyctl postgres connect -a $DB_NAME --command "echo \$DATABASE_URL")

if [ -z "$DB_URL" ]; then
    echo "❌ Could not get database connection string"
    exit 1
fi

echo "✅ Connected to database"

# Run migrations in order
echo "🔄 Running migrations..."

MIGRATION_DIR="./supabase/migrations"

if [ ! -d "$MIGRATION_DIR" ]; then
    echo "❌ Migration directory not found: $MIGRATION_DIR"
    exit 1
fi

# Count migrations
MIGRATION_COUNT=$(ls -1 $MIGRATION_DIR/*.sql 2>/dev/null | wc -l)
echo "📦 Found $MIGRATION_COUNT migration files"

# Run each migration
for migration in $MIGRATION_DIR/*.sql; do
    if [ -f "$migration" ]; then
        filename=$(basename "$migration")
        echo "  ▶️  Running: $filename"
        
        # Execute migration using flyctl
        flyctl postgres connect -a $DB_NAME --command "psql -f $migration"
        
        if [ $? -eq 0 ]; then
            echo "  ✅ $filename completed"
        else
            echo "  ❌ $filename failed"
            exit 1
        fi
    fi
done

echo ""
echo "✅ All migrations completed successfully!"
echo ""
echo "Next steps:"
echo "1. Verify database: flyctl postgres connect -a $DB_NAME"
echo "2. Deploy app: flyctl deploy"
