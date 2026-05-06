import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import './Auth.css';
import './ForgotPassword.css';

const STEPS = { EMAIL: 'email', CODE: 'code', SUCCESS: 'success' };

export default function ForgotPasswordPage() {
  const [step,     setStep]     = useState(STEPS.EMAIL);
  const [email,    setEmail]    = useState('');
  const [code,     setCode]     = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [msg,      setMsg]      = useState('');

  const sendCode = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setError('Please enter your email.'); return; }
    setLoading(true); setError('');
    try {
      const r = await axiosInstance.post('/auth/forgot-password', { email });
      setMsg(r.data.message);
      setStep(STEPS.CODE);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong.');
    } finally { setLoading(false); }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    if (code.length !== 6)       { setError('Enter the 6-digit code.'); return; }
    if (password.length < 8)     { setError('Password must be at least 8 characters.'); return; }
    if (!/[A-Z]/.test(password)) { setError('Password must contain at least one uppercase letter.'); return; }
    if (!/[0-9]/.test(password)) { setError('Password must contain at least one number.'); return; }
    if (password !== confirm)    { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    try {
      const r = await axiosInstance.post('/auth/reset-password', { email, code, new_password: password });
      setMsg(r.data.message);
      setStep(STEPS.SUCCESS);
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired code.');
    } finally { setLoading(false); }
  };

  return (
    <div className="fp-page">
      <div className="fp-card">
        {/* Logo */}
        <div className="fp-logo">
          <div className="fp-logo-icon">AN</div>
          <div>
            <div className="fp-logo-title">Smart Campus</div>
            <div className="fp-logo-sub">An-Najah National University</div>
          </div>
        </div>

        {/* Step indicators */}
        <div className="fp-steps">
          {['Email', 'Verify', 'Done'].map((s, i) => (
            <React.Fragment key={s}>
              <div className={`fp-step ${
                i === 0 && step === STEPS.EMAIL  ? 'fp-step--active' :
                i === 1 && step === STEPS.CODE   ? 'fp-step--active' :
                i === 2 && step === STEPS.SUCCESS? 'fp-step--active' :
                (i === 0 || (i === 1 && step !== STEPS.EMAIL)) && step !== STEPS.EMAIL && i < (step === STEPS.SUCCESS ? 3 : step === STEPS.CODE ? 1 : 0) ? 'fp-step--done' : ''
              }`}>
                <div className="fp-step-dot">{i + 1}</div>
                <span>{s}</span>
              </div>
              {i < 2 && <div className="fp-step-line"/>}
            </React.Fragment>
          ))}
        </div>

        {error && <div className="auth-error"><span>⚠</span> {error}</div>}
        {msg && step === STEPS.CODE && <div className="fp-success-msg">✉️ {msg}</div>}

        {/* Step 1 — Email */}
        {step === STEPS.EMAIL && (
          <form onSubmit={sendCode}>
            <h2 className="fp-title">Reset Password</h2>
            <p className="fp-desc">Enter your university email and we'll send you a verification code.</p>
            <div className="form-group" style={{marginTop:20}}>
              <label className="form-label form-label--req">University Email</label>
              <input className="form-input" type="email" placeholder="you@najah.edu"
                value={email} onChange={e=>setEmail(e.target.value)} autoFocus/>
            </div>
            <button type="submit" className="auth-submit-btn" disabled={loading} style={{marginTop:16}}>
              {loading ? <><span className="spinner spinner--sm" style={{borderTopColor:'#fff',borderColor:'rgba(255,255,255,.25)'}}/> Sending...</> : 'Send Verification Code'}
            </button>
            <p className="auth-footer-link"><Link to="/login">← Back to Sign In</Link></p>
          </form>
        )}

        {/* Step 2 — Code + new password */}
        {step === STEPS.CODE && (
          <form onSubmit={resetPassword}>
            <h2 className="fp-title">Enter Code & New Password</h2>
            <p className="fp-desc">Check your email for the 6-digit code. It expires in 15 minutes.</p>

            <div style={{display:'flex',flexDirection:'column',gap:14,marginTop:16}}>
              <div className="form-group">
                <label className="form-label form-label--req">Verification Code</label>
                <input className="form-input fp-code-input" type="text"
                  placeholder="000000" maxLength={6}
                  value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}
                  autoFocus style={{letterSpacing:8,fontSize:22,textAlign:'center',fontFamily:'var(--font-mono)'}}/>
              </div>
              <div className="form-group">
                <label className="form-label form-label--req">New Password</label>
                <input className="form-input" type="password"
                  placeholder="Min 8 chars, 1 uppercase, 1 number"
                  value={password} onChange={e=>setPassword(e.target.value)}/>
                <PasswordStrength password={password}/>
              </div>
              <div className="form-group">
                <label className="form-label form-label--req">Confirm New Password</label>
                <input className={`form-input ${confirm && confirm !== password ? 'form-input--error' : ''}`}
                  type="password" placeholder="Repeat new password"
                  value={confirm} onChange={e=>setConfirm(e.target.value)}/>
                {confirm && confirm !== password && <span className="form-error">Passwords do not match</span>}
              </div>
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading} style={{marginTop:16}}>
              {loading ? <><span className="spinner spinner--sm" style={{borderTopColor:'#fff',borderColor:'rgba(255,255,255,.25)'}}/> Resetting...</> : 'Reset Password'}
            </button>
            <p style={{textAlign:'center',marginTop:12,fontSize:13,color:'var(--text-muted)'}}>
              Didn't receive it?{' '}
              <button type="button" className="fp-resend" onClick={()=>{ setStep(STEPS.EMAIL); setCode(''); }}>
                Try again
              </button>
            </p>
          </form>
        )}

        {/* Step 3 — Success */}
        {step === STEPS.SUCCESS && (
          <div className="fp-done">
            <div className="fp-done-icon">✅</div>
            <h2 className="fp-title">Password Reset!</h2>
            <p className="fp-desc">Your password has been changed successfully. A confirmation email has been sent.</p>
            <Link to="/login" className="auth-submit-btn" style={{display:'block',textAlign:'center',marginTop:24,textDecoration:'none'}}>
              Sign In Now →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function PasswordStrength({ password }) {
  if (!password) return null;
  const checks = [
    { label:'8+ chars',   ok: password.length >= 8 },
    { label:'Uppercase',  ok: /[A-Z]/.test(password) },
    { label:'Number',     ok: /[0-9]/.test(password) },
  ];
  const score = checks.filter(c=>c.ok).length;
  const label = score === 0 ? '' : score === 1 ? 'Weak' : score === 2 ? 'Fair' : 'Strong';
  const color = score === 3 ? 'var(--green)' : score === 2 ? 'var(--amber)' : 'var(--red)';
  return (
    <div style={{marginTop:6}}>
      <div style={{display:'flex',gap:3,marginBottom:4}}>
        {[0,1,2].map(i=>(
          <div key={i} style={{flex:1,height:4,borderRadius:4,
            background: i < score ? color : 'var(--border)',
            transition:'background .2s'}}/>
        ))}
      </div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
        {checks.map(c=>(
          <span key={c.label} style={{fontSize:11,color:c.ok?'var(--green)':'var(--text-faint)'}}>
            {c.ok?'✓':'○'} {c.label}
          </span>
        ))}
        {label && <span style={{fontSize:11,fontWeight:600,color,marginLeft:'auto'}}>{label}</span>}
      </div>
    </div>
  );
}
