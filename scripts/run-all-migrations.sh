#!/bin/bash
# Run all database migrations in order

set -e

# Check if DATABASE_URL is provided
if [ -z "$1" ]; then
    echo "Usage: ./run-all-migrations.sh <database-connection-string>"
    echo ""
    echo "Example:"
    echo "  ./run-all-migrations.sh 'postgresql://user:pass@host/db'"
    echo ""
    echo "Get your connection string from:"
    echo "  - Neon: Dashboard → Connection Details"
    echo "  - Vercel: Dashboard → Storage → .env.local"
    exit 1
fi

DATABASE_URL="$1"

echo "🔄 Running all database migrations..."
echo "📦 Database: ${DATABASE_URL:0:30}..."
echo ""

MIGRATION_DIR="./supabase/migrations"

# Get all migration files in order
MIGRATIONS=(
    "20260123015929_6c56543d-bb81-413d-b142-dbea66bdbd09.sql"
    "20260123015951_d8043680-479c-417e-9e63-43e1ec4c240a.sql"
    "20260123035127_9627ef71-12e4-485e-9333-4737f533b651.sql"
    "20260123040110_600bb8a6-96ad-4e8a-964e-43cc88f67fdf.sql"
    "20260123135449_2eb0571d-f235-4174-af52-503bfee41ccf.sql"
    "20260123141746_9e251afe-9b77-4cf4-87f3-8a0f0d17c31e.sql"
    "20260123145013_9b6259cd-dbe1-42a5-a8f6-1f09ae0a2fc7.sql"
    "20260126154602_afd142e9-b7b1-4803-8b2d-33bf048a6c1d.sql"
    "20260128002104_442c4c0c-0829-4805-8e61-9817c874a6d0.sql"
    "20260128003848_d0722402-0117-4053-9887-cb861cbabbaf.sql"
    "20260128180945_23c62077-a9d5-4173-9ade-115875b5251c.sql"
    "20260128181000_6903a7e7-ad91-4fb7-944a-71bd88994266.sql"
    "20260128230120_0568e7b1-9326-4c3c-9eb7-c157531487d5.sql"
    "20260129005202_61c1c883-d521-418a-b52e-ed10216741fb.sql"
    "20260129005600_1e0e27be-29d4-4bce-8fa6-f946c95e49cf.sql"
    "20260129011541_4d276a45-9f71-492c-82e6-11fde096bd35.sql"
    "20260129012908_2942b736-aa10-4c53-b830-676161810c20.sql"
    "20260130000000_refactored_schema_alignment.sql"
)

TOTAL=${#MIGRATIONS[@]}
CURRENT=0

for migration in "${MIGRATIONS[@]}"; do
    CURRENT=$((CURRENT + 1))
    echo "[$CURRENT/$TOTAL] Running: $migration"
    
    if [ -f "$MIGRATION_DIR/$migration" ]; then
        psql "$DATABASE_URL" -f "$MIGRATION_DIR/$migration" -q
        
        if [ $? -eq 0 ]; then
            echo "  ✅ Success"
        else
            echo "  ❌ Failed"
            exit 1
        fi
    else
        echo "  ⚠️  File not found: $MIGRATION_DIR/$migration"
    fi
    
    echo ""
done

echo "✅ All migrations completed successfully!"
echo ""
echo "Next steps:"
echo "1. Verify tables: psql \"$DATABASE_URL\" -c '\\dt'"
echo "2. Test backend: curl https://optionstrat-backend.fly.dev/stats"
