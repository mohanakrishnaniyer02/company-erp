import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Topbar({ crumbs, search, onSearch }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const initials = (user?.fullName || 'U').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase()

  useEffect(() => {
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function handleLogout() {
    setMenuOpen(false)
    logout()
    navigate('/login')
  }

  return (
    <div className="topbar">
      <div className="crumbs">{crumbs}</div>
      <div className="topbar-right">
        {onSearch && (
          <div className="search-box">
            <input placeholder="Search employees…" value={search} onChange={e => onSearch(e.target.value)} />
          </div>
        )}
        <div className="role-chip">{user?.role}</div>
        <div className="account-menu" ref={menuRef}>
          <button type="button" className="avatar" onClick={() => setMenuOpen(o => !o)}>{initials}</button>
          {menuOpen && (
            <div className="account-dropdown">
              <div className="account-dropdown-head">
                <div className="name">{user?.fullName}</div>
              </div>
              <button type="button" onClick={() => { setMenuOpen(false); navigate('/change-password') }}>Change password</button>
              <button type="button" onClick={handleLogout}>← Log out</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
