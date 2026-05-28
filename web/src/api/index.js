import api from './axiosInstance';

// ─── floorAPI ────────────────────────────────────────────────
export const floorAPI = {
  getBuildings: () => api.get('/floors/buildings'),

  getBuildingsAdmin: () => api.get('/floors/buildings/manage'),

  createBuilding: (data) => api.post('/floors/buildings', data),

  updateBuilding: (id, data) => api.patch(`/floors/buildings/${id}`, data),

  deleteBuilding: (id) => api.delete(`/floors/buildings/${id}`),

  getAll: (params = {}) => api.get('/floors', { params }),

  getById: (id) => api.get(`/floors/${id}`),

  create: (data) => api.post('/floors', data),

  update: (id, data) => api.patch(`/floors/${id}`, data),

  delete: (id) => api.delete(`/floors/${id}`),

  uploadMap: (id, file) => {
    const form = new FormData();
    form.append('map', file);

    return api.post(`/floors/${id}/map`, form, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  }
};

// ─── roomAPI ─────────────────────────────────────────────────
export const roomAPI = {
  getAll: (params = {}) => api.get('/rooms', { params }),

  getByFloor: (floor_id, params = {}) =>
    api.get('/rooms', {
      params: {
        floor_id,
        ...params
      }
    }),

  getById: (id) => api.get(`/rooms/${id}`),

  getByNumber: (roomNumber) =>
    api.get(`/rooms/number/${encodeURIComponent(roomNumber)}`),

  getLiveStatus: (roomId) => api.get(`/rooms/${roomId}/live-status`),

  getAvailableNow: () => api.get('/rooms/available-now'),

  create: (data) => api.post('/rooms', data),

  update: (id, data) => api.patch(`/rooms/${id}`, data),

  delete: (id) => api.delete(`/rooms/${id}`),

  bulkCoordinates: (rooms) =>
    api.patch('/rooms/bulk-coordinates', { rooms }),

  bulkUpdateCoordinates: (rooms) =>
    api.patch('/rooms/bulk-coordinates', { rooms }),

  setAdjacency: (data) => api.patch('/rooms/adjacency', data),

  getAssignedInstructors: (roomId) => api.get(`/rooms/${roomId}/instructors`),
};

// ─── scheduleAPI ─────────────────────────────────────────────
export const scheduleAPI = {
  getMy: (params = {}) => api.get('/schedule/my', { params }),

  getToday: () => api.get('/schedule/today'),

  getMaterials: (params = {}) => api.get('/schedule/materials', { params }),

  openMaterial: (materialId) =>
    api.post(`/schedule/materials/${materialId}/open`),

  getMessages: () => api.get('/schedule/messages'),

  getAttendanceSummary: () => api.get('/schedule/attendance-summary'),

  getGrades: () => api.get('/schedule/grades'),

  getAll: (params = {}) => api.get('/schedule', { params }),

  create: (data) => api.post('/schedule', data),

  update: (id, data) => api.patch(`/schedule/${id}`, data),

  delete: (id) => api.delete(`/schedule/${id}`),

  enroll: (section_id) => api.post('/schedule/enroll', { section_id }),

  drop: (section_id) => api.delete(`/schedule/enroll/${section_id}`),

  getRoomAvailability: (params = {}) =>
    api.get('/schedule/room-availability', { params }),

  getMyTerms: () =>
    api.get('/schedule/my/terms'),

  getPublishedSemesters: () =>
    api.get('/schedule/published-semesters'),
};


// ─── officeHoursAPI ───────────────────────────────────────────
export const officeHoursAPI = {
  getByInstructorEmail: (email, params = {}) =>
    api.get(`/office-hours/${encodeURIComponent(email)}`, { params }),
};

// ─── searchAPI ───────────────────────────────────────────────
export const searchAPI = {
  global: (params = {}) => api.get('/search', { params }),

  rooms: (params = {}) => api.get('/search/rooms', { params }),

  getGraph: (params = {}) => api.get('/search/graph', { params })
};

// ─── notificationAPI ─────────────────────────────────────────
export const notificationAPI = {
  getMy: (params = {}) => api.get('/notifications', { params }),

  getAll: (params = {}) => api.get('/notifications/all', { params }),

  markRead: (id) => api.patch(`/notifications/${id}/read`),

  markAllRead: () => api.patch('/notifications/read-all'),

  create: (data) => api.post('/notifications', data),

  delete: (id) => api.delete(`/notifications/${id}`)
};

// ─── eventAPI ────────────────────────────────────────────────
export const eventAPI = {
  list: (params = {}) => api.get('/events', { params }),

  create: (data) => api.post('/events', data),

  cancel: (id) => api.patch(`/events/${id}/cancel`),

  getConflicts: (params = {}) => api.get('/events/conflicts', { params }),

  getAvailableRooms: (params = {}) => api.get('/events/available-rooms', { params }),

  getRoomStates: (params = {}) => api.get('/events/room-states', { params }),
};

// ─── userAPI ─────────────────────────────────────────────────
export const userAPI = {
  getAll: (params = {}) => api.get('/users', { params }),

  getById: (id) => api.get(`/users/${id}`),

  updateMe: (data) => api.patch('/users/me/profile', data),

  uploadAvatar: (file) => {
    const form = new FormData();
    form.append('avatar', file);

    return api.post('/users/me/avatar', form, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  },

  create: (data) => api.post('/users', data),

  adminUpdate: (id, data) => api.patch(`/users/${id}`, data),

  delete: (id) => api.delete(`/users/${id}`),

  getStats: () => api.get('/users/stats')
};

// ─── announcementAPI ─────────────────────────────────────────
export const announcementAPI = {
  getAll: (params = {}) => api.get('/announcements', { params }),

  getDepartments: () => api.get('/announcements/departments/list'),

  getById: (id) => api.get(`/announcements/${id}`),

  create: (data, file) => {
    const form = new FormData();

    Object.entries(data || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        form.append(key, value);
      }
    });

    if (file) {
      form.append('image', file);
    }

    return api.post('/announcements', form, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  },

  update: (id, data, file) => {
    const form = new FormData();

    Object.entries(data || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        form.append(key, value);
      }
    });

    if (file) {
      form.append('image', file);
    }

    return api.patch(`/announcements/${id}`, form, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  },

  delete: (id) => api.delete(`/announcements/${id}`)
};

