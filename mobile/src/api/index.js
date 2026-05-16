import axios from 'axios';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/*
  API addresses:

  Expo Web in Chrome:
    http://localhost:5000/api

  Android Emulator:
    http://10.0.2.2:5000/api

  Real Android phone:
    replace with your laptop IP, for example:
    http://192.168.56.1:5000/api
*/

const WEB_API_URL = 'http://localhost:5000/api';
const ANDROID_EMULATOR_API_URL = 'http://10.0.2.2:5000/api';

const WEB_ASSET_URL = 'http://localhost:3000';
const ANDROID_EMULATOR_ASSET_URL = 'http://10.0.2.2:3000';

export const API_BASE_URL =
  Platform.OS === 'web'
    ? WEB_API_URL
    : Platform.OS === 'android'
      ? ANDROID_EMULATOR_API_URL
      : WEB_API_URL;

export const ASSET_BASE_URL =
  Platform.OS === 'web'
    ? WEB_ASSET_URL
    : Platform.OS === 'android'
      ? ANDROID_EMULATOR_ASSET_URL
      : WEB_ASSET_URL;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/* SecureStore does not work on Expo Web, so use localStorage on web */
async function storageGet(key) {
  if (Platform.OS === 'web') {
    return window.localStorage.getItem(key);
  }

  return SecureStore.getItemAsync(key);
}

async function storageSet(key, value) {
  if (!value) return;

  if (Platform.OS === 'web') {
    window.localStorage.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

async function storageDelete(key) {
  if (Platform.OS === 'web') {
    window.localStorage.removeItem(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}

export async function getToken() {
  return storageGet('accessToken');
}

export async function saveTokens(accessToken, refreshToken) {
  await storageSet('accessToken', accessToken);
  await storageSet('refreshToken', refreshToken);
}

export async function clearTokens() {
  await storageDelete('accessToken');
  await storageDelete('refreshToken');
}

export function getAssetUrl(path) {
  if (!path) return '';

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${ASSET_BASE_URL}${String(path).startsWith('/') ? '' : '/'}${path}`;
}

api.interceptors.request.use(async (config) => {
  const token = await getToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;

      try {
        const refreshToken = await storageGet('refreshToken');

        if (!refreshToken) {
          throw new Error('Missing refresh token');
        }

        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });

        const payload = data?.data || data || {};

        const nextAccessToken =
          payload.accessToken ||
          payload.access_token ||
          payload.token;

        const nextRefreshToken =
          payload.refreshToken ||
          payload.refresh_token;

        await saveTokens(nextAccessToken, nextRefreshToken);

        original.headers.Authorization = `Bearer ${nextAccessToken}`;

        return api(original);
      } catch (refreshError) {
        await clearTokens();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data) => api.patch('/users/me/profile', data),
  changePassword: (data) => api.patch('/auth/me/password', data),
};

export const userAPI = {
  updateMe: (data) => api.patch('/users/me/profile', data),
};

export const floorAPI = {
  getBuildings: () => api.get('/floors/buildings'),
  getAll: (params = {}) => api.get('/floors', { params }),
  getById: (id) => api.get(`/floors/${id}`),
};

export const roomAPI = {
  getAll: (params = {}) => api.get('/rooms', { params }),
  getByFloor: (floorId, params = {}) =>
    api.get('/rooms', { params: { floor_id: floorId, ...params } }),
  getById: (id) => api.get(`/rooms/${id}`),
  getByNumber: (roomNumber) =>
    api.get(`/rooms/number/${encodeURIComponent(roomNumber)}`),
};

export const scheduleAPI = {
  getMy: (params = {}) => api.get('/schedule/my', { params }),
  getToday: () => api.get('/schedule/today'),
  getAll: (params = {}) => api.get('/schedule', { params }),
  enroll: (sectionId) => api.post('/schedule/enroll', { section_id: sectionId }),
  drop: (sectionId) => api.delete(`/schedule/enroll/${sectionId}`),
};

export const searchAPI = {
  global: (params = {}) => api.get('/search', { params }),
  rooms: (params = {}) => api.get('/search/rooms', { params }),
  graph: (params = {}) => api.get('/search/graph', { params }),
};

export const notificationAPI = {
  getMy: (params = {}) => api.get('/notifications', { params }),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

export const announcementAPI = {
  getAll: (params = {}) => api.get('/announcements', { params }),
  getById: (id) => api.get(`/announcements/${id}`),
};

export const chatAPI = {
  send: (message) => api.post('/chat', { message }),
};

export const officeHoursAPI = {
  getByEmail: (email) =>
    api.get(`/office-hours/${encodeURIComponent(email)}`),
};