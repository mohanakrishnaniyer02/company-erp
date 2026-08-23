import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import AuthBackground from '../components/AuthBackground.jsx'

export default function Login() {
  const [error, setError] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

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

  return (
    <div id="auth">
      <AuthBackground />
      <div className="auth-wrap">
        <div className="auth-logo"><div className="sq">C</div><span>Company HR</span></div>
        <div className="auth-card">
          {error && <div className="auth-error">{error}</div>}
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
          </form>
        </div>
      </div>
    </div>
  )
}
