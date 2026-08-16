import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Login() {
  const [mode, setMode] = useState('login')
  const [error, setError] = useState('')
  const { login, signup } = useAuth()
  const navigate = useNavigate()

  // login fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // signup fields
  const [fullName, setFullName] = useState('')
  const [suEmail, setSuEmail] = useState('')
  const [suPassword, setSuPassword] = useState('')
  const [suConfirm, setSuConfirm] = useState('')
  const [role, setRole] = useState('User')   // <-- role as a dropdown now

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Check your credentials.')
    }
  }

  async function handleSignup(e) {
    e.preventDefault()
    setError('')
    if (suPassword !== suConfirm) { setError('Passwords do not match.'); return }
    try {
      await signup(fullName, suEmail, suPassword, role)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create account.')
    }
  }

  return (
    <div id="auth">
      <div className="auth-wrap">
        <div className="auth-logo"><div className="sq">C</div><span>Company HR</span></div>
        <div className="auth-card">
          <div className="auth-tabs">
            <button type="button" className={mode==='login' ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>Log in</button>
            <button type="button" className={mode==='signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError('') }}>Sign up</button>
          </div>

          {error && <div className="auth-error">{error}</div>}

          {mode === 'login' ? (
            <form onSubmit={handleLogin}>
              <h2>Welcome back</h2>
              <p className="sub">Log in with your work email to continue.</p>
              <div className="field">
                <label>Email address</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
              </div>
              <div className="field">
                <label>Password</label>
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••" />
              </div>
              <button type="submit" className="btn-primary">Log in →</button>
              <p className="auth-note">Access is scoped automatically by your assigned role (User · HR · Admin · SuperAdmin) after authentication.</p>
              <p className="auth-switch-line">New here? <a onClick={() => setMode('signup')}>Create an account</a></p>
            </form>
          ) : (
            <form onSubmit={handleSignup}>
              <h2>Create your account</h2>
              <p className="sub">Set up access — your role determines what you'll see next.</p>
              <div className="field">
                <label>Full name</label>
                <input required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Priya Raman" />
              </div>
              <div className="field">
                <label>Work email</label>
                <input type="email" required value={suEmail} onChange={e => setSuEmail(e.target.value)} placeholder="priya@company.com" />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Password</label>
                  <input type="password" required value={suPassword} onChange={e => setSuPassword(e.target.value)} placeholder="Min. 8 characters" />
                </div>
                <div className="field">
                  <label>Confirm password</label>
                  <input type="password" required value={suConfirm} onChange={e => setSuConfirm(e.target.value)} placeholder="Repeat password" />
                </div>
              </div>
              <div className="field">
                <label>Role</label>
                <select value={role} onChange={e => setRole(e.target.value)}>
                  <option value="User">User</option>
                  <option value="HR">HR</option>
                  <option value="Admin">Admin</option>
                  <option value="SuperAdmin">SuperAdmin</option>
                </select>
              </div>
              <button type="submit" className="btn-primary">Create account →</button>
              <p className="auth-note">A JWT is generated on signup and stored against your user record for subsequent request authentication. Self-service signup only grants User or HR — Admin/SuperAdmin accounts are created by an existing Admin (the very first account on a fresh system is the one exception).</p>
              <p className="auth-switch-line">Already have an account? <a onClick={() => setMode('login')}>Log in</a></p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
