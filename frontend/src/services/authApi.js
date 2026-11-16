const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
async function postJson(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || 'Request failed.');
  }

  return payload;
}

async function getJson(path) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    credentials: 'include'
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || 'Request failed.');
  }

  return payload;
}

export function registerUser({ email, password, role, inviteCode }) {
  return postJson('/auth/register', { email, password, role, inviteCode });
}

export function loginUser({ email, password, role }) {
  return postJson('/auth/login', { email, password, role });
}

export function fetchMe() {
  return getJson('/auth/me');
}

export function verifyEmail(token) {
  return postJson('/auth/verify-email', { token });
}

export function resendEmailVerification(email) {
  return postJson('/auth/resend-verification', { email });
}

export async function updateUserProfile(profile) {
  const response = await fetch(`${API_BASE_URL}/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(profile)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || 'Unable to update your profile.');
  }
  return payload;
}

export async function logoutUser() {
  await postJson('/auth/logout', {});
}