// ─── mapEditorAPI ────────────────────────────────────────────
export const mapEditorAPI = {
  // names used by your current MapEditorPage
  getFloor: (floor_id) => api.get(`/map-editor/${floor_id}`),

  saveLayout: (floor_id, data) =>
    api.post(`/map-editor/${floor_id}/layout`, data),

  savePosition: (room_id, data) =>
    api.patch(`/map-editor/rooms/${room_id}/position`, data),

  // aliases in case another page uses these names
  getFloorForEditing: (floor_id) => api.get(`/map-editor/${floor_id}`),

  saveFloorLayout: (floor_id, data) =>
    api.post(`/map-editor/${floor_id}/layout`, data),

  saveRoomPosition: (room_id, data) =>
    api.patch(`/map-editor/rooms/${room_id}/position`, data)
};
// ─── roomTypeAPI ─────────────────────────────────────────────
export const roomTypeAPI = {
  getAll:        ()        => api.get('/room-types'),
  adminList:     ()        => api.get('/room-types/admin'),
  adminCreate:   (data)    => api.post('/room-types', data),
  adminUpdate:   (id, data) => api.patch(`/room-types/${id}`, data),
  adminToggle:   (id)      => api.patch(`/room-types/${id}/toggle`),
};

// ─── enrollmentAPI ────────────────────────────────────────────
export const enrollmentAPI = {
  getEnrollments: (sectionId, params = {}) =>
    api.get(`/schedule/admin/sections/${sectionId}/enrollments`, { params }),

  searchStudents: (params = {}) =>
    api.get('/schedule/admin/students/search', { params }),

  enrollStudent: (data) =>
    api.post('/schedule/admin/enroll', data),

  removeEnrollment: (sectionId, studentId) =>
    api.delete(`/schedule/admin/enroll/${sectionId}/${studentId}`),

  bulkEnroll: (data) =>
    api.post('/schedule/admin/bulk-enroll', data),

  getStudentDepartments: (params = {}) =>
    api.get('/schedule/admin/student-departments', { params }),

  removeAllEnrollments: (sectionId) =>
    api.delete(`/schedule/admin/sections/${sectionId}/enrollments`),
};

