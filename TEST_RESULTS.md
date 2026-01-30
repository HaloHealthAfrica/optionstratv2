# Test Results

## Backend Tests

- `deno test --allow-all`  
  **Result:** FAILED  
  **Error:** `Could not find package.json for workspace member in 'file:///C:/backend/'.`

## Lint/Type Checks

- `read_lints` on edited backend and frontend files  
  **Result:** PASS (no linter errors reported)

## Frontend Tests

- Not run (no test command specified in repo; not requested).

## Notes

- Deno installed via winget, but tests failed due to Deno workspace/package.json error.
- Local backend start failed due to Docker Desktop engine 500 errors.
- Docker Desktop must be healthy before local Supabase can start.
- Consider running `npm run build` and `npm run type-check` in `optionstrat-main` after installing dependencies.

