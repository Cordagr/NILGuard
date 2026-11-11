import jwt from 'jsonwebtoken';

export function signToken(user) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is missing. Add it to your .env file.');
  }

  return jwt.sign(
    { userId: String(user._id), role: user.role },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '45m' }
  );
}

export function verifyToken(token) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is missing. Add it to your .env file.');
  }

  return jwt.verify(token, secret);
}

function getAuthCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction
  };
}

function getTokenMaxAge(token) {
  const payload = jwt.decode(token);
  if (!payload || typeof payload !== 'object' || typeof payload.exp !== 'number') {
    throw new Error('Auth token must include an expiration.');
  }

  return Math.max(0, payload.exp * 1000 - Date.now());
}

export function setAuthCookie(res, token) {
  res.cookie('token', token, {
    ...getAuthCookieOptions(),
    maxAge: getTokenMaxAge(token)
  });
}

export function clearAuthCookie(res) {
  res.clearCookie('token', getAuthCookieOptions());
}
