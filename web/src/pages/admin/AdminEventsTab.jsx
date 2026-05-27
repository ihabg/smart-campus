import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { eventAPI, roomAPI } from '../../api/index';
import { getErrorMessage } from '../../utils/helpers';
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
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
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

const BLANK_FORM = {
  title: '',
  description: '',
  room_id: '',
  event_date: '',
  start_time: '',
  end_time: '',
};

function StatusBadge({ status }) {
  return (
    <span className={`aet-badge aet-badge--${status}`}>
      {status === 'active' ? 'Active' : 'Cancelled'}
    </span>
  );
}

// ─── Component ─────────────────────────────────────────────────

export default function AdminEventsTab() {
  const [form,         setForm]         = useState(BLANK_FORM);
  const [formError,    setFormError]    = useState('');

  const [rooms,        setRooms]        = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const roomsLoadedRef = useRef(false);

  const [checking,    setChecking]    = useState(false);
  const [checkError,  setCheckError]  = useState('');
  const [checkResult, setCheckResult] = useState(null);
  // checkResult = { conflicts, available_rooms, event_date, weekday, has_conflicts }

  const [replacements, setReplacements] = useState({});
  // { [section_meeting_id]: room_id }

  const [confirming,    setConfirming]    = useState(false);
  const [confirmError,  setConfirmError]  = useState('');

  const [events,       setEvents]       = useState([]);
  const [eventsLoading,setEventsLoading]= useState(false);
  const eventsLoadedRef = useRef(false);

  const [cancelTarget,  setCancelTarget]  = useState(null); // event object
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError,   setCancelError]   = useState('');

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

  // ── Form field change ──────────────────────────────────────
  function handleChange(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    setCheckResult(null);
    setCheckError('');
    setConfirmError('');
    setReplacements({});
  }

  // ── Validate before check ──────────────────────────────────
  function validate() {
    if (!form.title.trim())    return 'Event title is required.';
    if (!form.room_id)         return 'Please select a room.';
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
          room_id:    form.room_id,
          date:       form.event_date,
          start_time: form.start_time,
          end_time:   form.end_time,
        }),
        eventAPI.getAvailableRooms({
          date:            form.event_date,
          start_time:      form.start_time,
          end_time:        form.end_time,
          exclude_room_id: form.room_id,
        }),
      ]);

      setCheckResult({
        conflicts:       conflictsRes.data.data.conflicts       || [],
        available_rooms: availableRes.data.data.rooms           || [],
        event_date:      conflictsRes.data.data.event_date,
        weekday:         conflictsRes.data.data.weekday,
        has_conflicts:   conflictsRes.data.data.has_conflicts,
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
      const relocations = (checkResult.conflicts || []).map(c => ({
        section_meeting_id:  c.section_meeting_id,
        section_id:          c.section_id,
        replacement_room_id: replacements[c.section_meeting_id],
      }));

      const res = await eventAPI.create({
        title:       form.title.trim(),
        description: form.description.trim() || undefined,
        room_id:     form.room_id,
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

      // Reset form + preview
      setForm(BLANK_FORM);
      setCheckResult(null);
      setReplacements({});
      setFormError('');
      setConfirmError('');

      // Refresh events list
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

  // ── Derived state ──────────────────────────────────────────
  const selectedRoom = rooms.find(r => r.id === form.room_id);

  const allReplacementsSelected =
    !checkResult?.has_conflicts ||
    (checkResult?.conflicts || []).every(c => replacements[c.section_meeting_id]);

  const canConfirm = checkResult !== null && allReplacementsSelected && !confirming;

  // ──────────────────────────────────────────────────────────
  return (
    <div className="aet-root">

      {/* ── Top: form + result panel side-by-side ── */}
      <div className="aet-top">

        {/* ── Availability form ── */}
        <div className="aet-form-card card">
          <div className="aet-form-title">Book an Event</div>

          {formError && (
            <div className="aet-alert aet-alert--error">{formError}</div>
          )}

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

            <div className="aet-field">
              <label className="aet-label" htmlFor="aet-room">Room *</label>
              <select
                id="aet-room"
                className="aet-input aet-select"
                name="room_id"
                value={form.room_id}
                onChange={handleChange}
                disabled={roomsLoading}
              >
                <option value="">
                  {roomsLoading ? 'Loading rooms…' : '— Select a room —'}
                </option>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.room_number}{r.name ? ` — ${r.name}` : ''}
                    {r.capacity ? ` (${r.capacity} seats)` : ''}
                  </option>
                ))}
              </select>
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
          {checkError && (
            <div className="aet-alert aet-alert--error">{checkError}</div>
          )}

          {!checkResult && !checkError && (
            <div className="aet-result-empty">
              <div className="aet-result-empty__icon">🔍</div>
              <p className="aet-result-empty__text">
                Fill in the form and click <strong>Check Availability</strong> to
                see if the room is free or has lecture conflicts.
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
                      ? `${checkResult.conflicts.length} lecture conflict${checkResult.conflicts.length !== 1 ? 's' : ''} detected`
                      : 'Room is available for this event'}
                  </div>
                  <div className="aet-summary__sub">
                    {selectedRoom?.room_number} · {formatDate(checkResult.event_date)} ·{' '}
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

              {/* ── Conflict cards ── */}
              {checkResult.has_conflicts && (
                <div className="aet-conflicts">
                  {checkResult.conflicts.map((c, i) => (
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

                      {/* Replacement room selector */}
                      <div className="aet-conflict-card__replace">
                        <label className="aet-replace-label">
                          Replacement room *
                        </label>
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
                            onChange={e =>
                              handleReplacementChange(c.section_meeting_id, e.target.value)
                            }
                          >
                            <option value="">— Select replacement room —</option>
                            {checkResult.available_rooms.map(r => (
                              <option key={r.id} value={r.id}>
                                {roomLabel(r)}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

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
                      <span className="aet-confirm-summary__key">Room</span>
                      <span className="aet-confirm-summary__val">
                        {selectedRoom?.room_number}
                        {selectedRoom?.name ? ` — ${selectedRoom.name}` : ''}
                      </span>
                    </div>
                    <div className="aet-confirm-summary__row">
                      <span className="aet-confirm-summary__key">Date</span>
                      <span className="aet-confirm-summary__val">
                        {formatDate(checkResult.event_date)}
                      </span>
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
                          {checkResult.conflicts.length} lecture{checkResult.conflicts.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  {checkResult.has_conflicts && (
                    <div className="aet-confirm-relocations">
                      {checkResult.conflicts.map(c => {
                        const repRoom = checkResult.available_rooms.find(
                          r => r.id === replacements[c.section_meeting_id]
                        );
                        return (
                          <div key={c.section_meeting_id} className="aet-confirm-reloc-row">
                            <span className="aet-confirm-reloc-course">
                              {c.course_code} §{c.section_number}
                            </span>
                            <span className="aet-confirm-reloc-from">
                              {c.original_room_number}
                            </span>
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
                {confirmError && (
                  <div className="aet-alert aet-alert--error">{confirmError}</div>
                )}

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

      {/* ── Cancel confirmation modal ── */}
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
            {cancelError && (
              <div className="aet-alert aet-alert--error">{cancelError}</div>
            )}
            <div className="aet-modal__actions">
              <button
                type="button"
                className="btn btn--secondary aet-modal__btn-keep"
                onClick={() => setCancelTarget(null)}
                disabled={cancelLoading}
              >
                Keep Event
              </button>
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
                    <th>Room</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Created By</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(ev => (
                    <tr key={ev.id}>
                      <td>
                        <div className="aet-event-name">{ev.title}</div>
                        {ev.description && (
                          <div className="aet-event-desc">{ev.description}</div>
                        )}
                      </td>
                      <td>
                        <span className="aet-room-num">{ev.room_number}</span>
                        {ev.room_name && (
                          <span className="aet-room-name"> — {ev.room_name}</span>
                        )}
                      </td>
                      <td>{formatDate(ev.event_date)}</td>
                      <td className="aet-time-cell">
                        {formatTime(ev.start_time)} – {formatTime(ev.end_time)}
                      </td>
                      <td><StatusBadge status={ev.status} /></td>
                      <td className="aet-created-by">{ev.created_by_name}</td>
                      <td className="aet-actions-cell">
                        {ev.status === 'active' && (
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
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="aet-event-cards">
              {events.map(ev => (
                <div key={ev.id} className="aet-event-card">
                  <div className="aet-event-card__top">
                    <div className="aet-event-card__name">{ev.title}</div>
                    <StatusBadge status={ev.status} />
                  </div>
                  {ev.description && (
                    <div className="aet-event-card__desc">{ev.description}</div>
                  )}
                  <div className="aet-event-card__meta">
                    <span>📍 {ev.room_number}{ev.room_name ? ` — ${ev.room_name}` : ''}</span>
                    <span>📅 {formatDate(ev.event_date)}</span>
                    <span>🕐 {formatTime(ev.start_time)} – {formatTime(ev.end_time)}</span>
                    <span>👤 {ev.created_by_name}</span>
                  </div>
                  {ev.status === 'active' && (
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
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
