// simple checks used by the register and login endpoints

export function isEduEmail(email) {
  return /^[^\s@]+@[^\s@]+\.edu$/i.test(String(email || '').trim());
}

export function isStrongPassword(password) {
  return String(password || '').length >= 8;
}
