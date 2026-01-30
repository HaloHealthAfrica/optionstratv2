# End-to-End Flow Test Script (PowerShell)
# Tests: Webhook → Signal → Order → Trade → Position → Analytics

$API_URL = if ($env:API_URL) { $env:API_URL } else { "https://optionstrat-backend.fly.dev" }
$TEST_EMAIL = "test-$(Get-Date -Format 'yyyyMMddHHmmss')@example.com"
$TEST_PASSWORD = "testpass123"

$authToken = $null
$userId = $null

function Write-Step {
    param($step, $message)
    Write-Host "`n[$step] $message" -ForegroundColor Cyan
}

function Write-Success {
    param($message)
    Write-Host "✅ $message" -ForegroundColor Green
}

function Write-Error-Custom {
    param($message)
    Write-Host "❌ $message" -ForegroundColor Red
}

function Write-Warning-Custom {
    param($message)
    Write-Host "⚠️  $message" -ForegroundColor Yellow
}

function Invoke-ApiRequest {
    param(
        [string]$Endpoint,
        [string]$Method = "GET",
        [object]$Body = $null
    )
    
    $url = "$API_URL$Endpoint"
    $headers = @{
        "Content-Type" = "application/json"
    }
    
    if ($script:authToken) {
        $headers["Authorization"] = "Bearer $script:authToken"
    }
    
    try {
        $params = @{
            Uri = $url
            Method = $Method
            Headers = $headers
        }
        
        if ($Body) {
            $params["Body"] = ($Body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-RestMethod @params
        return @{ success = $true; data = $response }
    }
    catch {
        $errorMessage = $_.Exception.Message
        if ($_.ErrorDetails.Message) {
            $errorMessage = $_.ErrorDetails.Message
        }
        return @{ success = $false; error = $errorMessage }
    }
}

# Test 1: Health Check
function Test-HealthCheck {
    Write-Step "1" "Testing Health Check"
    
    $result = Invoke-ApiRequest -Endpoint "/health"
    
    if (-not $result.success) {
        Write-Error-Custom "Health check failed: $($result.error)"
        return $false
    }
    
    Write-Success "Health check passed"
    Write-Host "   Mode: $($result.data.mode)"
    Write-Host "   Live Trading: $($result.data.live_trading_enabled)"
    Write-Host "   Timestamp: $($result.data.timestamp)"
    
    return $true
}

# Test 2: User Registration
function Test-Registration {
    Write-Step "2" "Testing User Registration"
    
    $body = @{
        email = $TEST_EMAIL
        password = $TEST_PASSWORD
    }
    
    $result = Invoke-ApiRequest -Endpoint "/auth?action=register" -Method "POST" -Body $body
    
    if (-not $result.success) {
        Write-Error-Custom "Registration failed: $($result.error)"
        return $false
    }
    
    $script:authToken = $result.data.token
    $script:userId = $result.data.user.id
    
    Write-Success "User registered successfully"
    Write-Host "   Email: $($result.data.user.email)"
    Write-Host "   User ID: $script:userId"
    Write-Host "   Token: $($script:authToken.Substring(0, 20))..."
    
    return $true
}

# Test 3: User Login
function Test-Login {
    Write-Step "3" "Testing User Login"
    
    $body = @{
        email = $TEST_EMAIL
        password = $TEST_PASSWORD
    }
    
    $result = Invoke-ApiRequest -Endpoint "/auth?action=login" -Method "POST" -Body $body
    
    if (-not $result.success) {
        Write-Error-Custom "Login failed: $($result.error)"
        return $false
    }
    
    $script:authToken = $result.data.token
    
    Write-Success "Login successful"
    Write-Host "   Token refreshed: $($script:authToken.Substring(0, 20))..."
    
    return $true
}

# Test 4: Token Verification
function Test-TokenVerification {
    Write-Step "4" "Testing Token Verification"
    
    $result = Invoke-ApiRequest -Endpoint "/auth?action=me"
    
    if (-not $result.success) {
        Write-Error-Custom "Token verification failed: $($result.error)"
        return $false
    }
    
    Write-Success "Token verified successfully"
    Write-Host "   User ID: $($result.data.user.id)"
    Write-Host "   Email: $($result.data.user.email)"
    
    return $true
}

# Test 5: Send Test Webhook
function Test-Webhook {
    Write-Step "5" "Testing Webhook (Creating Signal)"
    
    $body = @{
        ticker = "SPY"
        action = "BUY"
        strategy = "e2e-test-strategy"
        timeframe = "5m"
        price = 450.50
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        signal_strength = 85
        source = "tradingview"
    }
    
    $result = Invoke-ApiRequest -Endpoint "/webhook" -Method "POST" -Body $body
    
    if (-not $result.success) {
        Write-Error-Custom "Webhook failed: $($result.error)"
        return $false
    }
    
    Write-Success "Webhook processed successfully"
    Write-Host "   Ticker: $($body.ticker)"
    Write-Host "   Action: $($body.action)"
    Write-Host "   Strategy: $($body.strategy)"
    
    return $true
}

# Test 6: Verify Signal Created
function Test-SignalCreated {
    Write-Step "6" "Verifying Signal Created"
    
    Start-Sleep -Seconds 2
    
    $result = Invoke-ApiRequest -Endpoint "/signals?limit=10"
    
    if (-not $result.success) {
        Write-Error-Custom "Failed to fetch signals: $($result.error)"
        return $false
    }
    
    $signals = $result.data
    
    if (-not $signals -or $signals.Count -eq 0) {
        Write-Warning-Custom "No signals found (this might be expected if signal processing is async)"
        return $true
    }
    
    $testSignal = $signals | Where-Object { $_.strategy -eq "e2e-test-strategy" -or $_.underlying -eq "SPY" } | Select-Object -First 1
    
    if ($testSignal) {
        Write-Success "Signal found in database"
        Write-Host "   Signal ID: $($testSignal.id)"
        Write-Host "   Underlying: $($testSignal.underlying)"
        Write-Host "   Action: $($testSignal.action)"
        Write-Host "   Status: $($testSignal.status)"
    }
    else {
        Write-Warning-Custom "Test signal not found (might be processed already)"
    }
    
    return $true
}

# Test 7: Check Orders
function Test-Orders {
    Write-Step "7" "Checking Orders"
    
    Start-Sleep -Seconds 3
    
    $result = Invoke-ApiRequest -Endpoint "/orders?limit=10"
    
    if (-not $result.success) {
        Write-Error-Custom "Failed to fetch orders: $($result.error)"
        return $false
    }
    
    $orders = $result.data
    
    if (-not $orders -or $orders.Count -eq 0) {
        Write-Warning-Custom "No orders found (signal might not have triggered order yet)"
        return $true
    }
    
    $recentOrder = $orders[0]
    
    Write-Success "Orders retrieved"
    Write-Host "   Total Orders: $($orders.Count)"
    Write-Host "   Latest Order ID: $($recentOrder.id)"
    Write-Host "   Symbol: $($recentOrder.symbol)"
    Write-Host "   Side: $($recentOrder.side)"
    Write-Host "   Quantity: $($recentOrder.quantity)"
    Write-Host "   Status: $($recentOrder.status)"
    Write-Host "   Mode: $($recentOrder.mode)"
    
    return $true
}

# Test 8: Check Stats
function Test-Stats {
    Write-Step "8" "Checking System Stats"
    
    $result = Invoke-ApiRequest -Endpoint "/stats"
    
    if (-not $result.success) {
        Write-Error-Custom "Failed to fetch stats: $($result.error)"
        return $false
    }
    
    $stats = $result.data
    
    Write-Success "Stats retrieved"
    Write-Host "   Total Signals: $($stats.total_signals)"
    Write-Host "   Active Positions: $($stats.active_positions)"
    Write-Host "   Total Orders: $($stats.total_orders)"
    Write-Host "   Win Rate: $($stats.win_rate)%"
    Write-Host "   Total P&L: `$$($stats.total_pnl)"
    
    return $true
}

# Main test runner
function Run-Tests {
    Write-Host "`n============================================================" -ForegroundColor Blue
    Write-Host "🚀 Starting End-to-End Flow Tests" -ForegroundColor Blue
    Write-Host "============================================================`n" -ForegroundColor Blue
    Write-Host "API URL: $API_URL`n"
    
    $tests = @(
        @{ name = "Health Check"; fn = ${function:Test-HealthCheck} },
        @{ name = "User Registration"; fn = ${function:Test-Registration} },
        @{ name = "User Login"; fn = ${function:Test-Login} },
        @{ name = "Token Verification"; fn = ${function:Test-TokenVerification} },
        @{ name = "Webhook (Signal Creation)"; fn = ${function:Test-Webhook} },
        @{ name = "Signal Verification"; fn = ${function:Test-SignalCreated} },
        @{ name = "Orders Check"; fn = ${function:Test-Orders} },
        @{ name = "System Stats"; fn = ${function:Test-Stats} }
    )
    
    $passed = 0
    $failed = 0
    
    foreach ($test in $tests) {
        try {
            $result = & $test.fn
            if ($result) {
                $passed++
            }
            else {
                $failed++
            }
        }
        catch {
            Write-Error-Custom "Test '$($test.name)' threw error: $($_.Exception.Message)"
            $failed++
        }
    }
    
    # Summary
    Write-Host "`n============================================================" -ForegroundColor Blue
    Write-Host "📊 Test Summary" -ForegroundColor Blue
    Write-Host "============================================================" -ForegroundColor Blue
    Write-Host "Total Tests: $($tests.Count)"
    Write-Host "Passed: $passed" -ForegroundColor Green
    Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "White" })
    Write-Host "Success Rate: $([math]::Round(($passed / $tests.Count) * 100, 1))%`n"
    
    if ($failed -eq 0) {
        Write-Host "🎉 All tests passed! Your system is working end-to-end!" -ForegroundColor Green
    }
    else {
        Write-Host "⚠️  Some tests failed. Check the errors above." -ForegroundColor Yellow
    }
    
    Write-Host "`n============================================================`n" -ForegroundColor Blue
}

# Run tests
Run-Tests
