import { useEffect, useState } from 'react'
import api from '../api/client'
import Topbar from '../components/Topbar.jsx'

const WATCH = { LATE_IN: 'Late In', EARLY_OUT: 'Early Out' }
const ACTIONS = {
  PERMISSION: { label: 'Deduct Permission', unit: 'min', step: 1 },
  CASUAL: { label: 'Deduct Casual Leave', unit: 'day', step: 0.5 },
  SICK: { label: 'Deduct Sick Leave', unit: 'day', step: 1 },
  LOP: { label: 'Loss of Pay', unit: 'day', step: 0.5 },
  WARNING: { label: 'Warning only', unit: '', step: 1 },
}
const FALLBACKS = { CASUAL: 'Casual Leave', SICK: 'Sick Leave', LOP: 'Loss of Pay' }
const LOW = {
  USE_AVAILABLE_THEN_FALLBACK: 'Use what is left, then charge the fallback',
  USE_AVAILABLE: 'Use only what is left',
  FALLBACK: 'Skip it and charge the fallback instead',
  WARN: 'Do not deduct, just warn',
}
const isBalance = a => a === 'PERMISSION' || a === 'CASUAL' || a === 'SICK'
const emptyTier = () => ({ minMinutes: '30', occurrenceNo: '1', action: 'PERMISSION', amount: '60', onLowBalance: 'USE_AVAILABLE_THEN_FALLBACK', fallbackAction: 'CASUAL', fallbackAmount: '0.5' })
const emptyForm = () => ({ name: '', orgDepartmentId: '', watch: 'LATE_IN', resetPeriod: 'MONTH', isActive: true, tiers: [emptyTier()] })

