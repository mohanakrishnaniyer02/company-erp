import { Fragment, useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import Topbar from '../components/Topbar.jsx'
import useDepartmentNames from '../hooks/useDepartmentNames'

const emptyPunches = [{in:'',out:''},{in:'',out:''}]
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const today = localDate()
const thisMonth = today.slice(0,7)
const weekAgo = localDate(new Date(Date.now() - 6*86400000))

function punchesToPayload(punches) {
  return punches
    .filter(p => p.in || p.out)
    .map(p => ({punchIn: p.in || null, punchOut: p.out || null}))
}
function formatMinutes(value) {
  const n = Number(value || 0)
  if (n < 60) return `${n}m`
  return `${Math.floor(n / 60)}h ${String(n % 60).padStart(2,'0')}m`
}
function toMinutes(t) { const [h,m] = t.split(':').map(Number); return h*60 + (m||0) }
function weekdayOf(dateStr) {
  const [y,m,d] = dateStr.split('-').map(Number)
  return new Date(y, m-1, d).toLocaleDateString('en-US', {weekday:'short'})
}
// First In, last Out, the gaps between pairs (breaks), and the total break.
// Total break = (last Out - first In) - minutes actually worked, so it includes both the gaps
// between punch pairs and any lunch the shift deducts automatically from a continuous punch.
function punchSummary(punches, actualWork) {
  const pairs = (punches||[]).filter(p => p.punchIn && p.punchOut)
  if (!pairs.length) return {pairs:[], firstIn:null, lastOut:null, gaps:[], span:0, breakMinutes:0, autoLunch:0}
  const mins = t => toMinutes(t)
  const gaps = []
  for (let i = 0; i < pairs.length - 1; i++) {
    const from = mins(pairs[i].punchOut), to = mins(pairs[i+1].punchIn)
    if (to > from) gaps.push({from: pairs[i].punchOut.slice(0,5), to: pairs[i+1].punchIn.slice(0,5), minutes: to - from})
  }
  let s = mins(pairs[0].punchIn), e = mins(pairs[pairs.length-1].punchOut)
  if (e < s) e += 24*60
  const span = e - s
  const breakMinutes = Math.max(0, span - actualWork)
  const gapTotal = gaps.reduce((t,g)=>t+g.minutes, 0)
  return {pairs, firstIn: pairs[0].punchIn.slice(0,5), lastOut: pairs[pairs.length-1].punchOut.slice(0,5), gaps, span, breakMinutes, autoLunch: Math.max(0, breakMinutes - gapTotal)}
}
function monthRange(monthStr) {
  const [y,m] = monthStr.split('-').map(Number)
  const from = `${monthStr}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to = `${monthStr}-${String(lastDay).padStart(2,'0')}`
  return {from, to, daysInMonth: lastDay}
}

export default function Attendance() {
  const [employees,setEmployees] = useState([]), [shifts,setShifts] = useState([]), [statuses,setStatuses] = useState([])
  const departments = useDepartmentNames()
  const [departmentFilter,setDepartmentFilter] = useState('')
  const [viewMode,setViewMode] = useState('month'), [dayDate,setDayDate] = useState(today), [month,setMonth] = useState(thisMonth)
  const [rangeFrom,setRangeFrom] = useState(weekAgo), [rangeTo,setRangeTo] = useState(today)
  const [expanded,setExpanded] = useState({}), [appliedInfo,setAppliedInfo] = useState({})
  const [entries,setEntries] = useState([]), [roundingRules,setRoundingRules] = useState([])
  const [ruleForm,setRuleForm] = useState({fromMinutes:0,toMinutes:29,roundedMinutes:0})
  const [showRoundingModal,setShowRoundingModal] = useState(false)
  const [showEntryModal,setShowEntryModal] = useState(false)
  const [error,setError] = useState(''), [success,setSuccess] = useState('')
  useEffect(()=>{ if(!success) return; const t=setTimeout(()=>setSuccess(''),4000); return()=>clearTimeout(t) },[success])

  // ---- entry modal's own form state ----
  const [editingId,setEditingId] = useState(null)
  const [formEmployeeId,setFormEmployeeId] = useState(''), [formDepartmentFilter,setFormDepartmentFilter] = useState(''), [date,setDate] = useState(today)
  const [shiftSource,setShiftSource] = useState(''), [shiftId,setShiftId] = useState(''), [attendanceStatusId,setAttendanceStatusId] = useState('')
  const [bio,setBio] = useState(null), [bioLoading,setBioLoading] = useState(false)
  const [applyRules,setApplyRules] = useState(false), [ruleTouched,setRuleTouched] = useState(false), [rulePreview,setRulePreview] = useState(null), [rulesWereApplied,setRulesWereApplied] = useState(false)
  const [entryType,setEntryType] = useState('User'), [punches,setPunches] = useState(emptyPunches)
  const [calc,setCalc] = useState({actualWorkMinutes:0,requiredWorkMinutes:0,calculatedOtMinutes:0,roundedOtMinutes:0})
  const [otInfo,setOtInfo] = useState(null)   // when editing: that entry's current OT decision
  const [comments,setComments] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/employees'), api.get('/shifts'), api.get('/attendance/statuses'), api.get('/attendance/rounding-rules')
    ]).then(([e,s,a,r]) => {
      setEmployees(e.data); setShifts(s.data); setStatuses(a.data); setRoundingRules(r.data)
      const present=a.data.find(x=>x.status==='PRESENT'); if(present) setAttendanceStatusId(String(present.attendanceStatusId))
    }).catch(()=>setError('Could not load attendance masters.'))
  },[])

  const {from, to} = useMemo(()=>{
    if (viewMode==='day') return {from:dayDate, to:dayDate}
    if (viewMode==='range') return rangeFrom<=rangeTo ? {from:rangeFrom, to:rangeTo} : {from:rangeTo, to:rangeFrom}
    const m = monthRange(month); return {from:m.from, to:m.to}
  },[viewMode,dayDate,month,rangeFrom,rangeTo])
  const loadEntries = () => {
    if (!from || !to) return
    api.get('/attendance',{params:{fromDate:from, toDate:to}}).then(r=>setEntries(r.data)).catch(()=>setError('Could not load attendance entries.'))
  }
  useEffect(()=>{loadEntries(); setExpanded({})},[from,to])

  const formSelectedEmployee = useMemo(()=>employees.find(e=>String(e.employeeId)===String(formEmployeeId)),[employees,formEmployeeId])
  const empById = useMemo(()=>Object.fromEntries(employees.map(e=>[e.employeeId,e])),[employees])
  const inDept = e => !departmentFilter || e?.orgDepartment===departmentFilter
  const shiftById = useMemo(()=>Object.fromEntries(shifts.map(x=>[x.shiftId,x])),[shifts])

  // Rows shown: saved entries for the chosen Department; in Day view, also everyone active in that
  // Department with no entry yet (so it is obvious who still needs attendance).
  const rows = useMemo(()=>{
    const list = entries.filter(a=>inDept(empById[a.employeeId]))
      .slice().sort((x,y)=>x.attendanceDate.localeCompare(y.attendanceDate) || x.employeeName.localeCompare(y.employeeName))
      .map(a=>({kind:'entry', key:'a'+a.attendanceId, a}))
    if (viewMode==='day') {
      const have = new Set(entries.map(a=>a.employeeId))
      employees.filter(e=>e.status==='Active' && inDept(e) && !have.has(e.employeeId))
        .slice().sort((x,y)=>x.fullName.localeCompare(y.fullName))
        .forEach(e=>list.push({kind:'missing', key:'m'+e.employeeId, e}))
    }
    return list
  },[entries,employees,empById,departmentFilter,viewMode])

  const summary = useMemo(()=>{
    const s = {entries:0, present:0, halfDay:0, leave:0, absent:0, late:0, pendingOt:0, notEntered:0}
    for (const r of rows) {
      if (r.kind==='missing') { s.notEntered++; continue }
      const a = r.a; s.entries++
      if (a.attendanceType==='PRESENT'||a.attendanceType==='ON_DUTY') s.present++
      else if (a.attendanceType==='HALF_DAY') s.halfDay++
      else if (a.attendanceType==='PAID_LEAVE'||a.attendanceType==='UNPAID_LEAVE') s.leave++
      else if (a.attendanceType==='ABSENT') s.absent++
      if (a.lateInMinutes>0) s.late++
      if (a.otStatus==='PENDING') s.pendingOt++
    }
    return s
  },[rows])

  function toggleRow(a){
    setExpanded(x=>({...x,[a.attendanceId]:!x[a.attendanceId]}))
    if (a.rulesApplied && !appliedInfo[a.attendanceId]) {
      api.get(`/attendance-rules/applied/${a.attendanceId}`).then(r=>setAppliedInfo(x=>({...x,[a.attendanceId]:r.data}))).catch(()=>{})
    }
  }
  function resetForm(){
    setEditingId(null); setFormEmployeeId(''); setFormDepartmentFilter(departmentFilter||''); setDate(viewMode==='day'?dayDate:today); setShiftId(''); setShiftSource(''); setEntryType('User')
    const present=statuses.find(x=>x.status==='PRESENT'); setAttendanceStatusId(present?String(present.attendanceStatusId):'')
    setPunches(emptyPunches); setComments(''); setOtInfo(null)
    setApplyRules(false); setRuleTouched(false); setRulePreview(null); setRulesWereApplied(false); setBio(null)
    setCalc({actualWorkMinutes:0,requiredWorkMinutes:0,calculatedOtMinutes:0,roundedOtMinutes:0})
  }
  function openAdd(prefillEmployeeId, prefillDate){
    resetForm()
    if (prefillEmployeeId) { setFormEmployeeId(String(prefillEmployeeId)); const emp = empById[prefillEmployeeId]; setFormDepartmentFilter(emp?.orgDepartment||'') }
    if (prefillDate) setDate(prefillDate)
    setError(''); setSuccess(''); setShowEntryModal(true)
  }
  function openEdit(a){
    setEditingId(a.attendanceId); setFormEmployeeId(String(a.employeeId))
    const emp = employees.find(e=>e.employeeId===a.employeeId)
    setFormDepartmentFilter(emp?.orgDepartment||''); setDate(a.attendanceDate)
    setShiftId(String(a.shiftId))
    const st = statuses.find(x=>x.status===a.attendanceType); setAttendanceStatusId(st?String(st.attendanceStatusId):'')
    setEntryType(a.entryType)
    const loaded = (a.punches||[]).map(p=>({in:(p.punchIn||'').slice(0,5), out:(p.punchOut||'').slice(0,5)}))
    setPunches(loaded.length ? loaded : emptyPunches)
    setComments(a.comments||'')
    setOtInfo({status:a.otStatus, rounded:a.roundedOtMinutes, approved:a.approvedOtMinutes})
    setApplyRules(!!a.rulesApplied); setRuleTouched(true); setRulePreview(null); setRulesWereApplied(!!a.rulesApplied); setBio(null)
    setCalc({actualWorkMinutes:a.actualWorkMinutes,requiredWorkMinutes:a.requiredWorkMinutes,calculatedOtMinutes:a.calculatedOtMinutes,roundedOtMinutes:a.roundedOtMinutes})
    setError(''); setSuccess(''); setShowEntryModal(true)
  }
  function closeModal(){ setShowEntryModal(false) }

  // Auto-fill the shift when picking an employee inside the modal (only for a brand-new entry).
  // New entries: the shift is whatever applies to this employee on this date —
  // a Shift Mapping covering the date if there is one, else their own shift.
  useEffect(()=>{
    if(!showEntryModal || editingId || !formEmployeeId || !date) return
    let cancelled=false
    api.get('/shift-mappings/resolve',{params:{employeeId:formEmployeeId,date}}).then(r=>{
      if(cancelled) return
      setShiftSource(r.data.source)
      if(r.data.shiftId) setShiftId(String(r.data.shiftId))
    }).catch(()=>{})
    return()=>{cancelled=true}
  },[showEntryModal,editingId,formEmployeeId,date])

  // Debounced live calculation as punches/shift change, same as before.
  useEffect(()=>{
    if(!showEntryModal || !formEmployeeId || !shiftId) return
    const timer=setTimeout(async()=>{
      try{
        const payload={employeeId:Number(formEmployeeId),shiftId:Number(shiftId),punches:punchesToPayload(punches)}
        const r=await api.post('/attendance/calculate',payload)
        setCalc(r.data)
      }catch{}
    },300)
    return()=>clearTimeout(timer)
  },[formEmployeeId,shiftId,JSON.stringify(punches),showEntryModal])

  // What ticking "Apply attendance rules" would do. A new entry gets the box ticked automatically
  // when lateness is detected and a rule matches; HR can untick it to waive.
  useEffect(()=>{
    if(!showEntryModal || !formEmployeeId || !shiftId || !date) { setRulePreview(null); return }
    const timer=setTimeout(async()=>{
      try{
        const r=await api.post('/attendance-rules/preview',{employeeId:Number(formEmployeeId),shiftId:Number(shiftId),attendanceDate:date,punches:punchesToPayload(punches),excludeAttendanceId:editingId||null})
        setRulePreview(r.data)
        if(!editingId && !ruleTouched) setApplyRules(r.data.evaluations.length>0)
      }catch{ setRulePreview(null) }
    },400)
    return()=>clearTimeout(timer)
  },[formEmployeeId,shiftId,date,JSON.stringify(punches),showEntryModal,editingId])

  // Biometric entries: pull the day's captures from the machine data and fill the punch rows.
  // Duplicate scans (e.g. face + thumb a few seconds apart) are already removed by the server.
  // Nothing is saved until Save Attendance is pressed, so the times can still be corrected.
  async function fetchBiometric(){
    if(!formEmployeeId||!date) return
    setBioLoading(true); setBio(null)
    try{
      const r=await api.get('/biometric/punches',{params:{employeeId:formEmployeeId,date}})
      const d=r.data
      if(d.punches.length>0){
        const rows=d.punches.map(p=>({in:(p.punchIn||'').slice(0,5), out:(p.punchOut||'').slice(0,5)}))
        while(rows.length<2) rows.push({in:'',out:''})
        setPunches(rows)
      } else setPunches(emptyPunches)
      setBio({ok:true, ...d})
    }catch(err){
      setBio({ok:false, message: err.response?.data?.message || 'Could not read the biometric data.'})
    }finally{ setBioLoading(false) }
  }
  useEffect(()=>{
    if(!showEntryModal || editingId || entryType!=='Biometric' || !formEmployeeId || !date) return
    fetchBiometric()
  },[showEntryModal,editingId,entryType,formEmployeeId,date])
  useEffect(()=>{ if(entryType!=='Biometric') setBio(null) },[entryType])

  function setPunch(index,field,value){ setPunches(rows => rows.map((r,i) => i===index ? {...r,[field]:value} : r)) }
  function addPunchRow(){ setPunches(rows => [...rows, {in:'',out:''}]) }
  function removePunchRow(index){ setPunches(rows => rows.length<=1 ? rows : rows.filter((_,i)=>i!==index)) }

  async function save(e){
    e.preventDefault(); setError(''); setSuccess('')
    if(!formEmployeeId||!shiftId||!attendanceStatusId){setError('Employee, shift and attendance type are required.');return}
    try{
      await api.post('/attendance',{
        employeeId:Number(formEmployeeId),attendanceDate:date,shiftId:Number(shiftId),attendanceStatusId:Number(attendanceStatusId),
        entryType,punches:punchesToPayload(punches),
        comments:comments||null, applyRules
      })
      setSuccess(`Attendance saved for ${formSelectedEmployee?.fullName}.`)
      setShowEntryModal(false)
      loadEntries()
    }catch(err){setError(err.response?.data?.message||'Could not save attendance.')}
  }

  async function removeEntry(a){
    if(!window.confirm(`Delete the ${a.attendanceDate} entry for ${a.employeeName}?`)) return
    try{ await api.delete(`/attendance/${a.attendanceId}`); setSuccess('Attendance entry deleted.'); loadEntries() }
    catch(err){ setError(err.response?.data?.message||'Could not delete this entry.') }
  }

  async function addRoundingRule(e){
    e.preventDefault(); setError('')
    try{
      await api.post('/attendance/rounding-rules',{
        fromMinutes:Number(ruleForm.fromMinutes),toMinutes:Number(ruleForm.toMinutes),
        roundedMinutes:Number(ruleForm.roundedMinutes),isActive:true
      })
      const r=await api.get('/attendance/rounding-rules'); setRoundingRules(r.data)
      setSuccess('OT rounding rule added.')
    }catch(err){setError(err.response?.data?.message||'Could not add rounding rule.')}
  }
  async function deleteRoundingRule(id, label){
    if (!window.confirm(`Delete the rounding rule "${label}"?`)) return
    setError('')
    try{
      await api.delete(`/attendance/rounding-rules/${id}`)
      setRoundingRules(rules=>rules.filter(r=>r.otRoundingRuleId!==id))
      setSuccess('OT rounding rule deleted.')
    }catch(err){setError(err.response?.data?.message||'Could not delete rounding rule.')}
  }

  return <>
    <Topbar/>
    <div className="page-head">
      <div><h1>Attendance</h1><p>See who came in, who left, breaks, work hours and overtime — by day, month or any range.</p></div>
      <div style={{display:'flex', gap:10}}>
        <button type="button" className="btn-ghost" onClick={()=>setShowRoundingModal(true)}>⚙ OT Rounding Rules</button>
        <button type="button" className="btn-blue" onClick={()=>openAdd()}>＋ Add Entry</button>
      </div>
    </div>
    {error&&<div className="auth-error" style={{marginBottom:16}}>{error}</div>}
    {success&&<div className="success-note" style={{marginBottom:16}}>{success}</div>}

    <div className="card att-filters" style={{marginBottom:16}}>
      <div className="seg" role="tablist" aria-label="View by">
        {[['day','Day'],['month','Month'],['range','Range']].map(([k,l])=>(
          <button key={k} type="button" role="tab" aria-selected={viewMode===k} className={viewMode===k?'active':''} onClick={()=>setViewMode(k)}>{l}</button>
        ))}
      </div>
      {viewMode==='day' && <div className="field"><label>Date</label><input type="date" value={dayDate} onChange={e=>e.target.value && setDayDate(e.target.value)}/></div>}
      {viewMode==='month' && <div className="field"><label>Month</label><input type="month" value={month} onChange={e=>e.target.value && setMonth(e.target.value)}/></div>}
      {viewMode==='range' && <>
        <div className="field"><label>From</label><input type="date" value={rangeFrom} max={rangeTo} onChange={e=>e.target.value && setRangeFrom(e.target.value)}/></div>
        <div className="field"><label>To</label><input type="date" value={rangeTo} min={rangeFrom} onChange={e=>e.target.value && setRangeTo(e.target.value)}/></div>
      </>}
      <div className="field"><label>Department</label>
        <select value={departmentFilter} onChange={e=>setDepartmentFilter(e.target.value)}>
          <option value="">All Departments</option>
          {departments.map(d=><option key={d} value={d}>{d}</option>)}
        </select>
      </div>
    </div>

    <div className="kpi-grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))'}}>
      <div className="kpi-card"><div className="lbl">Entries</div><div className="num">{summary.entries}</div></div>
      <div className="kpi-card"><div className="lbl">Present</div><div className="num">{summary.present}</div></div>
      <div className="kpi-card"><div className="lbl">Half Day</div><div className="num">{summary.halfDay}</div></div>
      <div className="kpi-card"><div className="lbl">Leave</div><div className="num">{summary.leave}</div></div>
      <div className="kpi-card"><div className="lbl">Absent</div><div className="num">{summary.absent}</div></div>
      <div className="kpi-card"><div className="lbl">Late In</div><div className="num">{summary.late}</div></div>
      <div className="kpi-card"><div className="lbl">OT Pending</div><div className="num">{summary.pendingOt}</div></div>
      {viewMode==='day' && <div className="kpi-card"><div className="lbl">Not Entered</div><div className="num">{summary.notEntered}</div></div>}
    </div>

    <div className="table-card">
      <div className="table-scroll"><table className="emp-table att-table">
        <thead><tr>
          <th>#</th><th>Employee</th><th>Date</th><th>Day</th><th>Shift</th><th>Status</th>
          <th>In Time</th><th>Out Time</th><th title="Click a break to see when it was taken">Break</th>
          <th title="Required time plus any approved overtime — what counts toward pay">Work Hrs</th><th>OT Hrs</th><th></th>
        </tr></thead>
        <tbody>{rows.map((r,i)=>{
          if (r.kind==='missing') {
            const e = r.e
            return (
              <tr key={r.key} className="att-missing">
                <td className="meta">{i+1}</td>
                <td><b>{e.fullName}</b><div className="meta">{e.empCode}</div></td>
                <td className="mono">{dayDate}</td><td>{weekdayOf(dayDate)}</td><td className="meta">—</td>
                <td><span className="badge inactive">Not entered</span></td>
                <td colSpan={5} className="meta">No attendance recorded for this day yet.</td>
                <td><button type="button" className="btn-ghost att-add" onClick={()=>openAdd(e.employeeId, dayDate)}>＋ Add</button></td>
              </tr>
            )
          }
          const a = r.a
          const ps = punchSummary(a.punches, a.actualWorkMinutes)
          const open = !!expanded[a.attendanceId]
          const shift = shiftById[a.shiftId]
          const applied = appliedInfo[a.attendanceId]
          return (
            <Fragment key={r.key}>
              <tr className={open?'att-open':''}>
                <td className="meta">{i+1}</td>
                <td><b>{a.employeeName}</b><div className="meta">{a.empCode}</div></td>
                <td className="mono">{a.attendanceDate}</td><td>{weekdayOf(a.attendanceDate)}</td>
                <td className="meta">{a.shiftName}</td>
                <td><span className={'badge '+(a.attendanceType==='PRESENT'||a.attendanceType==='ON_DUTY'?'active':'inactive')}>{a.attendanceType.replace('_',' ')}</span>{a.rulesApplied && <div className="meta" title="Attendance rules were applied to this day">⚖ rules applied</div>}</td>
                <td>{ps.firstIn||'—'}{a.lateInMinutes>0 && <div className="att-flag" title="Minutes past shift start, after Grace In">late {formatMinutes(a.lateInMinutes)}</div>}</td>
                <td>{ps.lastOut||'—'}{a.earlyOutMinutes>0 && <div className="att-flag" title="Minutes before shift end, after Grace Out">early {formatMinutes(a.earlyOutMinutes)}</div>}</td>
                <td>{ps.pairs.length>0
                  ? <button type="button" className="att-break" onClick={()=>toggleRow(a)} aria-expanded={open} title="Show punches and break times">
                      {ps.breakMinutes>0 ? formatMinutes(ps.breakMinutes) : 'None'} <span aria-hidden="true">{open?'▴':'▾'}</span>
                    </button>
                  : '—'}</td>
                <td>{formatMinutes(a.countedWorkMinutes)}{a.countedWorkMinutes!==a.actualWorkMinutes && <div className="meta" title="Total time punched, before OT approval">punched {formatMinutes(a.actualWorkMinutes)}</div>}</td>
                <td>
                  {a.otStatus==='APPROVED' && <><b>{formatMinutes(a.approvedOtMinutes)}</b> <span className="pill approved">Approved</span></>}
                  {a.otStatus==='PENDING' && <><span className="pill pending">Pending</span><div className="meta">{formatMinutes(a.roundedOtMinutes)} awaiting approval</div></>}
                  {a.otStatus==='REJECTED' && <><span className="pill rejected">Rejected</span><div className="meta">{formatMinutes(a.roundedOtMinutes)} not counted</div></>}
                  {(!a.otStatus || a.otStatus==='NONE') && '—'}
                </td>
                <td><div className="row-actions">
                  <button type="button" className="edit" title="Edit" onClick={()=>openEdit(a)}>✎</button>
                  <button type="button" className="del" title="Delete" onClick={()=>removeEntry(a)}>🗑</button>
                </div></td>
              </tr>
              {open && (
                <tr className="att-detail"><td colSpan={12}>
                  <div className="att-timeline">
                    {ps.pairs.map((p,j)=>(
                      <Fragment key={j}>
                        <div className="att-seg work"><b>{p.punchIn.slice(0,5)} → {p.punchOut.slice(0,5)}</b><span>Worked {formatMinutes(toMinutes(p.punchOut)-toMinutes(p.punchIn) < 0 ? toMinutes(p.punchOut)-toMinutes(p.punchIn)+1440 : toMinutes(p.punchOut)-toMinutes(p.punchIn))}</span></div>
                        {ps.gaps[j] && ps.gaps[j].from===p.punchOut.slice(0,5) && (
                          <div className="att-seg brk"><b>☕ {ps.gaps[j].from} → {ps.gaps[j].to}</b><span>Break {formatMinutes(ps.gaps[j].minutes)}</span></div>
                        )}
                      </Fragment>
                    ))}
                  </div>
                  <div className="att-notes">
                    {ps.autoLunch>0 && <div>{formatMinutes(ps.autoLunch)} of the shift's lunch window{shift?.lunchStartTime ? ` (${shift.lunchStartTime.slice(0,5)}–${shift.lunchEndTime.slice(0,5)})` : ''} falls inside punched time, so it is not counted as work.</div>}
                    <div>Total break {formatMinutes(ps.breakMinutes)} · punched span {formatMinutes(ps.span)} · worked {formatMinutes(a.actualWorkMinutes)}</div>
                    {a.lateInMinutes>0 && <div>Late In: {formatMinutes(a.lateInMinutes)} past shift start{shift ? ` (${shift.startTime.slice(0,5)}, grace ${shift.graceInMinutes} min)` : ''}</div>}
                    {a.earlyOutMinutes>0 && <div>Early Out: {formatMinutes(a.earlyOutMinutes)} before shift end{shift ? ` (${shift.endTime.slice(0,5)}, grace ${shift.graceOutMinutes} min)` : ''}</div>}
                    {applied && applied.map((ap,j)=><div key={j}>⚖ {ap.watchName} {ap.varianceMinutes} min, occurrence {ap.occurrenceNo} ({ap.ruleSetName}): {ap.charges.map(c=>c.label).join(' + ')}</div>)}
                    <div>Entry type: {a.entryType}{a.comments ? ` · Note: ${a.comments}` : ''}</div>
                  </div>
                </td></tr>
              )}
            </Fragment>
          )
        })}
        {rows.length===0&&<tr className="empty-row"><td colSpan={12}>No attendance entries for this {viewMode==='day'?'day':viewMode==='month'?'month':'range'}{departmentFilter?` in ${departmentFilter}`:''}.</td></tr>}
        </tbody>
      </table></div>
    </div>

    {showEntryModal && (
      <div className="modal-overlay" onClick={closeModal}>
        <div className="modal-box" style={{maxWidth:760}} onClick={e=>e.stopPropagation()}>
          <div className="modal-head">
            <h3>{editingId ? 'Edit Attendance Entry' : 'Add Attendance Entry'}</h3>
            <button type="button" className="icon-btn" onClick={closeModal} title="Close">✕</button>
          </div>
          <form onSubmit={save}>
            <div className="form-grid">
              <div className="field"><label>Date *</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/><small className="field-help">{weekdayOf(date)}</small></div>
              <div className="field"><label>Department</label>
                <select value={formDepartmentFilter} onChange={e=>{setFormDepartmentFilter(e.target.value); setFormEmployeeId('')}} disabled={!!editingId}>
                  <option value="">All Departments</option>
                  {departments.map(d=><option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="field"><label>Employee *</label>
                <select value={formEmployeeId} onChange={e=>setFormEmployeeId(e.target.value)} disabled={!!editingId}>
                  <option value="">Select employee…</option>
                  {employees.filter(e=>e.status==='Active' && (!formDepartmentFilter || e.orgDepartment===formDepartmentFilter)).map(e=><option key={e.employeeId} value={e.employeeId}>{e.fullName} — {e.empCode}</option>)}
                </select>
              </div>
              <div className="field"><label>Employee ID</label><input className="mono" value={formSelectedEmployee?.empCode||''} disabled/></div>
              <div className="field"><label>Shift *</label>
                <select value={shiftId} onChange={e=>setShiftId(e.target.value)}>
                  <option value="">Select shift…</option>{shifts.filter(s=>s.status==='Active').map(s=><option key={s.shiftId} value={s.shiftId}>{s.shiftName} — {s.shiftCode}</option>)}
                </select>
                {shiftSource==='Mapped' && <small className="field-help" style={{color:'var(--blue-700)', fontWeight:600}}>Mapped shift for this date</small>}
                {shiftSource==='Default' && <small className="field-help">Employee's default shift</small>}
                {shiftSource==='None' && <small className="field-help">No shift allocated to this employee — pick one</small>}
              </div>
              <div className="field"><label>Attendance Type *</label>
                <select value={attendanceStatusId} onChange={e=>setAttendanceStatusId(e.target.value)}>
                  <option value="">Select type…</option>{statuses.map(s=><option key={s.attendanceStatusId} value={s.attendanceStatusId}>{s.status} — {s.meaning}</option>)}
                </select>
              </div>
              <div className="field"><label>Entry Type *</label>
                <select value={entryType} onChange={e=>setEntryType(e.target.value)}>
                  <option value="User">User (manual)</option><option value="Biometric">Biometric (machine)</option>
                </select>
              </div>
              <div className="field" style={{gridColumn:'1/-1'}}><label>Comments</label><input value={comments} onChange={e=>setComments(e.target.value)} placeholder="Any general note about this day (optional)"/></div>
            </div>

            {entryType==='Biometric' && (
              <div className={'bio-note'+(bio&&!bio.ok?' bad':'')}>
                <div style={{display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
                  <b>Biometric punches</b>
                  <button type="button" className="btn-ghost att-add" onClick={fetchBiometric} disabled={bioLoading||!formEmployeeId}>{bioLoading?'Fetching…':'↻ Fetch from machine'}</button>
                </div>
                {!formEmployeeId && <div className="meta">Pick an employee and date to fetch their punches.</div>}
                {bio && !bio.ok && <div style={{marginTop:6}}>{bio.message}</div>}
                {bio && bio.ok && <div style={{marginTop:6, lineHeight:1.6}}>
                  {bio.rawCount===0 && <>No punches found on the machine for Device ID {bio.deviceEmpId} on this date. You can still type the times below.</>}
                  {bio.rawCount>0 && <>Fetched {bio.rawCount} capture{bio.rawCount===1?'':'s'} for Device ID {bio.deviceEmpId}
                    {bio.duplicatesIgnored>0 && <> — {bio.duplicatesIgnored} duplicate scan{bio.duplicatesIgnored===1?'':'s'} within {bio.duplicateWindowSeconds}s ignored</>}.
                    {' '}Captured: {bio.capturedTimes.map(t=>t.slice(0,5)).join(', ')}. Review the times below, then Save Attendance.</>}
                  {bio.lastPunchHasNoOut && <div style={{color:'var(--amber)', fontWeight:600}}>The last scan has no matching Out. Add the Out time (or delete that row) before saving.</div>}
                </div>}
              </div>
            )}

            <div style={{marginTop:18, marginBottom:6}}>
              <b style={{fontSize:13.5}}>In / Out Punches</b>
              <p className="card-sub" style={{margin:'2px 0 12px'}}>Add as many pairs as actually happened. A gap between one Out and the next In is automatically treated as a break.</p>
            </div>
            {punches.map((p,i)=>(
              <div key={i}>
                <div className="rep-row">
                  <div className="field" style={{margin:0}}><label>In {i+1}</label><input type="time" value={p.in} onChange={e=>setPunch(i,'in',e.target.value)}/></div>
                  <div className="field" style={{margin:0}}><label>Out {i+1}</label><input type="time" value={p.out} onChange={e=>setPunch(i,'out',e.target.value)}/></div>
                  <div></div>
                  <button type="button" className="icon-btn" onClick={()=>removePunchRow(i)} title="Remove this pair">✕</button>
                </div>
                {i < punches.length-1 && punches[i].in && punches[i].out && punches[i+1].in && punches[i+1].out && toMinutes(punches[i+1].in) > toMinutes(punches[i].out) && (
                  <div className="field-help" style={{margin:'-6px 0 10px 2px'}}>↳ Break: {formatMinutes(toMinutes(punches[i+1].in) - toMinutes(punches[i].out))}</div>
                )}
              </div>
            ))}
            <button type="button" className="add-row-btn" onClick={addPunchRow}>＋ Add another In/Out</button>

            <div className="section-label" style={{marginTop:18}}>Time Calculation</div>
            <div className="calc-grid">
              <div className="calc-box"><span>Actual Work</span><strong>{formatMinutes(calc.actualWorkMinutes)}</strong><small>{calc.actualWorkMinutes} minutes</small></div>
              <div className="calc-box"><span>Required Work</span><strong>{formatMinutes(calc.requiredWorkMinutes)}</strong><small>{calc.requiredWorkMinutes} minutes</small></div>
              <div className="calc-box"><span>Calculated OT</span><strong>{formatMinutes(calc.calculatedOtMinutes)}</strong><small>{calc.calculatedOtMinutes} minutes</small></div>
              <div className="calc-box"><span>Rounded OT</span><strong>{formatMinutes(calc.roundedOtMinutes)}</strong><small>{calc.roundedOtMinutes} minutes</small></div>
              <div className="calc-box"><span>Counted Work</span><strong>{formatMinutes(Math.min(calc.actualWorkMinutes, calc.requiredWorkMinutes))}</strong><small>approved OT is added once decided</small></div>
              <div className="field" style={{gridColumn:'1 / -1'}}>
                <label>Overtime approval</label>
                <div className="meta" style={{fontSize:12.5, lineHeight:1.5}}>
                  {calc.roundedOtMinutes <= 0 && 'No overtime on this entry.'}
                  {calc.roundedOtMinutes > 0 && otInfo && otInfo.rounded === calc.roundedOtMinutes && otInfo.status === 'APPROVED' && `Approved: ${formatMinutes(otInfo.approved)}. This stays as decided unless the overtime changes.`}
                  {calc.roundedOtMinutes > 0 && otInfo && otInfo.rounded === calc.roundedOtMinutes && otInfo.status === 'REJECTED' && 'Rejected — the overtime is not counted. This stays as decided unless the overtime changes.'}
                  {calc.roundedOtMinutes > 0 && !(otInfo && otInfo.rounded === calc.roundedOtMinutes && (otInfo.status === 'APPROVED' || otInfo.status === 'REJECTED')) && `${formatMinutes(calc.roundedOtMinutes)} of overtime will be sent to an Admin or SuperAdmin for approval. It only counts toward work hours once approved.`}
                </div>
              </div>
            </div>

            {rulePreview && (rulePreview.lateInMinutes>0 || rulePreview.earlyOutMinutes>0 || rulesWereApplied) && (
              <div style={{marginTop:16, border:'1px solid var(--line)', borderRadius:10, padding:'12px 14px'}}>
                <label style={{display:'flex', alignItems:'center', gap:8, fontWeight:600, cursor:'pointer'}}>
                  <input type="checkbox" style={{width:'auto'}} checked={applyRules} onChange={e=>{setApplyRules(e.target.checked); setRuleTouched(true)}}/>
                  Apply attendance rules
                </label>
                <div className="meta" style={{fontSize:12.5, lineHeight:1.6, marginTop:6}}>
                  {rulePreview.lateInMinutes>0 && <div>Late In: {formatMinutes(rulePreview.lateInMinutes)} past shift start (Grace In is {rulePreview.graceInMinutes} min).</div>}
                  {rulePreview.earlyOutMinutes>0 && <div>Early Out: {formatMinutes(rulePreview.earlyOutMinutes)} before shift end (Grace Out is {rulePreview.graceOutMinutes} min).</div>}
                  {rulePreview.evaluations.map(ev=>(
                    <div key={ev.watch} style={{color:'var(--text)', marginTop:4}}>
                      <b>{ev.watchName}, occurrence {ev.occurrence} in {ev.resetLabel}</b> ({ev.ruleSetName}): {ev.charges.map(c=>c.label).join(' + ')}
                    </div>
                  ))}
                  {rulePreview.evaluations.length===0 && (rulePreview.lateInMinutes>0 || rulePreview.earlyOutMinutes>0) && <div>No rule matches this: there may be no active rule set for this employee's Department, or the time is below its first threshold.</div>}
                  {rulesWereApplied && <div>{applyRules ? 'Rules were applied to this entry earlier. Saving recalculates them.' : 'Rules were applied to this entry earlier. Saving with this unticked removes those deductions.'}</div>}
                  {!applyRules && rulePreview.evaluations.length>0 && !rulesWereApplied && <div>Unticked: nothing will be deducted.</div>}
                </div>
              </div>
            )}

            <div style={{display:'flex', justifyContent:'flex-end', gap:10, marginTop:20, paddingTop:16, borderTop:'1px solid var(--line)'}}>
              <button type="button" className="btn-ghost" onClick={closeModal}>Cancel</button>
              <button type="submit" className="btn-blue">Save Attendance</button>
            </div>
          </form>
        </div>
      </div>
    )}

    {showRoundingModal && (
      <div className="modal-overlay" onClick={()=>setShowRoundingModal(false)}>
        <div className="modal-box" onClick={e=>e.stopPropagation()}>
          <div className="modal-head">
            <h3>OT Rounding Rules</h3>
            <button type="button" className="icon-btn" onClick={()=>setShowRoundingModal(false)} title="Close">✕</button>
          </div>
          <form className="form-grid" onSubmit={addRoundingRule} style={{marginBottom:18}}>
            <div className="field"><label>From Minutes</label><input type="number" min="0" value={ruleForm.fromMinutes} onChange={e=>setRuleForm(f=>({...f,fromMinutes:e.target.value}))}/></div>
            <div className="field"><label>To Minutes</label><input type="number" min="0" value={ruleForm.toMinutes} onChange={e=>setRuleForm(f=>({...f,toMinutes:e.target.value}))}/></div>
            <div className="field"><label>Payroll OT Minutes</label><input type="number" min="0" value={ruleForm.roundedMinutes} onChange={e=>setRuleForm(f=>({...f,roundedMinutes:e.target.value}))}/></div>
            <div className="field" style={{display:'flex',alignItems:'end'}}><button className="btn-blue" type="submit">＋ Add Rule</button></div>
          </form>
          <div className="table-scroll" style={{maxHeight:280, overflowY:'auto'}}><table className="emp-table"><thead><tr><th>Actual OT From</th><th>Actual OT To</th><th>Payroll OT</th><th></th></tr></thead>
          <tbody>{roundingRules.map(r=>(
            <tr key={r.otRoundingRuleId}>
              <td>{formatMinutes(r.fromMinutes)}</td><td>{formatMinutes(r.toMinutes)}</td><td><b>{formatMinutes(r.roundedMinutes)}</b></td>
              <td><button type="button" className="icon-btn" onClick={()=>deleteRoundingRule(r.otRoundingRuleId, `${formatMinutes(r.fromMinutes)} – ${formatMinutes(r.toMinutes)}`)} title="Delete this rule">🗑</button></td>
            </tr>
          ))}</tbody></table></div>
        </div>
      </div>
    )}
  </>
}
