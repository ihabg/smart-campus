import api from './axiosInstance';

export const floorAPI = {
  getBuildings:  ()           => api.get('/floors/buildings'),
  getAll:        params       => api.get('/floors', { params }),
  getById:       id           => api.get(`/floors/${id}`),
  create:        data         => api.post('/floors', data),
  update:        (id, data)   => api.patch(`/floors/${id}`, data),
  delete:        id           => api.delete(`/floors/${id}`),
  uploadMap:     (id, file)   => {
    const form = new FormData();
    form.append('map', file);
    return api.post(`/floors/${id}/map`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
