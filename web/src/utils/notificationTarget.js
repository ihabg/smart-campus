const PROFESSOR_ROLES = new Set(['professor', 'department_head', 'super_admin']);
const ADMIN_ROLES = new Set(['admin', 'super_admin']);

export function getNotificationTarget(notification, user) {
  const type = notification?.type || '';
  const data = notification?.data || {};
  const role = user?.role || '';
  const isProfessor = PROFESSOR_ROLES.has(role);
  const isAdmin = ADMIN_ROLES.has(role);

  if (type === 'announcement') {
    if (isAdmin) return { pathname: '/admin/announcements' };
    if (data.announcement_id) return { pathname: `/announcements/${data.announcement_id}` };
    return { pathname: '/announcements' };
  }

  if (type === 'schedule_change' || type === 'room_change') {
    if (isProfessor) return { pathname: '/professor/change-history' };
    return { pathname: '/schedule' };
  }

  if (type === 'system') {
    if (role === 'student') return { pathname: '/course-registration' };
    return { pathname: '/notifications' };
  }

  if (type === 'custom') {
    if (data.assessment_id) {
      if (isProfessor) return { pathname: '/professor/assessments' };
      return { pathname: '/assessments', search: `?assessment_id=${data.assessment_id}` };
    }
    if (data.material_id) {
      if (isProfessor) return { pathname: '/professor/materials' };
      return { pathname: '/materials' };
    }
    if (data.office_hour_id) {
      if (isProfessor) return { pathname: '/professor/office-hours' };
      return { pathname: '/schedule' };
    }
  }

  return { pathname: isAdmin ? '/admin/notifications' : '/notifications' };
}
