import { useState, useEffect, useCallback } from 'react';
import { floorAPI }        from '../api/floorAPI';
import { roomAPI, scheduleAPI, searchAPI, notificationAPI } from '../api/index';
import toast from 'react-hot-toast';

// ─── useAsync — generic data-fetching hook ────────────────────
export function useAsync(asyncFn, deps = [], options = {}) {
  const { immediate = true, onSuccess, onError } = options;
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error,   setError]   = useState(null);

  const execute = useCallback(async (...args) => {
    setLoading(true);
    setError(null);
    try {
      const result = await asyncFn(...args);
      const payload = result?.data?.data ?? result?.data ?? result;
      setData(payload);
      onSuccess?.(payload);
      return payload;
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'An error occurred';
      setError(msg);
      onError?.(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (immediate) execute();
  }, [execute]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error, refetch: execute };
}

// ─── useBuildings ─────────────────────────────────────────────
export function useBuildings() {
  return useAsync(() => floorAPI.getBuildings());
}

// ─── useFloors ────────────────────────────────────────────────
export function useFloors(params = {}) {
  const [floors,  setFloors]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await floorAPI.getAll(params);
      setFloors(data.data.floors);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load floors');
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetch(); }, [fetch]);

  return { floors, loading, error, refetch: fetch };
}

// ─── useFloor (single, with rooms) ────────────────────────────
export function useFloor(floorId) {
  const [floor,   setFloor]   = useState(null);
  const [rooms,   setRooms]   = useState([]);
  const [loading, setLoading] = useState(!!floorId);
  const [error,   setError]   = useState(null);

  const fetch = useCallback(async () => {
    if (!floorId) return;
    setLoading(true);
    try {
      const { data } = await floorAPI.getById(floorId);
      setFloor(data.data.floor);
      setRooms(data.data.rooms || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load floor');
    } finally {
      setLoading(false);
    }
  }, [floorId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { floor, rooms, loading, error, refetch: fetch };
}

// ─── useRooms ─────────────────────────────────────────────────
export function useRooms(floorId, params = {}) {
  const [rooms,   setRooms]   = useState([]);
  const [loading, setLoading] = useState(!!floorId);
  const [error,   setError]   = useState(null);

  const fetch = useCallback(async () => {
    if (!floorId) { setRooms([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await roomAPI.getByFloor(floorId, params);
      setRooms(data.data.rooms);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }, [floorId, JSON.stringify(params)]); // eslint-disable-line

  useEffect(() => { fetch(); }, [fetch]);

  return { rooms, setRooms, loading, error, refetch: fetch };
}

// ─── useMySchedule ────────────────────────────────────────────
export function useMySchedule(params = {}) {
  const [schedule, setSchedule] = useState({ sections: [], by_day: {} });
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await scheduleAPI.getMy(params);
      setSchedule(data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]); // eslint-disable-line

  useEffect(() => { fetch(); }, [fetch]);

  return { schedule, loading, error, refetch: fetch };
}

// ─── useTodaySchedule ────────────────────────────────────────
export function useTodaySchedule() {
  return useAsync(() => scheduleAPI.getToday());
}

// ─── useAllSections ──────────────────────────────────────────
export function useAllSections(params = {}) {
  const [sections,   setSections]   = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading,    setLoading]    = useState(true);

  const fetch = useCallback(async (p = params) => {
    setLoading(true);
    try {
      const { data } = await scheduleAPI.getAll(p);
      setSections(data.data.sections);
      setPagination(data.data.pagination);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load sections');
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(params)]); // eslint-disable-line

  useEffect(() => { fetch(); }, [fetch]);

  return { sections, pagination, loading, refetch: fetch };
}

// ─── useSearch ────────────────────────────────────────────────
export function useSearch() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [query,   setQuery]   = useState('');

  const search = useCallback(async (q, options = {}) => {
    if (!q || q.trim().length < 2) { setResults(null); return; }
    setQuery(q);
    setLoading(true);
    try {
      const { data } = await searchAPI.global({ q, ...options });
      setResults(data.data);
    } catch (err) {
      toast.error('Search failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => { setResults(null); setQuery(''); }, []);

  return { results, loading, query, search, clear };
}

// ─── useNotifications ────────────────────────────────────────
export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [pagination,    setPagination]    = useState({});

  const fetch = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const { data } = await notificationAPI.getMy(params);
      setNotifications(data.data.notifications);
      setUnreadCount(data.data.unread_count);
      setPagination(data.data.pagination);
    } catch {
      // fail silently for notifications
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const markRead = useCallback(async (id) => {
    await notificationAPI.markRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await notificationAPI.markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, []);

  return { notifications, unreadCount, loading, pagination, refetch: fetch, markRead, markAllRead };
}