// ─── semesterAPI ─────────────────────────────────────────────
export const semesterAPI = {
  getSemesterStats: (semester, academic_year, extra = {}) =>
    api.get('/schedule/stats', { params: { semester, academic_year, ...extra } }),

  getSemesterMeetings: (semester, academic_year, extra = {}) =>
    api.get('/schedule/meetings', { params: { semester, academic_year, ...extra } }),

  list: () =>
    api.get('/schedule/semesters'),

  ensure: ({ semester, academic_year }) =>
    api.post('/schedule/semesters/ensure', { semester, academic_year }),

  publish: ({ semester, academic_year }) =>
    api.patch('/schedule/semesters/publish', { semester, academic_year }),

  unpublish: ({ semester, academic_year }) =>
    api.patch('/schedule/semesters/unpublish', { semester, academic_year }),

  validate: ({ semester, academic_year, department_contains } = {}) =>
    api.get('/schedule/validate', { params: { semester, academic_year, department_contains } }),

  setPeriod: ({ semester, academic_year, registration_start, registration_end, drop_deadline }) =>
    api.patch('/schedule/semesters/period', { semester, academic_year, registration_start, registration_end, drop_deadline }),
};

// ─── courseAPI ────────────────────────────────────────────────
export const courseAPI = {
  getAll: (params = {}) => api.get('/courses', { params }),

  getById: (id) => api.get(`/courses/${id}`),

  getDepartments: () => api.get('/courses/departments'),

  create: (data) => api.post('/courses', data),

  update: (id, data) => api.patch(`/courses/${id}`, data),

  delete: (id) => api.delete(`/courses/${id}`),

  getPrerequisites: (id) => api.get(`/courses/${id}/prerequisites`),

  addPrerequisite: (id, data) => api.post(`/courses/${id}/prerequisites`, data),

  updatePrerequisite: (id, prerequisiteId, data) =>
    api.patch(`/courses/${id}/prerequisites/${prerequisiteId}`, data),

  removePrerequisite: (id, prerequisiteId) =>
    api.delete(`/courses/${id}/prerequisites/${prerequisiteId}`),
};

// ─── instructorAPI ────────────────────────────────────────────
export const instructorAPI = {
  getAll: (params = {}) => api.get('/instructors', { params }),

  getById: (id) => api.get(`/instructors/${id}`),

  create: (data) => api.post('/instructors', data),

  update: (id, data) => api.patch(`/instructors/${id}`, data),

  delete: (id) => api.delete(`/instructors/${id}`),

  linkUser: (id) => api.post(`/instructors/${id}/link-user`),
};
// ─── professorAPI ─────────────────────────────────────────────
export const professorAPI = {
  getDashboard: (params = {}) => api.get('/professor/dashboard', { params }),

  getTerms: () => api.get('/professor/terms'),

  getOfficeHours: () => api.get('/professor/office-hours'),

  getSchedule: (params = {}) => api.get('/professor/schedule', { params }),

  getSectionStudents: (sectionId) =>
    api.get(`/professor/sections/${sectionId}/students`),

  getAttendance: (sectionId, params = {}) =>
    api.get(`/professor/sections/${sectionId}/attendance`, { params }),

  getAttendanceSummary: (sectionId) =>
    api.get(`/professor/sections/${sectionId}/attendance/summary`),

  markAttendance: (data) => api.post('/professor/attendance', data),

  saveGradesBulk: (data) => api.post('/professor/grades/bulk', data),

  sendWarning: (data) => api.post('/professor/warning', data)
};

// ─── studentAPI ──────────────────────────────────────────────
export const studentAPI = {
  getStudyPlan: () => api.get('/student/study-plan'),
  getStudyPlanAdvisorContext: () => api.get('/student/study-plan/advisor/context'),
  recommendStudyPlan: (data = {}) => api.post('/student/study-plan/advisor/recommend', data),
  evaluateStudyPlan: (data = {}) => api.post('/student/study-plan/advisor/evaluate', data),
  chatStudyPlanAdvisor: (data = {}) => api.post('/student/study-plan/advisor/chat', data),
};

