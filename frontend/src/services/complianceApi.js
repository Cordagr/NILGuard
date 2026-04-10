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

export async function listComplianceRequests(user) {
  const userId = getUserId(user);
  const searchParams = new URLSearchParams({ userId });
  const response = await fetch(`${API_BASE_URL}/compliance/requests?${searchParams.toString()}`, {
    headers: {
      'x-user-id': userId
    }
  });

  return parseJsonResponse(response);
}

export async function submitComplianceRequest(user, contractId, complianceEmail) {
  const userId = getUserId(user);
  const response = await fetch(`${API_BASE_URL}/compliance/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId
    },
    body: JSON.stringify({ userId, contractId, complianceEmail })
  });

  return parseJsonResponse(response);
}

export async function updateComplianceRequestStatus(user, requestId, status) {
  const userId = getUserId(user);
  const response = await fetch(`${API_BASE_URL}/compliance/requests/${requestId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userId
    },
    body: JSON.stringify({ userId, status })
  });

  return parseJsonResponse(response);
}

export function getComplianceRequestFileUrl(user, requestId) {
  const userId = getUserId(user);
  const searchParams = new URLSearchParams({ userId });
  return `${API_BASE_URL}/compliance/requests/${requestId}/file?${searchParams.toString()}`;
}