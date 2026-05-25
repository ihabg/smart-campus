import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { courseAPI } from '../../api/index';
import { Spinner } from '../../components/ui/index';
import './AdminCoursesPage.css';

// ─── Course Modal (Add / Edit) ─────────────────────────────────

function CourseModal({ course, departments, onSave, onClose }) {
  const isEdit = !!course;
  const [form, setForm] = useState({
    code:         course?.code                            ?? '',
    name:         course?.name                            ?? '',
    name_ar:      course?.name_ar                         ?? '',
    credit_hours: course?.credit_hours != null ? String(course.credit_hours) : '',
    department:   course?.department                      ?? '',
    description:  course?.description                     ?? '',
    is_active:    course?.is_active                       ?? true,
  });
  const [saving, setSaving] = useState(false);

  function set(field, value) { setForm(p => ({ ...p, [field]: value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.code.trim()) { toast.error('Course code is required.'); return; }
    if (!form.name.trim()) { toast.error('English name is required.'); return; }

    const hrs = form.credit_hours !== '' ? Number(form.credit_hours) : null;
    if (form.credit_hours !== '' && (!Number.isFinite(hrs) || hrs <= 0)) {
      toast.error('Credit hours must be a positive number.'); return;
    }

    setSaving(true);
    try {
      const payload = {
        code:        form.code.trim(),
        name:        form.name.trim(),
        name_ar:     form.name_ar.trim()     || null,
        credit_hours: hrs,
        department:  form.department.trim()  || null,
        description: form.description.trim() || null,
      };
      if (isEdit) payload.is_active = form.is_active;

      if (isEdit) {
        await courseAPI.update(course.id, payload);
        toast.success('Course updated.');
      } else {
        await courseAPI.create(payload);
        toast.success('Course created.');
      }
      onSave();
    } catch (err) {
      const msg = err.response?.data?.message || (isEdit ? 'Failed to update course.' : 'Failed to create course.');
      toast.error(msg);
      setSaving(false);
    }
  }

  return (
    <div className="acp-overlay" onClick={onClose}>
      <div className="acp-modal" onClick={e => e.stopPropagation()}>
        <div className="acp-modal__head">
          <span className="acp-modal__title">{isEdit ? 'Edit Course' : 'New Course'}</span>
          <button className="acp-modal__close" onClick={onClose} type="button">×</button>
        </div>
        <form onSubmit={handleSubmit} className="acp-modal__body">
          <div className="acp-form-grid">
            <div>
              <label className="acp-label">Course Code *</label>
              <input className="acp-input" value={form.code} placeholder="e.g. CPE301"
                onChange={e => set('code', e.target.value)} required />
            </div>
            <div>
              <label className="acp-label">Credit Hours</label>
              <input className="acp-input" type="number" min="0.5" max="20" step="0.5"
                value={form.credit_hours} placeholder="e.g. 3"
                onChange={e => set('credit_hours', e.target.value)} />
            </div>
          </div>

          <label className="acp-label">English Name *</label>
          <input className="acp-input" value={form.name} placeholder="Course name in English"
            onChange={e => set('name', e.target.value)} required />

          <label className="acp-label">Arabic Name</label>
          <input className="acp-input" value={form.name_ar}
            placeholder="اسم المادة بالعربية" dir="rtl"
            onChange={e => set('name_ar', e.target.value)} />

          <label className="acp-label">Department</label>
          <input className="acp-input" list="acp-dept-suggestions"
            value={form.department} placeholder="e.g. Computer Engineering"
            onChange={e => set('department', e.target.value)} />
          <datalist id="acp-dept-suggestions">
            {departments.map(d => <option key={d} value={d} />)}
          </datalist>

          <label className="acp-label">Description</label>
          <textarea className="acp-textarea" value={form.description} rows={3}
            placeholder="Optional course description"
            onChange={e => set('description', e.target.value)} />

          {isEdit && (
            <label className="acp-checkbox-row">
              <input type="checkbox" checked={form.is_active}
                onChange={e => set('is_active', e.target.checked)} />
              <span>Active — visible in section creation and study plan picker</span>
            </label>
          )}

          <div className="acp-modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Course')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Confirm Modal ─────────────────────────────────────────────

function ConfirmModal({ title, message, confirmLabel = 'Confirm', danger = true, onConfirm, onClose }) {
  return (
    <div className="acp-overlay" onClick={onClose}>
      <div className="acp-modal" onClick={e => e.stopPropagation()}>
        <div className="acp-modal__head">
          <span className="acp-modal__title">{title}</span>
          <button className="acp-modal__close" onClick={onClose} type="button">×</button>
        </div>
        <div className="acp-modal__body">
          <p className="acp-confirm-text">{message}</p>
          <div className="acp-modal__actions">
            <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button
              className={danger ? 'acp-btn--danger' : 'btn btn--primary'}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Status badge ──────────────────────────────────────────────

function StatusBadge({ active }) {
  return (
    <span className={`acp-status ${active ? 'acp-status--active' : 'acp-status--inactive'}`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

// ─── Main Page ─────────────────────────────────────────────────

const STATUS_OPTS = [
  { value: 'active',   label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'all',      label: 'All' },
];

export default function AdminCoursesPage() {
  const [courses,      setCourses]    = useState([]);
  const [pagination,   setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [page,         setPage]       = useState(1);
  const [searchInput,  setSearchInput] = useState('');
  const [search,       setSearch]     = useState('');   // debounced
  const [deptFilter,   setDeptFilter] = useState('');
  const [statusFilter, setStatus]     = useState('active');
  const [loading,      setLoading]    = useState(true);
  const [depts,        setDepts]      = useState([]);
  const [refreshKey,   setRefreshKey] = useState(0);

  const [modal,        setModal]      = useState(null); // { mode:'add'|'edit', course }
  const [confirmDel,   setConfirmDel] = useState(null);
  const [confirmDeact, setConfirmDeact] = useState(null);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Load department options once (and after mutations that could add new depts)
  const reloadDepts = useCallback(() => {
    courseAPI.getDepartments()
      .then(r => setDepts(r.data?.data?.departments || []))
      .catch(() => {});
  }, []);

  useEffect(() => { reloadDepts(); }, [reloadDepts]);

  // Fetch courses whenever page / filters / refresh trigger changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = { page, limit: 30 };
        if (statusFilter === 'active')        params.active_only = 'true';
        else if (statusFilter === 'inactive') params.active_only = 'false';
        else                                  params.active_only = 'all';
        if (search)     params.search     = search;
        if (deptFilter) params.department = deptFilter;

        const res = await courseAPI.getAll(params);
        if (!cancelled) {
          setCourses(res.data?.data?.courses    || []);
          setPagination(res.data?.data?.pagination || { page, totalPages: 1, total: 0 });
        }
      } catch {
        if (!cancelled) toast.error('Failed to load courses.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [page, search, deptFilter, statusFilter, refreshKey]);

  function refresh() { setRefreshKey(k => k + 1); }

  function handleDeptChange(e) { setDeptFilter(e.target.value); setPage(1); }
  function handleStatusChange(val) { setStatus(val); setPage(1); }

  async function handleDeactivate(course) {
    try {
      await courseAPI.update(course.id, { is_active: false });
      toast.success(`${course.code} deactivated.`);
      setConfirmDeact(null);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to deactivate.');
    }
  }

  async function handleActivate(course) {
    try {
      await courseAPI.update(course.id, { is_active: true });
      toast.success(`${course.code} reactivated.`);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reactivate.');
    }
  }

  async function handleDelete(course) {
    try {
      const res = await courseAPI.delete(course.id);
      toast.success(res.data?.message || 'Course deleted.');
      setConfirmDel(null);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete.');
    }
  }

  function handleModalSaved() {
    setModal(null);
    reloadDepts();
    refresh();
  }

  return (
    <div className="acp-page">

      {/* ── Header ── */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title">Courses</h1>
        <button className="btn btn--primary" onClick={() => setModal({ mode: 'add', course: null })}>
          + New Course
        </button>
      </div>

      {/* ── Controls ── */}
      <div className="acp-controls">
        <input
          className="acp-search"
          placeholder="Search by code, name, or Arabic name…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
        />
        <select className="acp-select" value={deptFilter} onChange={handleDeptChange}>
          <option value="">All Departments</option>
          {depts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <div className="acp-status-filters">
          {STATUS_OPTS.map(o => (
            <button
              key={o.value}
              className={`acp-filter-btn${statusFilter === o.value ? ' acp-filter-btn--active' : ''}`}
              onClick={() => handleStatusChange(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stats line ── */}
      <div className="acp-stats-bar">
        {!loading && `${pagination.total} course${pagination.total !== 1 ? 's' : ''} found`}
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="acp-center"><Spinner /></div>
      ) : courses.length === 0 ? (
        <div className="acp-empty">
          <div className="acp-empty__icon">📖</div>
          <p>No courses match the current filter.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="acp-table-wrap card">
            <table className="acp-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>English Name</th>
                  <th className="acp-col-ar">Arabic Name</th>
                  <th className="acp-col-hrs">Hours</th>
                  <th className="acp-col-dept">Department</th>
                  <th className="acp-col-status">Status</th>
                  <th className="acp-col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {courses.map(c => (
                  <tr key={c.id}>
                    <td><span className="acp-code">{c.code}</span></td>
                    <td>
                      <div className="acp-course-name">{c.name}</div>
                      {c.description && (
                        <div className="acp-course-desc" title={c.description}>
                          {c.description.length > 70
                            ? c.description.slice(0, 70) + '…'
                            : c.description}
                        </div>
                      )}
                    </td>
                    <td className="acp-col-ar">
                      {c.name_ar
                        ? <span dir="rtl" className="acp-name-ar">{c.name_ar}</span>
                        : <span className="acp-muted">—</span>}
                    </td>
                    <td className="acp-col-hrs">
                      <span className="acp-mono">
                        {c.credit_hours != null ? c.credit_hours : <span className="acp-muted">—</span>}
                      </span>
                    </td>
                    <td className="acp-col-dept">
                      {c.department || <span className="acp-muted">—</span>}
                    </td>
                    <td className="acp-col-status">
                      <StatusBadge active={c.is_active} />
                    </td>
                    <td className="acp-col-actions">
                      <div className="acp-actions">
                        <button className="acp-action-btn"
                          onClick={() => setModal({ mode: 'edit', course: c })}>
                          Edit
                        </button>
                        {c.is_active ? (
                          <button className="acp-action-btn acp-action-btn--warn"
                            onClick={() => setConfirmDeact(c)}>
                            Deactivate
                          </button>
                        ) : (
                          <button className="acp-action-btn"
                            onClick={() => handleActivate(c)}>
                            Reactivate
                          </button>
                        )}
                        <button className="acp-action-btn acp-action-btn--danger"
                          onClick={() => setConfirmDel(c)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="acp-mob-list">
            {courses.map(c => (
              <div key={c.id} className="acp-mob-card card">
                <div className="acp-mob-card__top">
                  <div className="acp-mob-card__id-row">
                    <span className="acp-code">{c.code}</span>
                    {c.credit_hours != null && (
                      <span className="acp-mob-hrs">{c.credit_hours}h</span>
                    )}
                  </div>
                  <StatusBadge active={c.is_active} />
                </div>
                <div className="acp-mob-card__name">{c.name}</div>
                {c.name_ar && (
                  <div className="acp-mob-card__name-ar" dir="rtl">{c.name_ar}</div>
                )}
                {c.department && (
                  <div className="acp-mob-card__dept">{c.department}</div>
                )}
                <div className="acp-mob-card__actions">
                  <button className="btn btn--ghost acp-sm-btn"
                    onClick={() => setModal({ mode: 'edit', course: c })}>
                    Edit
                  </button>
                  {c.is_active ? (
                    <button className="acp-action-btn acp-action-btn--warn acp-sm-btn"
                      onClick={() => setConfirmDeact(c)}>
                      Deactivate
                    </button>
                  ) : (
                    <button className="btn btn--ghost acp-sm-btn"
                      onClick={() => handleActivate(c)}>
                      Reactivate
                    </button>
                  )}
                  <button className="acp-btn--danger acp-sm-btn"
                    onClick={() => setConfirmDel(c)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="acp-pagination">
              <button className="btn btn--ghost acp-sm-btn"
                disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                ← Prev
              </button>
              <span className="acp-pagination__info">
                Page {page} of {pagination.totalPages}
              </span>
              <button className="btn btn--ghost acp-sm-btn"
                disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Modals ── */}

      {modal && (
        <CourseModal
          course={modal.course}
          departments={depts}
          onSave={handleModalSaved}
          onClose={() => setModal(null)}
        />
      )}

      {confirmDeact && (
        <ConfirmModal
          title="Deactivate Course"
          message={`Deactivate "${confirmDeact.code} — ${confirmDeact.name}"? It will no longer appear in section creation or the study plan course picker. Existing sections and study plan entries are not affected.`}
          confirmLabel="Deactivate"
          danger={false}
          onConfirm={() => handleDeactivate(confirmDeact)}
          onClose={() => setConfirmDeact(null)}
        />
      )}

      {confirmDel && (
        <ConfirmModal
          title="Delete Course"
          message={`Delete "${confirmDel.code} — ${confirmDel.name}"? If this course is referenced by sections or study plans it will be deactivated instead. If unreferenced, it will be permanently removed.`}
          confirmLabel="Delete"
          danger={true}
          onConfirm={() => handleDelete(confirmDel)}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}
