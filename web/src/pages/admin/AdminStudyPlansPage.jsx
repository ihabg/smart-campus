import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { studyPlanAPI } from '../../api/index';
import { Spinner } from '../../components/ui/index';
import './AdminStudyPlansPage.css';

// ─── Constants ────────────────────────────────────────────────

const CATEGORIES = ['required', 'elective', 'general'];
const SEMESTERS  = ['fall', 'spring', 'summer'];
const YEARS      = [1, 2, 3, 4, 5, 6];

const CAT_META = {
  required: { label: 'Required', cls: 'spm-cat--required' },
  elective: { label: 'Elective', cls: 'spm-cat--elective' },
  general:  { label: 'General',  cls: 'spm-cat--general'  },
};

function CategoryBadge({ cat }) {
  const m = CAT_META[cat] || { label: cat, cls: '' };
  return <span className={`spm-cat ${m.cls}`}>{m.label}</span>;
}

// ─── New Plan Modal ────────────────────────────────────────────

function NewPlanModal({ departments, onSave, onClose }) {
  const [form, setForm] = useState({
    department_id: '',
    plan_year:     new Date().getFullYear(),
    label:         '',
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.department_id) { toast.error('Select a department.'); return; }
    setSaving(true);
    try {
      const res = await studyPlanAPI.create({
        department_id: form.department_id,
        plan_year:     Number(form.plan_year),
        label:         form.label || undefined,
      });
      onSave(res.data.data, form.department_id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create plan.');
      setSaving(false);
    }
  }

  return (
    <div className="spm-overlay" onClick={onClose}>
      <div className="spm-modal" onClick={e => e.stopPropagation()}>
        <div className="spm-modal__head">
          <span className="spm-modal__title">New Study Plan</span>
          <button className="spm-modal__close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="spm-modal__body">
          <label className="spm-label">Department *</label>
          <select
            className="spm-select"
            value={form.department_id}
            onChange={e => setForm(p => ({ ...p, department_id: e.target.value }))}
            required
          >
            <option value="">Select department…</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name_en}</option>
            ))}
          </select>

          <label className="spm-label">Batch Year *</label>
          <input
            className="spm-input"
            type="number"
            min="2000"
            max="2100"
            value={form.plan_year}
            onChange={e => setForm(p => ({ ...p, plan_year: e.target.value }))}
            required
          />

          <label className="spm-label">Label (optional)</label>
          <input
            className="spm-input"
            placeholder="e.g. Revised 2024 Plan"
            value={form.label}
            onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
          />

          <div className="spm-modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add Course Modal ──────────────────────────────────────────

