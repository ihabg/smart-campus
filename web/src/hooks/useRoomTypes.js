import { useState, useEffect } from 'react';
import { roomTypeAPI } from '../api/index';

// Module-level cache so multiple components on the same page share one request.
let _cache = null;
let _promise = null;

export function useRoomTypes() {
  const [roomTypes, setRoomTypes] = useState(_cache || []);
  const [loading, setLoading]     = useState(!_cache);
  const [error, setError]         = useState(null);

  useEffect(() => {
    if (_cache) {
      setRoomTypes(_cache);
      setLoading(false);
      return;
    }

    if (!_promise) {
      _promise = roomTypeAPI.getAll()
        .then(res => {
          _cache = res.data?.data?.roomTypes || [];
          return _cache;
        })
        .catch(err => {
          _promise = null;
          throw err;
        });
    }

    _promise
      .then(types => {
        setRoomTypes(types);
        setLoading(false);
      })
      .catch(err => {
        setError(err.response?.data?.message || 'Failed to load room types');
        setLoading(false);
      });
  }, []);

  return { roomTypes, loading, error };
}
