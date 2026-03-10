const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'btechplus-secret-2026';

const ADMIN_EMAILS = [
  'admin@btechplus.com',
  'btechplus01@gmail.com',
  'btechkenya@gmail.com'
];

function makeToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      is_admin: user.is_admin
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '');

  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user?.is_admin) {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

router.post('/register', async (req, res) => {
  try {

    const { username, email, password, grade, cluster, county } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'username, email and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await pool.query(
      'SELECT id FROM users WHERE email=$1',
      [email.toLowerCase()]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);

    const is_admin = ADMIN_EMAILS.includes(email.toLowerCase());

    const result = await pool.query(
      `INSERT INTO users
       (username, email, password_hash, is_admin, grade, cluster, county)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, username, email, is_admin, grade, cluster, county`,
      [
        username.trim(),
        email.toLowerCase(),
        hash,
        is_admin,
        grade || null,
        cluster || null,
        county || null
      ]
    );

    const user = result.rows[0];
    const token = makeToken(user);

    console.log(`✅ New user: ${user.email} (admin:${is_admin})`);

    res.json({
      success: true,
      token,
      user
    });

  } catch (err) {

    console.error('Register error:', err.message);

    res.status(500).json({ error: err.message });

  }
});

router.post('/login', async (req, res) => {
  try {

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE email=$1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (ADMIN_EMAILS.includes(email.toLowerCase()) && !user.is_admin) {
      await pool.query(
        'UPDATE users SET is_admin=TRUE WHERE id=$1',
        [user.id]
      );
      user.is_admin = true;
    }

    const token = makeToken(user);

    console.log(`✅ Login success: ${user.email}`);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_admin: user.is_admin,
        grade: user.grade,
        cluster: user.cluster,
        county: user.county
      }
    });

  } catch (err) {

    console.error('Login error:', err.message);

    res.status(500).json({ error: err.message });

  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {

    const result = await pool.query(
      `SELECT id, username, email, is_admin, grade, cluster, county, created_at
       FROM users
       WHERE id=$1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });

  } catch (err) {

    res.status(500).json({ error: err.message });

  }
});

router.patch('/profile', authMiddleware, async (req, res) => {
  try {

    const { grade, cluster, county, username } = req.body;

    await pool.query(
      `UPDATE users
       SET grade=$1,
           cluster=$2,
           county=$3,
           username=COALESCE($4, username)
       WHERE id=$5`,
      [grade, cluster, county, username, req.user.id]
    );

    res.json({ success: true });

  } catch (err) {

    res.status(500).json({ error: err.message });

  }
});

module.exports = {
  router,
  authMiddleware,
  adminMiddleware
};