function tierText(t) {
  const n = Number(t.amount)
  if (t.action === 'WARNING') return 'Warning only (no deduction)'
  if (t.action === 'LOP') return `Loss of Pay: ${n} day`
  if (t.action === 'PERMISSION') return `Deduct ${n} min Permission`
  return `Deduct ${n} day ${ACTIONS[t.action].label.replace('Deduct ', '')}`
}
const ordinal = n => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)]}`

export default function AttendanceRules() {
  const [sets, setSets] = useState([])
  const [departments, setDepartments] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState('')
  useEffect(() => { if (!success) return; const t = setTimeout(() => setSuccess(''), 4000); return () => clearTimeout(t) }, [success])

  const load = () => api.get('/attendance-rules').then(r => setSets(r.data)).catch(() => setError('Could not load attendance rules.'))
  useEffect(() => {
    load()
    api.get('/org-departments').then(r => setDepartments(r.data)).catch(() => {})
  }, [])

  const set = (f, v) => setForm(x => ({ ...x, [f]: v }))
  const setTier = (i, f, v) => setForm(x => ({ ...x, tiers: x.tiers.map((t, j) => {
    if (j !== i) return t
    const n = { ...t, [f]: v }
    if (f === 'action') { n.amount = v === 'PERMISSION' ? '60' : v === 'WARNING' ? '0' : (v === 'SICK' ? '1' : '1') }
    return n
  }) }))
  const addTier = () => setForm(x => {
    const last = x.tiers[x.tiers.length - 1]
    return { ...x, tiers: [...x.tiers, { ...emptyTier(), minMinutes: last?.minMinutes || '30', occurrenceNo: String((Number(last?.occurrenceNo) || 0) + 1) }] }
  })
  const removeTier = i => setForm(x => ({ ...x, tiers: x.tiers.length <= 1 ? x.tiers : x.tiers.filter((_, j) => j !== i) }))

  function startAdd() { setEditingId(null); setForm(emptyForm()); setFormError(''); setError(''); setSuccess(''); setShowForm(true) }
  function startEdit(s) {
    setEditingId(s.ruleSetId)
    setForm({
      name: s.name, orgDepartmentId: s.orgDepartmentId ? String(s.orgDepartmentId) : '', watch: s.watch, resetPeriod: s.resetPeriod, isActive: s.isActive,
      tiers: s.tiers.map(t => ({
        minMinutes: String(t.minMinutes), occurrenceNo: String(t.occurrenceNo), action: t.action, amount: String(t.amount),
        onLowBalance: isBalance(t.action) ? t.onLowBalance : 'USE_AVAILABLE_THEN_FALLBACK',
        fallbackAction: t.fallbackAction || 'CASUAL', fallbackAmount: String(t.fallbackAmount || 0.5),
      })),
    })
    setFormError(''); setError(''); setSuccess(''); setShowForm(true)
  }
  const close = () => { setShowForm(false); setEditingId(null) }

  async function save(e) {
    e.preventDefault(); setFormError('')
    const payload = {
      name: form.name, orgDepartmentId: form.orgDepartmentId ? Number(form.orgDepartmentId) : null,
      watch: form.watch, resetPeriod: form.resetPeriod, isActive: form.isActive,
      tiers: form.tiers.map(t => ({
        minMinutes: Number(t.minMinutes), occurrenceNo: Number(t.occurrenceNo), action: t.action,
        amount: t.action === 'WARNING' ? 0 : Number(t.amount),
        onLowBalance: isBalance(t.action) ? t.onLowBalance : null,
        fallbackAction: isBalance(t.action) && t.onLowBalance.includes('FALLBACK') ? t.fallbackAction : null,
        fallbackAmount: isBalance(t.action) && t.onLowBalance.includes('FALLBACK') ? Number(t.fallbackAmount) : null,
      })),
    }
    try {
      if (editingId) await api.put(`/attendance-rules/${editingId}`, payload)
      else await api.post('/attendance-rules', payload)
      setSuccess(editingId ? 'Rule set updated.' : 'Rule set added.')
      close(); load()
    } catch (err) { setFormError(err.response?.data?.message || 'Could not save the rule set.') }
  }

  async function remove(s) {
    if (!window.confirm(`Delete "${s.name}"? Deductions already made stay as they are.`)) return
    try { await api.delete(`/attendance-rules/${s.ruleSetId}`); setSuccess('Rule set deleted.'); load() }
    catch (err) { setError(err.response?.data?.message || 'Could not delete the rule set.') }
  }

  return <>
    <Topbar />
    <div className="page-head">
      <div><h1>Attendance Rules</h1><p>What happens when someone arrives late or leaves early. Rules apply only when HR ticks “Apply attendance rules” on an entry.</p></div>
      <button type="button" className="btn-blue" onClick={startAdd}>＋ Add Rule Set</button>
    </div>
    {error && <div className="auth-error" style={{ marginBottom: 16 }}>{error}</div>}
    {success && <div className="success-note" style={{ marginBottom: 16 }}>{success}</div>}

    {sets.length === 0 && <div className="table-card"><div style={{ padding: 24 }} className="meta">No rule sets yet. Add one to start.</div></div>}
    {sets.map(s => (
      <div className="table-card" key={s.ruleSetId} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <b>{s.name}</b>
            <div className="meta">{s.departmentName} · checks {WATCH[s.watch]} · count resets every {s.resetPeriod === 'MONTH' ? 'month' : 'year'}</div>
          </div>
          <span className={'badge ' + (s.isActive ? 'active' : 'inactive')}>{s.isActive ? 'Active' : 'Inactive'}</span>
          <div className="row-actions">
            <button className="edit" title="Edit" onClick={() => startEdit(s)}>✎</button>
            <button className="del" title="Delete" onClick={() => remove(s)}>🗑</button>
          </div>
        </div>
        <div className="table-scroll"><table className="emp-table">
          <thead><tr><th>{WATCH[s.watch]} by at least</th><th>Occurrence</th><th>Action</th><th>If the balance is too low</th></tr></thead>
          <tbody>
            {s.tiers.map(t => (
              <tr key={t.tierId}>
                <td>{t.minMinutes} min</td>
                <td>{ordinal(t.occurrenceNo)} time</td>
                <td>{tierText(t)}</td>
                <td className="meta">{isBalance(t.action)
                  ? `${LOW[t.onLowBalance]}${t.onLowBalance.includes('FALLBACK') ? ` (${FALLBACKS[t.fallbackAction]} ${Number(t.fallbackAmount)} day)` : ''}`
                  : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    ))}
    <p className="meta" style={{ marginTop: 4 }}>The last occurrence in a ladder keeps repeating. If a Department has no active rule set of its own, the “All Departments” one is used.</p>

    {showForm && (
      <div className="modal-overlay" onClick={close}>
        <div className="modal-box" style={{ maxWidth: 900 }} onClick={e => e.stopPropagation()}>
          <div className="modal-head">
            <h3>{editingId ? 'Edit Rule Set' : 'Add Rule Set'}</h3>
            <button type="button" className="icon-btn" onClick={close} title="Close">✕</button>
          </div>
          <form onSubmit={save}>
            {formError && <div className="auth-error" style={{ marginBottom: 14 }}>{formError}</div>}
            <div className="form-grid two">
              <div className="field" style={{ gridColumn: '1/-1' }}><label>Name *</label><input required value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Finance late-in policy" /></div>
              <div className="field"><label>Department</label>
                <select value={form.orgDepartmentId} onChange={e => set('orgDepartmentId', e.target.value)}>
                  <option value="">All Departments</option>
                  {departments.map(d => <option key={d.orgDepartmentId} value={d.orgDepartmentId}>{d.departmentName}</option>)}
                </select>
              </div>
              <div className="field"><label>Checks</label>
                <select value={form.watch} onChange={e => set('watch', e.target.value)}>
                  <option value="LATE_IN">Late In (first punch-in after shift start)</option>
                  <option value="EARLY_OUT">Early Out (last punch-out before shift end)</option>
                </select>
              </div>
              <div className="field"><label>Occurrence count resets</label>
                <select value={form.resetPeriod} onChange={e => set('resetPeriod', e.target.value)}>
                  <option value="MONTH">Every month</option><option value="YEAR">Every year (Jan–Dec)</option>
                </select>
              </div>
              <div className="field"><label>Status</label>
                <select value={form.isActive ? '1' : '0'} onChange={e => set('isActive', e.target.value === '1')}>
                  <option value="1">Active</option><option value="0">Inactive</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: 18, marginBottom: 6 }}>
              <b style={{ fontSize: 13.5 }}>Ladder</b>
              <p className="card-sub" style={{ margin: '2px 0 10px' }}>Lateness within the shift’s Grace is never counted. Beyond it, the full time counts. For each occurrence the highest threshold met is used.</p>
            </div>
            {form.tiers.map((t, i) => (
              <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                  <div className="field"><label>At least (min)</label><input type="number" min="1" required value={t.minMinutes} onChange={e => setTier(i, 'minMinutes', e.target.value)} /></div>
                  <div className="field"><label>Occurrence #</label><input type="number" min="1" required value={t.occurrenceNo} onChange={e => setTier(i, 'occurrenceNo', e.target.value)} /></div>
                  <div className="field"><label>Action</label>
                    <select value={t.action} onChange={e => setTier(i, 'action', e.target.value)}>
                      {Object.entries(ACTIONS).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
                    </select>
                  </div>
                  {t.action !== 'WARNING' && <div className="field"><label>Amount ({ACTIONS[t.action].unit}s)</label>
                    <input type="number" min={ACTIONS[t.action].step} step={ACTIONS[t.action].step} required value={t.amount} onChange={e => setTier(i, 'amount', e.target.value)} />
                  </div>}
                </div>
                {isBalance(t.action) && (
                  <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginTop: 8 }}>
                    <div className="field" style={{ gridColumn: 'span 2' }}><label>If the balance is too low</label>
                      <select value={t.onLowBalance} onChange={e => setTier(i, 'onLowBalance', e.target.value)}>
                        {Object.entries(LOW).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    {t.onLowBalance.includes('FALLBACK') && <>
                      <div className="field"><label>Fallback</label>
                        <select value={t.fallbackAction} onChange={e => setTier(i, 'fallbackAction', e.target.value)}>
                          {Object.entries(FALLBACKS).filter(([k]) => k !== t.action).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                      <div className="field"><label>Fallback amount (days)</label>
                        <input type="number" min="0.5" step="0.5" required value={t.fallbackAmount} onChange={e => setTier(i, 'fallbackAmount', e.target.value)} />
                      </div>
                    </>}
                  </div>
                )}
                <div style={{ textAlign: 'right' }}>
                  <button type="button" className="icon-btn" onClick={() => removeTier(i)} title="Remove this step" disabled={form.tiers.length <= 1}>🗑 Remove step</button>
                </div>
              </div>
            ))}
            <button type="button" className="add-row-btn" onClick={addTier}>＋ Add another step</button>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
              <button type="button" className="btn-ghost" onClick={close}>Cancel</button>
              <button className="btn-blue" type="submit">{editingId ? 'Update Rule Set' : 'Save Rule Set'}</button>
            </div>
          </form>
        </div>
      </div>
    )}
  </>
}
