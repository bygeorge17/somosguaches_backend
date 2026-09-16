// routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');
const { validateBody } = require('../middleware/validateBody');
const User = require('../models/User');
const { JWT_SECRET } = require('../config/env');
const { serializeUser, userRole } = require('../utils/user');
const { login, register } = require('../validation/schemas');
const router = express.Router();

function buildAuthResponse(user) {
  const role = userRole(user);
  const payload = {
    id: user._id,
    name: user.name,
    role,
    isAdmin: role === 'admin',
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

  return {
    token,
    user: serializeUser(user, { includePrivate: true }),
  };
}

// Registro (Signup)
router.post('/register', validateBody(register), async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const user = new User({ email, password, name });
    await user.save();

    res.status(201).json(buildAuthResponse(user));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Login
router.post('/login', validateBody(login), async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || user.isActive === false) {
      return res.status(400).json({ error: 'Email o contraseña incorrectos' });
    }

    const valid = await user.comparePassword(password);
    if (!valid) return res.status(400).json({ error: 'Email o contraseña incorrectos' });

    res.json(buildAuthResponse(user));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user || user.isActive === false) {
      return res.status(401).json({ error: 'Token invalido' });
    }

    res.json({ user: serializeUser(user, { includePrivate: true }) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