// ─── studyPlanAPI ─────────────────────────────────────────────
export const studyPlanAPI = {
  list:              ()           => api.get('/admin/study-plans'),
  getDepartments:    ()           => api.get('/admin/study-plans/departments'),
  create:            (data)       => api.post('/admin/study-plans', data),
  getById:           (id)         => api.get(`/admin/study-plans/${id}`),
  update:            (id, data)   => api.patch(`/admin/study-plans/${id}`, data),
  delete:            (id)         => api.delete(`/admin/study-plans/${id}`),
  getAvailableCourses: (id, params = {}) => api.get(`/admin/study-plans/${id}/available-courses`, { params }),
  addCourse:         (id, data)           => api.post(`/admin/study-plans/${id}/courses`, data),
  updateCourse:      (id, courseId, data) => api.patch(`/admin/study-plans/${id}/courses/${courseId}`, data),
  removeCourse:      (id, courseId)       => api.delete(`/admin/study-plans/${id}/courses/${courseId}`),
  // Batch assignments
  listBatchAssignments: (id)       => api.get(`/admin/study-plans/${id}/batch-assignments`),
  assignBatch:          (id, data) => api.post(`/admin/study-plans/${id}/batch-assignments`, data),
  removeBatchAssignment:(id, year) => api.delete(`/admin/study-plans/${id}/batch-assignments/${year}`),
};

// ─── activityLogAPI ───────────────────────────────────────────
export const activityLogAPI = {
  getAll: (params = {}) => api.get('/admin/activity-logs', { params }),
};

export default api;
// ─── assessmentAPI ──────────────────────────────────────────
function assessmentFormData(data = {}, files = [], questionImageFiles = []) {
  const form = new FormData();
  Object.entries(data || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value) || typeof value === 'object') {
      form.append(key, JSON.stringify(value));
    } else {
      form.append(key, value);
    }
  });
  const fileList = Array.isArray(files) ? files : (files ? [files] : []);
  fileList.forEach((f) => { if (f) form.append('attachments', f); });
  questionImageFiles.forEach((imageFile) => {
    if (imageFile) form.append('question_images', imageFile);
  });
  return form;
}

export const assessmentAPI = {
  professorSections: (params = {}) => api.get('/assessments/professor/sections', { params }),

  professorList: (params = {}) => api.get('/assessments/professor', { params }),

  professorCreate: (data, files = [], questionImageFiles = []) => api.post('/assessments/professor', assessmentFormData(data, files, questionImageFiles), {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),

  professorDetail: (assessmentId) => api.get(`/assessments/professor/${assessmentId}`),

  professorUpdate: (assessmentId, data, files = [], questionImageFiles = []) => api.patch(`/assessments/professor/${assessmentId}`, assessmentFormData(data, files, questionImageFiles), {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),

  deleteAttachment: (assessmentId, attachmentId) =>
    api.delete(`/assessments/professor/${assessmentId}/attachments/${attachmentId}`),

  professorDelete: (assessmentId) => api.delete(`/assessments/professor/${assessmentId}`),

  professorResults: (assessmentId) => api.get(`/assessments/professor/${assessmentId}/results`),

  setQuizReviewAccess: (assessmentId, allowReview) =>
    api.patch(`/assessments/professor/${assessmentId}/review`, { allow_review: allowReview }),

  professorQuizAttemptReview: (assessmentId, attemptId) =>
    api.get(`/assessments/professor/${assessmentId}/attempts/${attemptId}/review`),

  gradeSubmission: (assessmentId, submissionId, data) =>
    api.patch(`/assessments/professor/${assessmentId}/submissions/${submissionId}/grade`, data),

  studentList: (params = {}) => api.get('/assessments/student', { params }),

  studentDetail: (assessmentId) => api.get(`/assessments/student/${assessmentId}`),

  submitAssignment: (assessmentId, data, file) => {
    const form = new FormData();
    Object.entries(data || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) form.append(key, value);
    });
    if (file) form.append('submission', file);

    return api.post(`/assessments/student/${assessmentId}/assignment-submit`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  startQuiz: (assessmentId) => api.post(`/assessments/student/${assessmentId}/quiz-start`),

  submitQuiz: (assessmentId, answers) =>
    api.post(`/assessments/student/${assessmentId}/quiz-submit`, { answers }),

  studentQuizReview: (assessmentId) =>
    api.get(`/assessments/student/${assessmentId}/quiz-review`)
};
