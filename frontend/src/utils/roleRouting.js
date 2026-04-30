export const ROLE_LABELS = {
  student: "I'm a Student Athlete",
  coach: "I'm a Coach",
  school: "I'm a School Representative",
  compliance: "I'm a Compliance Officer"
};

const VALID_ROLES = Object.keys(ROLE_LABELS);

export function getNormalizedRole(role) {
  if (!role || typeof role !== 'string') {
    return 'student';
  }

  const normalized = role.toLowerCase().trim();
  return VALID_ROLES.includes(normalized) ? normalized : 'student';
}

export function getDashboardRouteForRole(role) {
  const normalized = getNormalizedRole(role);

  if (normalized === 'coach') {
    return '/dashboard/coach';
  }

  if (normalized === 'school') {
    return '/dashboard/school';
  }

  if (normalized === 'compliance') {
    return '/dashboard/compliance';
  }

  return '/dashboard/student';
}
