# Deployment Instructions - Fix 404 Errors

## Changes Made

### 1. Fixed API URL Configuration ✅
- Updated `.env` and `.env.production` to use correct backend URL
- Old: `https://optionstrat-backend.fly.dev` ❌
- New: `https://optionstratv2.fly.dev` ✅

### 2. Added Missing API Endpoints ✅
- Created `/signals` endpoint
- Created `/orders` endpoint
- Updated `server.ts` to include new endpoints

### 3. Pushed to GitHub ✅
- All changes committed and pushed to: https://github.com/HaloHealthAfrica/optionstratv2

---

## Deployment Steps

### Step 1: Deploy Backend to Fly.io

```powershell
# Navigate to project directory
cd optionstrat-main

# Deploy to Fly.io
fly deploy --app optionstratv2

# Wait for deployment to complete (2-3 minutes)
```

**Expected output:**
```
==> Verifying app config
--> Verified app config
==> Building image
...
==> Deploying optionstratv2
...
--> v2 deployed successfully
```

### Step 2: Verify Backend Deployment

```powershell
# Test health endpoint
curl https://optionstratv2.fly.dev/health

# Test new signals endpoint
curl https://optionstratv2.fly.dev/signals

# Test new orders endpoint
curl https://optionstratv2.fly.dev/orders
```

**Expected responses:**
- `/health`: `{"status":"healthy",...}`
- `/signals`: `{"signals":[...]}`
- `/orders`: `{"orders":[...]}`

### Step 3: Update Vercel Environment Variable

1. Go to https://vercel.com/dashboard
2. Find your `optionstratv2` project
3. Click **Settings** → **Environment Variables**
4. Find `VITE_API_URL` variable
5. Update value to: `https://optionstratv2.fly.dev`
6. Click **Save**

### Step 4: Redeploy Frontend on Vercel

**Option A: Automatic (Recommended)**
- Vercel will automatically redeploy when you push to GitHub
- Changes are already pushed, so just wait 2-3 minutes

**Option B: Manual**
1. Go to https://vercel.com/dashboard
2. Find your `optionstratv2` project
3. Go to **Deployments** tab
4. Click **Redeploy** on the latest deployment
5. Select **Use existing Build Cache** (faster)
6. Click **Redeploy**

### Step 5: Verify Frontend Deployment

1. Visit: https://optionstratv2.vercel.app
2. Open browser console (F12)
3. Check for errors

**Expected results:**
- ✅ Dashboard loads without errors
- ✅ Stats cards show data
- ✅ Signals table displays recent signals
- ✅ Positions table displays positions
- ✅ No 404 errors in console

---

## Testing Webhooks

After deployment, test the webhook system:

```powershell
# Navigate to scripts directory
cd optionstrat-main/scripts

# Run test webhook
.\test-webhook.ps1
```

**Expected output:**
```
✅ SUCCESS!
Status Code: 200
✅ Signal ID: abc123...
✅ Status: PROCESSING
✅ Correlation ID: xyz789...
```

### Verify Webhook Activity on Website

1. Send test webhook (using script above)
2. Wait 5-10 seconds for polling to refresh
3. Go to https://optionstratv2.vercel.app
4. Check **Signals** table - should show new signal
5. Check **Stats** cards - signal count should increase

---

## Troubleshooting

### Issue: Backend deployment fails

**Solution:**
```powershell
# Check Fly.io logs
fly logs --app optionstratv2

# Restart app
fly apps restart optionstratv2
```

### Issue: Frontend still shows 404 errors

**Possible causes:**
1. Vercel environment variable not updated
2. Frontend not redeployed
3. Browser cache

**Solutions:**
```powershell
# 1. Verify environment variable in Vercel dashboard
# 2. Manually redeploy in Vercel
# 3. Clear browser cache (Ctrl+Shift+Delete)
# 4. Hard refresh (Ctrl+F5)
```

### Issue: Signals endpoint returns empty array

**This is normal if:**
- No webhooks have been sent yet
- Database is empty

**Solution:**
```powershell
# Send test webhook
cd optionstrat-main/scripts
.\test-webhook.ps1

# Wait 5 seconds, then check again
curl https://optionstratv2.fly.dev/signals
```

### Issue: Authentication errors

**Solution:**
```powershell
# Check if auth token is set in Fly.io
fly secrets list --app optionstratv2

# If API_AUTH_TOKEN is missing, set it
fly secrets set API_AUTH_TOKEN="your-secret-token" --app optionstratv2
```

---

## Verification Checklist

After completing all deployment steps:

- [ ] Backend deployed to Fly.io
- [ ] Backend health check returns 200 OK
- [ ] `/signals` endpoint returns data (or empty array)
- [ ] `/orders` endpoint returns data (or empty array)
- [ ] Vercel environment variable updated
- [ ] Frontend redeployed on Vercel
- [ ] Frontend loads without 404 errors
- [ ] Dashboard displays data correctly
- [ ] Test webhook succeeds
- [ ] Webhook activity appears on website

---

## Quick Commands Reference

```powershell
# Deploy backend
cd optionstrat-main
fly deploy --app optionstratv2

# Check backend health
curl https://optionstratv2.fly.dev/health

# Check backend logs
fly logs --app optionstratv2

# Test webhook
cd optionstrat-main/scripts
.\test-webhook.ps1

# Check database (run in Neon SQL Editor)
SELECT COUNT(*) FROM signals;
SELECT COUNT(*) FROM orders;
SELECT COUNT(*) FROM refactored_signals;
```

---

## Summary

**Root Cause:** Frontend was calling wrong backend URL + missing API endpoints

**Fix Applied:**
1. Updated environment files with correct URL
2. Created missing `/signals` and `/orders` endpoints
3. Updated server to include new endpoints

**Action Required:**
1. Deploy backend to Fly.io: `fly deploy --app optionstratv2`
2. Update Vercel environment variable: `VITE_API_URL=https://optionstratv2.fly.dev`
3. Redeploy frontend on Vercel (automatic or manual)
4. Test webhook system

**Expected Result:**
- Dashboard loads without 404 errors
- Webhook activity displays on website
- All API endpoints work correctly

---

## Support

If you encounter issues:

1. Check Fly.io logs: `fly logs --app optionstratv2`
2. Check browser console for errors (F12)
3. Verify environment variables in Vercel dashboard
4. Run diagnostic queries in Neon SQL Editor (see `404_FIX_SUMMARY.md`)

All changes are committed and pushed to GitHub: https://github.com/HaloHealthAfrica/optionstratv2
