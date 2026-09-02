import { query } from '../db.js';
import { verifyToken } from '../utils/jwt.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// checks the session cookie and attaches the logged in user to the request
export function makeRequireAuth(recordAudit) {
  return async (req, res, next) => {
    try {
      const token = req.cookies?.token;

      if (!token) {
        recordAudit('unauthorized', { ip: req.ip });
        return res.status(401).json({ message: 'You need to log in first.' });
      }

      let payload;
      try {
        payload = verifyToken(token);
      } catch (error) {
        recordAudit('unauthorized', { ip: req.ip });
        return res.status(401).json({ message: 'Your session expired, please log in again.' });
      }

      const userId = payload?.userId;

      if (!userId || !UUID_PATTERN.test(userId)) {
        recordAudit('unauthorized', { ip: req.ip });
        return res.status(401).json({ message: 'Invalid session.' });
      }

      const result = await query('SELECT * FROM users WHERE id = $1', [userId]);
      const user = result.rows[0];

      if (!user) {
        recordAudit('unauthorized', { ip: req.ip });
        return res.status(401).json({ message: 'This account no longer exists.' });
      }

      // keep _id around because the mongo routes still read it, remove once mongo is gone
      req.user = { ...user, _id: user.id, ncaaDivision: user.ncaa_division };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
