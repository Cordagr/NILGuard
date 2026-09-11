const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

function getUserId(user) {
  const userId = user?.id || user?._id || user?.userId;

  if (!userId) {
    throw new Error('No signed-in user was found for this session.');
  }

  return userId;
}

async function parseJsonResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload.error ||
        payload.message ||
        'Request failed.'
    );
  }

  return payload;
}

export async function listContracts(
  user,
  sortBy = 'lastAccessedAt',
  sortDirection = 'desc'
) {
  const userId = getUserId(user);

  const searchParams = new URLSearchParams({
    userId,
    sortBy,
    sortDirection
  });

  const response = await fetch(
    `${API_BASE_URL}/contracts?${searchParams.toString()}`,
    {
      credentials: 'include',
      headers: {
        'x-user-id': userId
      }
    }
  );

  return parseJsonResponse(response);
}

export async function uploadContract(user, file) {
  const userId = getUserId(user);

  if (!file) {
    throw new Error('Please select a contract PDF.');
  }

  const formData = new FormData();

  formData.append('userId', userId);
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/contracts`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'x-user-id': userId
    },
    body: formData
  });

  return parseJsonResponse(response);
}

export function getContractFileUrl(user, contractId) {
  const userId = getUserId(user);

  const searchParams = new URLSearchParams({
    userId
  });

  return `${API_BASE_URL}/contracts/${contractId}/file?${searchParams.toString()}`;
}

export async function deleteContract(user, contractId) {
  const userId = getUserId(user);

  if (!contractId) {
    throw new Error('No contract ID provided.');
  }

  const searchParams = new URLSearchParams({
    userId
  });

  const response = await fetch(
    `${API_BASE_URL}/contracts/${contractId}?${searchParams.toString()}`,
    {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'x-user-id': userId
      }
    }
  );

  return parseJsonResponse(response);
}

export async function saveContractMetadata(
  user,
  contractId,
  metadata
) {
  const userId = getUserId(user);

  if (!contractId) {
    throw new Error(
      'No contract ID provided for agreement metadata.'
    );
  }

  const response = await fetch(
    `${API_BASE_URL}/contracts/${contractId}/metadata`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId
      },
      body: JSON.stringify({
        metadata
      })
    }
  );

  return parseJsonResponse(response);
}

export async function getContractAnalysis(
  user,
  contractId
) {
  const userId = getUserId(user);

  if (!contractId) {
    throw new Error(
      'No contract ID provided for analysis.'
    );
  }

  const response = await fetch(
    `${API_BASE_URL}/contracts/${contractId}/analysis`,
    {
      credentials: 'include',
      headers: {
        'x-user-id': userId
      }
    }
  );

  return parseJsonResponse(response);
}
