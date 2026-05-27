import React, { useState, useRef, useEffect, useCallback } from 'react';
import { activityLogAPI } from '../../api/index';
import {
  Button, Modal, Badge, Spinner, EyeIcon,
} from '../../components/ui/index';
import { timeAgo, formatDateTime, getErrorMessage } from '../../utils/helpers';
import toast from 'react-hot-toast';
import './AdminActivityLogPage.css';

// ─── Constants ────────────────────────────────────────────────
const ACTION_OPTIONS = [
  { value: '',                          label: 'All Actions' },
  { value: 'user.create_student',       label: 'Create Student' },
  { value: 'user.update',               label: 'Update User' },
  { value: 'user.delete',               label: 'Delete User' },
  { value: 'announcement.create',       label: 'Create Announcement' },
  { value: 'announcement.update',       label: 'Update Announcement' },
  { value: 'announcement.delete',       label: 'Delete Announcement' },
  { value: 'registration.period_update',label: 'Update Registration Period' },
  { value: 'event.create',              label: 'Create Event' },
  { value: 'event.cancel',              label: 'Cancel Event' },
  { value: 'enrollment.add',            label: 'Enroll Student' },
  { value: 'enrollment.remove',         label: 'Remove Enrollment' },
  { value: 'prerequisite.add',          label: 'Add Prerequisite' },
  { value: 'prerequisite.remove',       label: 'Remove Prerequisite' },
  { value: 'study_plan.add_course',     label: 'Add Course to Plan' },
  { value: 'study_plan.remove_course',  label: 'Remove Course from Plan' },
  { value: 'study_plan.upsert_requirement', label: 'Update Plan Requirement' },
];

const ENTITY_OPTIONS = [
  { value: '',            label: 'All Types' },
  { value: 'user',        label: 'User' },
  { value: 'announcement',label: 'Announcement' },
  { value: 'semester',    label: 'Semester' },
  { value: 'event',       label: 'Event' },
  { value: 'enrollment',  label: 'Enrollment' },
  { value: 'prerequisite',label: 'Prerequisite' },
  { value: 'study_plan',  label: 'Study Plan' },
];

// ─── Helpers ──────────────────────────────────────────────────
function getActionColor(action = '') {
  const prefix = action.split('.')[0];
  const map = {
    user:          { bg: '#dbeafe', color: '#1d4ed8' },
    announcement:  { bg: '#fef3c7', color: '#92400e' },
    registration:  { bg: '#d1fae5', color: '#065f46' },
    event:         { bg: '#f3e8ff', color: '#6b21a8' },
    enrollment:    { bg: '#ccfbf1', color: '#115e59' },
    prerequisite:  { bg: '#ffedd5', color: '#9a3412' },
    study_plan:    { bg: '#e0e7ff', color: '#3730a3' },
  };
  return map[prefix] || { bg: '#f1f5f9', color: '#475569' };
}

function getEntityBadgeVariant(entityType = '') {
  const map = {
    user:          'blue',
    announcement:  'amber',
    semester:      'green',
    event:         'purple',
    enrollment:    'gray',
    prerequisite:  'orange',
    study_plan:    'indigo',
  };
  return map[entityType] || 'gray';
}

function ActionBadge({ action }) {
  const { bg, color } = getActionColor(action);
  const label = ACTION_OPTIONS.find(o => o.value === action)?.label || action;
  return (
    <span className="al-action-badge" style={{ background: bg, color }}>
      {label}
    </span>
  );
}

