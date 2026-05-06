import React, { useState } from 'react';
import axiosInstance from '../api/axiosInstance';
import './ForgotPassword.css';

export default function ChangePassword({ onCancel, onSuccess }) {
  const [step,     setStep]     = useState('current'); // current | verify | done
  const [current,  setCurrent]  = useState('');
  const [code,     setCode]     = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');

  // Step 1 — verify current password, trigger OTP
  const requestChange = async (e) => {
    e.preventDefault();
    if (!current) { setError('Enter your current password.'); return; }
    setLoading(true); setError('');
    try {
      const r = await axiosInstance.post('/auth/request-password-change', { current_password: current });
      setMaskedEmail(r.data.message);
      setStep('verify');
    } catch (err) {
      setError(err.response?.data?.message || 'Incorrect password.');
    } finally { setLoading(false); }
  };

  // Step 2 — confirm OTP + set new password
  const confirmChange = async (e) => {
    e.preventDefault();
    if (code.length !== 6)       { setError('Enter the 6-digit code.'); return; }
    if (password.length < 8)     { setError('Password must be at least 8 characters.'); return; }
    if (!/[A-Z]/.test(password)) { setError('Must contain at least one uppercase letter.'); return; }
    if (!/[0-9]/.test(password)) { setError('Must contain at least one number.'); return; }
    if (password !== confirm)    { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    try {
      await axiosInstance.post('/auth/confirm-password-change', { code, new_password: password });
      setStep('done');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired code.');
    } finally { setLoading(false); }
  };

  const checks = [
    { label:'8+ chars',  ok: password.length >= 8 },
    { label:'Uppercase', ok: /[A-Z]/.test(password) },
    { label:'Number',    ok: /[0-9]/.test(password) },
  ];
  const score = checks.filter(c=>c.ok).length;
  const strengthColor = score === 3 ? 'var(--green)' : score === 2 ? 'var(--amber)' : 'var(--red)';

  return (
    <div style={{maxWidth:420}}>
      <h3 style={{fontFamily:'var(--font-display)',fontSize:18,marginBottom:4}}>🔒 Change Password</h3>
      <p style={{fontSize:13,color:'var(--text-muted)',marginBottom:20}}>
        A verification code will be sent to your email for security.
      </p>

      {error && <div className="auth-error" style={{marginBottom:14}}><span>⚠</span> {error}</div>}

      {/* Step 1 — current password */}
      {step === 'current' && (
        <form onSubmit={requestChange}>
          <div className="form-group">
            <label className="form-label form-label--req">Current Password</label>
            <input className="form-input" type="password" placeholder="••••••••"
              value={current} onChange={e=>setCurrent(e.target.value)} autoFocus/>
          </div>
          <div className="fp-info-box">
            🔐 A 6-digit verification code will be sent to your university email after verification.
          </div>
          <div style={{display:'flex',gap:8,marginTop:16}}>
            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? 'Sending code...' : 'Continue →'}
            </button>
            {onCancel && <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>}
          </div>
        </form>
      )}

      {/* Step 2 — OTP + new password */}
      {step === 'verify' && (
        <form onSubmit={confirmChange}>
          <div style={{background:'var(--green-bg)',border:'1px solid var(--green-border)',borderRadius:'var(--r-md)',padding:'10px 14px',fontSize:13,color:'var(--green)',marginBottom:16}}>
            ✉️ {maskedEmail}
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div className="form-group">
              <label className="form-label form-label--req">Verification Code</label>
              <input className="form-input" type="text" placeholder="000000" maxLength={6}
                value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} autoFocus
                style={{letterSpacing:8,fontSize:22,textAlign:'center',fontFamily:'var(--font-mono)'}}/>
            </div>
            <div className="form-group">
              <label className="form-label form-label--req">New Password</label>
              <input className="form-input" type="password" placeholder="Min 8 chars, 1 uppercase, 1 number"
                value={password} onChange={e=>setPassword(e.target.value)}/>
              {password && (
                <div style={{marginTop:6}}>
                  <div style={{display:'flex',gap:3,marginBottom:4}}>
                    {[0,1,2].map(i=><div key={i} style={{flex:1,height:4,borderRadius:4,background:i<score?strengthColor:'var(--border)',transition:'background .2s'}}/>)}
                  </div>
                  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                    {checks.map(c=><span key={c.label} style={{fontSize:11,color:c.ok?'var(--green)':'var(--text-faint)'}}>{c.ok?'✓':'○'} {c.label}</span>)}
                  </div>
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label form-label--req">Confirm New Password</label>
              <input className={`form-input ${confirm&&confirm!==password?'form-input--error':''}`}
                type="password" placeholder="Repeat new password"
                value={confirm} onChange={e=>setConfirm(e.target.value)}/>
              {confirm&&confirm!==password&&<span className="form-error">Passwords do not match</span>}
            </div>
          </div>

          <div style={{display:'flex',gap:8,marginTop:16}}>
            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? 'Changing...' : '🔒 Change Password'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={()=>setStep('current')}>← Back</button>
          </div>
        </form>
      )}

      {/* Done */}
      {step === 'done' && (
        <div style={{textAlign:'center',padding:'20px 0'}}>
          <div style={{fontSize:48,marginBottom:12}}>✅</div>
          <h3 style={{fontFamily:'var(--font-display)',fontSize:18,marginBottom:8}}>Password Changed!</h3>
          <p style={{fontSize:13,color:'var(--text-muted)',marginBottom:20}}>
            Your password has been updated. A confirmation email has been sent.
          </p>
          {onSuccess && <button className="btn btn--primary" onClick={onSuccess}>Done</button>}
        </div>
      )}
    </div>
  );
}
