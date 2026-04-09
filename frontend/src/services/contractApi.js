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

export async function listContracts(user, sortBy = 'lastAccessedAt', sortDirection = 'desc') {
  const userId = getUserId(user);
  const searchParams = new URLSearchParams({
    userId,
    sortBy,
    sortDirection
  });

  const response = await fetch(`${API_BASE_URL}/contracts?${searchParams.toString()}`, {
    headers: {
      'x-user-id': userId
    }
  });

  return parseJsonResponse(response);
}

export async function uploadContract(user, file) {
  const userId = getUserId(user);
  const formData = new FormData();
  formData.append('userId', userId);
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/contracts`, {
    method: 'POST',
    headers: {
      'x-user-id': userId
    },
    body: formData
  });

  return parseJsonResponse(response);
}

export function getContractFileUrl(user, contractId) {
  const userId = getUserId(user);
  const searchParams = new URLSearchParams({ userId });
  return `${API_BASE_URL}/contracts/${contractId}/file?${searchParams.toString()}`;
}
