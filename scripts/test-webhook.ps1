# Test Webhook Script
# Sends a test webhook to your backend to verify it's working

param(
    [string]$Url = "https://optionstratv2.fly.dev/webhook"
)

Write-Host "`n🧪 Testing Webhook Endpoint" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Blue
Write-Host "URL: $Url`n" -ForegroundColor Gray

# Test payload
$payload = @{
    action = "BUY"
    ticker = "SPY"
    strike = 580
    expiration = "2025-02-28"
    type = "CALL"
    qty = 1
} | ConvertTo-Json

Write-Host "Sending test webhook..." -ForegroundColor Yellow
Write-Host "Payload:" -ForegroundColor Gray
Write-Host $payload -ForegroundColor White

try {
    $response = Invoke-WebRequest -Uri $Url -Method POST -Body $payload -ContentType "application/json" -UseBasicParsing
    
    Write-Host "`n✅ SUCCESS!" -ForegroundColor Green
    Write-Host "Status Code: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Yellow
    Write-Host $response.Content -ForegroundColor White
    
    # Parse response
    $responseObj = $response.Content | ConvertFrom-Json
    
    if ($responseObj.signal_id) {
        Write-Host "`n✅ Signal ID: $($responseObj.signal_id)" -ForegroundColor Green
        Write-Host "✅ Status: $($responseObj.status)" -ForegroundColor Green
        Write-Host "✅ Correlation ID: $($responseObj.correlation_id)" -ForegroundColor Green
        
        Write-Host "`n📋 Next Steps:" -ForegroundColor Cyan
        Write-Host "1. Check Fly.io logs for this correlation ID: $($responseObj.correlation_id)" -ForegroundColor White
        Write-Host "2. Check database for signal ID: $($responseObj.signal_id)" -ForegroundColor White
        Write-Host "3. Run this SQL query in Neon:" -ForegroundColor White
        Write-Host @"

SELECT * FROM signals WHERE id = '$($responseObj.signal_id)';
SELECT * FROM refactored_signals WHERE metadata->>'original_signal_id' = '$($responseObj.signal_id)';
SELECT * FROM orders WHERE signal_id = '$($responseObj.signal_id)';

"@ -ForegroundColor Cyan
    }
    
} catch {
    Write-Host "`n❌ FAILED!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "Status Code: $statusCode" -ForegroundColor Red
        
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Red
        
        # Diagnose common issues
        Write-Host "`n🔍 Diagnosis:" -ForegroundColor Yellow
        
        if ($statusCode -eq 401) {
            Write-Host "❌ HMAC signature issue" -ForegroundColor Red
            Write-Host "   Fix: Temporarily disable HMAC:" -ForegroundColor Yellow
            Write-Host "   fly secrets unset HMAC_SECRET --app optionstrat-backend" -ForegroundColor Cyan
        }
        elseif ($statusCode -eq 400) {
            Write-Host "❌ Invalid payload format" -ForegroundColor Red
            Write-Host "   Fix: Check JSON structure matches expected format" -ForegroundColor Yellow
        }
        elseif ($statusCode -eq 404) {
            Write-Host "❌ Webhook endpoint not found" -ForegroundColor Red
            Write-Host "   Fix: Verify URL is correct: $Url" -ForegroundColor Yellow
        }
        elseif ($statusCode -eq 500) {
            Write-Host "❌ Server error" -ForegroundColor Red
            Write-Host "   Fix: Check Fly.io logs for error details" -ForegroundColor Yellow
        }
    }
}

Write-Host "`n" -NoNewline
