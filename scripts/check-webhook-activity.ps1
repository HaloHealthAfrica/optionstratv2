# Check Webhook Activity via Database
# This script queries the database to verify webhook activity

param(
    [string]$DatabaseUrl = $env:DATABASE_URL
)

if (-not $DatabaseUrl) {
    Write-Host "❌ DATABASE_URL not set!" -ForegroundColor Red
    Write-Host "Set it with: `$env:DATABASE_URL = 'your-neon-connection-string'" -ForegroundColor Yellow
    exit 1
}

Write-Host "🔍 Checking Webhook Activity in Database" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Blue

# Parse connection string
if ($DatabaseUrl -match "postgres://([^:]+):([^@]+)@([^/]+)/(.+)") {
    $user = $matches[1]
    $password = $matches[2]
    $host = $matches[3]
    $database = $matches[4]
    
    Write-Host "Database: $database" -ForegroundColor Gray
    Write-Host "Host: $host`n" -ForegroundColor Gray
} else {
    Write-Host "❌ Invalid DATABASE_URL format" -ForegroundColor Red
    exit 1
}

# Function to run SQL query
function Invoke-SqlQuery {
    param(
        [string]$Query,
        [string]$Title
    )
    
    Write-Host "`n[$Title]" -ForegroundColor Yellow
    Write-Host ("-" * 60) -ForegroundColor Gray
    
    try {
        # Use psql if available, otherwise show manual instructions
        $psqlPath = Get-Command psql -ErrorAction SilentlyContinue
        
        if ($psqlPath) {
            $env:PGPASSWORD = $password
            $result = psql -h $host -U $user -d $database -c $Query -t -A 2>&1
            $env:PGPASSWORD = $null
            
            if ($LASTEXITCODE -eq 0) {
                if ($result) {
                    Write-Host $result -ForegroundColor White
                } else {
                    Write-Host "(No results)" -ForegroundColor Gray
                }
            } else {
                Write-Host "Error executing query" -ForegroundColor Red
            }
        } else {
            Write-Host "⚠️  psql not installed. Run this query manually in Neon SQL Editor:" -ForegroundColor Yellow
            Write-Host $Query -ForegroundColor Cyan
        }
    } catch {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Query 1: Recent Signals
$query1 = @"
SELECT 
    TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created,
    underlying,
    action,
    strategy,
    status
FROM refactored_signals
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 10;
"@

Invoke-SqlQuery -Query $query1 -Title "Recent Signals (Last 24 hours)"

# Query 2: Signal Count
$query2 = @"
SELECT COUNT(*) as total_signals
FROM refactored_signals
WHERE created_at > NOW() - INTERVAL '24 hours';
"@

Invoke-SqlQuery -Query $query2 -Title "Total Signals (Last 24 hours)"

# Query 3: Recent Orders
$query3 = @"
SELECT 
    TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created,
    underlying,
    side,
    quantity,
    status,
    mode
FROM orders
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 10;
"@

Invoke-SqlQuery -Query $query3 -Title "Recent Orders (Last 24 hours)"

# Query 4: Quick Summary
$query4 = @"
SELECT 
    'Signals (24h)' as metric,
    COUNT(*)::text as value
FROM refactored_signals
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
    'Orders (24h)' as metric,
    COUNT(*)::text as value
FROM orders
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
    'Trades (24h)' as metric,
    COUNT(*)::text as value
FROM trades
WHERE executed_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
    'Active Positions' as metric,
    COUNT(*)::text as value
FROM refactored_positions
WHERE is_closed = false;
"@

Invoke-SqlQuery -Query $query4 -Title "Quick Summary"

# Manual Instructions
Write-Host "`n" -NoNewline
Write-Host "=" * 60 -ForegroundColor Blue
Write-Host "📋 Manual Database Check Instructions" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Blue

Write-Host "`n1. Go to Neon Dashboard: https://console.neon.tech" -ForegroundColor Yellow
Write-Host "2. Select your project" -ForegroundColor Yellow
Write-Host "3. Click 'SQL Editor'" -ForegroundColor Yellow
Write-Host "4. Run this query:" -ForegroundColor Yellow

Write-Host @"

-- Quick diagnostic query
SELECT 
    'Signals (24h)' as metric,
    COUNT(*) as count,
    MAX(created_at) as last_activity
FROM refactored_signals
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
    'Orders (24h)' as metric,
    COUNT(*) as count,
    MAX(created_at) as last_activity
FROM orders
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
    'Trades (24h)' as metric,
    COUNT(*) as count,
    MAX(executed_at) as last_activity
FROM trades
WHERE executed_at > NOW() - INTERVAL '24 hours';

"@ -ForegroundColor Cyan

Write-Host "`n5. Interpret Results:" -ForegroundColor Yellow
Write-Host "   - Signals > 0: ✅ Webhooks are being received" -ForegroundColor Green
Write-Host "   - Signals = 0: ❌ No webhooks received (check Fly.io logs)" -ForegroundColor Red
Write-Host "   - Orders > 0: ✅ Signals are triggering orders" -ForegroundColor Green
Write-Host "   - Orders = 0: ⚠️  Signals not converting to orders (check decision logic)" -ForegroundColor Yellow
Write-Host "   - Trades > 0: ✅ Orders are being executed" -ForegroundColor Green
Write-Host "   - Trades = 0: ⚠️  Orders not being filled (check broker)" -ForegroundColor Yellow

Write-Host "`n✅ Check complete!" -ForegroundColor Green
