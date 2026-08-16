import { useAuth } from '../context/AuthContext.jsx'

export default function Topbar({ crumbs, search, onSearch }) {
  const { user } = useAuth()
  const initials = (user?.fullName || 'U').split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase()

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
        <div className="avatar">{initials}</div>
      </div>
    </div>
  )
}
