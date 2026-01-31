// Authentication routes
import express from 'express';
import { query } from '../lib/db.js';
import { generateToken, verifyToken, hashPassword, comparePassword } from '../lib/auth.js';

const router = express.Router();

// GET /auth?action=me - Get current user
router.get('/', async (req, res) => {
  try {
    const { action } = req.query;
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: 'JWT_SECRET is not set' });
    }

    if (action === 'me') {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing token' });
      }

      const token = authHeader.replace('Bearer ', '');
      
      try {
        const payload = verifyToken(token);
        return res.json({
          user: {
            id: payload.sub,
            email: payload.email,
          },
        });
      } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('[Auth] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// POST /auth?action=login - Login
// POST /auth?action=register - Register
router.post('/', async (req, res) => {
  try {
    const { action } = req.query;
    const { email, password } = req.body;
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: 'JWT_SECRET is not set' });
    }

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (action === 'register') {
      // Check if user exists
      const existingResult = await query(
        'SELECT id FROM app_users WHERE email = $1',
        [normalizedEmail]
      );

      if (existingResult.rows.length > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      // Create user
      const passwordHash = await hashPassword(password);
      const result = await query(
        'INSERT INTO app_users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
        [normalizedEmail, passwordHash]
      );

      const user = result.rows[0];
      const token = generateToken(user);

      return res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
        },
      });
    }

    if (action === 'login') {
      // Get user
      const result = await query(
        'SELECT id, email, password_hash FROM app_users WHERE email = $1',
        [normalizedEmail]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];

      // Verify password
      const valid = await comparePassword(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Update last login
      await query(
        'UPDATE app_users SET last_login_at = NOW() WHERE id = $1',
        [user.id]
      );

      const token = generateToken(user);

      return res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
        },
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('[Auth] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
