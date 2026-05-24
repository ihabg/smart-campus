import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../utils/helpers';
import { validateStudentId, getYearOfStudy, getStudentEmail } from '../utils/studentId';
import './Auth.css';

const DEPARTMENTS = [
  'Computer Engineering',
  'Electrical Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Industrial Engineering',
  'Architectural Engineering',
  'Information Technology',
  'Chemical Engineering',
  'Agricultural Engineering',
  'Energy and Environmental Engineering',
  'Network and Intelligent Systems Engineering',
  'Urban Planning and Technology Engineering',
  'Geomatics Engineering',
  'Mechatronics Engineering',
];
/* ─── Login ──────────────────────────────────────────────── */
export function LoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [form,    setForm]    = useState({ identifier:'', password:'' });
  const [errors,  setErrors]  = useState({});
  const [loading, setLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    const errs = {};
    if (!form.identifier.trim()) errs.identifier = 'Email or registration number required';
    if (!form.password)          errs.password    = 'Password required';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      const user = await login(form.identifier.trim(), form.password);
      const roleRoutes = {
        student:         '/dashboard',
        super_admin:     '/admin',
        admin:           '/admin',
        professor:       '/professor',
        department_head: '/professor',
        lab_assistant:   '/dashboard',
        secretary:       '/dashboard',
      };
      navigate(roleRoutes[user.role] || '/dashboard');
    } catch (err) {
      setErrors({ general: getErrorMessage(err) });
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <AuthHero />
      <div className="auth-form-panel">
        <div className="auth-form-wrap">
          <div className="auth-form-header">
            <div className="auth-form-eyebrow">✦ Welcome back</div>
            <h1 className="auth-form-title">Sign in to<br />Smart Campus</h1>
            <p className="auth-form-sub">Access your schedule, navigate campus, and stay connected</p>
          </div>

          {errors.general && (
            <div className="auth-error"><span>⚠</span> {errors.general}</div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div className="form-group auth-field">
                <label className="form-label">Email or Registration Number</label>
                <div className="auth-input-wrap">
                  <span className="auth-input-icon"><MailIcon /></span>
                  <input className={`form-input ${errors.identifier ? 'form-input--error' : ''}`}
                    type="text" placeholder="you@najah.edu or 12143698"
                    value={form.identifier} onChange={set('identifier')} autoComplete="username"/>
                </div>
                {errors.identifier && <span className="form-error">{errors.identifier}</span>}
              </div>

              <div className="form-group auth-field">
  <label className="form-label">Password</label>

  <div className="auth-input-wrap">
    <span className="auth-input-icon"><LockIcon /></span>

    <input
      className={`form-input auth-password-input ${errors.password ? 'form-input--error' : ''}`}
      type={showLoginPassword ? 'text' : 'password'}
      placeholder="••••••••"
      value={form.password}
      onChange={set('password')}
      autoComplete="current-password"
    />

    <button
      type="button"
      className="auth-password-toggle"
      onClick={() => setShowLoginPassword(prev => !prev)}
      aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
      title={showLoginPassword ? 'Hide password' : 'Show password'}
    >
      {showLoginPassword ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  </div>

  {errors.password && <span className="form-error">{errors.password}</span>}
</div>
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading} style={{ marginTop:36 }}>
              {loading
                ? <><span className="spinner spinner--sm" style={{ borderTopColor:'#fff', borderColor:'rgba(255,255,255,.25)' }}/> Signing in…</>
                : 'Sign In →'}
            </button>
          </form>

          <p className="auth-footer-link">
            <Link to="/forgot-password" style={{ color:'var(--text-muted)', fontSize:12 }}>Forgot password?</Link>
          </p>
          <p className="auth-footer-link">
            Don't have an account? <Link to="/register">Register here</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Register ───────────────────────────────────────────── */
export function RegisterPage() {
  const { register } = useAuth();
  const navigate     = useNavigate();
  const [form, setForm] = useState({
    first_name:'', last_name:'', email:'', password:'',
    student_id:'', department:'', year_of_study:'',
  });
  const [errors,  setErrors]  = useState({});
  const [loading, setLoading] = useState(false);
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);

  const set = k => e => {
    const val = e.target.value;
    setForm(f => {
      const updated = { ...f, [k]: val };
      if (k === 'student_id' && val.length >= 3) {
        const year = getYearOfStudy(val);
        if (year) updated.year_of_study = String(year);
        updated.email = getStudentEmail(val);
      }
      return updated;
    });
  };

  const validate = () => {
    const e = {};
    if (!form.first_name.trim()) e.first_name = 'Required';
    if (!form.last_name.trim())  e.last_name  = 'Required';
    if (!form.email.trim())      e.email      = 'Required';
    if (form.student_id) {
      const idCheck = validateStudentId(form.student_id);
      if (!idCheck.valid) e.student_id = idCheck.error;
    }
    if (!form.password)                    e.password = 'Required';
    else if (form.password.length < 8)     e.password = 'Min 8 characters';
    else if (!/[A-Z]/.test(form.password)) e.password = 'Need 1 uppercase letter';
    else if (!/[0-9]/.test(form.password)) e.password = 'Need 1 number';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const payload = { ...form };
      if (!payload.student_id)    delete payload.student_id;
      if (!payload.department)    delete payload.department;
      if (!payload.year_of_study) delete payload.year_of_study;
      else payload.year_of_study  = parseInt(payload.year_of_study);
      await register(payload);
      navigate('/dashboard');
    } catch (err) {
      setErrors({ general: getErrorMessage(err) });
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <AuthHero />
      <div className="auth-form-panel">
        <div className="auth-form-wrap" style={{ maxWidth:480 }}>
          <div className="auth-form-header">
            <div className="auth-form-eyebrow">✦ New student</div>
            <h1 className="auth-form-title">Create your<br />account</h1>
            <p className="auth-form-sub">Use your student email: s12345678@stu.najah.edu</p>
          </div>

          {errors.general && (
            <div className="auth-error"><span>⚠</span> {errors.general}</div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div className="form-row">
                <div className="form-group auth-field">
                  <label className="form-label form-label--req">First name</label>
                  <input className={`form-input ${errors.first_name ? 'form-input--error' : ''}`}
                    value={form.first_name} onChange={set('first_name')} placeholder="Ahmad"/>
                  {errors.first_name && <span className="form-error">{errors.first_name}</span>}
                </div>
                <div className="form-group auth-field">
                  <label className="form-label form-label--req">Last name</label>
                  <input className={`form-input ${errors.last_name ? 'form-input--error' : ''}`}
                    value={form.last_name} onChange={set('last_name')} placeholder="Hasan"/>
                  {errors.last_name && <span className="form-error">{errors.last_name}</span>}
                </div>
              </div>

              <div className="form-group auth-field">
                <label className="form-label">Student ID</label>
                <input className={`form-input ${errors.student_id ? 'form-input--error' : ''}`}
                  value={form.student_id} onChange={set('student_id')}
                  placeholder="e.g. 12143698 — email & year auto-fill"/>
                {errors.student_id && <span className="form-error">{errors.student_id}</span>}
                {form.student_id.length >= 3 && !errors.student_id && (
                  <span style={{ fontSize:11, color:'var(--green)', marginTop:3, display:'block' }}>
                    ✓ Batch {form.student_id.slice(0,3)} → Year {form.year_of_study}
                  </span>
                )}
              </div>

              <div className="form-group auth-field">
                <label className="form-label form-label--req">University Email</label>
                <div className="auth-input-wrap">
                  <span className="auth-input-icon"><MailIcon /></span>
                  <input className={`form-input ${errors.email ? 'form-input--error' : ''}`}
                    type="email" placeholder="s12345678@stu.najah.edu"
                    value={form.email} onChange={set('email')}/>
                </div>
                {errors.email && <span className="form-error">{errors.email}</span>}
              </div>

             <div className="form-group auth-field">
  <label className="form-label form-label--req">Password</label>

  <div className="auth-input-wrap">
    <span className="auth-input-icon"><LockIcon /></span>

    <input
      className={`form-input auth-password-input ${errors.password ? 'form-input--error' : ''}`}
      type={showRegisterPassword ? 'text' : 'password'}
      placeholder="Min 8 chars, 1 uppercase, 1 number"
      value={form.password}
      onChange={set('password')}
      autoComplete="new-password"
    />

    <button
      type="button"
      className="auth-password-toggle"
      onClick={() => setShowRegisterPassword(prev => !prev)}
      aria-label={showRegisterPassword ? 'Hide password' : 'Show password'}
      title={showRegisterPassword ? 'Hide password' : 'Show password'}
    >
      {showRegisterPassword ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  </div>

  {errors.password && <span className="form-error">{errors.password}</span>}
</div>

              <div className="form-group auth-field department-field">
  <label className="form-label">Department</label>

  <button
    type="button"
    className={`department-select ${departmentOpen ? 'is-open' : ''}`}
    onClick={() => setDepartmentOpen(open => !open)}
  >
    <span>{form.department || 'Select department'}</span>
    <span className="department-chevron">⌄</span>
  </button>

  {departmentOpen && (
    <div className="department-menu">
      {DEPARTMENTS.map((department) => (
        <button
          type="button"
          key={department}
          className={`department-option ${
            form.department === department ? 'is-selected' : ''
          }`}
          onClick={() => {
            setForm(f => ({ ...f, department }));
            setDepartmentOpen(false);
          }}
        >
          {department}
        </button>
      ))}
    </div>
  )}
</div>
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading} style={{ marginTop:24 }}>
              {loading
                ? <><span className="spinner spinner--sm" style={{ borderTopColor:'#fff', borderColor:'rgba(255,255,255,.25)' }}/> Creating account…</>
                : 'Create Account →'}
            </button>
          </form>

          <p className="auth-footer-link">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Hero Panel ─────────────────────────────────────────── */
function AuthHero() {
  return (
    <div className="auth-hero">
      <div className="auth-hero__bg"/>
      <div className="auth-hero__overlay"/>
      <div className="auth-hero__particles">
        {[...Array(6)].map((_, i) => <div key={i} className="auth-hero__particle"/>)}
      </div>
      <div className="auth-hero__features">
        {[
          { icon:'🗺️', text:'Interactive Campus Map' },
          { icon:'📅', text:'Smart Schedule' },
          { icon:'🤖', text:'AI Chat Assistant' },
          { icon:'↗️', text:'Room Navigation' },
        ].map(f => (
          <div key={f.text} className="auth-feature-pill">
            <span className="auth-feature-pill__icon">{f.icon}</span>
            {f.text}
          </div>
        ))}
      </div>
      <div className="auth-hero__content">
        <div className="auth-hero__top">
          <div className="auth-hero__logo">AN</div>
          <div>
            <div className="auth-hero__brand-name">Smart Campus</div>
            <div className="auth-hero__brand-sub">An-Najah National University</div>
          </div>
        </div>
        <div className="auth-hero__mid">
          <div className="auth-hero__quote">
            Navigate your<br /><span>university</span><br />with ease.
          </div>
          <p className="auth-hero__desc">
            Find rooms, check your schedule, get directions, and connect with your campus — all in one place.
          </p>
        </div>
        <div className="auth-hero__stats">
          {[
            { num:'20+',  label:'Buildings' },
            { num:'500+', label:'Rooms' },
            { num:'10k+', label:'Students' },
          ].map(s => (
            <div key={s.label} className="auth-hero__stat">
              <div className="auth-hero__stat-num">{s.num}</div>
              <div className="auth-hero__stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MailIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="3" width="14" height="10" rx="1.5"/><path d="M1 3l7 6 7-6"/></svg>;
}
function LockIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="7" width="10" height="8" rx="1"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>;
}
function EyeIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6" />
      <path d="M9.9 4.2A10.5 10.5 0 0 1 12 4c6.5 0 10 8 10 8a18.3 18.3 0 0 1-3.1 4.3" />
      <path d="M6.1 6.1C3.5 8 2 12 2 12s3.5 8 10 8a10.8 10.8 0 0 0 4.1-.8" />
    </svg>
  );
}