function AddCourseModal({ planId, onSave, onClose }) {
  const [q,        setQ]        = useState('');
  const [avail,    setAvail]    = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({
    category:             'required',
    recommended_year:     '',
    recommended_semester: '',
    is_required:          true,
    sort_order:           0,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await studyPlanAPI.getAvailableCourses(planId, { q });
        setAvail(res.data?.data || []);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [q, planId]);

  async function handleAdd() {
    if (!selected) { toast.error('Select a course first.'); return; }
    setSaving(true);
    try {
      await studyPlanAPI.addCourse(planId, {
        course_id:            selected.id,
        category:             form.category,
        recommended_year:     form.recommended_year     ? Number(form.recommended_year)  : null,
        recommended_semester: form.recommended_semester || null,
        is_required:          form.is_required,
        sort_order:           Number(form.sort_order) || 0,
      });
      onSave();
      toast.success('Course added to plan.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add course.');
      setSaving(false);
    }
  }

  return (
    <div className="spm-overlay" onClick={onClose}>
      <div className="spm-modal spm-modal--wide" onClick={e => e.stopPropagation()}>
        <div className="spm-modal__head">
          <span className="spm-modal__title">Add Course to Plan</span>
          <button className="spm-modal__close" onClick={onClose}>×</button>
        </div>
        <div className="spm-modal__body">
          {!selected ? (
            <>
              <label className="spm-label">Search courses</label>
              <input
                className="spm-input"
                placeholder="Course code or name…"
                value={q}
                onChange={e => setQ(e.target.value)}
                autoFocus
              />
              <div className="spm-avail-list">
                {avail.length === 0 ? (
                  <div className="spm-avail-list__empty">
                    {q ? 'No matching courses.' : 'Start typing to search…'}
                  </div>
                ) : avail.map(c => (
                  <button key={c.id} className="spm-avail-item" onClick={() => setSelected(c)}>
                    <span className="spm-avail-item__code">{c.code}</span>
                    <span className="spm-avail-item__name">{c.name}</span>
                    <span className="spm-avail-item__hrs">{c.credit_hours}h</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="spm-selected-course">
                <div>
                  <span className="spm-avail-item__code">{selected.code}</span>
                  <span className="spm-avail-item__name"> {selected.name}</span>
                </div>
                <button className="spm-link-btn" onClick={() => setSelected(null)}>Change</button>
              </div>

              <div className="spm-form-grid">
                <div>
                  <label className="spm-label">Category</label>
                  <select className="spm-select" value={form.category}
                    onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="spm-label">Rec. Year</label>
                  <select className="spm-select" value={form.recommended_year}
                    onChange={e => setForm(p => ({ ...p, recommended_year: e.target.value }))}>
                    <option value="">—</option>
                    {YEARS.map(y => <option key={y} value={y}>Year {y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="spm-label">Rec. Semester</label>
                  <select className="spm-select" value={form.recommended_semester}
                    onChange={e => setForm(p => ({ ...p, recommended_semester: e.target.value }))}>
                    <option value="">—</option>
                    {SEMESTERS.map(s => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="spm-label">Sort Order</label>
                  <input className="spm-input" type="number" value={form.sort_order}
                    onChange={e => setForm(p => ({ ...p, sort_order: e.target.value }))} />
                </div>
              </div>

              <label className="spm-checkbox-row">
                <input type="checkbox" checked={form.is_required}
                  onChange={e => setForm(p => ({ ...p, is_required: e.target.checked }))} />
                <span>Required course</span>
              </label>

              <div className="spm-modal__actions">
                <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
                <button className="btn btn--primary" onClick={handleAdd} disabled={saving}>
                  {saving ? 'Adding…' : 'Add Course'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Edit Course Modal ─────────────────────────────────────────

function EditCourseModal({ planId, course, onSave, onClose }) {
  const [form, setForm] = useState({
    category:             course.category             || 'required',
    recommended_year:     course.recommended_year     ?? '',
    recommended_semester: course.recommended_semester || '',
    is_required:          course.is_required          ?? true,
    sort_order:           course.sort_order           ?? 0,
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await studyPlanAPI.updateCourse(planId, course.course_id, {
        category:             form.category,
        recommended_year:     form.recommended_year     ? Number(form.recommended_year)  : null,
        recommended_semester: form.recommended_semester || null,
        is_required:          form.is_required,
        sort_order:           Number(form.sort_order) || 0,
      });
      onSave();
      toast.success('Course updated.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update course.');
      setSaving(false);
    }
  }

  return (
    <div className="spm-overlay" onClick={onClose}>
      <div className="spm-modal" onClick={e => e.stopPropagation()}>
        <div className="spm-modal__head">
          <span className="spm-modal__title">Edit Course Placement</span>
          <button className="spm-modal__close" onClick={onClose}>×</button>
        </div>
        <div className="spm-modal__body">
          <div className="spm-selected-course">
            <span className="spm-avail-item__code">{course.course_code}</span>
            <span className="spm-avail-item__name"> {course.course_name}</span>
          </div>

          <div className="spm-form-grid">
            <div>
              <label className="spm-label">Category</label>
              <select className="spm-select" value={form.category}
                onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="spm-label">Rec. Year</label>
              <select className="spm-select" value={form.recommended_year}
                onChange={e => setForm(p => ({ ...p, recommended_year: e.target.value }))}>
                <option value="">—</option>
                {YEARS.map(y => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </div>
            <div>
              <label className="spm-label">Rec. Semester</label>
              <select className="spm-select" value={form.recommended_semester}
                onChange={e => setForm(p => ({ ...p, recommended_semester: e.target.value }))}>
                <option value="">—</option>
                {SEMESTERS.map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="spm-label">Sort Order</label>
              <input className="spm-input" type="number" value={form.sort_order}
                onChange={e => setForm(p => ({ ...p, sort_order: e.target.value }))} />
            </div>
          </div>

          <label className="spm-checkbox-row">
            <input type="checkbox" checked={form.is_required}
              onChange={e => setForm(p => ({ ...p, is_required: e.target.checked }))} />
            <span>Required course</span>
          </label>

          <div className="spm-modal__actions">
            <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Modal ─────────────────────────────────────────────

function ConfirmModal({ title, message, onConfirm, onClose, danger = true }) {
  return (
    <div className="spm-overlay" onClick={onClose}>
      <div className="spm-modal" onClick={e => e.stopPropagation()}>
        <div className="spm-modal__head">
          <span className="spm-modal__title">{title}</span>
          <button className="spm-modal__close" onClick={onClose}>×</button>
        </div>
        <div className="spm-modal__body">
          <p className="spm-confirm-text">{message}</p>
          <div className="spm-modal__actions">
            <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button className={`btn ${danger ? 'spm-btn--danger' : 'btn--primary'}`} onClick={onConfirm}>
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────

export default function AdminStudyPlansPage() {
  const [plans,       setPlans]    = useState([]);
  const [departments, setDepts]    = useState([]);
  const [loading,     setLoading]  = useState(true);
  const [selectedId,  setSelected] = useState(null);
  const [detail,      setDetail]   = useState(null);
  const [detailLoad,  setDL]       = useState(false);
  const [courseQ,     setCourseQ]  = useState('');
  const [catFilter,   setCatF]     = useState('all');

  const [showNewPlan,   setShowNew]     = useState(false);
  const [showAddCourse, setShowAdd]     = useState(false);
  const [editCourse,    setEditCourse]  = useState(null);
  const [delPlan,       setDelPlan]     = useState(false);
  const [delCourse,     setDelCourse]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, dr] = await Promise.all([studyPlanAPI.list(), studyPlanAPI.getDepartments()]);
      setPlans(pr.data?.data || []);
      setDepts(dr.data?.data || []);
    } catch {
      toast.error('Failed to load study plans.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadDetail = useCallback(async (id) => {
    setDL(true);
    setDetail(null);
    try {
      const res = await studyPlanAPI.getById(id);
      setDetail(res.data?.data || null);
    } catch {
      toast.error('Failed to load plan detail.');
    } finally {
      setDL(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else { setDetail(null); }
  }, [selectedId, loadDetail]);

  async function handleDeletePlan() {
    try {
      await studyPlanAPI.delete(selectedId);
      setPlans(p => p.filter(pl => pl.id !== selectedId));
      setSelected(null);
      setDelPlan(false);
      toast.success('Study plan deleted.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete plan.');
    }
  }

  async function handleDeleteCourse(courseId) {
    try {
      await studyPlanAPI.removeCourse(selectedId, courseId);
      setDetail(d => ({ ...d, courses: d.courses.filter(c => c.course_id !== courseId) }));
      setDelCourse(null);
      // Also update course_count in plans list
      setPlans(p => p.map(pl => pl.id === selectedId
        ? { ...pl, course_count: pl.course_count - 1 }
        : pl
      ));
      toast.success('Course removed from plan.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove course.');
    }
  }

  // Filter courses in the detail view
  const filteredCourses = (detail?.courses || []).filter(c => {
    if (catFilter !== 'all' && c.category !== catFilter) return false;
    if (courseQ) {
      const q = courseQ.toLowerCase();
      return c.course_code.toLowerCase().includes(q) || c.course_name.toLowerCase().includes(q);
    }
    return true;
  });

  // Group filtered courses by recommended_year (nulls at end)
  const yearMap = new Map();
  for (const c of filteredCourses) {
    const key = c.recommended_year ?? 0;
    if (!yearMap.has(key)) yearMap.set(key, []);
    yearMap.get(key).push(c);
  }
  const yearKeys = [...yearMap.keys()].sort((a, b) => a === 0 ? 1 : b === 0 ? -1 : a - b);

  const selectedPlan = plans.find(p => p.id === selectedId);

  return (
    <div className="spm-page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 className="page-title">Study Plans</h1>
        <button className="btn btn--primary" onClick={() => setShowNew(true)}>+ New Plan</button>
      </div>

      {loading ? (
        <div className="spm-center"><Spinner /></div>
      ) : (
        <div className="spm-layout">

          {/* ── Left: plan list ── */}
          <div className="spm-plans-panel card">
            {plans.length === 0 ? (
              <div className="spm-empty-msg">No study plans yet.<br />Click "+ New Plan" to create one.</div>
            ) : plans.map(p => (
              <button
                key={p.id}
                className={`spm-plan-item${selectedId === p.id ? ' spm-plan-item--active' : ''}`}
                onClick={() => setSelected(p.id)}
              >
                <div className="spm-plan-item__dept">{p.department_name}</div>
                <div className="spm-plan-item__row">
                  <span className="spm-plan-item__year">Batch {p.plan_year}</span>
                  <span className="spm-plan-item__count">{p.course_count} course{p.course_count !== 1 ? 's' : ''}</span>
                </div>
                {p.label && <div className="spm-plan-item__label">{p.label}</div>}
              </button>
            ))}
          </div>

          {/* ── Right: plan detail ── */}
          <div className="spm-detail-panel">
            {!selectedId && (
              <div className="spm-detail-empty card">
                <div className="spm-detail-empty__icon">📋</div>
                <p>Select a study plan from the list, or create a new one.</p>
              </div>
            )}

            {selectedId && detailLoad && (
              <div className="spm-center"><Spinner /></div>
            )}

            {selectedId && !detailLoad && detail && (
              <>
                {/* Plan header */}
                <div className="spm-detail-head card">
                  <div className="spm-detail-head__info">
                    <div className="spm-detail-head__title">
                      {detail.plan.department_name} — Batch {detail.plan.plan_year}
                    </div>
                    {detail.plan.label && (
                      <div className="spm-detail-head__sub">{detail.plan.label}</div>
                    )}
                    <div className="spm-detail-head__count">
                      {detail.courses.length} course{detail.courses.length !== 1 ? 's' : ''} in plan
                    </div>
                  </div>
                  <button className="spm-btn--danger" onClick={() => setDelPlan(true)}>
                    Delete Plan
                  </button>
                </div>

                {/* Controls */}
                <div className="spm-detail-controls">
                  <input
                    className="spm-input spm-detail-search"
                    placeholder="Search by code or name…"
                    value={courseQ}
                    onChange={e => setCourseQ(e.target.value)}
                  />
                  <select className="spm-select" value={catFilter} onChange={e => setCatF(e.target.value)}>
                    <option value="all">All Categories</option>
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                    ))}
                  </select>
                  <button className="btn btn--primary" onClick={() => setShowAdd(true)}>+ Add Course</button>
                </div>

                {/* Empty states */}
                {detail.courses.length === 0 && (
                  <div className="card spm-empty-msg" style={{ padding: '32px 24px', textAlign: 'center' }}>
                    No courses in this plan yet. Click "+ Add Course" to start.
                  </div>
                )}
                {detail.courses.length > 0 && filteredCourses.length === 0 && (
                  <div className="card spm-empty-msg" style={{ padding: '24px', textAlign: 'center' }}>
                    No courses match the current filter.
                  </div>
                )}

                {/* Year groups */}
                {yearKeys.map(year => (
                  <div key={year} className="spm-year-group">
                    <div className="spm-year-head">
                      <span>{year === 0 ? 'Unassigned Year' : `Year ${year}`}</span>
                      <span className="spm-year-head__count">
                        {yearMap.get(year).length} course{yearMap.get(year).length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Desktop table */}
                    <div className="spm-table-wrap">
                      <table className="spm-table">
                        <thead>
                          <tr>
                            <th>Code</th>
                            <th>Course</th>
                            <th style={{ textAlign: 'center' }}>Hours</th>
                            <th style={{ textAlign: 'center' }}>Category</th>
                            <th style={{ textAlign: 'center' }}>Semester</th>
                            <th style={{ textAlign: 'center' }}>Required</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {yearMap.get(year).map(c => (
                            <tr key={c.course_id}>
                              <td><span className="spm-code">{c.course_code}</span></td>
                              <td>
                                <div className="spm-course-name">{c.course_name}</div>
                                {c.course_name_ar && (
                                  <div className="spm-course-name-ar">{c.course_name_ar}</div>
                                )}
                              </td>
                              <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{c.credit_hours}</td>
                              <td style={{ textAlign: 'center' }}><CategoryBadge cat={c.category} /></td>
                              <td style={{ textAlign: 'center', textTransform: 'capitalize', color: 'var(--text-muted)', fontSize: 12 }}>
                                {c.recommended_semester || '—'}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span className={`spm-req ${c.is_required ? 'spm-req--yes' : 'spm-req--no'}`}>
                                  {c.is_required ? 'Yes' : 'No'}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <button className="spm-icon-btn" title="Edit" onClick={() => setEditCourse(c)}>✏️</button>
                                <button className="spm-icon-btn spm-icon-btn--danger" title="Remove"
                                  onClick={() => setDelCourse(c)}>✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="spm-mob-cards">
                      {yearMap.get(year).map(c => (
                        <div key={c.course_id} className="spm-mob-card">
                          <div className="spm-mob-card__top">
                            <div>
                              <span className="spm-code">{c.course_code}</span>
                              <div className="spm-course-name">{c.course_name}</div>
                            </div>
                            <CategoryBadge cat={c.category} />
                          </div>
                          <div className="spm-mob-card__meta">
                            <span>{c.credit_hours} hrs</span>
                            {c.recommended_semester && (
                              <span style={{ textTransform: 'capitalize' }}>{c.recommended_semester}</span>
                            )}
                            <span className={`spm-req ${c.is_required ? 'spm-req--yes' : 'spm-req--no'}`}>
                              {c.is_required ? 'Required' : 'Optional'}
                            </span>
                          </div>
                          <div className="spm-mob-card__actions">
                            <button className="btn btn--ghost spm-sm-btn" onClick={() => setEditCourse(c)}>Edit</button>
                            <button className="spm-btn--danger spm-sm-btn" onClick={() => setDelCourse(c)}>Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Modals ── */}

      {showNewPlan && (
        <NewPlanModal
          departments={departments}
          onSave={(plan, deptId) => {
            const deptName = departments.find(d => d.id === deptId)?.name_en || '';
            setPlans(p => [...p, { ...plan, course_count: 0, department_name: deptName }]);
            setSelected(plan.id);
            setShowNew(false);
            toast.success('Study plan created.');
          }}
          onClose={() => setShowNew(false)}
        />
      )}

      {showAddCourse && selectedId && (
        <AddCourseModal
          planId={selectedId}
          onSave={() => {
            setShowAdd(false);
            loadDetail(selectedId);
            setPlans(p => p.map(pl => pl.id === selectedId
              ? { ...pl, course_count: pl.course_count + 1 }
              : pl
            ));
          }}
          onClose={() => setShowAdd(false)}
        />
      )}

      {editCourse && selectedId && (
        <EditCourseModal
          planId={selectedId}
          course={editCourse}
          onSave={() => {
            setEditCourse(null);
            loadDetail(selectedId);
          }}
          onClose={() => setEditCourse(null)}
        />
      )}

      {delPlan && (
        <ConfirmModal
          title="Delete Study Plan"
          message={`Delete "${selectedPlan?.department_name} — Batch ${selectedPlan?.plan_year}"? This will remove all ${selectedPlan?.course_count} course entries and cannot be undone.`}
          onConfirm={handleDeletePlan}
          onClose={() => setDelPlan(false)}
        />
      )}

      {delCourse && (
        <ConfirmModal
          title="Remove Course"
          message={`Remove ${delCourse.course_code} — ${delCourse.course_name} from this plan?`}
          onConfirm={() => handleDeleteCourse(delCourse.course_id)}
          onClose={() => setDelCourse(null)}
        />
      )}
    </div>
  );
}
