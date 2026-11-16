const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export const educationCourses = [
  {
    id: 'moneyBasics',
    progressKey: 'moneyBasicsProgress',
    quizKey: 'moneyBasicsQuizResult'
  },
  {
    id: 'nilDeals',
    progressKey: 'nilDealsProgress',
    quizKey: 'nilDealsQuizResult'
  },
  {
    id: 'contracts101',
    progressKey: 'contracts101Progress',
    quizKey: 'contracts101QuizResult'
  }
];

export function educationStorageKey(userId, key) {
  if (!userId) {
    throw new Error('A signed-in student account is required to save education progress.');
  }

  return `nilguard:education:${userId}:${key}`;
}

function readStoredJson(userId, key) {
  try {
    const savedValue = localStorage.getItem(educationStorageKey(userId, key));
    return savedValue ? JSON.parse(savedValue) : null;
  } catch (error) {
    console.error(`Unable to read saved education data for ${key}:`, error);
    return null;
  }
}

export function readLocalEducationProgress(userId) {
  return educationCourses.reduce((progress, course) => {
    const courseProgress = readStoredJson(userId, course.progressKey);
    const quizResult = readStoredJson(userId, course.quizKey);

    if (courseProgress || quizResult) {
      progress[course.id] = {
        ...(courseProgress || {}),
        quizResult
      };
    }

    return progress;
  }, {});
}

export function writeLocalEducationCourse(userId, courseId, courseProgress = {}) {
  const course = educationCourses.find((item) => item.id === courseId);
  if (!course) {
    return;
  }

  const progress = {
    currentLesson: Number.isInteger(courseProgress.currentLesson) ? courseProgress.currentLesson : 0,
    completedLessons: Array.isArray(courseProgress.completedLessons) ? courseProgress.completedLessons : []
  };

  localStorage.setItem(educationStorageKey(userId, course.progressKey), JSON.stringify(progress));

  if (courseProgress.quizResult) {
    localStorage.setItem(
      educationStorageKey(userId, course.quizKey),
      JSON.stringify(courseProgress.quizResult)
    );
  } else {
    localStorage.removeItem(educationStorageKey(userId, course.quizKey));
  }
}

export function mergeEducationCourseProgress(localProgress = {}, serverProgress = {}) {
  const completedLessons = Array.from(new Set([
    ...(Array.isArray(serverProgress.completedLessons) ? serverProgress.completedLessons : []),
    ...(Array.isArray(localProgress.completedLessons) ? localProgress.completedLessons : [])
  ])).sort((left, right) => left - right);
  const localQuiz = localProgress.quizResult || null;
  const serverQuiz = serverProgress.quizResult || null;
  const localQuizDate = Date.parse(localQuiz?.completedAt || '');
  const serverQuizDate = Date.parse(serverQuiz?.completedAt || '');
  const quizResult = localQuiz && (!serverQuiz || localQuizDate > serverQuizDate)
    ? localQuiz
    : serverQuiz;

  return {
    currentLesson: Number.isInteger(serverProgress.currentLesson)
        ? serverProgress.currentLesson
        : Number.isInteger(localProgress.currentLesson)
          ? localProgress.currentLesson
        : 0,
    completedLessons,
    quizResult
  };
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));

  if (response.status === 401) {
    window.dispatchEvent(new Event('nilguard:session-expired'));
  }

  if (!response.ok) {
    throw new Error(payload.message || 'Request failed.');
  }

  return payload;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include'
  });
  return parseResponse(response);
}

export async function getStudentEducationProgress() {
  return request('/education/progress');
}

export async function getStudentEducationCourseProgress(userId, courseId) {
  const course = educationCourses.find((item) => item.id === courseId);
  if (!course) {
    throw new Error('Unknown education course.');
  }

  const [response] = await Promise.all([getStudentEducationProgress()]);
  const localProgress = {
    ...(readStoredJson(userId, course.progressKey) || {}),
    quizResult: readStoredJson(userId, course.quizKey)
  };
  const hasLocalProgress = Boolean(
    localProgress.completedLessons?.length ||
    localProgress.currentLesson ||
    localProgress.quizResult
  );
  const serverProgress = response.progress?.[courseId];
  const mergedProgress = mergeEducationCourseProgress(localProgress, serverProgress);

  if (hasLocalProgress || serverProgress) {
    writeLocalEducationCourse(userId, courseId, mergedProgress);
    await saveStudentEducationProgress(courseId, mergedProgress);
  }

  return mergedProgress;
}

export async function saveStudentEducationProgress(courseId, progress) {
  try {
    return await request(`/education/progress/${encodeURIComponent(courseId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(progress)
    });
  } catch (error) {
    window.dispatchEvent(new CustomEvent('nilguard:education-sync-error', {
      detail: { message: error.message || 'Unable to save education progress.' }
    }));
    throw error;
  }
}

export function persistEducationQuizResult(userId, courseId, quizKey, quizResult) {
  const storageKey = educationStorageKey(userId, quizKey);
  if (quizResult) {
    localStorage.setItem(storageKey, JSON.stringify(quizResult));
  } else {
    localStorage.removeItem(storageKey);
  }

  return saveStudentEducationProgress(courseId, { quizResult });
}

export async function getEducationSharing() {
  return request('/education/sharing');
}

export async function previewRosterEducationInvite(code) {
  return request(`/rosters/link-invites/${encodeURIComponent(code)}`);
}

export async function acceptRosterEducationInvite(code, educationProgress, shareEducation = false) {
  return request(`/rosters/link-invites/${encodeURIComponent(code)}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shareEducation,
      educationProgress
    })
  });
}

export async function revokeEducationSharing() {
  return request('/education/sharing', { method: 'DELETE' });
}
