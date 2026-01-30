# PowerShell script to run all database migrations on Neon.tech
# Usage: .\scripts\run-neon-migrations.ps1 -DatabaseUrl "your-neon-connection-string"

param(
    [Parameter(Mandatory=$false)]
    [string]$DatabaseUrl
)

# If no URL provided, try to get from environment or prompt
if (-not $DatabaseUrl) {
    if ($env:DATABASE_URL) {
        $DatabaseUrl = $env:DATABASE_URL
        Write-Host "📌 Using DATABASE_URL from environment" -ForegroundColor Cyan
    } else {
        Write-Host "❌ No database URL provided!" -ForegroundColor Red
        Write-Host ""
        Write-Host "Usage:" -ForegroundColor Yellow
        Write-Host "  .\scripts\run-neon-migrations.ps1 -DatabaseUrl `"postgresql://user:pass@host/db?sslmode=require`"" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Or set environment variable:" -ForegroundColor Yellow
        Write-Host "  `$env:DATABASE_URL = `"postgresql://user:pass@host/db?sslmode=require`"" -ForegroundColor Gray
        Write-Host "  .\scripts\run-neon-migrations.ps1" -ForegroundColor Gray
        exit 1
    }
}

Write-Host ""
Write-Host "🚀 Neon.tech Database Migration Script" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# Mask password in display
$MaskedUrl = $DatabaseUrl -replace '://([^:]+):([^@]+)@', '://$1:****@'
Write-Host "📦 Database: $MaskedUrl" -ForegroundColor Gray
Write-Host ""

# Check if psql is available
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    Write-Host "❌ psql command not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install PostgreSQL client:" -ForegroundColor Yellow
    Write-Host "  Windows: https://www.postgresql.org/download/windows/" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Or use Neon SQL Editor in the dashboard:" -ForegroundColor Yellow
    Write-Host "  https://console.neon.tech/" -ForegroundColor Gray
    exit 1
}

Write-Host "✅ psql found: $($psqlPath.Source)" -ForegroundColor Green
Write-Host ""

# Test connection
Write-Host "🔌 Testing database connection..." -ForegroundColor Cyan
try {
    $testResult = psql $DatabaseUrl -c "SELECT 1;" -t 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Connection successful!" -ForegroundColor Green
    } else {
        Write-Host "❌ Connection failed!" -ForegroundColor Red
        Write-Host "Error: $testResult" -ForegroundColor Red
        Write-Host ""
        Write-Host "Troubleshooting:" -ForegroundColor Yellow
        Write-Host "  1. Check your connection string is correct" -ForegroundColor Gray
        Write-Host "  2. Verify database is not paused (Neon free tier auto-pauses)" -ForegroundColor Gray
        Write-Host "  3. Check if IP allowlist is configured in Neon dashboard" -ForegroundColor Gray
        Write-Host "  4. Ensure connection string includes ?sslmode=require" -ForegroundColor Gray
        exit 1
    }
} catch {
    Write-Host "❌ Connection test failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🔄 Running migrations..." -ForegroundColor Cyan
Write-Host ""

$MigrationDir = ".\supabase\migrations"

# All migrations in order
$Migrations = @(
    "20260123015929_6c56543d-bb81-413d-b142-dbea66bdbd09.sql",
    "20260123015951_d8043680-479c-417e-9e63-43e1ec4c240a.sql",
    "20260123035127_9627ef71-12e4-485e-9333-4737f533b651.sql",
    "20260123040110_600bb8a6-96ad-4e8a-964e-43cc88f67fdf.sql",
    "20260123135449_2eb0571d-f235-4174-af52-503bfee41ccf.sql",
    "20260123141746_9e251afe-9b77-4cf4-87f3-8a0f0d17c31e.sql",
    "20260123145013_9b6259cd-dbe1-42a5-a8f6-1f09ae0a2fc7.sql",
    "20260126154602_afd142e9-b7b1-4803-8b2d-33bf048a6c1d.sql",
    "20260128002104_442c4c0c-0829-4805-8e61-9817c874a6d0.sql",
    "20260128003848_d0722402-0117-4053-9887-cb861cbabbaf.sql",
    "20260128180945_23c62077-a9d5-4173-9ade-115875b5251c.sql",
    "20260128181000_6903a7e7-ad91-4fb7-944a-71bd88994266.sql",
    "20260128230120_0568e7b1-9326-4c3c-9eb7-c157531487d5.sql",
    "20260129005202_61c1c883-d521-418a-b52e-ed10216741fb.sql",
    "20260129005600_1e0e27be-29d4-4bce-8fa6-f946c95e49cf.sql",
    "20260129011541_4d276a45-9f71-492c-82e6-11fde096bd35.sql",
    "20260129012908_2942b736-aa10-4c53-b830-676161810c20.sql",
    "20260130000000_refactored_schema_alignment.sql"
)

$Total = $Migrations.Count
$Current = 0
$Success = 0
$Failed = 0

foreach ($migration in $Migrations) {
    $Current++
    Write-Host "[$Current/$Total] $migration" -ForegroundColor Yellow
    
    $FilePath = Join-Path $MigrationDir $migration
    
    if (-not (Test-Path $FilePath)) {
        Write-Host "  ⚠️  File not found: $FilePath" -ForegroundColor Yellow
        $Failed++
        continue
    }
    
    try {
        # Run migration with error output captured
        $output = psql $DatabaseUrl -f $FilePath 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✅ Success" -ForegroundColor Green
            $Success++
        } else {
            Write-Host "  ❌ Failed" -ForegroundColor Red
            Write-Host "  Error: $output" -ForegroundColor Red
            $Failed++
            
            # Ask if user wants to continue
            Write-Host ""
            $continue = Read-Host "Continue with remaining migrations? (y/n)"
            if ($continue -ne 'y') {
                Write-Host "❌ Migration aborted by user" -ForegroundColor Red
                exit 1
            }
        }
    } catch {
        Write-Host "  ❌ Error: $_" -ForegroundColor Red
        $Failed++
    }
    
    Write-Host ""
}

Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "📊 Migration Summary" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "Total migrations: $Total" -ForegroundColor Gray
Write-Host "✅ Successful: $Success" -ForegroundColor Green
Write-Host "❌ Failed: $Failed" -ForegroundColor $(if ($Failed -gt 0) { "Red" } else { "Gray" })
Write-Host ""

if ($Failed -eq 0) {
    Write-Host "🎉 All migrations completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Verify tables:" -ForegroundColor Gray
    Write-Host "     psql `"$DatabaseUrl`" -c '\dt'" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  2. Set Fly.io secret:" -ForegroundColor Gray
    Write-Host "     flyctl secrets set DATABASE_URL=`"$DatabaseUrl`" -a optionstrat-backend" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  3. Deploy backend:" -ForegroundColor Gray
    Write-Host "     flyctl deploy" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  4. Test backend:" -ForegroundColor Gray
    Write-Host "     curl https://optionstrat-backend.fly.dev/health" -ForegroundColor DarkGray
    Write-Host ""
} else {
    Write-Host "⚠️  Some migrations failed. Please review errors above." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Common issues:" -ForegroundColor Cyan
    Write-Host "  - 'relation already exists': Migrations already ran (safe to ignore)" -ForegroundColor Gray
    Write-Host "  - 'syntax error': Check migration file for issues" -ForegroundColor Gray
    Write-Host "  - 'connection lost': Database paused or network issue" -ForegroundColor Gray
    Write-Host ""
    exit 1
}
