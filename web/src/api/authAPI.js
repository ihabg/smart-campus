// ─── authAPI.js ──────────────────────────────────────────────
import api from './axiosInstance';

export const authAPI = {
  register:       data  => api.post('/auth/register', data),
  login:          data  => api.post('/auth/login', data),
  logout:         ()    => api.post('/auth/logout'),
  getMe:          ()    => api.get('/auth/me'),
  changePassword: data  => api.patch('/auth/me/password', data),
  updateFcmToken: token => api.patch('/auth/me/fcm-token', { fcm_token: token }),
  refreshToken:   token => api.post('/auth/refresh', { refreshToken: token }),
};
