import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { instructorAPI, roomAPI } from '../../api/index';
import { Spinner } from '../../components/ui/index';
import './AdminDoctorsPage.css';

// ─── Helpers ──────────────────────────────────────────────────

function fullName(doc) {
  return [doc.title, doc.first_name, doc.last_name].filter(Boolean).join(' ') || '—';
}

function officeLabel(doc) {
  if (!doc.office_room_number) return null;
  const parts = [doc.office_room_number];
  if (doc.office_building) parts.push(doc.office_building);
  if (doc.office_floor)    parts.push(doc.office_floor);
  return parts.join(' · ');
}

function isOfficeType(type) {
  const t = String(type || '').toLowerCase().replace(/[\s_]/g, '');
  return t === 'office' || t === 'doctoroffice';
}

function extractError(err) {
  return err?.response?.data?.message || err?.message || 'Request failed.';
}

// ─── Room picker (inline searchable dropdown) ─────────────────

function RoomPicker({ rooms, value, onChange }) {
  const [q, setQ]       = useState('');
  const [open, setOpen] = useState(false);
  const ref             = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = value ? rooms.find(r => r.id === value) : null;
  const label   = current
    ? `${current.room_number}${current.name ? ' — ' + current.name : ''}`
    : '';

  const filtered = q.trim()
    ? rooms.filter(r =>
        (r.room_number || '').toLowerCase().includes(q.toLowerCase()) ||
        (r.name        || '').toLowerCase().includes(q.toLowerCase()) ||
        (r.building_code || '').toLowerCase().includes(q.toLowerCase())
      ).slice(0, 50)
    : rooms.slice(0, 50);

  return (
    <div className="adp-room-picker" ref={ref}>
      <input
        className="adp-input"
        type="text"
        placeholder="Search room…"
        value={open ? q : label}
        onFocus={() => { setOpen(true); setQ(''); }}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        autoComplete="off"
      />
      {value && (
        <button
          type="button"
          className="adp-room-clear"
          onClick={() => { onChange(null); setQ(''); setOpen(false); }}
          title="Clear office assignment"
        >×</button>
      )}
      {open && (
        <div className="adp-room-dropdown">
          {filtered.length === 0 ? (
            <div className="adp-room-empty">No rooms found</div>
          ) : filtered.map(r => (
            <button
              key={r.id}
              type="button"
              className={`adp-room-option${r.id === value ? ' adp-room-option--selected' : ''}`}
              onClick={() => { onChange(r.id); setQ(''); setOpen(false); }}
            >
              <span className="adp-room-num">{r.room_number}</span>
              {r.name && <span className="adp-room-name"> — {r.name}</span>}
              {(r.building_code || r.floor_label) && (
                <span className="adp-room-loc">
                  {' '}· {[r.building_code, r.floor_label].filter(Boolean).join(' ')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Doctor Modal (Add / Edit) ────────────────────────────────

function DoctorModal({ doctor, departments, rooms, onSave, onClose }) {
  const isEdit = !!doctor;
  const [form, setForm] = useState({
    doctor_number:  doctor?.doctor_number  ?? '',
    title:          doctor?.title          ?? '',
    first_name:     doctor?.first_name     ?? '',
    last_name:      doctor?.last_name      ?? '',
    email:          doctor?.email          ?? '',
    department:     doctor?.department     ?? '',
    office_room_id: doctor?.office_room_id ?? null,
    is_active:      doctor?.is_active      ?? true,
  });
  const [saving, setSaving] = useState(false);

  const deptListId = 'adp-dept-list';

  function set(field, value) { setForm(p => ({ ...p, [field]: value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.first_name.trim()) { toast.error('First name is required.'); return; }
    if (!form.last_name.trim())  { toast.error('Last name is required.');  return; }

    setSaving(true);
    try {
      const payload = {
        doctor_number:  form.doctor_number.trim()  || null,
        title:          form.title.trim()          || null,
        first_name:     form.first_name.trim(),
        last_name:      form.last_name.trim(),
        email:          form.email.trim()          || null,
        department:     form.department.trim()     || null,
        office_room_id: form.office_room_id        || null,
      };
      if (isEdit) payload.is_active = form.is_active;

      if (isEdit) {
        await instructorAPI.update(doctor.id, payload);
        toast.success('Doctor updated.');
      } else {
        await instructorAPI.create(payload);
        toast.success('Doctor created.');
      }
      onSave();
    } catch (err) {
      toast.error(extractError(err));
      setSaving(false);
    }
  }

  return (
    <div className="adp-overlay" onClick={onClose}>
      <div className="adp-modal" onClick={e => e.stopPropagation()}>
        <div className="adp-modal__head">
          <span className="adp-modal__title">{isEdit ? 'Edit Doctor' : 'New Doctor'}</span>
          <button className="adp-modal__close" onClick={onClose} type="button">×</button>
        </div>
        <form onSubmit={handleSubmit} className="adp-modal__body">

          {/* Row 1: Doctor # + Title */}
          <div className="adp-form-grid">
            <div>
              <label className="adp-label">Doctor Number</label>
              <input className="adp-input" value={form.doctor_number}
                placeholder="e.g. 12345"
                onChange={e => set('doctor_number', e.target.value)} />
            </div>
            <div>
              <label className="adp-label">Title</label>
              <input className="adp-input" value={form.title}
                placeholder="e.g. Dr., Prof."
                onChange={e => set('title', e.target.value)} />
            </div>
          </div>

          {/* Row 2: First + Last name */}
          <div className="adp-form-grid">
            <div>
              <label className="adp-label">First Name *</label>
              <input className="adp-input" value={form.first_name}
                placeholder="First name" required
                onChange={e => set('first_name', e.target.value)} />
            </div>
            <div>
              <label className="adp-label">Last Name *</label>
              <input className="adp-input" value={form.last_name}
                placeholder="Last name" required
                onChange={e => set('last_name', e.target.value)} />
            </div>
          </div>

          {/* Email */}
          <label className="adp-label">Email</label>
          <input className="adp-input" type="email" value={form.email}
            placeholder="email@example.com"
            onChange={e => set('email', e.target.value)} />

          {/* Department */}
          <label className="adp-label">Department</label>
          <input className="adp-input" list={deptListId} value={form.department}
            placeholder="e.g. Computer Engineering"
            onChange={e => set('department', e.target.value)} />
          <datalist id={deptListId}>
            {departments.map(d => <option key={d.id} value={d.name_en} />)}
          </datalist>

          {/* Office room */}
          <label className="adp-label">Office Room</label>
          <RoomPicker
            rooms={rooms}
            value={form.office_room_id}
            onChange={v => set('office_room_id', v)}
          />

          {/* is_active toggle (edit only) */}
          {isEdit && (
            <label className="adp-checkbox-row">
              <input type="checkbox" checked={form.is_active}
                onChange={e => set('is_active', e.target.checked)} />
              Active
            </label>
          )}

          <div className="adp-modal__actions">
            <button type="button" className="btn btn--secondary adp-sm-btn"
              onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn--primary adp-sm-btn"
              disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Doctor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Confirm modal ────────────────────────────────────────────

function ConfirmModal({ title, body, confirmLabel, danger, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);

  async function handle() {
    setBusy(true);
    try { await onConfirm(); }
    finally { setBusy(false); }
  }

  return (
    <div className="adp-overlay" onClick={onClose}>
      <div className="adp-modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="adp-modal__head">
          <span className="adp-modal__title">{title}</span>
          <button className="adp-modal__close" onClick={onClose} type="button">×</button>
        </div>
        <div className="adp-modal__body">
          <p className="adp-confirm-text">{body}</p>
          <div className="adp-modal__actions">
            <button className="btn btn--secondary adp-sm-btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              className={danger ? 'adp-btn--danger adp-sm-btn' : 'btn btn--primary adp-sm-btn'}
              onClick={handle}
              disabled={busy}
            >
              {busy ? 'Please wait…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────

function StatusBadge({ active }) {
  return (
    <span className={`adp-status ${active ? 'adp-status--active' : 'adp-status--inactive'}`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

// ─── Linked badge ─────────────────────────────────────────────

function LinkedBadge({ linked }) {
  return (
    <span className={`adp-linked ${linked ? 'adp-linked--yes' : 'adp-linked--no'}`}>
      {linked ? 'Linked' : 'No Account'}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────

const PAGE_SIZE = 25;

export default function AdminDoctorsPage() {
  const [doctors,      setDoctors]      = useState([]);
  const [total,        setTotal]        = useState(0);
  const [totalPages,   setTotalPages]   = useState(1);
  const [page,         setPage]         = useState(1);

  const [searchInput,  setSearchInput]  = useState('');
  const [search,       setSearch]       = useState('');
  const [deptFilter,   setDeptFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('active');   // active | inactive | all
  const [officeFilter, setOfficeFilter] = useState('all');      // all | has | no
  const [linkedFilter, setLinkedFilter] = useState('all');      // all | linked | unlinked

  const [loading,      setLoading]      = useState(false);
  const [departments,  setDepartments]  = useState([]);
  const [officeRooms,  setOfficeRooms]  = useState([]);
  const [refreshKey,   setRefreshKey]   = useState(0);

  const [modal,        setModal]        = useState(null);  // null | { mode:'add'|'edit', doctor:obj|null }
  const [confirmDel,   setConfirmDel]   = useState(null);  // doctor obj
  const [confirmDeact, setConfirmDeact] = useState(null);  // doctor obj
  const [linkingId,    setLinkingId]    = useState(null);  // doctor id being linked

  // ── Debounce search input ────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Fetch doctors ─────────────────────────────────────────────
  const loadDoctors = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit:       PAGE_SIZE,
        active_only: statusFilter === 'all' ? 'all' : statusFilter === 'inactive' ? 'false' : 'true',
      };
      if (search)      params.search     = search;
      if (deptFilter)  params.department = deptFilter;
      if (officeFilter === 'has') params.has_office = 'true';
      if (officeFilter === 'no')  params.has_office = 'false';
      if (linkedFilter === 'linked')   params.has_user = 'true';
      if (linkedFilter === 'unlinked') params.has_user = 'false';

      const res = await instructorAPI.getAll(params);
      const d   = res.data?.data || res.data || {};
      setDoctors(d.instructors || []);
      setTotal(d.pagination?.total || 0);
      setTotalPages(d.pagination?.totalPages || 1);
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  }, [page, search, deptFilter, statusFilter, officeFilter, linkedFilter, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadDoctors(); }, [loadDoctors]);

  // ── Fetch departments (for datalist) and office rooms (for picker) ──
  useEffect(() => {
    instructorAPI.getAll({ limit: 500, active_only: 'all' })
      .then(res => {
        const rows = res.data?.data?.instructors || [];
        const seen = new Set();
        const depts = [];
        rows.forEach(r => {
          if (r.department && !seen.has(r.department)) {
            seen.add(r.department);
            depts.push({ id: r.department, name_en: r.department });
          }
        });
        setDepartments(depts);
      })
      .catch(() => {});

    roomAPI.getAll({ limit: 2000, active_only: 'true' })
      .then(res => {
        const all = res?.data?.data?.rooms || res?.data?.rooms || [];
        setOfficeRooms(all.filter(r => isOfficeType(r.type)));
      })
      .catch(() => {});
  }, []);

  // ── Helpers ──────────────────────────────────────────────────
  function refresh() { setRefreshKey(k => k + 1); }

  function handleFilterChange(setter, value) {
    setter(value);
    setPage(1);
  }

  // ── Deactivate ───────────────────────────────────────────────
  async function handleDeactivate(doc) {
    try {
      await instructorAPI.update(doc.id, { is_active: false });
      toast.success(`${fullName(doc)} deactivated.`);
      setConfirmDeact(null);
      refresh();
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  // ── Activate ─────────────────────────────────────────────────
  async function handleActivate(doc) {
    try {
      await instructorAPI.update(doc.id, { is_active: true });
      toast.success(`${fullName(doc)} activated.`);
      refresh();
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  // ── Delete ───────────────────────────────────────────────────
  async function handleDelete(doc) {
    try {
      const res = await instructorAPI.delete(doc.id);
      const msg = res.data?.message || 'Done.';
      toast.success(msg);
      setConfirmDel(null);
      refresh();
    } catch (err) {
      toast.error(extractError(err));
    }
  }

  // ── Link user account ─────────────────────────────────────────
  async function handleLinkUser(doc) {
    setLinkingId(doc.id);
    try {
      const res = await instructorAPI.linkUser(doc.id);
      toast.success(res.data?.message || 'Account linked.');
      refresh();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLinkingId(null);
    }
  }

  // ── Pagination helpers ────────────────────────────────────────
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd   = Math.min(page * PAGE_SIZE, total);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="adp-page">

      {/* Page header */}
      <div className="page-header">
        <h1 className="page-title">Doctors</h1>
        <button
          className="btn btn--primary"
          onClick={() => setModal({ mode: 'add', doctor: null })}
        >
          + New Doctor
        </button>
      </div>

      {/* Controls */}
      <div className="adp-controls">
        <input
          className="adp-search"
          type="text"
          placeholder="Search by name, #number, email, department…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
        />

        <select
          className="adp-select"
          value={deptFilter}
          onChange={e => handleFilterChange(setDeptFilter, e.target.value)}
        >
          <option value="">All Departments</option>
          {departments.map(d => (
            <option key={d.id} value={d.name_en}>{d.name_en}</option>
          ))}
        </select>

        {/* Status filter */}
        <div className="adp-filter-group">
          {[
            { value: 'active',   label: 'Active'   },
            { value: 'inactive', label: 'Inactive' },
            { value: 'all',      label: 'All'      },
          ].map(f => (
            <button
              key={f.value}
              className={`adp-filter-btn${statusFilter === f.value ? ' adp-filter-btn--active' : ''}`}
              onClick={() => handleFilterChange(setStatusFilter, f.value)}
            >{f.label}</button>
          ))}
        </div>

        {/* Office filter */}
        <div className="adp-filter-group">
          {[
            { value: 'all', label: 'All Offices' },
            { value: 'has', label: 'Has Office'  },
            { value: 'no',  label: 'No Office'   },
          ].map(f => (
            <button
              key={f.value}
              className={`adp-filter-btn${officeFilter === f.value ? ' adp-filter-btn--active' : ''}`}
              onClick={() => handleFilterChange(setOfficeFilter, f.value)}
            >{f.label}</button>
          ))}
        </div>

        {/* Linked filter */}
        <div className="adp-filter-group">
          {[
            { value: 'all',      label: 'All Accounts' },
            { value: 'linked',   label: 'Linked'       },
            { value: 'unlinked', label: 'Not Linked'   },
          ].map(f => (
            <button
              key={f.value}
              className={`adp-filter-btn${linkedFilter === f.value ? ' adp-filter-btn--active' : ''}`}
              onClick={() => handleFilterChange(setLinkedFilter, f.value)}
            >{f.label}</button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="adp-stats-bar">
        {loading ? '' : total === 0
          ? 'No doctors found.'
          : `Showing ${rangeStart}–${rangeEnd} of ${total} doctor${total !== 1 ? 's' : ''}`}
      </div>

      {/* Loading spinner */}
      {loading && (
        <div className="adp-center"><Spinner size="md" /></div>
      )}

      {/* Empty state */}
      {!loading && doctors.length === 0 && (
        <div className="adp-empty">
          <div className="adp-empty__icon">👨‍🏫</div>
          <div>No doctors match the current filters.</div>
        </div>
      )}

      {/* Desktop table */}
      {!loading && doctors.length > 0 && (
        <div className="adp-table-wrap">
          <table className="adp-table">
            <thead>
              <tr>
                <th className="adp-col-num">#</th>
                <th>Name</th>
                <th className="adp-col-dept">Department</th>
                <th className="adp-col-office">Office</th>
                <th className="adp-col-linked">Account</th>
                <th className="adp-col-status">Status</th>
                <th className="adp-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {doctors.map(doc => (
                <tr key={doc.id}>
                  <td className="adp-col-num">
                    {doc.doctor_number
                      ? <span className="adp-num">#{doc.doctor_number}</span>
                      : <span className="adp-muted">—</span>}
                  </td>
                  <td>
                    <div className="adp-name">{fullName(doc)}</div>
                    {doc.email && <div className="adp-email">{doc.email}</div>}
                  </td>
                  <td className="adp-col-dept">
                    <span className="adp-dept">{doc.department || <span className="adp-muted">—</span>}</span>
                  </td>
                  <td className="adp-col-office">
                    {officeLabel(doc)
                      ? <span className="adp-office">{officeLabel(doc)}</span>
                      : <span className="adp-muted">—</span>}
                  </td>
                  <td className="adp-col-linked">
                    <LinkedBadge linked={!!doc.user_id} />
                  </td>
                  <td className="adp-col-status">
                    <StatusBadge active={doc.is_active} />
                  </td>
                  <td className="adp-col-actions">
                    <div className="adp-actions">
                      <button
                        className="adp-action-btn"
                        onClick={() => setModal({ mode: 'edit', doctor: doc })}
                      >Edit</button>

                      {!doc.user_id && (
                        <button
                          className="adp-action-btn adp-action-btn--link"
                          disabled={linkingId === doc.id}
                          onClick={() => handleLinkUser(doc)}
                          title="Create / link professor account"
                        >{linkingId === doc.id ? '…' : 'Link Account'}</button>
                      )}

                      {doc.is_active ? (
                        <button
                          className="adp-action-btn adp-action-btn--warn"
                          onClick={() => setConfirmDeact(doc)}
                        >Deactivate</button>
                      ) : (
                        <button
                          className="adp-action-btn"
                          onClick={() => handleActivate(doc)}
                        >Activate</button>
                      )}

                      <button
                        className="adp-action-btn adp-action-btn--danger"
                        onClick={() => setConfirmDel(doc)}
                      >Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      {!loading && doctors.length > 0 && (
        <div className="adp-mob-list">
          {doctors.map(doc => (
            <div key={doc.id} className="card adp-mob-card">
              <div className="adp-mob-card__top">
                <div className="adp-mob-card__id-row">
                  {doc.doctor_number && (
                    <span className="adp-num">#{doc.doctor_number}</span>
                  )}
                  <StatusBadge active={doc.is_active} />
                  <LinkedBadge linked={!!doc.user_id} />
                </div>
              </div>

              <div className="adp-mob-card__name">{fullName(doc)}</div>
              {doc.email     && <div className="adp-mob-card__email">{doc.email}</div>}
              {doc.department && <div className="adp-mob-card__dept">{doc.department}</div>}
              {officeLabel(doc) && (
                <div className="adp-mob-card__office">{officeLabel(doc)}</div>
              )}

              <div className="adp-mob-card__actions">
                <button
                  className="adp-action-btn adp-sm-btn"
                  onClick={() => setModal({ mode: 'edit', doctor: doc })}
                >Edit</button>

                {!doc.user_id && (
                  <button
                    className="adp-action-btn adp-action-btn--link adp-sm-btn"
                    disabled={linkingId === doc.id}
                    onClick={() => handleLinkUser(doc)}
                  >{linkingId === doc.id ? '…' : 'Link Account'}</button>
                )}

                {doc.is_active ? (
                  <button
                    className="adp-action-btn adp-action-btn--warn adp-sm-btn"
                    onClick={() => setConfirmDeact(doc)}
                  >Deactivate</button>
                ) : (
                  <button
                    className="adp-action-btn adp-sm-btn"
                    onClick={() => handleActivate(doc)}
                  >Activate</button>
                )}

                <button
                  className="adp-action-btn adp-action-btn--danger adp-sm-btn"
                  onClick={() => setConfirmDel(doc)}
                >Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="adp-pagination">
          <button
            className="btn btn--secondary adp-sm-btn"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >← Prev</button>
          <span className="adp-pagination__info">Page {page} of {totalPages}</span>
          <button
            className="btn btn--secondary adp-sm-btn"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >Next →</button>
        </div>
      )}

      {/* Add / Edit modal */}
      {modal && (
        <DoctorModal
          doctor={modal.doctor}
          departments={departments}
          rooms={officeRooms}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); refresh(); }}
        />
      )}

      {/* Deactivate confirm */}
      {confirmDeact && (
        <ConfirmModal
          title="Deactivate Doctor"
          body={`Deactivate ${fullName(confirmDeact)}? This will prevent login by doctor number. The linked user account (if any) will not be disabled.`}
          confirmLabel="Deactivate"
          danger
          onConfirm={() => handleDeactivate(confirmDeact)}
          onClose={() => setConfirmDeact(null)}
        />
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <ConfirmModal
          title="Delete Doctor"
          body={`Delete ${fullName(confirmDel)}? If the doctor has teaching data, office hours, or a linked account, they will be deactivated instead of deleted.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDelete(confirmDel)}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}
