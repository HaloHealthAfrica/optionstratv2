# Migration from Supabase to Fly.io + Neon

## What Changed

### Backend
- ✅ Replaced Supabase client with direct PostgreSQL client (`postgres-client.ts`)
- ✅ Database now connects to Neon.tech instead of Supabase
- ✅ All 7 tables migrated to Neon database
- ✅ Backend deployed to Fly.io

### Frontend
- ✅ Created new API client (`api-client.ts`) to call Fly.io backend
- ⚠️ Need to update components to use new API client instead of Supabase client

### Database
- ✅ Migrated to Neon.tech PostgreSQL
- ✅ All tables created with proper schema
- ⚠️ RLS (Row Level Security) removed (not needed without Supabase Auth)

## Required Changes

### 1. Update Fly.io Secrets

```powershell
flyctl secrets set DATABASE_URL="postgresql://neondb_owner:npg_jNnSpe3vsP8O@ep-green-frost-ahuzljbx-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require" -a optionstrat-backend

# Add your API keys
flyctl secrets set ALPACA_API_KEY="your-key" -a optionstrat-backend
flyctl secrets set ALPACA_SECRET_KEY="your-secret" -a optionstrat-backend
flyctl secrets set TRADIER_API_KEY="your-key" -a optionstrat-backend
flyctl secrets set TWELVEDATA_API_KEY="your-key" -a optionstrat-backend
flyctl secrets set UNUSUAL_WHALES_API_KEY="your-key" -a optionstrat-backend
```

### 2. Update Vercel Environment Variables

```powershell
# Remove old Supabase variables
vercel env rm VITE_SUPABASE_URL production
vercel env rm VITE_SUPABASE_PUBLISHABLE_KEY production
vercel env rm VITE_SUPABASE_PROJECT_ID production

# Add new API URL
vercel env add VITE_API_URL production
# Enter: https://optionstrat-backend.fly.dev
```

### 3. Update Frontend Components

Replace Supabase client usage with new API client:

**Before:**
```typescript
import { supabase } from '@/integrations/supabase/client';

const { data, error } = await supabase
  .from('refactored_signals')
  .select('*')
  .order('created_at', { ascending: false });
```

**After:**
```typescript
import apiClient from '@/lib/api-client';

const { data, error } = await apiClient.getSignals({ limit: 100 });
```

### 4. Update Authentication

Since we're no longer using Supabase Auth, you'll need to implement your own auth or remove it:

**Option A: Remove Auth (Simplest)**
- Remove `AuthContext.tsx`
- Remove `ProtectedRoute.tsx`
- Remove login page
- Make all routes public

**Option B: Implement Custom Auth**
- Add JWT-based authentication to Fly.io backend
- Update frontend to use custom auth endpoints
- Store JWT token in localStorage

### 5. Deploy

```powershell
# Deploy backend
flyctl deploy

# Deploy frontend
vercel --prod
```

## Components That Need Updating

### High Priority (Data Fetching)
- [ ] `src/hooks/useSystemData.ts` - Replace Supabase queries
- [ ] `src/hooks/useTrades.ts` - Replace Supabase queries
- [ ] `src/hooks/useExitSignals.ts` - Replace Supabase queries
- [ ] `src/hooks/useMarketContext.ts` - Replace Supabase queries
- [ ] `src/hooks/useMarketPositioning.ts` - Replace Supabase queries
- [ ] `src/hooks/useRealtimeSubscriptions.ts` - Replace Supabase realtime with polling or WebSockets

### Medium Priority (UI Components)
- [ ] `src/components/dashboard/PerformanceCharts.tsx` - Update data fetching
- [ ] `src/pages/History.tsx` - Update data fetching
- [ ] `src/pages/Orders.tsx` - Update data fetching

### Low Priority (Auth)
- [ ] `src/contexts/AuthContext.tsx` - Remove or replace with custom auth
- [ ] `src/components/ProtectedRoute.tsx` - Remove or update
- [ ] `src/pages/Login.tsx` - Remove or update

## Testing Checklist

- [ ] Backend health check works: `curl https://optionstrat-backend.fly.dev/health`
- [ ] Database connection works from Fly.io
- [ ] Frontend loads without errors
- [ ] API calls return data
- [ ] Dashboard displays correctly
- [ ] Webhook endpoint works
- [ ] All edge functions accessible

## Rollback Plan

If issues occur:

1. **Revert Vercel deployment:**
   ```powershell
   # In Vercel dashboard, promote previous deployment
   ```

2. **Revert Fly.io deployment:**
   ```powershell
   flyctl releases rollback -a optionstrat-backend
   ```

3. **Restore Supabase connection:**
   - Revert `db-client.ts` changes
   - Restore Supabase environment variables

## Next Steps

1. ✅ Database migrated
2. ✅ Backend deployed
3. ✅ API client created
4. ⚠️ Update frontend components (in progress)
5. ⚠️ Remove/update authentication
6. ⚠️ Test end-to-end flow
7. ⚠️ Deploy to production

---

**Status:** Backend ready, frontend needs component updates
**Last Updated:** January 29, 2026
