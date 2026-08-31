const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:5000/api';

function getUserId(user) {
  const userId =
    user?.id;

  if (!userId) {
    throw new Error(
      'No signed-in user was found for this session.'
    );
  }

  return userId;
}

async function parseJsonResponse(
  response
) {
  const payload =
    await response
      .json()
      .catch(
        () => ({})
      );

  if (!response.ok) {
    throw new Error(
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
  const userId =
    getUserId(user);

  const searchParams =
    new URLSearchParams({
      userId,
      sortBy,
      sortDirection
    });

  const response =
    await fetch(
      `${API_BASE_URL}/contracts?${searchParams.toString()}`,
      {
        headers: {
          'x-user-id':
            userId
        }
      }
    );

  const payload =
    await parseJsonResponse(
      response
    );

  /*
   * The existing Student Dashboard stores
   * agreement metadata in localStorage.
   *
   * The backend now extracts that metadata
   * from the actual PDF and returns it here.
   *
   * Sync it into the existing storage location
   * so we do not have to replace the large
   * StudentDashboardPage.jsx file.
   */
  (
    payload.contracts ||
    []
  ).forEach(
    (contract) => {
      if (
        contract?.id &&
        contract?.agreementMetadata
      ) {
        localStorage.setItem(
          `nilguard_contract_metadata_${userId}_${contract.id}`,
          JSON.stringify(
            contract.agreementMetadata
          )
        );
      }
    }
  );

  return payload;
}

export async function uploadContract(
  user,
  file
) {
  const userId =
    getUserId(user);

  const formData =
    new FormData();

  formData.append(
    'userId',
    userId
  );

  formData.append(
    'file',
    file
  );

  const response =
    await fetch(
      `${API_BASE_URL}/contracts`,
      {
        method:
          'POST',

        headers: {
          'x-user-id':
            userId
        },

        body:
          formData
      }
    );

  return parseJsonResponse(
    response
  );
}

export async function deleteContract(
  user,
  contractId
) {
  const userId =
    getUserId(user);

  const searchParams =
    new URLSearchParams({
      userId
    });

  const response =
    await fetch(
      `${API_BASE_URL}/contracts/${contractId}?${searchParams.toString()}`,
      {
        method:
          'DELETE',

        headers: {
          'x-user-id':
            userId
        }
      }
    );

  return parseJsonResponse(
    response
  );
}

export function getContractFileUrl(
  user,
  contractId
) {
  const userId =
    getUserId(user);

  const searchParams =
    new URLSearchParams({
      userId
    });

  return `${API_BASE_URL}/contracts/${contractId}/file?${searchParams.toString()}`;
}

export async function getContractAnalysis(
  user,
  contractId
) {
  const userId =
    getUserId(user);

  if (!contractId) {
    throw new Error(
      'No contract ID provided for analysis.'
    );
  }

  const response =
    await fetch(
      `${API_BASE_URL}/contracts/${contractId}/analysis`,
      {
        headers: {
          'x-user-id':
            userId
        }
      }
    );

  return parseJsonResponse(
    response
  );
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