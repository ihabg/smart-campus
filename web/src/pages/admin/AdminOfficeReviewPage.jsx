import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { roomAPI, instructorAPI } from '../../api/index';
import OfficeAssignmentsPanel from '../../components/ui/OfficeAssignmentsPanel';
import { Spinner } from '../../components/ui/index';
import toast from 'react-hot-toast';

function isOfficeType(type) {
  const t = String(type || '').toLowerCase().replace(/[\s_]/g, '');
  return t === 'office' || t === 'doctoroffice';
}

function instLabel(inst) {
  return (
    [inst.title, inst.first_name, inst.last_name].filter(Boolean).join(' ') ||
    inst.email ||
    '—'
  );
}

function extractError(err) {
  return (
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.message ||
    'Request failed'
  );
}

// ─── Inline room picker for assigning an office to a professor ────────────────
function RoomPicker({ officeRooms, onSelect, onCancel, loading }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return officeRooms.slice(0, 40);
    const lq = q.toLowerCase();
    return officeRooms.filter(r =>
      (r.room_number || '').toLowerCase().includes(lq) ||
      (r.name        || '').toLowerCase().includes(lq) ||
      (r.building_code || '').toLowerCase().includes(lq) ||
      (r.floor_label || '').toLowerCase().includes(lq)
    );
  }, [officeRooms, q]);

  return (
    <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--surface-2, #f8fafc)', borderRadius: 8, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search room number or name…"
          style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, outline: 'none', background: 'var(--surface)', color: 'var(--text)' }}
        />
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12, cursor: 'pointer', color: 'var(--text-muted)' }}
        >
          Cancel
        </button>
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-faint)' }}>No rooms found</div>
        ) : filtered.map(r => (
          <button
            key={r.id}
            type="button"
            disabled={loading}
            onClick={() => onSelect(r)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '9px 10px', border: 'none',
              background: 'transparent',
              borderBottom: '1px solid var(--border)',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 12, color: 'var(--text)',
            }}
          >
            <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'var(--najah-blue, #1d4ed8)' }}>{r.room_number}</span>
            {r.name && <span style={{ color: 'var(--text-muted)' }}> — {r.name}</span>}
            {(r.building_code || r.floor_label) && (
              <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>
                {' '}· {[r.building_code, r.floor_label].filter(Boolean).join(' ')}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminOfficeReviewPage() {
  const [officeRooms,  setOfficeRooms]  = useState([]);
  const [instructors,  setInstructors]  = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [loadedOnce,   setLoadedOnce]   = useState(false);

  const [roomSearch,   setRoomSearch]   = useState('');
  const [profSearch,   setProfSearch]   = useState('');

  // which room's OfficeAssignmentsPanel is open
  const [expandedRoomId, setExpandedRoomId] = useState(null);
  // which professor's room-picker is open
  const [assigningProfId, setAssigningProfId] = useState(null);
  const [assignLoading,   setAssignLoading]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let roomsErr = null;
    let instsErr = null;

    // ── Rooms: fetch all active rooms, filter office types client-side ─────────
    // (same limit:2000 pattern used by SectionFormModal — avoids type-param edge cases)
    try {
      const res = await roomAPI.getAll({ limit: 2000, active_only: 'true' });
      const all = res?.data?.data?.rooms || res?.data?.rooms || [];
      setOfficeRooms(all.filter(r => isOfficeType(r.type)));
    } catch (err) {
      console.error('[OfficeReview] rooms fetch failed:', err?.response?.data ?? err?.message);
      roomsErr = extractError(err);
      setOfficeRooms([]);
    }

    // ── Instructors: fetch all active, include office_room_id for filtering ────
    try {
      const res = await instructorAPI.getAll({ limit: 1000, active_only: 'true' });
      setInstructors(res?.data?.data?.instructors || res?.data?.instructors || []);
    } catch (err) {
      console.error('[OfficeReview] instructors fetch failed:', err?.response?.data ?? err?.message);
      instsErr = extractError(err);
      setInstructors([]);
    }

    if (roomsErr || instsErr) {
      // id deduplicates the toast under React StrictMode double-invocation
      toast.error(
        roomsErr && instsErr
          ? 'Failed to load office rooms and instructors — check console.'
          : roomsErr
            ? `Rooms: ${roomsErr}`
            : `Instructors: ${instsErr}`,
        { id: 'office-review-load-error' }
      );
    }

    setLoadedOnce(true);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Room IDs that already have at least one professor assigned
  const assignedRoomIds = useMemo(() => {
    const ids = new Set();
    instructors.forEach(i => { if (i.office_room_id) ids.add(i.office_room_id); });
    return ids;
  }, [instructors]);

  // Panel A: office rooms with NO assigned professor
  const unassignedRooms = useMemo(() => {
    const q = roomSearch.trim().toLowerCase();
    return officeRooms
      .filter(r => !assignedRoomIds.has(r.id))
      .filter(r => !q ||
        (r.room_number || '').toLowerCase().includes(q) ||
        (r.name        || '').toLowerCase().includes(q)
      );
  }, [officeRooms, assignedRoomIds, roomSearch]);

  // Panel B: professors with no office
  const unassignedProfs = useMemo(() => {
    const q = profSearch.trim().toLowerCase();
    return instructors
      .filter(i => !i.office_room_id)
      .filter(i => !q ||
        instLabel(i).toLowerCase().includes(q) ||
        String(i.doctor_number || '').includes(q) ||
        (i.email      || '').toLowerCase().includes(q) ||
        (i.department || '').toLowerCase().includes(q)
      );
  }, [instructors, profSearch]);

  const handleAssignOffice = async (inst, room) => {
    setAssignLoading(true);
    try {
      await instructorAPI.update(inst.id, { office_room_id: room.id });
      toast.success(`${instLabel(inst)} assigned to ${room.room_number}.`);
      setAssigningProfId(null);
      await load();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setAssignLoading(false);
    }
  };

  const totalOffice          = officeRooms.length;
  const totalUnassignedRooms = officeRooms.filter(r => !assignedRoomIds.has(r.id)).length;
  const totalUnassignedProfs = instructors.filter(i => !i.office_room_id).length;

  // ── Shared card header style ──────────────────────────────────
  const panelHeader = {
    padding: '14px 18px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  };

  const filterInput = {
    width: '100%',
    padding: '7px 10px',
    borderRadius: 7,
    border: '1px solid var(--border)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    background: 'var(--surface)',
    color: 'var(--text)',
  };

  const assignBtn = active => ({
    flexShrink: 0,
    padding: '5px 12px',
    borderRadius: 7,
    border: '1px solid var(--najah-blue, #1d4ed8)',
    background: active ? 'var(--najah-blue, #1d4ed8)' : 'transparent',
    color: active ? '#fff' : 'var(--najah-blue, #1d4ed8)',
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  });

  return (
    <div>
      {/* ── Page header ── */}
      <div
        className="page-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}
      >
        <div>
          <h1 className="page-title">Office Assignment Review</h1>
          <p className="page-sub">
            {totalOffice} office room{totalOffice !== 1 ? 's' : ''} total
            {' · '}
            <span style={{ color: totalUnassignedRooms > 0 ? 'var(--red, #ef4444)' : 'var(--green, #22c55e)', fontWeight: 600 }}>
              {totalUnassignedRooms} unassigned
            </span>
            {' · '}
            {totalUnassignedProfs} professor{totalUnassignedProfs !== 1 ? 's' : ''} without office
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => { setExpandedRoomId(null); setAssigningProfId(null); load(); }}
            disabled={loading}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}
          >
            {loading ? '…' : '↻ Refresh'}
          </button>
          <Link to="/admin/floors" className="btn btn--secondary" style={{ fontSize: 13 }}>
            ← Floors & Maps
          </Link>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <Spinner size="lg" />
        </div>
      ) : (
        /* ── Two-panel grid: side by side ≥700 px, stacked below ── */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, alignItems: 'start' }}>

          {/* ── Panel A: Unassigned office rooms ── */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={panelHeader}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Unassigned Office Rooms</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {totalUnassignedRooms} room{totalUnassignedRooms !== 1 ? 's' : ''} with no professor assigned
                </div>
              </div>
            </div>

            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <input
                type="text"
                value={roomSearch}
                onChange={e => setRoomSearch(e.target.value)}
                placeholder="Filter by room number or name…"
                style={filterInput}
              />
            </div>

            <div style={{ maxHeight: 560, overflowY: 'auto' }}>
              {unassignedRooms.length === 0 ? (
                <div style={{ padding: 36, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13, lineHeight: 1.6 }}>
                  {!loadedOnce
                    ? 'Loading…'
                    : roomSearch
                      ? 'No rooms match your filter.'
                      : '🎉 All office rooms have at least one professor assigned.'}
                </div>
              ) : unassignedRooms.map(room => (
                <div key={room.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  {/* Row */}
                  <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--najah-blue, #1d4ed8)', fontFamily: 'monospace' }}>
                        {room.room_number}
                      </div>
                      {room.name && (
                        <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 2 }} dir="rtl">
                          {room.name}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {[room.building_code, room.floor_label].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedRoomId(expandedRoomId === room.id ? null : room.id)}
                      style={assignBtn(expandedRoomId === room.id)}
                    >
                      {expandedRoomId === room.id ? 'Close' : '+ Assign'}
                    </button>
                  </div>

                  {/* Expanded assignment panel */}
                  {expandedRoomId === room.id && (
                    <div style={{ padding: '0 14px 14px' }}>
                      <OfficeAssignmentsPanel roomId={room.id} />
                      <button
                        type="button"
                        onClick={() => { setExpandedRoomId(null); load(); }}
                        style={{ marginTop: 10, padding: '5px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12, cursor: 'pointer', color: 'var(--text)' }}
                      >
                        Done — Refresh
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Panel B: Professors without an office ── */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={panelHeader}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Professors Without an Office</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {totalUnassignedProfs} professor{totalUnassignedProfs !== 1 ? 's' : ''} with no office assigned
                </div>
              </div>
            </div>

            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <input
                type="text"
                value={profSearch}
                onChange={e => setProfSearch(e.target.value)}
                placeholder="Filter by name, #number, email, department…"
                style={filterInput}
              />
            </div>

            <div style={{ maxHeight: 560, overflowY: 'auto' }}>
              {unassignedProfs.length === 0 ? (
                <div style={{ padding: 36, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13, lineHeight: 1.6 }}>
                  {!loadedOnce
                    ? 'Loading…'
                    : profSearch
                      ? 'No professors match your filter.'
                      : '🎉 All professors have an office assigned.'}
                </div>
              ) : unassignedProfs.map(inst => (
                <div key={inst.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  {/* Row */}
                  <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }} dir="rtl">
                        {instLabel(inst)}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {inst.doctor_number && (
                          <span style={{ fontFamily: 'monospace', color: 'var(--najah-blue, #1d4ed8)', fontWeight: 600 }}>
                            #{inst.doctor_number}
                          </span>
                        )}
                        {inst.email && <span style={{ wordBreak: 'break-all' }}>{inst.email}</span>}
                      </div>
                      {inst.department && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                          {inst.department}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setAssigningProfId(assigningProfId === inst.id ? null : inst.id)}
                      style={assignBtn(assigningProfId === inst.id)}
                    >
                      {assigningProfId === inst.id ? 'Cancel' : 'Assign Office'}
                    </button>
                  </div>

                  {/* Expanded room picker */}
                  {assigningProfId === inst.id && (
                    <div style={{ padding: '0 14px 14px' }}>
                      <RoomPicker
                        officeRooms={officeRooms}
                        loading={assignLoading}
                        onSelect={room => handleAssignOffice(inst, room)}
                        onCancel={() => setAssigningProfId(null)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
