import api from './axiosInstance';

// ─── roomAPI ─────────────────────────────────────────────────
export const roomAPI = {
  getByFloor:         (floor_id, params) => api.get('/rooms', { params: { floor_id, ...params } }),
  getById:            id                 => api.get(`/rooms/${id}`),
  create:             data               => api.post('/rooms', data),
  update:             (id, data)         => api.patch(`/rooms/${id}`, data),
  delete:             id                 => api.delete(`/rooms/${id}`),
  bulkCoordinates:    rooms              => api.patch('/rooms/bulk-coordinates', { rooms }),
  setAdjacency:       data               => api.patch('/rooms/adjacency', data),
};

// ─── scheduleAPI ─────────────────────────────────────────────
export const scheduleAPI = {
  getMy:        params     => api.get('/schedule/my', { params }),
  getToday:     ()         => api.get('/schedule/today'),
  getAll:       params     => api.get('/schedule', { params }),
  create:       data       => api.post('/schedule', data),
  update:       (id, data) => api.patch(`/schedule/${id}`, data),
  delete:       id         => api.delete(`/schedule/${id}`),
  enroll:       section_id => api.post('/schedule/enroll', { section_id }),
  drop:         section_id => api.delete(`/schedule/enroll/${section_id}`),
};

// ─── searchAPI ───────────────────────────────────────────────
export const searchAPI = {
  global:     params => api.get('/search', { params }),
  rooms:      params => api.get('/search/rooms', { params }),
  getGraph:   params => api.get('/search/graph', { params }),
};

// ─── notificationAPI ─────────────────────────────────────────
export const notificationAPI = {
  getMy:       params => api.get('/notifications', { params }),
  getAll:      params => api.get('/notifications/all', { params }),
  markRead:    id     => api.patch(`/notifications/${id}/read`),
  markAllRead: ()     => api.patch('/notifications/read-all'),
  create:      data   => api.post('/notifications', data),
  delete:      id     => api.delete(`/notifications/${id}`),
};

// ─── userAPI ─────────────────────────────────────────────────
export const userAPI = {
  getAll:       params     => api.get('/users', { params }),
  getById:      id         => api.get(`/users/${id}`),
  updateMe:     data       => api.patch('/users/me/profile', data),
  uploadAvatar: file       => {
    const form = new FormData();
    form.append('avatar', file);
    return api.post('/users/me/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  adminUpdate:  (id, data) => api.patch(`/users/${id}`, data),
  delete:       id         => api.delete(`/users/${id}`),
  getStats:     ()         => api.get('/users/stats'),
};

// ─── announcementAPI ─────────────────────────────────────────
export const announcementAPI = {
  getAll:   params     => api.get('/announcements', { params }),
  getById:  id         => api.get(`/announcements/${id}`),
  create:   (data, file) => {
    const form = new FormData();
    Object.entries(data).forEach(([k, v]) => form.append(k, v));
    if (file) form.append('image', file);
    return api.post('/announcements', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  update:   (id, data, file) => {
    const form = new FormData();
    Object.entries(data).forEach(([k, v]) => v !== undefined && form.append(k, v));
    if (file) form.append('image', file);
    return api.patch(`/announcements/${id}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  delete:   id => api.delete(`/announcements/${id}`),
};

// ─── mapEditorAPI ────────────────────────────────────────────
export const mapEditorAPI = {
  getFloor:       floor_id          => api.get(`/map-editor/${floor_id}`),
  saveLayout:     (floor_id, data)  => api.post(`/map-editor/${floor_id}/layout`, data),
  savePosition:   (room_id, data)   => api.patch(`/map-editor/rooms/${room_id}/position`, data),
};

// Re-export floorAPI so AdminPages can import it from api/index
export { floorAPI } from './floorAPI';
