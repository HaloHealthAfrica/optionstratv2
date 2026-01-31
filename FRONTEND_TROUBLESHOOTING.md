# Frontend Blank Page Troubleshooting

## Quick Diagnostic Steps

### Step 1: Check Browser Console
1. Open your deployed frontend URL
2. Press F12 to open Developer Tools
3. Go to Console tab
4. Look for any errors (red text)
5. **Share the errors with me**

### Step 2: Check Network Tab
1. In Developer Tools, go to Network tab
2. Refresh the page (F5)
3. Look at the API calls being made
4. Check if they're going to `https://optionstratv2.fly.dev`
5. Check the status codes (should be 200, not 404/500)
6. **Share any failed requests (red/orange)**

### Step 3: Check Environment Variable
1. In browser console, type: `import.meta.env.VITE_API_URL`
2. It should show: `https://optionstratv2.fly.dev`
3. If it shows something else or undefined, the environment variable isn't set correctly on Vercel

### Step 4: Check if Frontend is Updated
1. In browser console, type: `console.log('Frontend version check')`
2. View the page source (Ctrl+U)
3. Search for "optionstratv2.fly.dev" in the source
4. If you don't see it, the frontend hasn't been redeployed

## Common Issues and Solutions

### Issue 1: Blank White Page
**Symptoms**: Page loads but shows nothing, no errors in console
**Cause**: JavaScript error preventing React from rendering
**Solution**: 
- Check console for errors
- Clear browser cache (Ctrl+Shift+Delete)
- Hard refresh (Ctrl+Shift+R)

### Issue 2: Stuck on Loading Spinner
**Symptoms**: Page shows loading spinner forever
**Cause**: Auth check is failing or API is unreachable
**Solution**:
- Check Network tab for failed API calls
- Verify `VITE_API_URL` is set correctly
- Try logging out and back in

### Issue 3: Redirects to Login Immediately
**Symptoms**: Logs in successfully but immediately redirects back to login
**Cause**: Auth token not being saved or validated correctly
**Solution**:
- Check localStorage for `auth_token`
- Check if `/auth?action=me` endpoint is working
- Clear localStorage and login again

### Issue 4: API Calls Failing
**Symptoms**: Console shows 404/500 errors for API calls
**Cause**: Frontend is calling wrong API URL or backend endpoints are broken
**Solution**:
- Verify backend is running: `curl https://optionstratv2.fly.dev/health`
- Check if API calls are going to correct URL in Network tab
- Redeploy frontend with correct `VITE_API_URL`

## Vercel Deployment Checklist

- [ ] Environment variable `VITE_API_URL=https://optionstratv2.fly.dev` is set
- [ ] Latest code is pushed to GitHub
- [ ] Vercel has redeployed (check Deployments tab)
- [ ] Deployment status is "Ready" (not "Building" or "Error")
- [ ] Browser cache is cleared
- [ ] Hard refresh performed (Ctrl+Shift+R)

## Testing Backend Directly

Run these commands to verify backend is working:

```bash
# Health check
curl https://optionstratv2.fly.dev/health

# Stats
curl https://optionstratv2.fly.dev/stats

# Signals
curl https://optionstratv2.fly.dev/signals

# Positions
curl https://optionstratv2.fly.dev/positions

# Risk violations
curl https://optionstratv2.fly.dev/risk-violations
```

All should return JSON responses (not 404/500 errors).

## Next Steps

1. **Check browser console and share errors**
2. **Verify Vercel environment variables**
3. **Redeploy frontend on Vercel**
4. **Clear browser cache and hard refresh**

If still blank after these steps, share:
- Browser console errors
- Network tab failed requests
- Vercel deployment logs