function MetadataBlock({ data }) {
  if (!data || Object.keys(data).length === 0) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No metadata.</p>;
  }

  // If before/after exist, show as a diff table
  if (data.before && data.after) {
    const keys = Array.from(new Set([
      ...Object.keys(data.before),
      ...Object.keys(data.after),
    ]));
    return (
      <div>
        <table className="al-diff-table">
          <thead>
            <tr><th>Field</th><th>Before</th><th>After</th></tr>
          </thead>
          <tbody>
            {keys.map(k => (
              <tr key={k}
                className={String(data.before[k]) !== String(data.after[k]) ? 'al-diff-table__changed' : ''}>
                <td>{k}</td>
                <td>{data.before[k] != null ? String(data.before[k]) : '—'}</td>
                <td>{data.after[k]  != null ? String(data.after[k])  : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Other top-level fields */}
        {Object.entries(data).filter(([k]) => k !== 'before' && k !== 'after').length > 0 && (
          <pre className="al-meta-pre">
            {JSON.stringify(
              Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'before' && k !== 'after')),
              null, 2
            )}
          </pre>
        )}
      </div>
    );
  }

  return (
    <pre className="al-meta-pre">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

// ─── Stat card ────────────────────────────────────────────────
function StatCard({ value, label, accent }) {
  return (
    <div className="al-stat-card" style={{ '--al-accent': accent }}>
      <div className="al-stat-value">{value?.toLocaleString() ?? '—'}</div>
      <div className="al-stat-label">{label}</div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────
export default function AdminActivityLogPage() {
  const [page, setPage]           = useState(1);
  const [searchRaw, setSearchRaw] = useState('');
  const [filters, setFilters]     = useState({
    search: '', action: '', entity_type: '', date_from: '', date_to: '',
  });
  const [detail, setDetail]       = useState(null);
  const [logs, setLogs]           = useState([]);
  const [pagination, setPagination] = useState(null);
  const [summary, setSummary]     = useState({});
  const [loading, setLoading]     = useState(true);

  const searchTimer = useRef(null);

  // Debounce search input
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setFilters(f => ({ ...f, search: searchRaw }));
      setPage(1);
    }, 400);
    return () => clearTimeout(searchTimer.current);
  }, [searchRaw]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filters.search)      params.search      = filters.search;
      if (filters.action)      params.action      = filters.action;
      if (filters.entity_type) params.entity_type = filters.entity_type;
      if (filters.date_from)   params.date_from   = filters.date_from;
      if (filters.date_to)     params.date_to     = filters.date_to;

      const res  = await activityLogAPI.getAll(params);
      const data = res.data?.data || {};
      setLogs(data.logs || []);
      setPagination(data.pagination || null);
      setSummary(data.summary || {});
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load activity logs'));
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const clearFilters = () => {
    setSearchRaw('');
    setFilters({ search: '', action: '', entity_type: '', date_from: '', date_to: '' });
    setPage(1);
  };

  const hasFilters = searchRaw || filters.action || filters.entity_type || filters.date_from || filters.date_to;

  // ── Table columns ──────────────────────────────────────────
  const columns = [
    {
      key: 'created_at',
      label: 'Time',
      render: v => (
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{timeAgo(v)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDateTime(v)}</div>
        </div>
      ),
    },
    {
      key: 'actor_name',
      label: 'Actor',
      render: (v, r) => (
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{v || '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{r.actor_role || ''}</div>
        </div>
      ),
    },
    {
      key: 'action',
      label: 'Action',
      render: v => <ActionBadge action={v} />,
    },
    {
      key: 'entity_label',
      label: 'Entity',
      render: (v, r) => (
        <div>
          <div style={{ fontSize: 13 }}>{v || '—'}</div>
          {r.entity_type && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize', marginTop: 2 }}>
              {r.entity_type}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'description',
      label: 'Description',
      render: v => (
        <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4, display: 'block', maxWidth: 320 }}>
          {v || '—'}
        </span>
      ),
    },
    {
      key: '_actions',
      label: '',
      render: (_, r) => (
        <button
          className="btn btn--ghost btn--sm btn--icon"
          onClick={() => setDetail(r)}
          title="View details"
        >
          <EyeIcon />
        </button>
      ),
    },
  ];

  return (
    <div className="al-page">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Activity Log</h1>
          <p className="page-sub">Track admin and system changes across Smart Campus</p>
        </div>
        <Button variant="secondary" onClick={loadLogs} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </div>

      {/* Stat cards */}
      <div className="al-stats">
        <StatCard value={summary.total}            label="Total Logs"        accent="var(--navy)" />
        <StatCard value={summary.total_today}      label="Today's Actions"   accent="var(--amber, #f59e0b)" />
        <StatCard value={summary.user_changes}     label="User Changes"      accent="#3b82f6" />
        <StatCard value={summary.academic_changes} label="Academic Changes"  accent="#10b981" />
        <StatCard value={summary.event_changes}    label="Event Changes"     accent="#8b5cf6" />
      </div>

      {/* Filters */}
      <div className="card al-filter-card">
        <div className="al-filter-row">
          <div className="al-filter-search">
            <input
              className="form-input"
              type="text"
              placeholder="Search actor, entity, description…"
              value={searchRaw}
              onChange={e => setSearchRaw(e.target.value)}
            />
          </div>
          <select
            className="form-input al-filter-select"
            value={filters.action}
            onChange={e => { setFilters(f => ({ ...f, action: e.target.value })); setPage(1); }}
          >
            {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            className="form-input al-filter-select"
            value={filters.entity_type}
            onChange={e => { setFilters(f => ({ ...f, entity_type: e.target.value })); setPage(1); }}
          >
            {ENTITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className="al-filter-dates">
            <input
              className="form-input"
              type="datetime-local"
              title="From date"
              value={filters.date_from}
              onChange={e => { setFilters(f => ({ ...f, date_from: e.target.value })); setPage(1); }}
            />
            <input
              className="form-input"
              type="datetime-local"
              title="To date"
              value={filters.date_to}
              onChange={e => { setFilters(f => ({ ...f, date_to: e.target.value })); setPage(1); }}
            />
          </div>
          {hasFilters && (
            <Button variant="secondary" onClick={clearFilters} style={{ whiteSpace: 'nowrap' }}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Table — desktop/tablet */}
      <div className="card card--no-pad al-table-view">
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}><Spinner /></div>
        ) : logs.length === 0 ? (
          <div className="al-empty">
            <span>📋</span>
            <p>No activity logs found.</p>
            {hasFilters && <p style={{ fontSize: 12 }}>Try clearing the filters.</p>}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  {columns.map(col => (
                    <th key={col.key} className="table__th">{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="table__row">
                    {columns.map(col => (
                      <td key={col.key} className="table__td">
                        {col.render
                          ? col.render(log[col.key], log)
                          : (log[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cards — mobile */}
      <div className="al-card-view">
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}><Spinner /></div>
        ) : logs.length === 0 ? (
          <div className="al-empty">
            <span>📋</span>
            <p>No activity logs found.</p>
          </div>
        ) : (
          logs.map(log => (
            <div key={log.id} className="al-log-card">
              <div className="al-log-card__header">
                <ActionBadge action={log.action} />
                <span className="al-log-card__time">{timeAgo(log.created_at)}</span>
              </div>
              <div className="al-log-card__body">
                <div className="al-log-card__actor">{log.actor_name || '—'} <span className="al-log-card__role">({log.actor_role})</span></div>
                {log.entity_label && (
                  <div className="al-log-card__entity">{log.entity_label}</div>
                )}
                {log.description && (
                  <div className="al-log-card__desc">{log.description}</div>
                )}
              </div>
              <div className="al-log-card__footer">
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => setDetail(log)}
                >
                  Details
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="al-pagination">
          <button
            className="btn btn--secondary btn--sm"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            ← Prev
          </button>
          <span className="al-pagination__info">
            Page {pagination.page} of {pagination.totalPages}
            <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
              ({pagination.total.toLocaleString()} total)
            </span>
          </span>
          <button
            className="btn btn--secondary btn--sm"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Next →
          </button>
        </div>
      )}

      {/* Detail Modal */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Activity Log Details"
        size="md"
        footer={<Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>}
      >
        {detail && (
          <div className="al-detail">
            <div className="al-detail-grid">
              <div className="al-detail-row">
                <span className="al-detail-label">Action</span>
                <ActionBadge action={detail.action} />
              </div>
              <div className="al-detail-row">
                <span className="al-detail-label">Actor</span>
                <span>
                  {detail.actor_name || '—'}
                  {detail.actor_role && (
                    <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: 12 }}>
                      ({detail.actor_role})
                    </span>
                  )}
                </span>
              </div>
              {detail.entity_label && (
                <div className="al-detail-row">
                  <span className="al-detail-label">Entity</span>
                  <span>{detail.entity_label}
                    {detail.entity_type && (
                      <span style={{ color: 'var(--text-muted)', marginLeft: 6, fontSize: 12 }}>
                        [{detail.entity_type}]
                      </span>
                    )}
                  </span>
                </div>
              )}
              {detail.description && (
                <div className="al-detail-row">
                  <span className="al-detail-label">Description</span>
                  <span>{detail.description}</span>
                </div>
              )}
              <div className="al-detail-row">
                <span className="al-detail-label">Time</span>
                <span>{formatDateTime(detail.created_at)}</span>
              </div>
              {detail.ip_address && (
                <div className="al-detail-row">
                  <span className="al-detail-label">IP Address</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{detail.ip_address}</span>
                </div>
              )}
            </div>

            {detail.metadata && Object.keys(detail.metadata).length > 0 && (
              <div className="al-detail-meta">
                <div className="al-detail-meta__title">Metadata</div>
                <MetadataBlock data={detail.metadata} />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
