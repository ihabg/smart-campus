import React, { useState, useEffect, useRef } from 'react';

// ─── Button ───────────────────────────────────────────────────
export function Button({
  children, variant = 'primary', size = '', loading = false,
  full = false, icon, className = '', ...props
}) {
  return (
    <button
      className={`btn btn--${variant} ${size ? `btn--${size}` : ''} ${full ? 'btn--full' : ''} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <span className="spinner spinner--sm" /> : icon}
      {children}
    </button>
  );
}

// ─── Input ────────────────────────────────────────────────────
export function Input({
  label, error, required, hint, className = '', ...props
}) {
  return (
    <div className="form-group">
      {label && (
        <label className={`form-label ${required ? 'form-label--req' : ''}`}>
          {label}
        </label>
      )}
      <input
        className={`form-input ${error ? 'form-input--error' : ''} ${className}`}
        {...props}
      />
      {hint  && !error && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{hint}</span>}
      {error && <span className="form-error">{error}</span>}
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────
export function Select({ label, error, required, options = [], placeholder, className = '', ...props }) {
  return (
    <div className="form-group">
      {label && <label className={`form-label ${required ? 'form-label--req' : ''}`}>{label}</label>}
      <select className={`form-input ${error ? 'form-input--error' : ''} ${className}`} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <span className="form-error">{error}</span>}
    </div>
  );
}

// ─── Textarea ─────────────────────────────────────────────────
export function Textarea({ label, error, required, rows = 4, className = '', ...props }) {
  return (
    <div className="form-group">
      {label && <label className={`form-label ${required ? 'form-label--req' : ''}`}>{label}</label>}
      <textarea
        className={`form-input ${error ? 'form-input--error' : ''} ${className}`}
        rows={rows}
        style={{ resize: 'vertical' }}
        {...props}
      />
      {error && <span className="form-error">{error}</span>}
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────
export function Spinner({ size = '', center = false }) {
  const el = <span className={`spinner ${size ? `spinner--${size}` : ''}`} />;
  if (!center) return el;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
      {el}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────
export function Badge({ children, variant = 'gray' }) {
  return <span className={`badge badge--${variant}`}>{children}</span>;
}

// ─── Modal ────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else      document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const maxWidths = { sm: 420, md: 540, lg: 720, xl: 900 };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={{ maxWidth: maxWidths[size] || 540 }}>
        <div className="modal__header">
          <h3 className="modal__title">{title}</h3>
          <button className="btn btn--ghost btn--icon" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────
export function ConfirmDialog({ open, onClose, onConfirm, title, message, danger = false, loading = false }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title || 'Confirm Action'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            Confirm
          </Button>
        </>
      }
    >
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{message}</p>
    </Modal>
  );
}

// ─── Table ────────────────────────────────────────────────────
export function Table({ columns, data, loading, emptyMessage = 'No data found', onRowClick }) {
  if (loading) return <Spinner center />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={col.style}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!data?.length ? (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                {emptyMessage}
              </td>
            </tr>
          ) : data.map((row, i) => (
            <tr
              key={row.id || i}
              onClick={() => onRowClick?.(row)}
              style={onRowClick ? { cursor: 'pointer' } : {}}
            >
              {columns.map(col => (
                <td key={col.key}>
                  {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────
export function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, total, limit } = pagination;
  const from = (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', fontSize: 13, color: 'var(--text-muted)' }}>
      <span>Showing {from}–{to} of {total}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn btn--secondary btn--sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>‹</button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
          <button
            key={p}
            className={`btn btn--sm ${p === page ? 'btn--primary' : 'btn--secondary'}`}
            onClick={() => onPageChange(p)}
          >
            {p}
          </button>
        ))}
        <button className="btn btn--secondary btn--sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>›</button>
      </div>
    </div>
  );
}

// ─── SearchInput ──────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder = 'Search…', onClear }) {
  return (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }}>
        <SearchIcon size={14} />
      </span>
      <input
        className="form-input"
        style={{ paddingLeft: 32, paddingRight: value ? 32 : 12 }}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button
          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          onClick={onClear}
        >×</button>
      )}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────
export function Card({ children, className = '', noPad = false, ...props }) {
  return (
    <div className={`card ${noPad ? 'card--no-pad' : ''} ${className}`} {...props}>
      {children}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────
export function SectionHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-lg)' }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ─── Inline icons ─────────────────────────────────────────────
export function CloseIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 3l10 10M13 3L3 13"/>
    </svg>
  );
}

export function SearchIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="6.5" cy="6.5" r="4"/><path d="m10 10 3 3"/>
    </svg>
  );
}

export function PlusIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 3v10M3 8h10"/>
    </svg>
  );
}

export function EditIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M11.5 2.5l2 2-9 9H2.5v-2l9-9z"/>
    </svg>
  );
}

export function TrashIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/>
    </svg>
  );
}

export function EyeIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/>
      <circle cx="8" cy="8" r="2"/>
    </svg>
  );
}

export function BellIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10 2a6 6 0 00-6 6c0 3-1.5 4-1.5 5h15s-1.5-2-1.5-5a6 6 0 00-6-6z"/>
      <path d="M8.5 17a1.5 1.5 0 003 0"/>
    </svg>
  );
}
