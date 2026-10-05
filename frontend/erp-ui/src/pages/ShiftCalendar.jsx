import { useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import Topbar from '../components/Topbar.jsx'

const PALETTE = ['#2F6FED', '#7C3AED', '#059669', '#D97706', '#DB2777', '#0891B2']
const NONE_COLOR = '#8B93A3'
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const localISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

export default function ShiftCalendar() {
  const [month, setMonth] = useState(localISO(new Date()).slice(0, 7))
  const [orgDepartmentId, setOrgDepartmentId] = useState('')
  const [departments, setDepartments] = useState([])
  const [days, setDays] = useState([])
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { api.get('/org-departments').then(r => setDepartments(r.data)).catch(() => {}) }, [])
  useEffect(() => {
    setError('')
    const params = { month }
    if (orgDepartmentId) params.orgDepartmentId = orgDepartmentId
    api.get('/shift-mappings/calendar', { params }).then(r => setDays(r.data.days)).catch(() => setError('Could not load the calendar.'))
  }, [month, orgDepartmentId])

  // One stable colour per shift, in shift-id order, so a shift keeps its colour all month.
  const colorOf = useMemo(() => {
    const ids = [...new Set(days.flatMap(d => d.shifts.map(s => s.shiftId)).filter(id => id != null))].sort((a, b) => a - b)
    return id => id == null ? NONE_COLOR : PALETTE[ids.indexOf(id) % PALETTE.length]
  }, [days])
  const legend = useMemo(() => {
    const seen = new Map()
    days.forEach(d => d.shifts.forEach(s => { if (!seen.has(s.shiftId)) seen.set(s.shiftId, s) }))
    return [...seen.values()].sort((a, b) => (a.shiftId ?? 1e9) - (b.shiftId ?? 1e9))
  }, [days])

  const [y, m] = month.split('-').map(Number)
  const leadingBlanks = (new Date(y, m - 1, 1).getDay() + 6) % 7 // weeks start on Monday
  const today = localISO(new Date())
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  function shiftMonth(delta) {
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
  }

  return (
    <>
      <Topbar />
      <div className="page-head">
        <div><h1>Shift Calendar</h1><p>How many employees are on each shift, day by day. Click a day to see who.</p></div>
      </div>
      {error && <div className="auth-error" style={{marginBottom:16}}>{error}</div>}

      <div className="card" style={{marginBottom:20}}>
        <div style={{display:'flex', alignItems:'flex-end', gap:16, flexWrap:'wrap'}}>
          <div className="field" style={{margin:0}}><label>Month</label><input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} /></div>
          <div className="field" style={{margin:0, minWidth:220}}><label>Department</label>
            <select value={orgDepartmentId} onChange={e => setOrgDepartmentId(e.target.value)}>
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.orgDepartmentId} value={d.orgDepartmentId}>{d.departmentName}</option>)}
            </select>
          </div>
          <div style={{display:'flex', gap:8, marginLeft:'auto'}}>
            <button type="button" className="btn-ghost" onClick={() => shiftMonth(-1)}>‹ Prev</button>
            <button type="button" className="btn-ghost" onClick={() => setMonth(localISO(new Date()).slice(0, 7))}>Today</button>
            <button type="button" className="btn-ghost" onClick={() => shiftMonth(1)}>Next ›</button>
          </div>
        </div>
      </div>

      <div style={{display:'flex', alignItems:'center', gap:16, flexWrap:'wrap', marginBottom:12}}>
        <b style={{fontSize:16}}>{monthLabel}</b>
        {legend.map(s => (
          <span key={String(s.shiftId)} style={{display:'inline-flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-soft)'}}>
            <span style={{width:10, height:10, borderRadius:3, background:colorOf(s.shiftId)}} /> {s.shiftName}
          </span>
        ))}
      </div>

      <div className="cal-grid">
        {DOW.map(d => <div key={d} className="cal-dow">{d}</div>)}
        {Array.from({ length: leadingBlanks }).map((_, i) => <div key={'b'+i} className="cal-cell out" />)}
        {days.map(day => {
          const dn = Number(day.date.slice(8))
          const dow = (new Date(y, m - 1, dn).getDay() + 6) % 7
          return (
            <button type="button" key={day.date}
              className={'cal-cell' + (dow >= 5 ? ' weekend' : '') + (day.date === today ? ' today' : '')}
              onClick={() => setSelected(day)}>
              <span className="cal-date">{dn}</span>
              {day.shifts.map(s => {
                const c = colorOf(s.shiftId)
                return (
                  <span key={String(s.shiftId)} className="cal-chip" style={{background: c + '22', color: c, borderLeft: `3px solid ${c}`}}>
                    <span>{s.shiftCode || 'None'}</span><b>{s.count}</b>
                  </span>
                )
              })}
              {day.shifts.length === 0 && <span className="meta" style={{fontSize:11}}>—</span>}
            </button>
          )
        })}
      </div>

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-box" style={{maxWidth:560}} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{new Date(selected.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3>
              <button type="button" className="icon-btn" onClick={() => setSelected(null)} title="Close">✕</button>
            </div>
            {selected.shifts.length === 0 && <p className="card-sub">No employees on any shift this day.</p>}
            {selected.shifts.map(s => (
              <div key={String(s.shiftId)} style={{marginTop:14}}>
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
                  <span style={{width:10, height:10, borderRadius:3, background:colorOf(s.shiftId)}} />
                  <b>{s.shiftName}</b><span className="meta">· {s.count} employee{s.count === 1 ? '' : 's'}</span>
                </div>
                <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
                  {s.employees.map(e => (
                    <span key={e.employeeId} className="badge active" style={{background:'var(--blue-50)', color:'var(--text)', border:'1px solid var(--line)'}}>
                      {e.fullName} <span className="meta">{e.empCode}</span>{e.mapped && <b style={{color:'var(--blue-700)', marginLeft:4}} title="Temporary shift mapping">⇄</b>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <p className="field-help" style={{marginTop:16}}>⇄ marks employees temporarily moved onto this shift by a Shift Mapping.</p>
          </div>
        </div>
      )}
    </>
  )
}
