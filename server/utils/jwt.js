import jwt from 'jsonwebtoken';

export function signToken(user) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is missing. Add it to your .env file.');
  }

  return jwt.sign(
    { userId: String(user._id), role: user.role },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30m' }
  );
}

export function verifyToken(token) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is missing. Add it to your .env file.');
  }

  return jwt.verify(token, secret);
}

export function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // change to true when the app runs over https
    maxAge: 30 * 60 * 1000
  });
}

export function clearAuthCookie(res) {
  res.clearCookie('token');
}
