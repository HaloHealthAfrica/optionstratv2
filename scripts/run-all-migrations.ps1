# PowerShell script to run all database migrations
param(
    [Parameter(Mandatory=$true)]
    [string]$DatabaseUrl
)

Write-Host "🔄 Running all database migrations..." -ForegroundColor Cyan
Write-Host "📦 Database: $($DatabaseUrl.Substring(0, [Math]::Min(30, $DatabaseUrl.Length)))..." -ForegroundColor Gray
Write-Host ""

$MigrationDir = ".\supabase\migrations"

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

foreach ($migration in $Migrations) {
    $Current++
    Write-Host "[$Current/$Total] Running: $migration" -ForegroundColor Yellow
    
    $FilePath = Join-Path $MigrationDir $migration
    
    if (Test-Path $FilePath) {
        try {
            psql $DatabaseUrl -f $FilePath -q
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  ✅ Success" -ForegroundColor Green
            } else {
                Write-Host "  ❌ Failed (exit code: $LASTEXITCODE)" -ForegroundColor Red
                exit 1
            }
        } catch {
            Write-Host "  ❌ Error: $_" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "  ⚠️  File not found: $FilePath" -ForegroundColor Yellow
    }
    
    Write-Host ""
}

Write-Host "✅ All migrations completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Verify tables: psql `"$DatabaseUrl`" -c '\dt'" -ForegroundColor Gray
Write-Host "2. Test backend: curl https://optionstrat-backend.fly.dev/stats" -ForegroundColor Gray
