# Vercel Frontend Deployment Steps

## Issue
Dashboard page is blank after backend deployment because the frontend on Vercel needs to be updated.

## Backend Status ✅
- Backend is deployed and working on Fly.io: `https://optionstratv2.fly.dev`
- All endpoints are responding correctly:
  - `/health` - ✅ Working
  - `/stats` - ✅ Working (returns empty data)
  - `/signals` - ✅ Working
  - `/positions` - ✅ Working
  - `/orders` - ✅ Working
  - `/risk-violations` - ✅ Working (was 404, now fixed)
  - `/mtf-comparison` - ✅ Working (was 501, now returns empty data)
  - `/analytics` - ✅ Working
  - `/exit-signals` - ✅ Working

## Frontend Deployment Required

### Option 1: Redeploy via Vercel Dashboard (Recommended)
1. Go to your Vercel dashboard: https://vercel.com/dashboard
2. Find your optionstrat project
3. Go to Settings → Environment Variables
4. Ensure `VITE_API_URL` is set to: `https://optionstratv2.fly.dev`
5. Go to Deployments tab
6. Click "Redeploy" on the latest deployment
7. Wait for deployment to complete

### Option 2: Deploy via Git Push
1. Make a small change to trigger Vercel deployment (or push latest changes)
2. Vercel will automatically deploy when you push to the connected branch

### Option 3: Deploy via Vercel CLI
```bash
cd optionstrat-main
npm install -g vercel  # If not already installed
vercel --prod
```

## Environment Variables Required on Vercel

Make sure these are set in Vercel project settings:

```
VITE_API_URL=https://optionstratv2.fly.dev
```

## Verification Steps

After deployment:
1. Open your Vercel frontend URL
2. Login with your credentials
3. Dashboard should load with empty state (no errors)
4. Open browser console (F12) - should see no 404/500 errors
5. Check Network tab - all API calls should return 200 status

## Expected Behavior

Since the database is empty:
- Stats cards will show zeros
- Positions table will be empty
- Signals table will be empty
- Orders table will be empty
- No errors should appear

## Next Steps After Frontend Deployment

To populate the dashboard with data:
1. Send a test webhook signal to: `https://optionstratv2.fly.dev/webhook`
2. Or wait for TradingView to send real signals
3. Data will then appear on the dashboard

## Troubleshooting

If dashboard is still blank after deployment:
1. Check browser console for errors
2. Check Network tab to see if API calls are going to the correct URL
3. Verify `VITE_API_URL` environment variable is set correctly on Vercel
4. Clear browser cache and hard refresh (Ctrl+Shift+R)
