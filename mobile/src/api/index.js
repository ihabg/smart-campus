import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = 'http://10.0.2.2:5000/api';
// For physical device: 'http://YOUR_MACHINE_IP:5000/api'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Token helpers ────────────────────────────────────────────
export async function getToken()  { return SecureStore.getItemAsync('accessToken'); }
export async function saveTokens(access, refresh) {
  await SecureStore.setItemAsync('accessToken',  access);
  await SecureStore.setItemAsync('refreshToken', refresh);
}
export async function clearTokens() {
  await SecureStore.deleteItemAsync('accessToken');
  await SecureStore.deleteItemAsync('refreshToken');
}

// ─── Request interceptor ─────────────────────────────────────
api.interceptors.request.use(async config => {
  const token = await getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Response interceptor — refresh on 401 ───────────────────
api.interceptors.response.use(
  r => r,
  async error => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = await SecureStore.getItemAsync('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
        await saveTokens(data.data.accessToken, data.data.refreshToken);
        original.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(original);
      } catch {
        await clearTokens();
        // Navigation to login handled in AuthContext
        throw error;
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// ─── API services ─────────────────────────────────────────────
export const authAPI = {
  login:      d => api.post('/auth/login', d),
  register:   d => api.post('/auth/register', d),
  logout:     () => api.post('/auth/logout'),
  getMe:      () => api.get('/auth/me'),
  changePass: d => api.patch('/auth/me/password', d),
  updateFcm:  t => api.patch('/auth/me/fcm-token', { fcm_token: t }),
};

export const floorAPI = {
  getBuildings: ()     => api.get('/floors/buildings'),
  getAll:       p      => api.get('/floors', { params: p }),
  getById:      id     => api.get(`/floors/${id}`),
};

export const roomAPI = {
  getByFloor: (fid, p) => api.get('/rooms', { params: { floor_id: fid, ...p } }),
  getById:    id       => api.get(`/rooms/${id}`),
};

export const scheduleAPI = {
  getMy:    p => api.get('/schedule/my', { params: p }),
  getToday: () => api.get('/schedule/today'),
  enroll:   id => api.post('/schedule/enroll', { section_id: id }),
  drop:     id => api.delete(`/schedule/enroll/${id}`),
};

export const searchAPI = {
  global: p => api.get('/search', { params: p }),
  rooms:  p => api.get('/search/rooms', { params: p }),
  graph:  p => api.get('/search/graph', { params: p }),
};

export const notificationAPI = {
  getMy:       p  => api.get('/notifications', { params: p }),
  markRead:    id => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

export const announcementAPI = {
  getAll:  p  => api.get('/announcements', { params: p }),
  getById: id => api.get(`/announcements/${id}`),
};
