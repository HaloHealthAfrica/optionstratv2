// Authentication utilities
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET;

function requireJwtSecret() {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not set');
  }
  return JWT_SECRET;
}

export function generateToken(user) {
  const secret = requireJwtSecret();
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
    },
    secret,
    {
      expiresIn: '7d',
    }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, requireJwtSecret());
  } catch (error) {
    throw new Error('Invalid token');
  }
}

export async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

export async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');
  
  try {
    const payload = verifyToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
