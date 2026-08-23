import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import Topbar from '../components/Topbar.jsx'

const emptyForm = {
  empCode: '', type: 'Regular', fullName: '', designation: '', departmentId: '', companyId: '', managerId: '',
  dateOfJoining: '', dateOfBirth: '', dateOfLeaving: '', leavingComments: '',
  locationId: '', email: '', phoneNumber: '', maritalStatus: '', roleType: 'User', shiftId: '', password: ''
}

const LOGIN_ROLES = ['HR', 'Admin', 'SuperAdmin']

export default function EmployeeProfile({ mode }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('basic')
  const [form, setForm] = useState(emptyForm)
  const [lookups, setLookups] = useState({ companies: [], departments: [], locations: [] })
  const [managerOptions, setManagerOptions] = useState([])
  const [shiftTemplates, setShiftTemplates] = useState([])
  const [bank, setBank] = useState({ bankName:'', accountNumber:'', ifscCode:'', branchName:'', esiNumber:'', panNumber:'' })
  const [proofs, setProofs] = useState([])
  const [newProof, setNewProof] = useState({ proofType:'Aadhaar', proofNumber:'' })
  const [addresses, setAddresses] = useState({ Current: {}, Permanent: {} })
  const [addrTab, setAddrTab] = useState('Current')
  const [education, setEducation] = useState([])
  const [newEdu, setNewEdu] = useState({ institutionName:'', degree:'', completionDate:'' })
  const [hasLogin, setHasLogin] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/lookups/companies').then(r => setLookups(l => ({...l, companies: r.data})))
    api.get('/lookups/departments').then(r => setLookups(l => ({...l, departments: r.data})))
    api.get('/lookups/locations').then(r => setLookups(l => ({...l, locations: r.data})))
    api.get('/employees').then(r => setManagerOptions(r.data.filter(e => String(e.employeeId) !== id)))
    api.get('/shifts').then(r => setShiftTemplates(r.data))
  }, [])

  useEffect(() => {
    if (mode === 'edit' && id) {
      api.get(`/employees/${id}`).then(res => {
        const e = res.data
        setHasLogin(!!e.userId)
        setForm({
          empCode: e.empCode,
          type: e.type, fullName: e.fullName, designation: e.designation || '',
          departmentId: e.departmentId || '', companyId: e.companyId || '', managerId: e.managerId || '',
          shiftId: e.shiftId || '', roleType: e.roleType || 'User', password: '',
          dateOfJoining: e.dateOfJoining || '', dateOfBirth: e.dateOfBirth || '', dateOfLeaving: e.dateOfLeaving || '',
          leavingComments: e.leavingComments || '', locationId: e.locationId || '',
          email: e.email || '', phoneNumber: e.phoneNumber || '', maritalStatus: e.maritalStatus || ''
        })
        if (e.bankDetail) setBank(e.bankDetail)
        setProofs(e.proofDocuments || [])
        setEducation(e.education || [])
        const a = { Current: {}, Permanent: {} }
        ;(e.addresses || []).forEach(ad => { a[ad.addressType] = ad })
        setAddresses(a)
      }).catch(() => setError('Could not load this employee.'))
    }
  }, [mode, id])

  function set(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function handleSave() {
    if (!form.fullName.trim()) { setError('Full name is required.'); return }
    if (mode === 'add' && !form.empCode.trim()) { setError('Employee ID is required.'); return }
    setError('')
    const toIntOrNull = (v) => (v === '' || v === null || v === undefined) ? null : parseInt(v, 10)
    const payload = {
      ...form,
      departmentId: toIntOrNull(form.departmentId),
      companyId: toIntOrNull(form.companyId),
      managerId: toIntOrNull(form.managerId),
      locationId: toIntOrNull(form.locationId),
      shiftId: toIntOrNull(form.shiftId),
      roleType: form.roleType || 'User',
      dateOfJoining: form.dateOfJoining || null,
      dateOfBirth: form.dateOfBirth || null,
      dateOfLeaving: form.dateOfLeaving || null,
    }
    try {
      let employeeId = id
      if (mode === 'add') {
        const res = await api.post('/employees', payload)
        employeeId = res.data.employeeId
      } else {
        await api.put(`/employees/${id}`, payload)
      }
      // save sub-tabs (only if something was entered)
      if (bank.bankName || bank.accountNumber || bank.ifscCode) {
        await api.put(`/employees/${employeeId}/bank-details`, bank)
      }
      navigate('/employees')
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save employee.')
    }
  }

  async function addProof() {
    if (!newProof.proofNumber.trim() || mode !== 'edit') return
    const res = await api.post(`/employees/${id}/proof`, newProof)
    setProofs(p => [...p, res.data])
    setNewProof({ proofType: 'Aadhaar', proofNumber: '' })
  }
  async function removeProof(proofId) {
    await api.delete(`/employees/${id}/proof/${proofId}`)
    setProofs(p => p.filter(x => x.proofId !== proofId))
  }
  async function saveAddress() {
    if (mode !== 'edit') return
    const res = await api.put(`/employees/${id}/addresses/${addrTab}`, { addressType: addrTab, ...addresses[addrTab] })
    setAddresses(a => ({ ...a, [addrTab]: res.data }))
  }
  async function addEducation() {
    if (!newEdu.institutionName.trim() || mode !== 'edit') return
    const res = await api.post(`/employees/${id}/education`, newEdu)
    setEducation(e => [...e, res.data])
    setNewEdu({ institutionName:'', degree:'', completionDate:'' })
  }
  async function removeEducation(educationId) {
    await api.delete(`/employees/${id}/education/${educationId}`)
    setEducation(e => e.filter(x => x.educationId !== educationId))
  }

  const initials = form.fullName ? form.fullName.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase() : 'NE'

  return (
    <>
      <Topbar crumbs={<><a onClick={() => navigate('/employees')} style={{color:'var(--blue-600)', cursor:'pointer', fontWeight:600}}>Employees</a> / <b>{mode==='add' ? 'New' : form.empCode}</b></>} />

      <div className="page-head">
        <div>
          <h1>{mode === 'add' ? 'Add Employee' : 'Edit Employee'}</h1>
          <p>Core details, role, department, shift, banking, compliance documents and address.</p>
        </div>
      </div>

      {error && <div className="auth-error" style={{marginBottom:16}}>{error}</div>}

      <div className="emp-layout">
        <div className="badge-card">
          <div className="badge-notch"></div>
          <div className="badge-top">
            <div className="badge-photo">{initials}</div>
            <h3>{form.fullName || 'New Employee'}</h3>
            <div className="desig">{form.designation || '—'}</div><br/>
            <span className="badge-id mono">{form.empCode || (mode==='add' ? 'Not set yet' : '')}</span><br/>
            <span className={'badge-status' + (mode==='add' ? ' draft' : '')}><span className="dot"></span> {mode==='add' ? 'Draft' : (form.dateOfLeaving ? 'Inactive' : 'Active') + ' · ' + form.type}</span>
          </div>
          <div className="badge-divider"></div>
          <div className="badge-meta">
            <div className="row"><span>Email</span><span>{form.email || '—'}</span></div>
            <div className="row"><span>Phone</span><span>{form.phoneNumber || '—'}</span></div>
            <div className="row"><span>Joined</span><span>{form.dateOfJoining || '—'}</span></div>
          </div>
        </div>

        <div className="panel">
          <div className="tabs">
            {['basic','bank','proof','address','education'].map(t => (
              <button key={t} type="button" className={'tab-btn' + (tab===t ? ' active' : '')} onClick={() => setTab(t)}>
                {{basic:'Basic Details', bank:'Bank Details', proof:'Proof / Documents', address:'Address', education:'Education'}[t]}
              </button>
            ))}
          </div>

          {tab === 'basic' && (
            <div className="tab-content active">
              <div className="form-grid">
                <div className="section-label">Identity</div>
                <div className="field"><label>Employee ID <span className="req">*</span></label>
                  <input className="mono" value={form.empCode} onChange={e => set('empCode', e.target.value)} disabled={mode==='edit'} placeholder="e.g. EMP-2026-0150" />
                </div>
                <div className="field"><label>Type <span className="req">*</span></label>
                  <select value={form.type} onChange={e => set('type', e.target.value)}>
                    <option>Regular</option><option>Contract</option>
                  </select>
                </div>
                <div className="field"><label>Full Name <span className="req">*</span></label>
                  <input value={form.fullName} onChange={e => set('fullName', e.target.value)} />
                </div>

                <div className="section-label">Role &amp; Reporting</div>
                <div className="field"><label>Designation</label><input value={form.designation} onChange={e => set('designation', e.target.value)} /></div>
                <div className="field"><label>Department</label>
                  <select value={form.departmentId} onChange={e => set('departmentId', e.target.value)}>
                    <option value="">Select…</option>
                    {lookups.departments.map(d => <option key={d.departmentId} value={d.departmentId}>{d.departmentName}</option>)}
                  </select>
                </div>
                <div className="field"><label>Reporting Manager</label>
                  <select value={form.managerId} onChange={e => set('managerId', e.target.value)}>
                    <option value="">— None —</option>
                    {managerOptions.map(m => <option key={m.employeeId} value={m.employeeId}>{m.fullName}{m.designation ? ` — ${m.designation}` : ''}</option>)}
                  </select>
                </div>

                <div className="field"><label>Role Type</label>
                  <select value={form.roleType} onChange={e => set('roleType', e.target.value)}>
                    <option>User</option><option>HR</option><option>Admin</option><option>SuperAdmin</option>
                  </select>
                </div>
                {LOGIN_ROLES.includes(form.roleType) && (
                  <div className="field">
                    <label>{hasLogin ? 'Reset Password (optional)' : 'Password'}{!hasLogin && <span className="req"> *</span>}</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={e => set('password', e.target.value)}
                      placeholder={hasLogin ? 'Leave blank to keep current password' : 'Min. 8 characters, letters + numbers'}
                    />
                    <small className="field-help">
                      {hasLogin
                        ? 'This person already has login access — only fill this in to reset their password (they\'ll be asked to set their own again on next login).'
                        : `This is a temporary password for ${form.fullName || 'this employee'} — they'll be asked to set their own the first time they log in.`}
                    </small>
                  </div>
                )}
                <div className="field"><label>Shift</label>
                  <select value={form.shiftId} onChange={e => set('shiftId', e.target.value)}>
                    <option value="">Select shift…</option>
                    {shiftTemplates.filter(s => s.status === 'Active').map(s => <option key={s.shiftId} value={s.shiftId}>{s.shiftName} — {s.shiftCode}</option>)}
                  </select>
                </div>

                <div className="field"><label>Company</label>
                  <select value={form.companyId} onChange={e => set('companyId', e.target.value)}>
                    <option value="">Select…</option>
                    {lookups.companies.map(c => <option key={c.companyId} value={c.companyId}>{c.companyName}</option>)}
                  </select>
                </div>
                <div className="field"><label>Location</label>
                  <select value={form.locationId} onChange={e => set('locationId', e.target.value)}>
                    <option value="">Select…</option>
                    {lookups.locations.map(l => <option key={l.locationId} value={l.locationId}>{l.locationName}</option>)}
                  </select>
                </div>
                <div className="field"><label>Marital Status</label>
                  <select value={form.maritalStatus} onChange={e => set('maritalStatus', e.target.value)}>
                    <option value="">Select…</option><option>Single</option><option>Married</option>
                  </select>
                </div>

                <div className="section-label">Dates</div>
                <div className="field"><label>Date of Birth</label><input type="date" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} /></div>
                <div className="field"><label>Date of Joining</label><input type="date" value={form.dateOfJoining} onChange={e => set('dateOfJoining', e.target.value)} /></div>
                <div className="field"><label>Date of Leaving</label><input type="date" value={form.dateOfLeaving} onChange={e => set('dateOfLeaving', e.target.value)} /></div>
                <div className="field" style={{gridColumn:'1/-1'}}><label>Leaving Comments</label>
                  <input value={form.leavingComments} onChange={e => set('leavingComments', e.target.value)} placeholder="Only applicable if Date of Leaving is set" />
                </div>

                <div className="section-label">Contact</div>
                <div className="field"><label>Email ID</label><input value={form.email} onChange={e => set('email', e.target.value)} /></div>
                <div className="field"><label>Phone Number</label><input value={form.phoneNumber} onChange={e => set('phoneNumber', e.target.value)} /></div>
                <div className="field"><label>Photo</label><div className="upload-box">⇪ Drop photo or click to upload</div></div>
              </div>
            </div>
          )}

          {tab === 'bank' && (
            <div className="tab-content active">
              <div className="form-grid two">
                <div className="field"><label>Bank Name</label><input value={bank.bankName||''} onChange={e => setBank(b=>({...b,bankName:e.target.value}))} /></div>
                <div className="field"><label>Account Number</label><input className="mono" value={bank.accountNumber||''} onChange={e => setBank(b=>({...b,accountNumber:e.target.value}))} /></div>
                <div className="field"><label>IFSC Code</label><input className="mono" value={bank.ifscCode||''} onChange={e => setBank(b=>({...b,ifscCode:e.target.value}))} /></div>
                <div className="field"><label>Branch Name</label><input value={bank.branchName||''} onChange={e => setBank(b=>({...b,branchName:e.target.value}))} /></div>
                <div className="field"><label>ESI Number</label><input className="mono" value={bank.esiNumber||''} onChange={e => setBank(b=>({...b,esiNumber:e.target.value}))} /></div>
                <div className="field"><label>PAN Number</label><input className="mono" value={bank.panNumber||''} onChange={e => setBank(b=>({...b,panNumber:e.target.value}))} /></div>
              </div>
              <p style={{fontSize:12,color:'var(--text-faint)'}}>Bank details save together with the employee record when you click Save Changes.</p>
            </div>
          )}

          {tab === 'proof' && (
            <div className="tab-content active">
              {proofs.map(p => (
                <div className="rep-row" key={p.proofId}>
                  <div className="field" style={{margin:0}}><label>Type</label><input value={p.proofType} disabled /></div>
                  <div className="field" style={{margin:0}}><label>Number</label><input className="mono" value={p.proofNumber} disabled /></div>
                  <div className="field" style={{margin:0}}><label>Attachment</label><div className="upload-box" style={{padding:9}}>{p.attachmentUrl || 'No file'}</div></div>
                  <button type="button" className="icon-btn" onClick={() => removeProof(p.proofId)}>✕</button>
                </div>
              ))}
              {mode === 'edit' ? (
                <div className="rep-row">
                  <div className="field" style={{margin:0}}><label>Type</label>
                    <select value={newProof.proofType} onChange={e => setNewProof(p=>({...p,proofType:e.target.value}))}>
                      <option>Aadhaar</option><option>PAN</option><option>Passport</option><option>Driving Licence</option>
                    </select>
                  </div>
                  <div className="field" style={{margin:0}}><label>Number</label>
                    <input className="mono" value={newProof.proofNumber} onChange={e => setNewProof(p=>({...p,proofNumber:e.target.value}))} placeholder="XXXX XXXX 1234" />
                  </div>
                  <div className="field" style={{margin:0}}><label>Attachment</label><div className="upload-box" style={{padding:9}}>⇪ Upload file</div></div>
                  <button type="button" className="icon-btn" onClick={addProof}>＋</button>
                </div>
              ) : (
                <p style={{fontSize:12.5,color:'var(--text-faint)'}}>Save the employee first, then add proof documents.</p>
              )}
            </div>
          )}

          {tab === 'address' && (
            <div className="tab-content active">
              <div className="auth-tabs" style={{maxWidth:220, marginBottom:18}}>
                <button type="button" className={addrTab==='Current'?'active':''} onClick={() => setAddrTab('Current')}>Current</button>
                <button type="button" className={addrTab==='Permanent'?'active':''} onClick={() => setAddrTab('Permanent')}>Permanent</button>
              </div>
              <div className="form-grid">
                <div className="field"><label>Address Line 1</label>
                  <input value={addresses[addrTab]?.addressLine1||''} onChange={e => setAddresses(a=>({...a,[addrTab]:{...a[addrTab],addressLine1:e.target.value}}))} />
                </div>
                <div className="field"><label>Address Line 2</label>
                  <input value={addresses[addrTab]?.addressLine2||''} onChange={e => setAddresses(a=>({...a,[addrTab]:{...a[addrTab],addressLine2:e.target.value}}))} />
                </div>
                <div className="field"><label>Address Line 3</label>
                  <input value={addresses[addrTab]?.addressLine3||''} onChange={e => setAddresses(a=>({...a,[addrTab]:{...a[addrTab],addressLine3:e.target.value}}))} />
                </div>
                <div className="section-label">Emergency Contact</div>
                <div className="field"><label>Emergency Person</label>
                  <input value={addresses[addrTab]?.emergencyPerson||''} onChange={e => setAddresses(a=>({...a,[addrTab]:{...a[addrTab],emergencyPerson:e.target.value}}))} />
                </div>
                <div className="field"><label>Emergency Contact Number</label>
                  <input value={addresses[addrTab]?.emergencyContactNumber||''} onChange={e => setAddresses(a=>({...a,[addrTab]:{...a[addrTab],emergencyContactNumber:e.target.value}}))} />
                </div>
              </div>
              {mode === 'edit' ? (
                <button type="button" className="add-row-btn" onClick={saveAddress}>Save {addrTab} Address</button>
              ) : (
                <p style={{fontSize:12.5,color:'var(--text-faint)'}}>Save the employee first, then add address details.</p>
              )}
            </div>
          )}

          {tab === 'education' && (
            <div className="tab-content active">
              {education.map(ed => (
                <div className="rep-row edu" key={ed.educationId}>
                  <div className="field" style={{margin:0}}><label>School / College</label><input value={ed.institutionName||''} disabled /></div>
                  <div className="field" style={{margin:0}}><label>Degree</label><input value={ed.degree||''} disabled /></div>
                  <div className="field" style={{margin:0}}><label>Date</label><input value={ed.completionDate||''} disabled /></div>
                  <button type="button" className="icon-btn" onClick={() => removeEducation(ed.educationId)}>✕</button>
                </div>
              ))}
              {mode === 'edit' ? (
                <div className="rep-row edu">
                  <div className="field" style={{margin:0}}><label>School / College</label>
                    <input value={newEdu.institutionName} onChange={e => setNewEdu(x=>({...x,institutionName:e.target.value}))} />
                  </div>
                  <div className="field" style={{margin:0}}><label>Degree</label>
                    <input value={newEdu.degree} onChange={e => setNewEdu(x=>({...x,degree:e.target.value}))} />
                  </div>
                  <div className="field" style={{margin:0}}><label>Date</label>
                    <input type="date" value={newEdu.completionDate} onChange={e => setNewEdu(x=>({...x,completionDate:e.target.value}))} />
                  </div>
                  <button type="button" className="icon-btn" onClick={addEducation}>＋</button>
                </div>
              ) : (
                <p style={{fontSize:12.5,color:'var(--text-faint)'}}>Save the employee first, then add qualifications.</p>
              )}
            </div>
          )}

          <div className="footer-actions">
            <button type="button" className="btn-ghost" onClick={() => navigate('/employees')}>Cancel</button>
            <button type="button" className="btn-primary" style={{width:'auto', margin:0, padding:'10px 22px'}} onClick={handleSave}>Save Changes</button>
          </div>
        </div>
      </div>
    </>
  )
}
