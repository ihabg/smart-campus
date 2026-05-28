import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { eventAPI, roomAPI, floorAPI, roomTypeAPI } from '../../api/index';
import { getErrorMessage } from '../../utils/helpers';
import { RoomAvailabilityMap } from '../../components/map/RoomAvailabilityMap';
import './AdminEventsTab.css';

// ─── Helpers ───────────────────────────────────────────────────

function formatTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12  = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function formatDate(d) {
  if (!d) return '';
  const str = typeof d === 'string' ? d : (d instanceof Date ? d.toISOString() : String(d));
  const datePart = str.substring(0, 10);
  const [year, month, day] = datePart.split('-').map(Number);
  if (!year || !month || !day) return datePart;
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function roomLabel(r) {
  if (!r) return '';
  const parts = [r.room_number, r.name].filter(Boolean);
  const cap   = r.capacity ? ` (${r.capacity} seats)` : '';
  const loc   = [r.building_code, r.floor_label].filter(Boolean).join(' · ');
  return `${parts.join(' — ')}${cap}${loc ? ' · ' + loc : ''}`;
}

function normalizeFloorKeyFromDb(floor) {
  const label = String(floor?.floor_label || '').trim().toUpperCase();
  if (label === 'B2') return 'B2';
  if (label === 'B1') return 'B1';
  if (label === 'G')  return 'G';
  const n = Number(floor?.floor_number);
  if (n === -2) return 'B2';
  if (n === -1) return 'B1';
  if (n === 0)  return 'G';
  return String(n || label);
}

function getDisplayStatus(ev) {
  if (ev.status === 'cancelled') return 'cancelled';

  const str = typeof ev.event_date === 'string'
    ? ev.event_date
    : (ev.event_date instanceof Date ? ev.event_date.toISOString() : String(ev.event_date));
  const [yr, mo, dy] = str.substring(0, 10).split('-').map(Number);

  const now      = new Date();
  const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDay = new Date(yr, mo - 1, dy);

  if (eventDay < today) return 'finished';
  if (eventDay > today) return 'upcoming';

  const [sh, sm] = String(ev.start_time || '').split(':').map(Number);
  const [eh, em] = String(ev.end_time   || '').split(':').map(Number);
  const nowMins   = now.getHours() * 60 + now.getMinutes();
  const startMins = (sh || 0) * 60 + (sm || 0);
  const endMins   = (eh || 0) * 60 + (em || 0);

  if (nowMins < startMins) return 'upcoming';
  if (nowMins >= endMins)  return 'finished';
  return 'ongoing';
}

const DISPLAY_LABELS = {
  upcoming:  'Upcoming',
  ongoing:   'Ongoing',
  finished:  'Finished',
  cancelled: 'Cancelled',
};

function StatusBadge({ displayStatus }) {
  return (
    <span className={`aet-badge aet-badge--${displayStatus}`}>
      {DISPLAY_LABELS[displayStatus] || displayStatus}
    </span>
  );
}

const BLANK_FORM = {
  title:       '',
  description: '',
  room_ids:    [],   // multi-room: array of UUIDs
  event_date:  '',
  start_time:  '',
  end_time:    '',
};

// ─── Component ─────────────────────────────────────────────────

export default function AdminEventsTab() {
  const [form,         setForm]         = useState(BLANK_FORM);
  const [formError,    setFormError]    = useState('');

  const [rooms,        setRooms]        = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const roomsLoadedRef = useRef(false);

  const [bookableTypeSet, setBookableTypeSet] = useState(null);
  const bookableTypesLoadedRef = useRef(false);

  // Searchable room picker
  const [roomSearch,     setRoomSearch]     = useState('');
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const roomPickerRef = useRef(null);

  const [checking,    setChecking]    = useState(false);
  const [checkError,  setCheckError]  = useState('');
  const [checkResult, setCheckResult] = useState(null);
  // checkResult = { roomConflicts: [{room_id, room_number, conflicts:[]}], available_rooms, event_date, weekday, has_conflicts }

  const [replacements, setReplacements] = useState({});
  // { [section_meeting_id]: replacement_room_id }

  const [confirming,   setConfirming]   = useState(false);
  const [confirmError, setConfirmError] = useState('');

  const [events,        setEvents]        = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const eventsLoadedRef = useRef(false);

  const [cancelTarget,  setCancelTarget]  = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError,   setCancelError]   = useState('');

  // Map picker
  const [mapOpen,           setMapOpen]           = useState(false);
  const [mapFloors,         setMapFloors]         = useState([]);
  const mapFloorsRef = useRef(false);
  const [mapFloorId,        setMapFloorId]        = useState('');
  const [mapRooms,          setMapRooms]          = useState([]);
  const [mapRoomsLoading,   setMapRoomsLoading]   = useState(false);
  const [mapClickMsg,       setMapClickMsg]       = useState('');
  const [mapWarning,        setMapWarning]        = useState('');
  const [pendingMapRoomIds, setPendingMapRoomIds] = useState(new Set());

  // ── Load rooms once ────────────────────────────────────────
  useEffect(() => {
    if (roomsLoadedRef.current) return;
    roomsLoadedRef.current = true;
    setRoomsLoading(true);
    roomAPI.getAll()
      .then(res => setRooms(res?.data?.data?.rooms || []))
      .catch(() => {})
      .finally(() => setRoomsLoading(false));
  }, []);

  // ── Load bookable room types once ──────────────────────────
  useEffect(() => {
    if (bookableTypesLoadedRef.current) return;
    bookableTypesLoadedRef.current = true;
    roomTypeAPI.getAll()
      .then(res => {
        const types = res?.data?.data?.roomTypes || [];
        setBookableTypeSet(
          new Set(types.filter(rt => rt.is_bookable_for_events).map(rt => rt.value))
        );
      })
      .catch(() => setBookableTypeSet(new Set()));
  }, []);

  // ── Load events list ───────────────────────────────────────
  function loadEvents() {
    setEventsLoading(true);
    eventAPI.list()
      .then(res => setEvents(res?.data?.data?.events || []))
      .catch(() => {})
      .finally(() => setEventsLoading(false));
  }

  useEffect(() => {
    if (eventsLoadedRef.current) return;
    eventsLoadedRef.current = true;
    loadEvents();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Close room picker on outside click ────────────────────
  useEffect(() => {
    function onClickOutside(e) {
      if (roomPickerRef.current && !roomPickerRef.current.contains(e.target)) {
        setRoomPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // ── Bookable rooms, excluding already-selected ────────────
  const bookableRooms = bookableTypeSet === null
    ? rooms
    : rooms.filter(r => bookableTypeSet.has(r.type));

  const filteredRooms = (roomSearch.trim()
    ? bookableRooms.filter(r => {
        const q = roomSearch.toLowerCase();
        return (
          (r.room_number || '').toLowerCase().includes(q) ||
          (r.name        || '').toLowerCase().includes(q) ||
          (r.type        || '').toLowerCase().includes(q)
        );
      })
    : bookableRooms
  ).filter(r => !form.room_ids.includes(r.id));

  const selectedEventRooms = rooms.filter(r => form.room_ids.includes(r.id));

  // ── Add a room ─────────────────────────────────────────────
  const handleRoomAdd = useCallback((room) => {
    setForm(f => {
      if (f.room_ids.includes(room.id)) return f;
      return { ...f, room_ids: [...f.room_ids, room.id] };
    });
    setRoomSearch('');
    setRoomPickerOpen(false);
    setCheckResult(null);
    setCheckError('');
    setConfirmError('');
    setReplacements({});
    setMapWarning('');
  }, []);

  // ── Remove a single room ───────────────────────────────────
  const handleRoomRemove = useCallback((roomId) => {
    setForm(f => ({ ...f, room_ids: f.room_ids.filter(id => id !== roomId) }));
    setCheckResult(null);
    setCheckError('');
    setConfirmError('');
    setReplacements({});
  }, []);

  // ── Clear all rooms ────────────────────────────────────────
  const handleRoomClear = useCallback(() => {
    setForm(f => ({ ...f, room_ids: [] }));
    setRoomSearch('');
    setRoomPickerOpen(false);
    setCheckResult(null);
    setCheckError('');
    setConfirmError('');
    setReplacements({});
    setMapWarning('');
  }, []);

  // ── Form field change ──────────────────────────────────────
  function handleChange(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    setCheckResult(null);
    setCheckError('');
    setConfirmError('');
    setReplacements({});
    if (['event_date', 'start_time', 'end_time'].includes(name)) {
      setMapWarning('');
    }
  }

  // ── Map: fetch rooms for a floor ───────────────────────────
  async function fetchMapRooms(floorId) {
    setMapRoomsLoading(true);
    setMapClickMsg('');
    try {
      const res = await eventAPI.getRoomStates({
        floor_id:   floorId,
        date:       form.event_date,
        start_time: form.start_time,
        end_time:   form.end_time,
      });
      setMapRooms(res?.data?.data?.rooms || []);
    } catch {
      setMapRooms([]);
    } finally {
      setMapRoomsLoading(false);
    }
  }

  // ── Map: open ──────────────────────────────────────────────
  async function openMapPicker() {
    if (!form.event_date || !form.start_time || !form.end_time) {
      setMapWarning('Please fill in the date and time fields before using the map picker.');
      return;
    }
    setMapWarning('');
    setPendingMapRoomIds(new Set(form.room_ids));
    setMapOpen(true);
    setMapClickMsg('');

    if (!mapFloorsRef.current) {
      try {
        const res = await floorAPI.getAll();
        const floors = res?.data?.data?.floors || [];
        setMapFloors(floors);
        mapFloorsRef.current = true;
        const firstId = floors[0]?.id || '';
        setMapFloorId(firstId);
        if (firstId) fetchMapRooms(firstId);
      } catch {
        setMapFloors([]);
      }
    } else {
      const floorId = mapFloorId || mapFloors[0]?.id || '';
      if (floorId) fetchMapRooms(floorId);
    }
  }

  // ── Map: toggle a room ─────────────────────────────────────
  function handleMapRoomClick(block, avail) {
    if (!avail) return;
    const origStatus = avail.original_status || avail.status;
    if (origStatus === 'not_bookable') {
      setMapClickMsg('This room type cannot be booked for events.');
      return;
    }
    const isCurrentlySelected = pendingMapRoomIds.has(avail.room_id);
    if (origStatus === 'event_conflict' && !isCurrentlySelected) {
      setMapClickMsg('This room already has an event booking at this time.');
      return;
    }
    setPendingMapRoomIds(prev => {
      const next = new Set(prev);
      if (next.has(avail.room_id)) next.delete(avail.room_id);
      else next.add(avail.room_id);
      return next;
    });
    setMapClickMsg(
      isCurrentlySelected
        ? `Room ${block.roomNumber} removed`
        : `Room ${block.roomNumber} added`
    );
  }

  // ── Map: apply pending selection ───────────────────────────
  function handleMapDone() {
    setForm(f => ({ ...f, room_ids: [...pendingMapRoomIds] }));
    setCheckResult(null);
    setCheckError('');
    setConfirmError('');
    setReplacements({});
    setMapOpen(false);
    setMapClickMsg('');
  }

  // ── Validate ───────────────────────────────────────────────
  function validate() {
    if (!form.title.trim())    return 'Event title is required.';
    if (!form.room_ids.length) return 'Please select at least one room.';
    if (!form.event_date)      return 'Please select a date.';
    if (!form.start_time)      return 'Please enter a start time.';
    if (!form.end_time)        return 'Please enter an end time.';
    if (form.start_time >= form.end_time)
      return 'Start time must be before end time.';
    return null;
  }

  // ── Check availability ─────────────────────────────────────
  async function handleCheck(e) {
    e.preventDefault();
    const err = validate();
    if (err) { setFormError(err); return; }
    setFormError('');
    setCheckError('');
    setCheckResult(null);
    setConfirmError('');
    setReplacements({});
    setChecking(true);

    try {
      const [conflictsRes, availableRes] = await Promise.all([
        eventAPI.getConflicts({
          room_ids:   form.room_ids.join(','),
          date:       form.event_date,
          start_time: form.start_time,
          end_time:   form.end_time,
        }),
        eventAPI.getAvailableRooms({
          date:             form.event_date,
          start_time:       form.start_time,
          end_time:         form.end_time,
          exclude_room_ids: form.room_ids.join(','),
        }),
      ]);

      const data = conflictsRes.data.data;
      setCheckResult({
        roomConflicts:   data.rooms            || [],
        available_rooms: availableRes.data.data.rooms || [],
        event_date:      data.event_date,
        weekday:         data.weekday,
        has_conflicts:   data.has_conflicts,
      });
    } catch (error) {
      setCheckError(getErrorMessage(error));
    } finally {
      setChecking(false);
    }
  }

  // ── Replacement selection ──────────────────────────────────
  function handleReplacementChange(sectionMeetingId, roomId) {
    setReplacements(r => ({ ...r, [sectionMeetingId]: roomId }));
    setConfirmError('');
  }

  // ── Confirm booking ────────────────────────────────────────
  async function handleConfirm() {
    setConfirmError('');
    setConfirming(true);

    try {
      const allConflictsFlat = (checkResult.roomConflicts || []).flatMap(rc => rc.conflicts);
      const relocations = allConflictsFlat.map(c => ({
        section_meeting_id:  c.section_meeting_id,
        section_id:          c.section_id,
        replacement_room_id: replacements[c.section_meeting_id],
      }));

      const res = await eventAPI.create({
        title:       form.title.trim(),
        description: form.description.trim() || undefined,
        room_ids:    form.room_ids,
        event_date:  form.event_date,
        start_time:  form.start_time,
        end_time:    form.end_time,
        relocations,
      });

      const { relocations_created, notifications_sent } = res.data.data;

      toast.success('Event booking created successfully.');
      if (relocations_created > 0) {
        toast.success(
          `${relocations_created} lecture${relocations_created !== 1 ? 's' : ''} relocated. ` +
          `${notifications_sent} notification${notifications_sent !== 1 ? 's' : ''} sent.`
        );
      }

      setForm(BLANK_FORM);
      setCheckResult(null);
      setReplacements({});
      setFormError('');
      setConfirmError('');
      loadEvents();
    } catch (error) {
      setConfirmError(getErrorMessage(error));
    } finally {
      setConfirming(false);
    }
  }

  // ── Cancel booking ─────────────────────────────────────────
  async function handleCancelConfirm() {
    setCancelError('');
    setCancelLoading(true);
    try {
      const res = await eventAPI.cancel(cancelTarget.id);
      const { relocations_cancelled, notifications_sent } = res.data.data;
      toast.success('Event booking cancelled.');
      if (relocations_cancelled > 0) {
        toast.success(
          `${relocations_cancelled} lecture${relocations_cancelled !== 1 ? 's' : ''} returned to original room. ` +
          `${notifications_sent} notification${notifications_sent !== 1 ? 's' : ''} sent.`
        );
      }
      setCancelTarget(null);
      loadEvents();
    } catch (err) {
      setCancelError(getErrorMessage(err));
    } finally {
      setCancelLoading(false);
    }
  }

  // ── Map derived values ────────────────────────────────────
  const mapFloorKey = useMemo(() => {
    const floor = mapFloors.find(f => f.id === mapFloorId);
    return floor ? normalizeFloorKeyFromDb(floor) : null;
  }, [mapFloors, mapFloorId]);

  // Build availability map — inject 'selected' status for pending rooms
  const mapAvailability = useMemo(() => {
    const byNum = {};
    mapRooms.forEach(r => {
      const isSelected = pendingMapRoomIds.has(r.id);
      byNum[r.room_number] = {
        status:          isSelected ? 'selected' : r.status,
        original_status: r.status,
        room_id:         r.id,
      };
    });
    return byNum;
  }, [mapRooms, pendingMapRoomIds]);

  // ── All conflicts flattened across all rooms ───────────────
  const allConflicts = useMemo(
    () => (checkResult?.roomConflicts || []).flatMap(rc => rc.conflicts),
    [checkResult]
  );

  const allReplacementsSelected =
    !checkResult?.has_conflicts ||
    allConflicts.every(c => replacements[c.section_meeting_id]);

  const canConfirm = checkResult !== null && allReplacementsSelected && !confirming;

  // ──────────────────────────────────────────────────────────
  return (
    <div className="aet-root">

      {/* ── Top: form + result panel side-by-side ── */}
      <div className="aet-top">

        {/* ── Availability form ── */}
        <div className="aet-form-card card">
          <div className="aet-form-title">Book an Event</div>

          {formError && <div className="aet-alert aet-alert--error">{formError}</div>}

          <form onSubmit={handleCheck} noValidate>
            <div className="aet-field">
              <label className="aet-label" htmlFor="aet-title">Event Title *</label>
              <input
                id="aet-title"
                className="aet-input"
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="e.g. Faculty Graduation Ceremony"
                maxLength={200}
              />
            </div>

            <div className="aet-field">
              <label className="aet-label" htmlFor="aet-desc">Description</label>
              <textarea
                id="aet-desc"
                className="aet-input aet-textarea"
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Optional details about the event"
                rows={2}
              />
            </div>

            {/* ── Multi-room selector ── */}
            <div className="aet-field">
              <label className="aet-label">Rooms *</label>

              {/* Selected room chips */}
              {selectedEventRooms.length > 0 && (
                <div className="aet-room-chips">
                  {selectedEventRooms.map(r => (
                    <span key={r.id} className="aet-room-chip">
                      <span className="aet-room-chip__num">{r.room_number}</span>
                      {r.name && <span className="aet-room-chip__name">{r.name}</span>}
                      <button
                        type="button"
                        className="aet-room-chip__remove"
                        onClick={() => handleRoomRemove(r.id)}
                        aria-label={`Remove ${r.room_number}`}
                      >×</button>
                    </span>
                  ))}
                  {selectedEventRooms.length > 1 && (
                    <button
                      type="button"
                      className="aet-room-chips__clear"
                      onClick={handleRoomClear}
                    >Clear all</button>
                  )}
                </div>
              )}

              {/* Search input */}
              <div className="aet-room-picker" ref={roomPickerRef}>
                <div className="aet-room-picker__input-wrap">
                  <input
                    className="aet-room-picker__input"
                    type="text"
                    placeholder={
                      roomsLoading ? 'Loading rooms…' :
                      selectedEventRooms.length > 0 ? 'Add another room…' :
                      'Search by room number or name…'
                    }
                    value={roomSearch}
                    disabled={roomsLoading}
                    onChange={e => { setRoomSearch(e.target.value); setRoomPickerOpen(true); }}
                    onFocus={() => setRoomPickerOpen(true)}
                    autoComplete="off"
                  />
                  <span className="aet-room-picker__icon">🔍</span>
                </div>
                {roomPickerOpen && (
                  <div className="aet-room-picker__dropdown">
                    {filteredRooms.length === 0 ? (
                      <div className="aet-room-picker__empty">
                        {roomsLoading ? 'Loading…' : 'No matching rooms found.'}
                      </div>
                    ) : filteredRooms.map(r => (
                      <button
                        key={r.id}
                        type="button"
                        className="aet-room-picker__option"
                        onMouseDown={e => { e.preventDefault(); handleRoomAdd(r); }}
                      >
                        <span className="aet-room-picker__opt-num">{r.room_number}</span>
                        {r.name && <span className="aet-room-picker__opt-name">{r.name}</span>}
                        <span className="aet-room-picker__opt-meta">
                          {r.type?.replace(/_/g, ' ')}
                          {r.capacity ? ` · ${r.capacity} seats` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="aet-room-picker-footer">
                <div className="aet-room-picker__hint">
                  Only rooms marked as Bookable for Events can be selected.
                </div>
                <button type="button" className="aet-map-picker-btn" onClick={openMapPicker}>
                  Choose from Map
                </button>
              </div>

              {mapWarning && (
                <div className="aet-alert aet-alert--warn aet-alert--sm" style={{ marginTop: 6 }}>
                  {mapWarning}
                </div>
              )}
            </div>

            <div className="aet-field">
              <label className="aet-label" htmlFor="aet-date">Event Date *</label>
              <input
                id="aet-date"
                className="aet-input"
                type="date"
                name="event_date"
                value={form.event_date}
                onChange={handleChange}
              />
            </div>

            <div className="aet-time-row">
              <div className="aet-field">
                <label className="aet-label" htmlFor="aet-start">Start Time *</label>
                <input
                  id="aet-start"
                  className="aet-input"
                  type="time"
                  name="start_time"
                  value={form.start_time}
                  onChange={handleChange}
                />
              </div>
              <div className="aet-field">
                <label className="aet-label" htmlFor="aet-end">End Time *</label>
                <input
                  id="aet-end"
                  className="aet-input"
                  type="time"
                  name="end_time"
                  value={form.end_time}
                  onChange={handleChange}
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn--secondary aet-check-btn"
              disabled={checking}
            >
              {checking ? 'Checking…' : '🔍 Check Availability'}
            </button>
          </form>
        </div>

        {/* ── Result + confirm panel ── */}
        <div className="aet-result-panel">
          {checkError && <div className="aet-alert aet-alert--error">{checkError}</div>}

          {!checkResult && !checkError && (
            <div className="aet-result-empty">
              <div className="aet-result-empty__icon">🔍</div>
              <p className="aet-result-empty__text">
                Fill in the form and click <strong>Check Availability</strong> to
                see if the selected rooms are free or have lecture conflicts.
              </p>
            </div>
          )}

          {checkResult && (
            <div>
              {/* ── Availability summary ── */}
              <div className={`aet-summary ${checkResult.has_conflicts ? 'aet-summary--warn' : 'aet-summary--ok'}`}>
                <div className="aet-summary__icon">
                  {checkResult.has_conflicts ? '⚠️' : '✅'}
                </div>
                <div className="aet-summary__body">
                  <div className="aet-summary__title">
                    {checkResult.has_conflicts
                      ? `${allConflicts.length} lecture conflict${allConflicts.length !== 1 ? 's' : ''} detected`
                      : `All ${checkResult.roomConflicts.length} room${checkResult.roomConflicts.length !== 1 ? 's' : ''} available`}
                  </div>
                  <div className="aet-summary__sub">
                    {selectedEventRooms.map(r => r.room_number).join(', ')} ·{' '}
                    {formatDate(checkResult.event_date)} ·{' '}
                    {formatTime(form.start_time)} – {formatTime(form.end_time)}
                  </div>
                  {checkResult.has_conflicts && (
                    <div className="aet-summary__note">
                      Select a replacement room for each conflicting lecture below,
                      then confirm the booking.
                    </div>
                  )}
                </div>
              </div>

              {/* ── Conflicts grouped by room ── */}
              {checkResult.roomConflicts.map(rc => (
                <div key={rc.room_id}>
                  <div className={`aet-room-section-head aet-room-section-head--${rc.conflicts.length > 0 ? 'warn' : 'ok'}`}>
                    <span>{rc.conflicts.length > 0 ? '⚠️' : '✅'}</span>
                    <span className="aet-room-section-head__num">Room {rc.room_number}</span>
                    <span className="aet-room-section-head__count">
                      {rc.conflicts.length > 0
                        ? `${rc.conflicts.length} conflict${rc.conflicts.length !== 1 ? 's' : ''}`
                        : 'No conflicts'}
                    </span>
                  </div>

                  {rc.conflicts.length > 0 && (
                    <div className="aet-conflicts">
                      {rc.conflicts.map((c, i) => (
                        <div key={c.section_meeting_id} className="aet-conflict-card">
                          <div className="aet-conflict-card__header">
                            <span className="aet-conflict-card__num">{i + 1}</span>
                            <div className="aet-conflict-card__info">
                              <div className="aet-conflict-card__course">
                                {c.course_code}
                                {c.course_name && c.course_name !== c.course_code && (
                                  <span className="aet-conflict-card__course-name">
                                    {' — '}{c.course_name}
                                  </span>
                                )}
                              </div>
                              <div className="aet-conflict-card__meta">
                                <span>Section {c.section_number}</span>
                                <span className="aet-dot">·</span>
                                <span>{c.instructor_name}</span>
                                <span className="aet-dot">·</span>
                                <span>{c.enrolled_count} enrolled</span>
                              </div>
                              <div className="aet-conflict-card__time">
                                <span className="aet-conflict-card__time-icon">🕐</span>
                                {checkResult.weekday} · {formatTime(c.start_time)} – {formatTime(c.end_time)}
                              </div>
                              <div className="aet-conflict-card__room">
                                <span className="aet-conflict-card__room-icon">📍</span>
                                Current room:{' '}
                                <strong>
                                  {c.original_room_number}
                                  {c.original_room_name ? ` — ${c.original_room_name}` : ''}
                                </strong>
                              </div>
                            </div>
                          </div>

                          <div className="aet-conflict-card__replace">
                            <label className="aet-replace-label">Replacement room *</label>
                            {checkResult.available_rooms.length === 0 ? (
                              <div className="aet-alert aet-alert--warn aet-alert--sm">
                                ⚠️ No available replacement rooms for this time slot.
                              </div>
                            ) : (
                              <select
                                className={`aet-input aet-select aet-replace-select${
                                  replacements[c.section_meeting_id] ? ' aet-replace-select--selected' : ''
                                }`}
                                value={replacements[c.section_meeting_id] || ''}
                                onChange={e => handleReplacementChange(c.section_meeting_id, e.target.value)}
                              >
                                <option value="">— Select replacement room —</option>
                                {checkResult.available_rooms.map(r => (
                                  <option key={r.id} value={r.id}>{roomLabel(r)}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* ── Booking confirmation summary ── */}
              {allReplacementsSelected && (
                <div className="aet-confirm-summary">
                  <div className="aet-confirm-summary__title">📋 Booking Summary</div>

                  <div className="aet-confirm-summary__grid">
                    <div className="aet-confirm-summary__row">
                      <span className="aet-confirm-summary__key">Event</span>
                      <span className="aet-confirm-summary__val">{form.title}</span>
                    </div>
                    <div className="aet-confirm-summary__row">
                      <span className="aet-confirm-summary__key">
                        {selectedEventRooms.length === 1 ? 'Room' : 'Rooms'}
                      </span>
                      <span className="aet-confirm-summary__val">
                        <div className="aet-confirm-rooms">
                          {selectedEventRooms.map(r => (
                            <span key={r.id} className="aet-confirm-room-chip">
                              {r.room_number}{r.name ? ` — ${r.name}` : ''}
                            </span>
                          ))}
                        </div>
                      </span>
                    </div>
                    <div className="aet-confirm-summary__row">
                      <span className="aet-confirm-summary__key">Date</span>
                      <span className="aet-confirm-summary__val">{formatDate(checkResult.event_date)}</span>
                    </div>
                    <div className="aet-confirm-summary__row">
                      <span className="aet-confirm-summary__key">Time</span>
                      <span className="aet-confirm-summary__val">
                        {formatTime(form.start_time)} – {formatTime(form.end_time)}
                      </span>
                    </div>
                    {checkResult.has_conflicts && (
                      <div className="aet-confirm-summary__row">
                        <span className="aet-confirm-summary__key">Relocations</span>
                        <span className="aet-confirm-summary__val">
                          {allConflicts.length} lecture{allConflicts.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  {checkResult.has_conflicts && (
                    <div className="aet-confirm-relocations">
                      {allConflicts.map(c => {
                        const repRoom = checkResult.available_rooms.find(
                          r => r.id === replacements[c.section_meeting_id]
                        );
                        return (
                          <div key={c.section_meeting_id} className="aet-confirm-reloc-row">
                            <span className="aet-confirm-reloc-course">
                              {c.course_code} §{c.section_number}
                            </span>
                            <span className="aet-confirm-reloc-from">{c.original_room_number}</span>
                            <span className="aet-confirm-reloc-arrow">→</span>
                            <span className="aet-confirm-reloc-to">
                              {repRoom?.room_number}
                              {repRoom?.name ? ` — ${repRoom.name}` : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="aet-confirm-summary__notif">
                    ✉️{' '}
                    {checkResult.has_conflicts
                      ? 'Affected students and professors will be notified.'
                      : 'No lectures are displaced — no notifications will be sent.'}
                  </div>
                </div>
              )}

              {/* ── Confirm button ── */}
              <div className="aet-confirm-row">
                {confirmError && <div className="aet-alert aet-alert--error">{confirmError}</div>}

                {checkResult.has_conflicts && !allReplacementsSelected && (
                  <div className="aet-confirm-hint">
                    Select a replacement room for each conflict above to enable booking.
                  </div>
                )}

                <button
                  type="button"
                  className="btn btn--primary aet-confirm-btn"
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                >
                  {confirming ? 'Creating Booking…' : '✅ Confirm Booking'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Cancel modal ── */}
      {cancelTarget && (
        <div className="aet-modal-overlay" onClick={() => !cancelLoading && setCancelTarget(null)}>
          <div className="aet-modal" onClick={e => e.stopPropagation()}>
            <div className="aet-modal__icon">⚠️</div>
            <div className="aet-modal__title">Cancel Event Booking?</div>
            <div className="aet-modal__event-name">{cancelTarget.title}</div>
            <div className="aet-modal__event-date">
              {formatDate(cancelTarget.event_date)} · {formatTime(cancelTarget.start_time)} – {formatTime(cancelTarget.end_time)}
            </div>
            <div className="aet-modal__body">
              This will cancel the event, reverse temporary lecture room changes,
              and notify affected students and professors.
            </div>
            {cancelError && <div className="aet-alert aet-alert--error">{cancelError}</div>}
            <div className="aet-modal__actions">
              <button
                type="button"
                className="btn btn--secondary aet-modal__btn-keep"
                onClick={() => setCancelTarget(null)}
                disabled={cancelLoading}
              >Keep Event</button>
              <button
                type="button"
                className="btn aet-modal__btn-cancel"
                onClick={handleCancelConfirm}
                disabled={cancelLoading}
              >
                {cancelLoading ? 'Cancelling…' : 'Cancel Event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Map room picker modal ── */}
      {mapOpen && (
        <div className="aet-map-overlay" onClick={() => setMapOpen(false)}>
          <div className="aet-map-modal" onClick={e => e.stopPropagation()}>
            <div className="aet-map-modal__header">
              <div className="aet-map-modal__header-text">
                <span className="aet-map-modal__title">Choose Rooms from Map</span>
                <span className="aet-map-modal__sub">
                  {form.event_date} &middot; {formatTime(form.start_time)} &ndash; {formatTime(form.end_time)}
                  {pendingMapRoomIds.size > 0 && (
                    <span className="aet-map-selected-count">
                      {' '}· {pendingMapRoomIds.size} room{pendingMapRoomIds.size !== 1 ? 's' : ''} selected
                    </span>
                  )}
                </span>
              </div>
              <div className="aet-map-modal__header-actions">
                <button
                  type="button"
                  className="aet-map-done-btn"
                  onClick={handleMapDone}
                >
                  Done{pendingMapRoomIds.size > 0 ? ` (${pendingMapRoomIds.size})` : ''}
                </button>
                <button
                  type="button"
                  className="aet-map-modal__close"
                  onClick={() => setMapOpen(false)}
                  aria-label="Close"
                >
                  &times;
                </button>
              </div>
            </div>

            {mapFloors.length > 0 && (
              <div className="aet-map-floor-tabs">
                {mapFloors.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    className={`aet-map-floor-tab${mapFloorId === f.id ? ' aet-map-floor-tab--active' : ''}`}
                    onClick={() => {
                      setMapFloorId(f.id);
                      fetchMapRooms(f.id);
                      setMapClickMsg('');
                    }}
                  >
                    {f.floor_label || f.floor_number}
                  </button>
                ))}
              </div>
            )}

            <div className="aet-map-body">
              <div className="aet-map-area">
                {mapRoomsLoading ? (
                  <div className="aet-map-empty">Loading rooms&hellip;</div>
                ) : mapFloorKey ? (
                  <RoomAvailabilityMap
                    floorKey={mapFloorKey}
                    availabilityByRoomNumber={mapAvailability}
                    selectedRoomId={null}
                    onRoomClick={handleMapRoomClick}
                    clickableStatuses={['available', 'lecture_conflict', 'selected']}
                  />
                ) : (
                  <div className="aet-map-empty">No map available for this floor.</div>
                )}
              </div>

              <div className="aet-map-panel">
                <div className="aet-map-legend">
                  <div className="aet-map-legend__title">Legend</div>
                  <div className="aet-map-legend__item">
                    <span className="aet-map-legend__dot aet-map-legend__dot--selected" />
                    Selected
                  </div>
                  <div className="aet-map-legend__item">
                    <span className="aet-map-legend__dot aet-map-legend__dot--available" />
                    Available
                  </div>
                  <div className="aet-map-legend__item">
                    <span className="aet-map-legend__dot aet-map-legend__dot--lecture" />
                    Lecture conflict
                  </div>
                  <div className="aet-map-legend__item">
                    <span className="aet-map-legend__dot aet-map-legend__dot--event" />
                    Event conflict
                  </div>
                  <div className="aet-map-legend__item">
                    <span className="aet-map-legend__dot aet-map-legend__dot--notbookable" />
                    Not bookable
                  </div>
                </div>

                {pendingMapRoomIds.size > 0 && (
                  <div className="aet-map-selected-list">
                    <div className="aet-map-selected-list__title">
                      Selected ({pendingMapRoomIds.size})
                    </div>
                    {[...pendingMapRoomIds].map(roomId => {
                      const r = rooms.find(x => x.id === roomId);
                      return (
                        <div key={roomId} className="aet-map-selected-list__item">
                          {r?.room_number || roomId}
                          {r?.name ? ` — ${r.name}` : ''}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="aet-map-msg">
                  {mapClickMsg ? (
                    <div className="aet-map-msg__text aet-map-msg__text--hint">{mapClickMsg}</div>
                  ) : (
                    <div className="aet-map-msg__text aet-map-msg__text--hint">
                      Click rooms to select/deselect. Click Done when finished.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Events list ── */}
      <div className="aet-list-section">
        <div className="aet-list-header">
          <div className="aet-list-title">Event Bookings</div>
          <div className="aet-list-sub">
            {eventsLoading
              ? 'Loading…'
              : `${events.length} event${events.length !== 1 ? 's' : ''}`}
          </div>
        </div>

        {eventsLoading && (
          <div className="aet-list-loading">
            {[1, 2, 3].map(i => <div key={i} className="aet-skeleton-row" />)}
          </div>
        )}

        {!eventsLoading && events.length === 0 && (
          <div className="aet-list-empty">
            <div className="aet-list-empty__icon">📅</div>
            <div className="aet-list-empty__title">No events yet</div>
            <div className="aet-list-empty__sub">
              Use the form above to check availability and confirm a booking.
            </div>
          </div>
        )}

        {!eventsLoading && events.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="aet-table-wrap">
              <table className="aet-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Room(s)</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Created By</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(ev => {
                    const evRooms = Array.isArray(ev.rooms) && ev.rooms.length > 0 ? ev.rooms : null;
                    return (
                      <tr key={ev.id}>
                        <td>
                          <div className="aet-event-name">{ev.title}</div>
                          {ev.description && <div className="aet-event-desc">{ev.description}</div>}
                        </td>
                        <td>
                          {evRooms ? (
                            evRooms.length === 1 ? (
                              <>
                                <span className="aet-room-num">{evRooms[0].room_number}</span>
                                {evRooms[0].name && (
                                  <span className="aet-room-name"> — {evRooms[0].name}</span>
                                )}
                              </>
                            ) : (
                              <div className="aet-rooms-chips">
                                {evRooms.map(r => (
                                  <span key={r.id} className="aet-rooms-chip">{r.room_number}</span>
                                ))}
                              </div>
                            )
                          ) : (
                            <>
                              <span className="aet-room-num">{ev.room_number}</span>
                              {ev.room_name && <span className="aet-room-name"> — {ev.room_name}</span>}
                            </>
                          )}
                        </td>
                        <td>{formatDate(ev.event_date)}</td>
                        <td className="aet-time-cell">
                          {formatTime(ev.start_time)} – {formatTime(ev.end_time)}
                        </td>
                        <td><StatusBadge displayStatus={getDisplayStatus(ev)} /></td>
                        <td className="aet-created-by">{ev.created_by_name}</td>
                        <td className="aet-actions-cell">
                          {['upcoming', 'ongoing'].includes(getDisplayStatus(ev)) && (
                            <button
                              type="button"
                              className="aet-btn-cancel"
                              onClick={() => { setCancelTarget(ev); setCancelError(''); }}
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="aet-event-cards">
              {events.map(ev => {
                const evRooms = Array.isArray(ev.rooms) && ev.rooms.length > 0 ? ev.rooms : null;
                const roomsText = evRooms
                  ? (evRooms.length === 1
                      ? `${evRooms[0].room_number}${evRooms[0].name ? ` — ${evRooms[0].name}` : ''}`
                      : evRooms.map(r => r.room_number).join(', '))
                  : `${ev.room_number}${ev.room_name ? ` — ${ev.room_name}` : ''}`;
                return (
                  <div key={ev.id} className="aet-event-card">
                    <div className="aet-event-card__top">
                      <div className="aet-event-card__name">{ev.title}</div>
                      <StatusBadge displayStatus={getDisplayStatus(ev)} />
                    </div>
                    {ev.description && <div className="aet-event-card__desc">{ev.description}</div>}
                    <div className="aet-event-card__meta">
                      <span>📍 {roomsText}</span>
                      <span>📅 {formatDate(ev.event_date)}</span>
                      <span>🕐 {formatTime(ev.start_time)} – {formatTime(ev.end_time)}</span>
                      <span>👤 {ev.created_by_name}</span>
                    </div>
                    {['upcoming', 'ongoing'].includes(getDisplayStatus(ev)) && (
                      <div className="aet-event-card__cancel">
                        <button
                          type="button"
                          className="aet-btn-cancel aet-btn-cancel--full"
                          onClick={() => { setCancelTarget(ev); setCancelError(''); }}
                        >
                          Cancel Event
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
