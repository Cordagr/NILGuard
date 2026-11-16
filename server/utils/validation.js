// simple checks used by the register and login endpoints

export function isEduEmail(email) {
  return /^[^\s@]+@[^\s@]+\.edu$/i.test(String(email || '').trim());
}

export function isValidEmailAddress(email) {
  const value = String(email || '').trim();
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isStrongPassword(password) {
  return String(password || '').length >= 8;
}
