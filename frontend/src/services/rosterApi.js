const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

function getUserId(user) {
  const userId = user?.id;

  if (!userId) {
    throw new Error('No signed-in user was found for this session.');
  }

  return userId;
}

async function parseJsonResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || 'Request failed.');
  }

  return payload;
}

export async function listRosters(user) {
  const userId = getUserId(user);
  const searchParams = new URLSearchParams({ userId });
 const response = await fetch(`${API_BASE_URL}/rosters?${searchParams.toString()}`, {
    credentials: 'include'
 });

  return parseJsonResponse(response);
}

export async function uploadRosterCsv(user, file) {
  const userId = getUserId(user);
  const formData = new FormData();
  formData.append('userId', userId);
  formData.append('file', file);

 const response = await fetch(`${API_BASE_URL}/rosters`, {
 method: 'POST',
    credentials: 'include',
 body: formData
 });

  return parseJsonResponse(response);
}

export async function deleteRoster(user, rosterId) {
  const userId = getUserId(user);
  const searchParams = new URLSearchParams({ userId });
 const response = await fetch(`${API_BASE_URL}/rosters/${rosterId}?${searchParams.toString()}`, {
 method: 'DELETE',
    credentials: 'include'
 });

  return parseJsonResponse(response);
}

export function getRosterFileUrl(user, rosterId) {
  const userId = getUserId(user);
  const searchParams = new URLSearchParams({ userId });
  return `${API_BASE_URL}/rosters/${rosterId}/file?${searchParams.toString()}`;
}
