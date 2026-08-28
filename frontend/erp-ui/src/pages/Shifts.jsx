import { useEffect, useState } from 'react'
import api from '../api/client'
import Topbar from '../components/Topbar.jsx'

const empty = {
  shiftCode:'', shiftName:'', startTime:'09:30', endTime:'18:30',
  lunchStartTime:'13:00', lunchEndTime:'13:30',
  graceInMinutes:'10', graceOutMinutes:'10', lateAfterMinutes:'10', earlyOutMinutes:'10',
  minimumWorkMinutes:'240', halfDayMinutes:'240', fullDayMinutes:'480',
  otAllowed:true, otStartAfterMinutes:'0', isNightShift:false, status:'Active'
}

function mins(v){const n=Number(v||0); return `${Math.floor(n/60)}h ${n%60}m`}

export default function Shifts(){
  const [items,setItems]=useState([]), [form,setForm]=useState(empty), [editingId,setEditingId]=useState(null)
  const [showForm,setShowForm]=useState(false)
  const [error,setError]=useState(''), [success,setSuccess]=useState('')

  const load=()=>api.get('/shifts').then(r=>setItems(r.data)).catch(()=>setError('Could not load shifts.'))
  useEffect(()=>{load()},[])
  const set=(f,v)=>setForm(x=>({...x,[f]:v}))
  const reset=()=>{setEditingId(null);setForm(empty);setShowForm(false)}
  const startAdd=()=>{setEditingId(null);setForm(empty);setError('');setSuccess('');setShowForm(true)}
  const edit=s=>{
    setEditingId(s.shiftId)
    setForm({
      shiftCode:s.shiftCode,shiftName:s.shiftName,startTime:(s.startTime||'').slice(0,5),endTime:(s.endTime||'').slice(0,5),
      lunchStartTime:s.lunchStartTime?(s.lunchStartTime.slice(0,5)):'',lunchEndTime:s.lunchEndTime?(s.lunchEndTime.slice(0,5)):'',
      graceInMinutes:s.graceInMinutes,graceOutMinutes:s.graceOutMinutes,lateAfterMinutes:s.lateAfterMinutes,earlyOutMinutes:s.earlyOutMinutes,
      minimumWorkMinutes:s.minimumWorkMinutes,halfDayMinutes:s.halfDayMinutes,fullDayMinutes:s.fullDayMinutes,
      otAllowed:s.otAllowed,otStartAfterMinutes:s.otStartAfterMinutes,isNightShift:s.isNightShift,status:s.status
    }); setError('');setSuccess('');setShowForm(true)
  }
  async function save(e){
    e.preventDefault();setError('');setSuccess('')
    const p={...form,graceInMinutes:Number(form.graceInMinutes),graceOutMinutes:Number(form.graceOutMinutes),
      lateAfterMinutes:Number(form.lateAfterMinutes),earlyOutMinutes:Number(form.earlyOutMinutes),
      minimumWorkMinutes:Number(form.minimumWorkMinutes),halfDayMinutes:Number(form.halfDayMinutes),fullDayMinutes:Number(form.fullDayMinutes),
      otStartAfterMinutes:Number(form.otStartAfterMinutes), lunchStartTime:form.lunchStartTime||null,lunchEndTime:form.lunchEndTime||null}
    try{if(editingId)await api.put(`/shifts/${editingId}`,p);else await api.post('/shifts',p);setSuccess(editingId?'Shift updated.':'Shift created.');reset();load()}
    catch(err){setError(err.response?.data?.message||'Could not save shift.')}
  }
  async function remove(s){
    if(!window.confirm(`Delete ${s.shiftName}?`))return
    try{await api.delete(`/shifts/${s.shiftId}`);setSuccess(`${s.shiftName} deleted.`);load()}catch(err){setError(err.response?.data?.message||'Could not delete shift.')}
  }
  return <>
    <Topbar/>
    <div className="page-head">
      <div><h1>Shifts</h1><p>Master configuration used by employee profiles and daily attendance.</p></div>
      <button type="button" className="btn-blue" onClick={showForm?reset:startAdd}>{showForm?'Cancel':'＋ Add Shift'}</button>
    </div>
    {error&&<div className="auth-error" style={{marginBottom:16}}>{error}</div>}
    {success&&<div className="success-note" style={{marginBottom:16}}>{success}</div>}

    {showForm && (
      <div className="modal-overlay" onClick={reset}>
        <div className="modal-box" onClick={e=>e.stopPropagation()}>
          <div className="modal-head">
            <h3>{editingId?'Edit Shift':'Add Shift'}</h3>
            <button type="button" className="icon-btn" onClick={reset} title="Close">✕</button>
          </div>
          <form onSubmit={save}>
            <p className="card-sub">Work and OT values are stored as minutes.</p>
            <div className="form-grid two">
              <div className="field"><label>Shift ID</label><input value={editingId||'Auto-generated'} disabled/></div>
              <div className="field"><label>Shift Code *</label><input required value={form.shiftCode} onChange={e=>set('shiftCode',e.target.value)}/></div>
              <div className="field" style={{gridColumn:'1/-1'}}><label>Shift Name *</label><input required value={form.shiftName} onChange={e=>set('shiftName',e.target.value)}/></div>
              <div className="section-label">Timing</div>
              <div className="field"><label>Shift Start</label><input type="time" value={form.startTime} onChange={e=>set('startTime',e.target.value)}/></div>
              <div className="field"><label>Shift End</label><input type="time" value={form.endTime} onChange={e=>set('endTime',e.target.value)}/></div>
              <div className="field"><label>Lunch Start</label><input type="time" value={form.lunchStartTime} onChange={e=>set('lunchStartTime',e.target.value)}/></div>
              <div className="field"><label>Lunch End</label><input type="time" value={form.lunchEndTime} onChange={e=>set('lunchEndTime',e.target.value)}/></div>
              <div className="section-label">Rules</div>
              <div className="field"><label>Grace In (min)</label><input type="number" min="0" value={form.graceInMinutes} onChange={e=>set('graceInMinutes',e.target.value)}/></div>
              <div className="field"><label>Grace Out (min)</label><input type="number" min="0" value={form.graceOutMinutes} onChange={e=>set('graceOutMinutes',e.target.value)}/></div>
              <div className="field"><label>Late After (min)</label><input type="number" min="0" value={form.lateAfterMinutes} onChange={e=>set('lateAfterMinutes',e.target.value)}/></div>
              <div className="field"><label>Early Out (min)</label><input type="number" min="0" value={form.earlyOutMinutes} onChange={e=>set('earlyOutMinutes',e.target.value)}/></div>
              <div className="field"><label>Minimum Work (min)</label><input type="number" min="0" value={form.minimumWorkMinutes} onChange={e=>set('minimumWorkMinutes',e.target.value)}/></div>
              <div className="field"><label>Half Day (min)</label><input type="number" min="0" value={form.halfDayMinutes} onChange={e=>set('halfDayMinutes',e.target.value)}/></div>
              <div className="field"><label>Full Day (min)</label><input type="number" min="1" value={form.fullDayMinutes} onChange={e=>set('fullDayMinutes',e.target.value)}/></div>
              <div className="field"><label>OT Allowed</label><select value={form.otAllowed?'Yes':'No'} onChange={e=>set('otAllowed',e.target.value==='Yes')}><option>Yes</option><option>No</option></select></div>
              <div className="field"><label>OT Start After (min)</label><input type="number" min="0" value={form.otStartAfterMinutes} onChange={e=>set('otStartAfterMinutes',e.target.value)}/></div>
              <div className="field"><label>Night Shift</label><select value={form.isNightShift?'Yes':'No'} onChange={e=>set('isNightShift',e.target.value==='Yes')}><option>No</option><option>Yes</option></select></div>
              <div className="field"><label>Status</label><select value={form.status} onChange={e=>set('status',e.target.value)}><option>Active</option><option>Inactive</option></select></div>
            </div>
            <p className="field-help">Full day: {mins(form.fullDayMinutes)} · Minimum work: {mins(form.minimumWorkMinutes)}</p>
            <div style={{display:'flex', justifyContent:'flex-end', gap:10, marginTop:20, paddingTop:16, borderTop:'1px solid var(--line)'}}>
              <button type="button" className="btn-ghost" onClick={reset}>Cancel</button>
              <button className="btn-blue">Save Shift</button>
            </div>
          </form>
        </div>
      </div>
    )}

    <div className="table-card"><div className="table-scroll"><table className="emp-table">
      <thead><tr><th>Code</th><th>Shift</th><th>Time</th><th>Lunch</th><th>Work</th><th>OT</th><th>Status</th><th></th></tr></thead>
      <tbody>{items.map(s=><tr key={s.shiftId}>
        <td className="mono">{s.shiftCode}</td><td><b>{s.shiftName}</b><div className="meta">{s.isNightShift?'Night':'Day'}</div></td>
        <td>{(s.startTime||'').slice(0,5)} – {(s.endTime||'').slice(0,5)}</td>
        <td>{s.lunchStartTime?(s.lunchStartTime.slice(0,5)+' – '+(s.lunchEndTime||'').slice(0,5)):'—'}</td>
        <td>{mins(s.fullDayMinutes)}</td><td>{s.otAllowed?'Allowed':'No'}</td>
        <td><span className={'badge '+(s.status==='Active'?'active':'inactive')}>{s.status}</span></td>
        <td><div className="row-actions"><button className="edit" onClick={()=>edit(s)}>✎</button><button className="del" onClick={()=>remove(s)}>🗑</button></div></td>
      </tr>)}{items.length===0&&<tr className="empty-row"><td colSpan="8">No shifts configured.</td></tr>}</tbody>
    </table></div></div>
  </>
}
