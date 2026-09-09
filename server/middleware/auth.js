import { ObjectId } from 'mongodb';
import { verifyToken } from '../utils/jwt.js';

// checks the session cookie and attaches the logged in user to the request
export function makeRequireAuth(getUsersCollection, recordAudit) {
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

      if (!userId || !ObjectId.isValid(userId)) {
        recordAudit('unauthorized', { ip: req.ip });
        return res.status(401).json({ message: 'Invalid session.' });
      }

      const user = await getUsersCollection().findOne({ _id: new ObjectId(userId) });

      if (!user) {
        recordAudit('unauthorized', { ip: req.ip });
        return res.status(401).json({ message: 'This account no longer exists.' });
      }

      req.user = user;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
