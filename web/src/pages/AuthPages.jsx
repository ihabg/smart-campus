import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../utils/helpers';
import './Auth.css';

const DEPARTMENTS = [
  'Computer Engineering','Electrical Engineering','Mechanical Engineering',
  'Civil Engineering','Industrial Engineering','Information Technology',
];

/* ─── Login ──────────────────────────────────────────────── */
export function LoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [form, setForm]     = useState({ email:'', password:'' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    const errs = {};
    if (!form.email)    errs.email    = 'Email required';
    if (!form.password) errs.password = 'Password required';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      navigate(user.role === 'student' ? '/dashboard' : '/admin');
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
                <label className="form-label">University Email</label>
                <div className="auth-input-wrap">
                  <span className="auth-input-icon"><MailIcon /></span>
                  <input
                    className={`form-input ${errors.email ? 'form-input--error' : ''}`}
                    type="email" placeholder="you@najah.edu"
                    value={form.email} onChange={set('email')} autoComplete="email"
                  />
                </div>
                {errors.email && <span className="form-error">{errors.email}</span>}
              </div>

              <div className="form-group auth-field">
                <label className="form-label">Password</label>
                <div className="auth-input-wrap">
                  <span className="auth-input-icon"><LockIcon /></span>
                  <input
                    className={`form-input ${errors.password ? 'form-input--error' : ''}`}
                    type="password" placeholder="••••••••"
                    value={form.password} onChange={set('password')} autoComplete="current-password"
                  />
                </div>
                {errors.password && <span className="form-error">{errors.password}</span>}
              </div>

            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading} style={{ marginTop:24 }}>
              {loading
                ? <><span className="spinner spinner--sm" style={{ borderTopColor:'#fff', borderColor:'rgba(255,255,255,.25)' }} /> Signing in…</>
                : 'Sign In →'
              }
            </button>
          </form>

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
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.first_name.trim()) e.first_name = 'Required';
    if (!form.last_name.trim())  e.last_name  = 'Required';
    if (!form.email.trim())      e.email      = 'Required';
    if (!form.password)          e.password   = 'Required';
    else if (form.password.length < 8)         e.password = 'Min 8 characters';
    else if (!/[A-Z]/.test(form.password))     e.password = 'Need 1 uppercase letter';
    else if (!/[0-9]/.test(form.password))     e.password = 'Need 1 number';
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
        <div className="auth-form-wrap" style={{ maxWidth: 480 }}>
          <div className="auth-form-header">
            <div className="auth-form-eyebrow">✦ New student</div>
            <h1 className="auth-form-title">Create your<br />account</h1>
            <p className="auth-form-sub">Join Smart Campus — An-Najah National University</p>
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
                    value={form.first_name} onChange={set('first_name')} placeholder="Ahmad" />
                  {errors.first_name && <span className="form-error">{errors.first_name}</span>}
                </div>
                <div className="form-group auth-field">
                  <label className="form-label form-label--req">Last name</label>
                  <input className={`form-input ${errors.last_name ? 'form-input--error' : ''}`}
                    value={form.last_name} onChange={set('last_name')} placeholder="Hasan" />
                  {errors.last_name && <span className="form-error">{errors.last_name}</span>}
                </div>
              </div>

              <div className="form-group auth-field">
                <label className="form-label form-label--req">University Email</label>
                <div className="auth-input-wrap">
                  <span className="auth-input-icon"><MailIcon /></span>
                  <input className={`form-input ${errors.email ? 'form-input--error' : ''}`}
                    type="email" placeholder="you@najah.edu"
                    value={form.email} onChange={set('email')} />
                </div>
                {errors.email && <span className="form-error">{errors.email}</span>}
              </div>

              <div className="form-group auth-field">
                <label className="form-label form-label--req">Password</label>
                <div className="auth-input-wrap">
                  <span className="auth-input-icon"><LockIcon /></span>
                  <input className={`form-input ${errors.password ? 'form-input--error' : ''}`}
                    type="password" placeholder="Min 8 chars, 1 uppercase, 1 number"
                    value={form.password} onChange={set('password')} />
                </div>
                {errors.password && <span className="form-error">{errors.password}</span>}
              </div>

              <div className="form-row">
                <div className="form-group auth-field">
                  <label className="form-label">Student ID</label>
                  <input className="form-input" value={form.student_id}
                    onChange={set('student_id')} placeholder="Optional" />
                </div>
                <div className="form-group auth-field">
                  <label className="form-label">Year</label>
                  <select className="form-input" value={form.year_of_study} onChange={set('year_of_study')}>
                    <option value="">Select</option>
                    {[1,2,3,4,5].map(y => <option key={y} value={y}>Year {y}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group auth-field">
                <label className="form-label">Department</label>
                <select className="form-input" value={form.department} onChange={set('department')}>
                  <option value="">Select department</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading} style={{ marginTop:24 }}>
              {loading
                ? <><span className="spinner spinner--sm" style={{ borderTopColor:'#fff', borderColor:'rgba(255,255,255,.25)' }} /> Creating account…</>
                : 'Create Account →'
              }
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
      <div className="auth-hero__bg" />
      <div className="auth-hero__overlay" />

      {/* Floating particles */}
      <div className="auth-hero__particles">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="auth-hero__particle" />
        ))}
      </div>

      {/* Feature pills */}
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
