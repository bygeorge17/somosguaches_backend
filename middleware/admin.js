const User = require('../models/User');
const { userRole } = require('../utils/user');

async function adminMiddleware(req, res, next) {
  try {
    const user = await User.findById(req.user?.id).select('role isAdmin isActive');
    if (!user || user.isActive === false) {
      return res.status(401).json({ error: 'Usuario no autorizado' });
    }

    if (userRole(user) !== 'admin') {
      return res.status(403).json({
        error: 'Solo el administrador puede hacer esta accion',
      });
    }

    req.user.role = 'admin';
    req.user.isAdmin = true;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = adminMiddleware;
