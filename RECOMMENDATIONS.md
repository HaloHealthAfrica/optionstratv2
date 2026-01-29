# Recommendations

## Immediate Actions (Before Production)
1. Install Deno and run `deno test --allow-all` under `supabase/functions`.
2. Apply migrations and verify `refactored_*` tables exist and RLS policies allow reads.
3. Run a full webhook → pipeline → decision → positions flow test in staging.

## Short-term Improvements (First Month)
1. Add a dedicated audit log table for signal/decision/trade events to avoid overloading `refactored_decisions`.
2. Add a lightweight end-to-end integration test that inserts a signal and validates downstream records.
3. Update docs to clearly differentiate legacy vs refactored tables and deprecate legacy ones.

## Long-term Enhancements (First Quarter)
1. Add schema migration to either deprecate legacy tables or create compatibility views.
2. Add frontend feature flags to toggle legacy vs refactored data sources.
3. Add performance baselines (signal latency, decision latency, query latency) with alerts.

