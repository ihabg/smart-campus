import React, { useState, useEffect, useCallback } from 'react';
import { roomAPI, instructorAPI } from '../../api/index';
import toast from 'react-hot-toast';

function extractErrorMessage(err) {
  const response = err?.response?.data || {};
  const lists = [response.errors, response.details].filter(Array.isArray);
  for (const list of lists) {
    const msg = list
      .map(i => i.message || i.msg || i.field || '')
      .filter(Boolean)
      .join(', ');
    if (msg) return msg;
  }
  return response.message || response.error || err?.message || 'Request failed';
}

function instLabel(inst) {
  return [inst.title, inst.first_name, inst.last_name].filter(Boolean).join(' ');
}

export default function OfficeAssignmentsPanel({ roomId }) {
  const [instructors, setInstructors]       = useState([]);
  const [loading, setLoading]               = useState(false);
  const [showAdd, setShowAdd]               = useState(false);
  const [search, setSearch]                 = useState('');
  const [searchResults, setSearchResults]   = useState([]);
  const [searchLoading, setSearchLoading]   = useState(false);

  const load = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    try {
      const res = await roomAPI.getAssignedInstructors(roomId);
      const payload = res?.data?.data || res?.data || {};
      setInstructors(payload.instructors || []);
    } catch {
      setInstructors([]);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  // Reset + reload whenever the selected room changes
  useEffect(() => {
    setInstructors([]);
    setShowAdd(false);
    setSearch('');
    setSearchResults([]);
    if (roomId) load();
  }, [roomId, load]);

  const handleSearch = useCallback(async (val) => {
    setSearch(val);
    if (!val.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await instructorAPI.getAll({ search: val, active_only: 'true', limit: 10 });
      const payload = res?.data?.data || res?.data || {};
      setSearchResults(payload.instructors || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleAssign = async (inst) => {
    try {
      await instructorAPI.update(inst.id, { office_room_id: roomId });
      toast.success(`${inst.first_name} assigned to this office.`);
      setShowAdd(false);
      setSearch('');
      setSearchResults([]);
      await load();
    } catch (err) {
      toast.error(extractErrorMessage(err));
    }
  };

  const handleRemove = async (inst) => {
    try {
      await instructorAPI.update(inst.id, { office_room_id: null });
      toast.success(`${inst.first_name} removed from this office.`);
      await load();
    } catch (err) {
      toast.error(extractErrorMessage(err));
    }
  };

  return (
    <div className="office-assign-section">
      <div className="office-assign-header">
        <span className="office-assign-title">Assigned Professors</span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            setShowAdd(v => !v);
            setSearch('');
            setSearchResults([]);
          }}
        >
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showAdd && (
        <div className="office-assign-search">
          <input
            className="form-input"
            placeholder="Search by name, email, or doctor number…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            autoFocus
          />
          {searchLoading && (
            <div className="office-assign-hint">Searching…</div>
          )}
          {!searchLoading && search && searchResults.length === 0 && (
            <div className="office-assign-hint">No results found.</div>
          )}
          {searchResults.length > 0 && (
            <div className="office-assign-results">
              {searchResults.map(inst => (
                <button
                  type="button"
                  key={inst.id}
                  className="office-assign-result-item"
                  onClick={() => handleAssign(inst)}
                >
                  <span className="office-assign-result-name">{instLabel(inst)}</span>
                  <span className="office-assign-result-meta">
                    {inst.doctor_number && <span>#{inst.doctor_number}</span>}
                    {inst.email && <span>{inst.email}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="office-assign-hint">Loading…</div>
      ) : instructors.length === 0 ? (
        <div className="office-assign-hint office-assign-hint--empty">
          No professors assigned to this office yet.
        </div>
      ) : (
        <div className="office-assign-list">
          {instructors.map(inst => (
            <div key={inst.id} className="office-assign-item">
              <div className="office-assign-item-info">
                <span className="office-assign-item-name" dir="rtl">
                  {instLabel(inst)}
                </span>
                <span className="office-assign-item-meta">
                  {inst.doctor_number && <span>#{inst.doctor_number}</span>}
                  {inst.email && <span>{inst.email}</span>}
                </span>
              </div>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                style={{ color: 'var(--red)', flexShrink: 0 }}
                onClick={() => handleRemove(inst)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
