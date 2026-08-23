import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext.jsx'

export default function ChangePassword() {
  const { user, clearMustChangePassword } = useAuth()
  const navigate = useNavigate()
  const forced = !!user?.mustChangePassword

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setSuccess('')
    if (newPassword !== confirmPassword) { setError('New passwords do not match.'); return }
    try {
      await api.put('/auth/change-password', { currentPassword, newPassword })
      clearMustChangePassword()
      if (forced) {
        navigate('/dashboard')
      } else {
        setSuccess('Password updated.')
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update password.')
    }
  }

  return (
    <div id="auth">
      <div className="auth-wrap">
        <div className="auth-logo"><div className="sq">C</div><span>Company HR</span></div>
        <div className="auth-card">
          {error && <div className="auth-error">{error}</div>}
          {success && <div className="success-note" style={{marginBottom:16}}>{success}</div>}
          <form onSubmit={handleSubmit}>
            <h2>{forced ? 'Set your password' : 'Change your password'}</h2>
            <p className="sub">
              {forced
                ? "You're logging in with a temporary password — set one only you know before continuing."
                : 'Update the password on your account.'}
            </p>
            <div className="field">
              <label>Current password</label>
              <input type="password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
            </div>
            <div className="field">
              <label>New password</label>
              <input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 8 characters, letters + numbers" />
            </div>
            <div className="field">
              <label>Confirm new password</label>
              <input type="password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
            </div>
            <button type="submit" className="btn-primary">{forced ? 'Set password →' : 'Update password'}</button>
            {!forced && (
              <p className="auth-switch-line"><a onClick={() => navigate('/dashboard')}>← Back to dashboard</a></p>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
