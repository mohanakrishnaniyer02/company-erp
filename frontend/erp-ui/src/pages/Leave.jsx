import { useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import Topbar from '../components/Topbar.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const localISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

// Mirrors the server's formatting so the screen and the error messages read the same.
function fmt(unit, v) {
  const n = Number(v)
  if (unit === 'MINUTES') {
    const m = Math.round(Math.abs(n))
    if (m >= 60) return m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`
    return `${m}m`
  }
  const a = Math.abs(n)
  return a === 1 ? '1 day' : `${Number(a.toFixed(2))} days`
}

// Days: 0.5 steps -> [0.5, 1]; whole-day steps -> [1].  (At most one day per date.)
function dayOptions(step) {
  const out = []
  for (let v = Number(step); v <= 1.0001; v += Number(step)) out.push(Number(v.toFixed(2)))
  return out
}

// Amount picker: a dropdown of day amounts, or hours + minutes for time-based leave.
function AmountInput({ balance, value, onChange }) {
  if (!balance) return null
  if (balance.unit === 'MINUTES') {
    const h = Math.floor(value / 60), m = value % 60
    return (
      <div style={{display:'flex', gap:8, alignItems:'center'}}>
        <input type="number" min="0" value={h} onChange={e => onChange(Math.max(0, Number(e.target.value || 0)) * 60 + m)} style={{width:80}} /> <span>h</span>
        <input type="number" min="0" max="59" value={m} onChange={e => onChange(h * 60 + Math.min(59, Math.max(0, Number(e.target.value || 0))))} style={{width:80}} /> <span>min</span>
      </div>
    )
  }
  return (
    <select value={value} onChange={e => onChange(Number(e.target.value))}>
      {dayOptions(balance.step).map(v => <option key={v} value={v}>{fmt('DAYS', v)}</option>)}
    </select>
  )
}

const defaultAmount = b => !b ? 0 : (b.unit === 'MINUTES' ? 30 : dayOptions(b.step)[dayOptions(b.step).length - 1])

export default function Leave() {
  const { user } = useAuth()
  const isAdmin = ['Admin', 'SuperAdmin'].includes(user?.role)
  const [employees, setEmployees] = useState([])
  const [dept, setDept] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [date, setDate] = useState(localISO(new Date()))
  const [balances, setBalances] = useState([])
  const [entries, setEntries] = useState([])
  const [typeId, setTypeId] = useState('')
  const [amount, setAmount] = useState(0)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  useEffect(()=>{ if(!success) return; const t=setTimeout(()=>setSuccess(''),4000); return()=>clearTimeout(t) },[success])

  // adjustment modal (Admin / SuperAdmin)
  const [showAdjust, setShowAdjust] = useState(false)
  const [adj, setAdj] = useState({ typeId: '', date: localISO(new Date()), direction: 'add', amount: 0, reason: '' })
  const [adjError, setAdjError] = useState('')

  useEffect(() => { api.get('/employees').then(r => setEmployees(r.data)).catch(() => setError('Could not load employees.')) }, [])

  const departments = useMemo(() => [...new Set(employees.map(e => e.orgDepartment).filter(Boolean))].sort(), [employees])
  const employee = employees.find(e => String(e.employeeId) === String(employeeId))
  const month = date.slice(0, 7), year = date.slice(0, 4)

  function loadBalances() {
    if (!employeeId || !date) { setBalances([]); return }
    api.get('/leave/balances', { params: { employeeId, month } }).then(r => setBalances(r.data)).catch(() => setError('Could not load balances.'))
  }
  function loadEntries() {
    if (!employeeId) { setEntries([]); return }
    api.get('/leave/entries', { params: { employeeId, year } }).then(r => setEntries(r.data)).catch(() => setError('Could not load leave history.'))
  }
  useEffect(() => { loadBalances() }, [employeeId, month])
  useEffect(() => { loadEntries() }, [employeeId, year])

  // Keep a valid leave type + amount selected as balances (re)load.
  useEffect(() => {
    if (!balances.length) return
    const current = balances.find(b => String(b.leaveTypeId) === String(typeId))
    if (!current) { setTypeId(String(balances[0].leaveTypeId)); setAmount(defaultAmount(balances[0])) }
  }, [balances])

  const selected = balances.find(b => String(b.leaveTypeId) === String(typeId))
  const adjBalance = balances.find(b => String(b.leaveTypeId) === String(adj.typeId))
  function pickType(b) { setTypeId(String(b.leaveTypeId)); setAmount(defaultAmount(b)) }

  async function addLeave(e) {
    e.preventDefault(); setError(''); setSuccess('')
    if (!employeeId) { setError('Select an employee first.'); return }
    setSaving(true)
    try {
      await api.post('/leave/entries', { employeeId: Number(employeeId), leaveTypeId: Number(typeId), leaveDate: date, amount, reason: note || null })
      setSuccess(`${selected.name} (${fmt(selected.unit, amount)}) recorded for ${employee.fullName}.`)
      setNote(''); loadBalances(); loadEntries()
    } catch (err) { setError(err.response?.data?.message || 'Could not record the leave.') }
    finally { setSaving(false) }
  }

  async function removeEntry(en) {
    if (!window.confirm(`Remove this ${en.leaveTypeName} entry (${fmt(en.unit, en.amount)} on ${en.leaveDate})? The balance is restored.`)) return
    setError(''); setSuccess('')
    try { await api.delete(`/leave/entries/${en.leaveEntryId}`); setSuccess('Entry removed — balance restored.'); loadBalances(); loadEntries() }
    catch (err) { setError(err.response?.data?.message || 'Could not remove the entry.') }
  }

  function openAdjust() {
    const first = balances[0]
    setAdj({ typeId: first ? String(first.leaveTypeId) : '', date, direction: 'add', amount: first ? (first.unit === 'MINUTES' ? 30 : Number(first.step)) : 0, reason: '' })
    setAdjError(''); setShowAdjust(true)
  }
  async function saveAdjust(e) {
    e.preventDefault(); setAdjError('')
    try {
      await api.post('/leave/adjustments', {
        employeeId: Number(employeeId), leaveTypeId: Number(adj.typeId), effectiveDate: adj.date,
        amount: adj.direction === 'add' ? adj.amount : -adj.amount, reason: adj.reason
      })
      setShowAdjust(false); setSuccess('Balance adjusted.')
      if (adj.date.slice(0, 7) !== month) setDate(adj.date); else loadBalances()
      loadEntries()
    } catch (err) { setAdjError(err.response?.data?.message || 'Could not adjust the balance.') }
  }

  return (
    <>
      <Topbar />
      <div className="page-head">
        <div><h1>Leave</h1><p>Balances are granted automatically by policy — here you record leave as it's taken.</p></div>
        {isAdmin && employeeId && <button type="button" className="btn-ghost" onClick={openAdjust}>⚖ Adjust balance</button>}
      </div>

      {error && <div className="auth-error" style={{marginBottom:16}}>{error}</div>}
      {success && <div className="success-note" style={{marginBottom:16}}>{success}</div>}

      <div className="card" style={{marginBottom:20}}>
        <div className="form-grid">
          <div className="field"><label>Department</label>
            <select value={dept} onChange={e => { setDept(e.target.value); setEmployeeId('') }}>
              <option value="">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="field"><label>Employee</label>
            <select value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
              <option value="">Select employee…</option>
              {employees.filter(e => e.status === 'Active' && (!dept || e.orgDepartment === dept))
                .map(e => <option key={e.employeeId} value={e.employeeId}>{e.fullName} — {e.empCode}</option>)}
            </select>
          </div>
          <div className="field"><label>Leave Date</label>
            <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} />
            <small className="field-help">Balances shown are for the period this date falls in.</small>
          </div>
        </div>
      </div>

      {!employeeId && <div className="card"><p className="card-sub" style={{margin:0}}>Select an employee to see their balances and record leave.</p></div>}

      {employeeId && (
        <>
          <div className="kpi-grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))'}}>
            {balances.map(b => {
              const used = Number(b.taken), total = Number(b.entitlement) + Math.max(0, Number(b.adjusted))
              const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
              const active = String(b.leaveTypeId) === String(typeId)
              return (
                <button type="button" key={b.leaveTypeId} onClick={() => pickType(b)} className="kpi-card"
                  style={{textAlign:'left', cursor:'pointer', fontFamily:'inherit', outline: active ? '2px solid var(--blue-600)' : 'none'}}>
                  <div className="lbl">{b.name}</div>
                  <div className="num">{fmt(b.unit, b.remaining)}</div>
                  <small>left · {b.periodLabel}</small>
                  <div style={{height:6, background:'var(--line)', borderRadius:4, margin:'10px 0 6px', overflow:'hidden'}}>
                    <div style={{width:`${pct}%`, height:'100%', background:'var(--blue-600)'}} />
                  </div>
                  <small>
                    {fmt(b.unit, b.taken)} used of {fmt(b.unit, b.entitlement)}
                    {Number(b.adjusted) !== 0 && <> · {Number(b.adjusted) > 0 ? '+' : '−'}{fmt(b.unit, b.adjusted)} adjusted</>}
                  </small>
                </button>
              )
            })}
          </div>

          <form className="card" onSubmit={addLeave} style={{marginBottom:20}}>
            <h3>Record leave for {employee?.fullName}</h3>
            <p className="card-sub">On {date}. Choose a leave type above (or below), the amount, then Add Leave.</p>
            <div className="form-grid">
              <div className="field"><label>Leave Type</label>
                <select value={typeId} onChange={e => pickType(balances.find(b => String(b.leaveTypeId) === e.target.value))}>
                  {balances.map(b => <option key={b.leaveTypeId} value={b.leaveTypeId}>{b.name}</option>)}
                </select>
              </div>
              <div className="field"><label>Amount</label>
                <AmountInput balance={selected} value={amount} onChange={setAmount} />
                {selected && <small className="field-help">{fmt(selected.unit, selected.remaining)} left for {selected.periodLabel}</small>}
              </div>
              <div className="field"><label>Note (optional)</label><input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Fever, bank visit" /></div>
            </div>
            <div style={{display:'flex', justifyContent:'flex-end', marginTop:16}}>
              <button className="btn-blue" type="submit" disabled={saving || !selected || amount <= 0}>{saving ? 'Adding…' : '＋ Add Leave'}</button>
            </div>
          </form>

          <div className="table-card"><div className="table-scroll"><table className="emp-table">
            <thead><tr><th>Date</th><th>Leave</th><th>Type</th><th>Amount</th><th>Note</th><th>Recorded By</th><th></th></tr></thead>
            <tbody>
              {entries.map(en => (
                <tr key={en.leaveEntryId}>
                  <td className="mono">{en.leaveDate}</td>
                  <td><b>{en.leaveTypeName}</b></td>
                  <td><span className={'badge ' + (en.kind === 'TAKEN' ? 'active' : 'inactive')}>{en.kind === 'TAKEN' ? 'Taken' : 'Adjustment'}</span></td>
                  <td><b>{en.kind === 'ADJUST' ? (Number(en.amount) > 0 ? '+' : '−') : ''}{fmt(en.unit, en.amount)}</b></td>
                  <td className="meta">{en.reason || '—'}</td>
                  <td className="meta">{en.recordedBy || '—'}</td>
                  <td>{(en.kind === 'TAKEN' || isAdmin) && <div className="row-actions"><button className="del" title="Remove" onClick={() => removeEntry(en)}>🗑</button></div>}</td>
                </tr>
              ))}
              {entries.length === 0 && <tr className="empty-row"><td colSpan="7">No leave recorded in {year}.</td></tr>}
            </tbody>
          </table></div></div>
        </>
      )}

      {showAdjust && (
        <div className="modal-overlay" onClick={() => setShowAdjust(false)}>
          <div className="modal-box" style={{maxWidth:560}} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Adjust balance — {employee?.fullName}</h3>
              <button type="button" className="icon-btn" onClick={() => setShowAdjust(false)} title="Close">✕</button>
            </div>
            <p className="card-sub">For exceptions only — an extra day granted, or a mistake corrected. Normal leave goes through Add Leave.</p>
            <form onSubmit={saveAdjust}>
              {adjError && <div className="auth-error" style={{marginBottom:14}}>{adjError}</div>}
              <div className="form-grid two">
                <div className="field"><label>Leave Type</label>
                  <select value={adj.typeId} onChange={e => { const b = balances.find(x => String(x.leaveTypeId) === e.target.value); setAdj(a => ({...a, typeId: e.target.value, amount: b ? (b.unit === 'MINUTES' ? 30 : Number(b.step)) : 0})) }}>
                    {balances.map(b => <option key={b.leaveTypeId} value={b.leaveTypeId}>{b.name}</option>)}
                  </select>
                </div>
                <div className="field"><label>Effective Date</label><input type="date" required value={adj.date} onChange={e => setAdj(a => ({...a, date: e.target.value}))} /></div>
                <div className="field"><label>Change</label>
                  <select value={adj.direction} onChange={e => setAdj(a => ({...a, direction: e.target.value}))}>
                    <option value="add">Add to balance</option><option value="deduct">Deduct from balance</option>
                  </select>
                </div>
                <div className="field"><label>Amount</label>
                  {adjBalance && adjBalance.unit === 'DAYS'
                    ? <input type="number" min={adjBalance.step} step={adjBalance.step} value={adj.amount} onChange={e => setAdj(a => ({...a, amount: Number(e.target.value)}))} />
                    : <AmountInput balance={adjBalance} value={adj.amount} onChange={v => setAdj(a => ({...a, amount: v}))} />}
                </div>
                <div className="field" style={{gridColumn:'1/-1'}}><label>Reason *</label>
                  <input required value={adj.reason} onChange={e => setAdj(a => ({...a, reason: e.target.value}))} placeholder="Why is this adjustment needed?" />
                </div>
              </div>
              <div style={{display:'flex', justifyContent:'flex-end', gap:10, marginTop:20, paddingTop:16, borderTop:'1px solid var(--line)'}}>
                <button type="button" className="btn-ghost" onClick={() => setShowAdjust(false)}>Cancel</button>
                <button className="btn-blue" type="submit" disabled={adj.amount <= 0}>Save Adjustment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
