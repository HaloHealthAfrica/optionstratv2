// Script to generate all route files
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const routes = [
  { name: 'positions', table: 'positions', requiresAuth: true },
  { name: 'stats', table: null, requiresAuth: true },
  { name: 'webhook', table: null, requiresAuth: false },
  { name: 'analytics', table: null, requiresAuth: true },
  { name: 'exit-signals', table: 'exit_signals', requiresAuth: true },
  { name: 'exit-rules', table: 'exit_rules', requiresAuth: true },
  { name: 'risk-limits', table: 'risk_limits', requiresAuth: true },
  { name: 'market-positioning', table: null, requiresAuth: true },
  { name: 'metrics', table: null, requiresAuth: true },
  { name: 'monitor-positions', table: null, requiresAuth: true },
  { name: 'mtf-analysis', table: null, requiresAuth: true },
  { name: 'mtf-comparison', table: null, requiresAuth: true },
  { name: 'paper-trading', table: null, requiresAuth: true },
  { name: 'poll-orders', table: null, requiresAuth: true },
  { name: 'refresh-gex-signals', table: null, requiresAuth: true },
  { name: 'refresh-positions', table: null, requiresAuth: true },
  { name: 'refactored-exit-worker', table: null, requiresAuth: false },
  { name: 'trades', table: 'trades', requiresAuth: true },
];

routes.forEach(route => {
  const fileName = `${route.name}.js`;
  const filePath = path.join(__dirname, 'routes', fileName);
  
  const authImport = route.requiresAuth ? "import { requireAuth } from '../lib/auth.js';" : '';
  const authMiddleware = route.requiresAuth ? ', requireAuth' : '';
  const routeHandler = route.requiresAuth ? 'requireAuth, ' : '';
  
  const content = `// ${route.name.charAt(0).toUpperCase() + route.name.slice(1).replace(/-/g, ' ')} endpoint
import express from 'express';
${authImport}
import { query } from '../lib/db.js';

const router = express.Router();

router.get('/', ${routeHandler}async (req, res) => {
  try {
    ${route.table ? `const result = await query(
      \`SELECT * FROM ${route.table} 
       ORDER BY created_at DESC 
       LIMIT 100\`
    );
    res.json(result.rows);` : `// TODO: Implement ${route.name} logic
    res.status(501).json({ error: 'Not implemented yet' });`}
  } catch (error) {
    console.error('[${route.name}] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

${route.name === 'webhook' ? `
router.post('/', async (req, res) => {
  try {
    // TODO: Implement webhook logic from Deno function
    res.status(501).json({ error: 'Webhook not implemented yet' });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    res.status(500).json({ error: error.message });
  }
});
` : ''}

export default router;
`;

  fs.writeFileSync(filePath, content);
  console.log(`✅ Created ${fileName}`);
});

console.log('\n✅ All route files created!');
