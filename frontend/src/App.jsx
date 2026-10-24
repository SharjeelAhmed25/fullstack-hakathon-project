import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const API = import.meta.env.VITE_API_URL || ''
const money = (amount) => new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(amount || 0)
const shortDate = (date) => date ? new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const roles = { ADMIN: 'Admin', HR: 'Human resources', EMPLOYEE: 'Employee' }
const validIsoDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

async function api(path, token, options = {}) {
  const response = await fetch(`${API}/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message || 'Something went wrong. Please try again.')
  return body
}

function Icon({ name, size = 19 }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.4" /><rect x="14" y="3" width="7" height="7" rx="1.4" /><rect x="3" y="14" width="7" height="7" rx="1.4" /><rect x="14" y="14" width="7" height="7" rx="1.4" /></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18M16 14h2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.1.9-1 1.8-1.4-.4a7.7 7.7 0 0 1-1.6.9l-.3 1.5h-2l-.4-1.4a7.7 7.7 0 0 1-1.8 0l-.8 1.1-1.8-1 .4-1.4a7.7 7.7 0 0 1-.9-1.6l-1.5-.3v-2l1.4-.4a7.7 7.7 0 0 1 0-1.8l-1.1-.8 1-1.8 1.4.4a7.7 7.7 0 0 1 1.6-.9l.3-1.5h2l.4 1.4a7.7 7.7 0 0 1 1.8 0l.8-1.1 1.8 1-.4 1.4a7.7 7.7 0 0 1 .9 1.6l1.5.3v2l-1.4.4a7.7 7.7 0 0 1 0 1.8z" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>,
    log: <><path d="M4 5h16M4 12h16M4 19h16" /><circle cx="7" cy="5" r="1" /><circle cx="7" cy="12" r="1" /><circle cx="7" cy="19" r="1" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></>,
    bot: <><rect x="4" y="7" width="16" height="13" rx="3" /><path d="M12 3v4M8 12h.01M16 12h.01M9 16h6M2 12v3M22 12v3" /><circle cx="12" cy="3" r="1" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    megaphone: <><path d="m3 11 18-5v12L3 13zM11 14l2 7h-4l-2-8" /><path d="M3 11v2" /></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m4 0-1 14H5L4 6m5 4v6m6-6v6" /></>,
    spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.grid}</svg>
}

function Field({ label, name, type = 'text', required = false, defaultValue, options, placeholder, min, max, minLength, maxLength, step }) {
  return <label className="field"><span>{label}</span>{options
    ? <select name={name} defaultValue={defaultValue ?? (placeholder ? '' : options[0]?.value ?? '')} required={required}>{placeholder && <option value="">{placeholder}</option>}{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    : <input name={name} type={type} required={required} defaultValue={defaultValue} placeholder={placeholder} min={min} max={max} minLength={minLength} maxLength={maxLength} step={step} />}</label>
}

function AuthScreen({ setup, onSubmit, error, busy }) {
  const [showPassword, setShowPassword] = useState(false)
  return <main className="auth-shell">
    <section className="auth-brand">
      <a className="brand" href="/" aria-label="PeopleOS home"><span className="brand-mark">p</span><span>people<span className="brand-light">OS</span></span></a>
      <div className="brand-message"><div className="eyebrow light-eyebrow"><span className="live-dot" /> PEOPLE, IN SYNC</div><h1>A better day at work starts here.</h1><p>One calm place to support your people, keep work moving, and make better decisions.</p></div>
      <div className="brand-foot"><span>People operations, simplified.</span><span>© 2026 PeopleOS</span></div>
      <div className="brand-orbit orbit-one" /><div className="brand-orbit orbit-two" />
    </section>
    <section className="auth-form-wrap"><div className="auth-form">
      <div className="eyebrow">{setup ? 'LET’S GET YOU STARTED' : 'WELCOME BACK'}</div>
      <h2>{setup ? 'Set up your workspace' : 'Sign in to your workspace'}</h2>
      <p className="muted">{setup ? 'Create your company and first administrator account.' : 'Enter your details to pick up where you left off.'}</p>
      <form onSubmit={onSubmit} className="stack-form">
        {setup && <><Field label="Company name" name="companyName" required maxLength={120} placeholder="e.g. Acme Studio" /><Field label="Your name" name="adminName" required maxLength={120} placeholder="Full name" /></>}
        <Field label="Work email" name={setup ? 'adminEmail' : 'email'} type="email" required maxLength={254} placeholder="you@company.com" />
        <label className="field"><span>Password</span><span className="password-wrap"><input name={setup ? 'adminPassword' : 'password'} type={showPassword ? 'text' : 'password'} required minLength={setup ? 8 : undefined} maxLength={128} placeholder={setup ? 'At least 8 characters' : 'Enter your password'} /><button className="password-toggle" type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></span></label>
        {setup && <div className="form-row"><Field label="Office start" name="officeStart" type="time" defaultValue="09:00" required /><Field label="Grace period (min)" name="graceMinutes" type="number" defaultValue="15" min="0" max="240" step="1" required /></div>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button button-primary button-wide" disabled={busy}>{busy ? 'Please wait…' : setup ? 'Create workspace' : 'Sign in'}<span>→</span></button>
      </form>
      <div className="auth-note"><span className="secure-dot" />Your information is protected and only visible to your team.</div>
    </div></section>
  </main>
}

function StatCard({ icon, label, value, note, tone = 'sage', onClick }) {
  const content = <><div className={`stat-icon ${tone}`}><Icon name={icon} /></div><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>{onClick && <Icon name="arrow" size={16} />}</>
  return onClick
    ? <button className="stat-card stat-card-action" type="button" onClick={onClick} aria-label={`${label}: ${value}. Open details.`}>{content}</button>
    : <article className="stat-card">{content}</article>
}

function EmptyState({ title, body }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name="file" size={23} /></span><strong>{title}</strong><p>{body}</p></div>
}

function Badge({ children }) {
  return <span className={`badge badge-${String(children).toLowerCase().replaceAll('_', '-')}`}>{String(children).replaceAll('_', ' ')}</span>
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('hcm-token') || '')
  const [user, setUser] = useState(null)
  const [setup, setSetup] = useState(false)
  const [company, setCompany] = useState('')
  const [section, setSection] = useState('dashboard')
  const [data, setData] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState('')
  const [editTarget, setEditTarget] = useState(null)
  const [mobileNav, setMobileNav] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [csvReport, setCsvReport] = useState(null)
  const [smartLeave, setSmartLeave] = useState(null)
  const [correctionTarget, setCorrectionTarget] = useState(null)
  const [notificationsUnread, setNotificationsUnread] = useState(0)

  const notify = useCallback((message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }, [])

  const loadSection = useCallback(async (view, authToken = token, authUser = user) => {
    if (!authToken || !authUser) return
    setBusy(true)
    setError('')
    try {
      const role = authUser.role
      const results = await api('/dashboard', authToken)
      const next = { dashboard: results }
      if (view === 'employees' && role !== 'EMPLOYEE') next.users = (await api('/users', authToken)).users
      if (view === 'attendance') {
        const [attendance, corrections] = await Promise.all([
          api(`/attendance?month=${new Date().toISOString().slice(0, 7)}`, authToken),
          api('/attendance/corrections', authToken),
        ])
        next.attendance = attendance.attendance
        next.corrections = corrections.corrections
      }
      if (view === 'corrections') next.corrections = (await api('/attendance/corrections', authToken)).corrections
      if (view === 'leaves') {
        next.leaves = (await api('/leaves', authToken)).leaves
        next.leaveDetails = await api('/leaves/balance', authToken)
        if (role === 'EMPLOYEE') next.leaveBalance = next.leaveDetails
      }
      if (view === 'payroll') next.payroll = (await api('/payroll', authToken)).runs
      if (view === 'settings' && role !== 'EMPLOYEE') {
        next.settings = (await api('/settings', authToken)).settings
        if (role === 'ADMIN') next.audit = (await api('/audit', authToken)).logs
      }
      if (view === 'employees' && role !== 'EMPLOYEE') {
        next.departments = (await api('/departments', authToken)).departments
      }
      if (view === 'announcements') next.announcements = (await api('/announcements', authToken)).announcements
      if (view === 'notifications') {
        const result = await api('/notifications', authToken)
        next.notifications = result.notifications
        setNotificationsUnread(result.unreadCount)
      }
      setData(next)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }, [token, user])

  const signOut = useCallback(() => {
    localStorage.removeItem('hcm-token')
    setToken('')
    setUser(null)
    setData({})
    setSection('dashboard')
    setDialog('')
    setCsvReport(null)
    setSmartLeave(null)
    setCorrectionTarget(null)
  }, [])

  useEffect(() => {
    let alive = true
    api('/setup/status').then((result) => {
      if (alive) { setSetup(!result.isSetupDone); setCompany(result.companyName) }
    }).catch(() => { if (alive) setError('Cannot reach the server. Start the backend and try again.') })
    const savedToken = localStorage.getItem('hcm-token')
    if (savedToken) api('/auth/me', savedToken).then(({ user: currentUser }) => {
      if (!alive) return
      setToken(savedToken)
      setUser(currentUser)
      loadSection('dashboard', savedToken, currentUser)
      api('/notifications', savedToken).then((result) => { if (alive) setNotificationsUnread(result.unreadCount) }).catch((requestError) => { if (alive) setError(requestError.message) })
    }).catch(() => { localStorage.removeItem('hcm-token') })
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const navItems = useMemo(() => {
    const items = [{ id: 'dashboard', label: 'Overview', icon: 'grid' }]
    if (user?.role !== 'EMPLOYEE') items.push({ id: 'employees', label: 'People', icon: 'people' })
    items.push(
      { id: 'attendance', label: 'Attendance', icon: 'clock' },
      { id: 'leaves', label: 'Time off', icon: 'calendar' },
      { id: 'payroll', label: 'Payroll', icon: 'wallet' },
      { id: 'assistant', label: 'AI assistant', icon: 'bot' },
      { id: 'announcements', label: 'Announcements', icon: 'megaphone' },
      { id: 'notifications', label: 'Notifications', icon: 'bell' },
    )
    if (user?.role === 'ADMIN' || user?.role === 'HR') items.push({ id: 'corrections', label: 'Attendance corrections', icon: 'clock' })
    if (user?.role === 'ADMIN' || user?.role === 'HR') items.push({ id: 'settings', label: 'Policies & audit', icon: 'settings' })
    return items
  }, [user])

  async function handleAuth(event) {
    event.preventDefault()
    if (!event.currentTarget.reportValidity()) return
    setBusy(true)
    setError('')
    const form = Object.fromEntries(new FormData(event.currentTarget))
    if (setup && (!form.companyName.trim() || form.companyName.trim().length > 120 || !form.adminName.trim() || form.adminName.trim().length > 120)) {
      setError('Company and administrator names must be between 1 and 120 characters.')
      setBusy(false)
      return
    }
    try {
      if (setup) {
        await api('/setup', '', { method: 'POST', body: JSON.stringify(form) })
        setSetup(false)
        notify('Workspace created. Sign in to continue.')
      } else {
        const result = await api('/auth/login', '', { method: 'POST', body: JSON.stringify(form) })
        localStorage.setItem('hcm-token', result.token)
        setToken(result.token)
        setUser(result.user)
        setCompany((await api('/setup/status')).companyName)
        setSection('dashboard')
        await loadSection('dashboard', result.token, result.user)
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitDialog(event) {
    event.preventDefault()
    const formElement = event.currentTarget
    if (!formElement.reportValidity()) return
    const formData = new FormData(event.currentTarget)
    const values = Object.fromEntries(formData)
    if (dialog === 'editUser' && user.role === 'ADMIN') values.isActive = formData.has('isActive')
    const name = (value) => typeof value === 'string' ? value.trim() : ''
    let validationError = ''
    if (['user', 'editUser'].includes(dialog) && (!name(values.name) || name(values.name).length > 120)) validationError = 'Name must be between 1 and 120 characters.'
    else if (['user', 'editUser'].includes(dialog) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name(values.email))) validationError = 'Enter a valid work email address.'
    else if (dialog === 'user' && values.password.length > 128) validationError = 'Temporary password must be 128 characters or fewer.'
    else if (dialog === 'resetPassword' && values.newPassword.length > 128) validationError = 'Temporary password must be 128 characters or fewer.'
    else if (dialog === 'leave' && (!validIsoDate(values.startDate) || !validIsoDate(values.endDate) || values.endDate < values.startDate || name(values.reason).length > 500)) validationError = 'Choose valid dates in order and keep the reason under 500 characters.'
    else if (dialog === 'settings' && (!name(values.companyName) || name(values.companyName).length > 120 || !Number.isInteger(Number(values.graceMinutes)) || Number(values.graceMinutes) < 0 || Number(values.graceMinutes) > 240 || !Number.isFinite(Number(values.officeRadius)) || Number(values.officeRadius) < 1 || Number(values.officeRadius) > 100000)) validationError = 'Check company name, grace period (0–240 minutes), and office radius (1–100000 metres).'
    else if (dialog === 'department' && (!name(values.name) || name(values.name).length > 80)) validationError = 'Department name must be between 1 and 80 characters.'
    else if (dialog === 'holiday' && (!name(values.name) || name(values.name).length > 120 || !validIsoDate(values.date))) validationError = 'Enter a holiday name (up to 120 characters) and a valid date.'
    else if (dialog === 'announcement' && (!name(values.title) || name(values.title).length > 120 || !name(values.body) || values.body.length > 3000)) validationError = 'Title must be 1–120 characters and the message 1–3000 characters.'
    else if (dialog === 'editUser' && (name(values.department).length > 80 || name(values.designation).length > 120 || name(values.phone).length > 40 || name(values.address).length > 200 || !Number.isFinite(Number(values.basicSalary)) || Number(values.basicSalary) < 0 || Number(values.basicSalary) > 1000000000)) validationError = 'Check the department, job title, phone, address and salary values.'
    else if (dialog === 'user' && (name(values.department).length > 80 || name(values.designation).length > 120 || !Number.isFinite(Number(values.basicSalary || 0)) || Number(values.basicSalary || 0) < 0 || Number(values.basicSalary || 0) > 1000000000)) validationError = 'Check the department, job title and salary values.'
    else if (dialog === 'correction') {
      const hasCheckIn = Boolean(values.checkIn)
      const hasCheckOut = Boolean(values.checkOut)
      const checkIn = hasCheckIn ? new Date(values.checkIn) : null
      const checkOut = hasCheckOut ? new Date(values.checkOut) : null
      if ((!hasCheckIn && !hasCheckOut) || !name(values.reason) || name(values.reason).length > 500 || (checkIn && Number.isNaN(checkIn.getTime())) || (checkOut && Number.isNaN(checkOut.getTime())) || (checkIn && checkOut && checkOut <= checkIn)) validationError = 'Provide at least one valid corrected time, ensure check-out follows check-in, and add a reason under 500 characters.'
    } else if (dialog === 'password' && (values.newPassword.length > 128 || values.currentPassword.length > 128)) validationError = 'Passwords must be 128 characters or fewer.'
    else if (dialog === 'password' && values.newPassword === values.currentPassword) validationError = 'Choose a new password different from your current password.'
    if (validationError) {
      setError(validationError)
      return
    }
    setBusy(true)
    setError('')
    try {
      if (dialog === 'user') {
        await api('/users', token, { method: 'POST', body: JSON.stringify({ ...values, basicSalary: Number(values.basicSalary || 0), role: user.role === 'ADMIN' ? 'HR' : 'EMPLOYEE' }) })
        notify(`${user.role === 'ADMIN' ? 'HR account' : 'Employee'} created successfully.`)
      } else if (dialog === 'editUser' && editTarget) {
        await api(`/users/${editTarget._id}`, token, { method: 'PATCH', body: JSON.stringify({ ...values, basicSalary: Number(values.basicSalary) }) })
        notify('Employee information updated.')
        setEditTarget(null)
      } else if (dialog === 'resetPassword' && editTarget) {
        await api(`/users/${editTarget._id}/password`, token, { method: 'PATCH', body: JSON.stringify(values) })
        notify('Temporary password set. Ask the employee to change it after signing in.')
        setEditTarget(null)
      } else if (dialog === 'leave') {
        await api('/leaves', token, { method: 'POST', body: JSON.stringify(values) })
        notify('Leave request sent for approval.')
        setSmartLeave(null)
      } else if (dialog === 'settings') {
        await api('/settings', token, { method: 'PATCH', body: JSON.stringify({ ...values, graceMinutes: Number(values.graceMinutes), officeRadius: Number(values.officeRadius) }) })
        notify('Company settings updated.')
      } else if (dialog === 'department') {
        await api('/departments', token, { method: 'POST', body: JSON.stringify(values) })
        notify('Department created.')
      } else if (dialog === 'holiday') {
        const settings = data.settings
        await api('/settings', token, { method: 'PATCH', body: JSON.stringify({ publicHolidays: [...settings.publicHolidays, values] }) })
        notify('Public holiday added.')
      } else if (dialog === 'announcement') {
        await api('/announcements', token, { method: 'POST', body: JSON.stringify(values) })
        notify('Announcement published.')
      } else if (dialog === 'correction') {
        await api(`/attendance/${correctionTarget._id}/corrections`, token, { method: 'POST', body: JSON.stringify(values) })
        notify('Correction request sent to HR.')
      } else if (dialog === 'csvReport') {
        await api('/users/csv/import', token, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csvText })
        notify(`${csvReport.valid} employees imported.`)
        setCsvReport(null)
        setCsvText('')
      } else if (dialog === 'password') {
        await api('/auth/password', token, { method: 'PATCH', body: JSON.stringify(values) })
        notify('Password changed.')
        setUser({ ...user, passwordChangeRequired: false })
      }
      setDialog('')
      await loadSection(section)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function runAction(path, options, success) {
    setBusy(true)
    setError('')
    try {
      await api(path, token, options)
      notify(success)
      await loadSection(section)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }

  }

  async function loadCsvFile(file) {
      if (!file) return
      setBusy(true)
      setError('')
      try {
        const contents = await file.text()
        const report = await api('/users/csv/dry-run', token, {
          method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: contents
        })
        setCsvText(contents)
        setCsvReport(report)
        setDialog('csvReport')
      } catch (requestError) {
        setError(requestError.message)
      } finally {
        setBusy(false)
      }
    }

  async function downloadEmployeeCsv(path) {
      setBusy(true)
      setError('')
      try {
        const response = await fetch(`${API}/api${path}`, { headers: { Authorization: `Bearer ${token}` } })
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.message || 'Could not download CSV.')
        }
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = path.endsWith('template') ? 'hcm-employees-template.csv' : 'hcm-employees.csv'
        anchor.click()
        URL.revokeObjectURL(url)
      } catch (requestError) {
        setError(requestError.message)
      } finally {
        setBusy(false)
      }
    }

  async function saveSettings(updates, success) {
      await runAction('/settings', { method: 'PATCH', body: JSON.stringify(updates) }, success)
    }

  async function requestSmartLeave(text) {
      setBusy(true)
      setError('')
      try {
        const result = await api('/ai/smart-leave', token, { method: 'POST', body: JSON.stringify({ text }) })
        setSmartLeave(result.form)
        setDialog('leave')
      } catch (requestError) {
        setError(requestError.message)
      } finally {
        setBusy(false)
    }
  }

  function downloadPayslip(payslip, month) {
    const printWindow = window.open('', '_blank', 'width=760,height=760')
    if (!printWindow) { notify('Allow pop-ups to print your payslip.'); return }
    printWindow.document.write(`<html><head><title>PeopleOS payslip ${month}</title><style>body{font:16px Arial,sans-serif;color:#1d3028;padding:48px;max-width:640px;margin:auto}h1{font-size:26px}.muted{color:#69766f}hr{border:0;border-top:1px solid #dce5df;margin:24px 0}.row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #edf0ed}.total{font-size:20px;font-weight:bold}</style></head><body><h1>${company || 'PeopleOS'} · Payslip</h1><p class="muted">${month} · ${user.name}</p><hr/><div class="row"><span>Basic salary</span><strong>${money(payslip.basic)}</strong></div><div class="row"><span>Gross salary</span><strong>${money(payslip.gross)}</strong></div><div class="row"><span>Attendance deductions</span><strong>− ${money(payslip.deductions)}</strong></div><div class="row"><span>Tax</span><strong>− ${money(payslip.tax)}</strong></div><div class="row total"><span>Net pay</span><strong>${money(payslip.net)}</strong></div><p class="muted">This payslip was generated by PeopleOS.</p><script>window.onload=()=>window.print()<\\/script></body></html>`)
    printWindow.document.close()
  }

  if (!user) return <AuthScreen setup={setup} onSubmit={handleAuth} error={error} busy={busy} />

  const currentNav = navItems.find((item) => item.id === section)
  const filteredUsers = (data.users || []).filter((person) => `${person.name} ${person.email} ${person.department}`.toLowerCase().includes(query.toLowerCase()))
  const title = currentNav?.label || 'Overview'

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <a className="brand sidebar-brand" href="#"><span className="brand-mark">p</span><span>people<span className="brand-light">OS</span></span></a>
      <div className="workspace-switch"><div className="workspace-logo">{(company || 'P').slice(0, 1).toUpperCase()}</div><div className="workspace-copy"><strong>{company || 'My workspace'}</strong><span>People workspace</span></div><span className="workspace-chevron">⌄</span></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav className="side-nav">{navItems.map((item) => <button key={item.id} className={`nav-item ${section === item.id ? 'active' : ''}`} onClick={() => { setSection(item.id); setMobileNav(false); setError(''); loadSection(item.id) }}><Icon name={item.icon} /><span>{item.label}</span>{item.id === 'notifications' && notificationsUnread > 0 && <b className="nav-count">{notificationsUnread}</b>}{item.id === 'leaves' && data.dashboard?.pendingLeaves > 0 && user.role !== 'EMPLOYEE' && <b className="nav-count">{data.dashboard.pendingLeaves}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-spark">✳</span><strong>People first, always.</strong><p>Your workspace is looking good. Keep the momentum going.</p></div><div className="profile-row"><button className="profile-button" onClick={() => setDialog('password')}><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><span className="profile-copy"><strong>{user.name}</strong><small>{roles[user.role]}</small></span></button><button className="signout" aria-label="Sign out" onClick={signOut}><Icon name="logout" size={17} /></button></div></div>
    </aside>
    {mobileNav && <button className="mobile-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Icon name="menu" /></button><div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{title}</strong></div></div><div className="topbar-actions"><label className="search-box"><Icon name="search" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && user.role !== 'EMPLOYEE') { setSection('employees'); loadSection('employees') } }} placeholder="Search people..." /><kbd>⌘ K</kbd></label><span className="today-label">{new Date().toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short' })}</span><button className="notification-button" aria-label="Open notifications" onClick={() => { setSection('notifications'); loadSection('notifications') }}><Icon name="bell" size={18} />{notificationsUnread > 0 && <i />}</button><button className="avatar top-avatar" title={user.name} onClick={() => setDialog('password')}>{user.name.slice(0, 1).toUpperCase()}</button></div></header>
      <div className="page-content">
        {error && <div className="page-error" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><Icon name="close" size={16} /></button></div>}
        {busy && !Object.keys(data).length ? <div className="loading-line"><span /> Loading your workspace…</div> : null}
        {section === 'dashboard' && <Dashboard data={data.dashboard} user={user} token={token} onNavigate={(view) => { setSection(view); loadSection(view) }} onAction={runAction} />}
        {section === 'employees' && <Employees users={filteredUsers} user={user} query={query} departments={data.departments || []} busy={busy} onQuery={setQuery} onAdd={() => setDialog('user')} onCsv={loadCsvFile} onDownloadCsv={downloadEmployeeCsv} onEdit={(person) => { setEditTarget(person); setDialog('editUser') }} onResetPassword={(person) => { setEditTarget(person); setDialog('resetPassword') }} />}
        {section === 'attendance' && <AttendancePage records={data.attendance || []} corrections={data.corrections || []} user={user} dashboard={data.dashboard} onAction={runAction} onCorrection={(record) => { setCorrectionTarget(record); setDialog('correction') }} busy={busy} />}
        {section === 'corrections' && <CorrectionsPage corrections={data.corrections || []} user={user} onAction={runAction} busy={busy} />}
        {section === 'leaves' && <LeavesPage leaves={data.leaves || []} user={user} balance={data.leaveBalance} policies={data.leaveDetails?.policies || []} onAdd={(form) => { setSmartLeave(form || null); setDialog('leave') }} onSmartLeave={requestSmartLeave} onAction={runAction} busy={busy} />}
        {section === 'payroll' && <PayrollPage runs={data.payroll || []} user={user} onAction={runAction} onDownload={downloadPayslip} busy={busy} />}
        {section === 'assistant' && <AssistantPage token={token} user={user} />}
        {section === 'announcements' && <AnnouncementsPage announcements={data.announcements || []} canPost={user.role !== 'EMPLOYEE'} onAdd={() => setDialog('announcement')} onArchive={(item) => runAction(`/announcements/${item._id}`, { method: 'DELETE' }, 'Announcement archived.')} />}
        {section === 'notifications' && <NotificationsPage notifications={data.notifications || []} unread={notificationsUnread} token={token} onRead={async (item) => { try { await api(`/notifications/${item._id}/read`, token, { method: 'PATCH' }); await loadSection('notifications') } catch (requestError) { setError(requestError.message) } }} onReadAll={async () => { try { await api('/notifications/read-all', token, { method: 'PATCH' }); await loadSection('notifications') } catch (requestError) { setError(requestError.message) } }} />}
        {section === 'settings' && <SettingsPage settings={data.settings} logs={data.audit || []} canEdit={user.role === 'ADMIN'} onEdit={() => setDialog('settings')} onAddDepartment={() => setDialog('department')} onAddHoliday={() => setDialog('holiday')} onSaveSettings={saveSettings} onDeleteDepartment={(name) => runAction(`/departments/${encodeURIComponent(name)}`, { method: 'DELETE' }, 'Department removed.')} />}
        {user.passwordChangeRequired && !dialog && <div className="force-password"><strong>Secure your account</strong><span>Choose a new password before continuing.</span><button className="button button-dark" onClick={() => setDialog('password')}>Change password</button></div>}
      </div>
    </main>
    {dialog && <Dialog title={dialog === 'user' ? user.role === 'ADMIN' ? 'Invite an HR partner' : 'Add a team member' : dialog === 'editUser' ? 'Edit employee information' : dialog === 'resetPassword' ? `Reset password · ${editTarget?.name || 'team member'}` : dialog === 'leave' ? 'Request time off' : dialog === 'settings' ? 'Company settings' : dialog === 'department' ? 'Add a department' : dialog === 'holiday' ? 'Add a public holiday' : dialog === 'announcement' ? 'Publish an announcement' : dialog === 'correction' ? 'Request an attendance correction' : dialog === 'csvReport' ? 'Review CSV import' : 'Change password'} onClose={() => { setDialog(''); setError(''); setEditTarget(null); if (dialog === 'csvReport') { setCsvReport(null); setCsvText('') } }}>
      <form onSubmit={submitDialog} className="stack-form dialog-form">
        {dialog === 'user' && <><Field label="Full name" name="name" required maxLength={120} placeholder="e.g. Ayesha Khan" /><Field label="Work email" name="email" type="email" required maxLength={254} placeholder="name@company.com" />{user.role === 'HR' ? <div className="form-row"><Field label="Department" name="department" required placeholder="Choose a department" options={(data.departments || []).map((name) => ({ value: name, label: name }))} /><Field label="Job title" name="designation" required maxLength={120} placeholder="e.g. Designer" /></div> : <Field label="Job title" name="designation" maxLength={120} placeholder="e.g. People partner" />}{user.role === 'HR' && <Field label="Basic monthly salary (PKR)" name="basicSalary" type="number" min="1" max="1000000000" step="1" required placeholder="80000" />}<Field label="Temporary password" name="password" type="password" minLength={8} maxLength={128} required placeholder="At least 8 characters" /><p className="field-hint">Ask them to change this password after signing in.</p></>}
        {dialog === 'editUser' && editTarget && <><Field label="Full name" name="name" required maxLength={120} defaultValue={editTarget.name} /><Field label="Work email" name="email" type="email" required maxLength={254} defaultValue={editTarget.email} /><Field label="Department" name="department" required placeholder="Choose a department" defaultValue={(data.departments || []).includes(editTarget.department) ? editTarget.department : ''} options={(data.departments || []).map((name) => ({ value: name, label: name }))} /><Field label="Job title" name="designation" required maxLength={120} defaultValue={editTarget.designation} /><div className="form-row"><Field label="Monthly salary (PKR)" name="basicSalary" type="number" min="0" max="1000000000" step="1" required defaultValue={editTarget.basicSalary ?? 0} /><Field label="Phone" name="phone" maxLength={40} defaultValue={editTarget.phone || ''} /></div><Field label="Address" name="address" maxLength={200} defaultValue={editTarget.address || ''} />{user.role === 'ADMIN' && <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="isActive" defaultChecked={editTarget.isActive !== false} className="accent-emerald-700" />Account is active</label>}</>}
        {dialog === 'resetPassword' && editTarget && <><p className="field-hint">Set a temporary password for {editTarget.name}. They will be asked to choose their own password when they next sign in.</p><Field label="New temporary password" name="newPassword" type="password" minLength={8} maxLength={128} required placeholder="At least 8 characters" /></>}
        {dialog === 'leave' && <><Field label="Leave type" name="type" required defaultValue={smartLeave?.type} options={(data.leaveDetails?.policies || [{ type: 'ANNUAL' }, { type: 'SICK' }, { type: 'CASUAL' }, { type: 'UNPAID' }]).map((policy) => ({ value: policy.type, label: policy.type.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase()) }))} /><div className="form-row"><Field label="From" name="startDate" type="date" required defaultValue={smartLeave?.startDate} /><Field label="To" name="endDate" type="date" required defaultValue={smartLeave?.endDate} /></div><Field label="Reason" name="reason" required maxLength={500} placeholder="Tell us a little about your request" defaultValue={smartLeave?.reason} /></>}
        {dialog === 'settings' && <><Field label="Company name" name="companyName" maxLength={120} defaultValue={data.settings?.companyName} required /><div className="form-row"><Field label="Office starts" name="officeStart" type="time" defaultValue={data.settings?.officeStart || '09:00'} required /><Field label="Grace period (minutes)" name="graceMinutes" type="number" min="0" max="240" step="1" defaultValue={data.settings?.graceMinutes ?? 15} required /></div><Field label="Office radius (metres)" name="officeRadius" type="number" min="1" max="100000" defaultValue={data.settings?.officeRadius || 150} required /><p className="field-hint">Saturday and Sunday are treated as weekends.</p></>}
        {dialog === 'department' && <Field label="Department name" name="name" required maxLength={80} placeholder="e.g. Customer success" />}
        {dialog === 'holiday' && <><Field label="Holiday name" name="name" required maxLength={120} placeholder="e.g. Independence Day" /><Field label="Date" name="date" type="date" required /></>}
        {dialog === 'announcement' && <><Field label="Title" name="title" required maxLength={120} placeholder="A quick update for the team" /><label className="field"><span>Message</span><textarea name="body" required maxLength="3000" rows="5" placeholder="Share the details…" /></label><Field label="Audience" name="audience" required options={[{ value: 'ALL', label: 'Everyone' }, { value: 'HR', label: 'Human resources' }, { value: 'EMPLOYEE', label: 'Employees' }]} /></>}
        {dialog === 'correction' && <><div className="attendance-banner"><span className="banner-icon"><Icon name="clock" /></span><div><strong>{shortDate(correctionTarget?.date)}</strong><p>Correct the time below and explain what needs fixing.</p></div></div><Field label="Correct check-in (optional)" name="checkIn" type="datetime-local" defaultValue={correctionTarget?.checkIn ? new Date(new Date(correctionTarget.checkIn).getTime() - new Date(correctionTarget.checkIn).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''} /><Field label="Correct check-out (optional)" name="checkOut" type="datetime-local" defaultValue={correctionTarget?.checkOut ? new Date(new Date(correctionTarget.checkOut).getTime() - new Date(correctionTarget.checkOut).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''} /><Field label="Reason" name="reason" required maxLength={500} placeholder="Tell HR what needs correcting" /></>}
        {dialog === 'csvReport' && csvReport && <><div className="csv-summary"><strong>{csvReport.valid} valid</strong><span>{csvReport.invalid} need fixing · {csvReport.total} rows scanned</span></div>{csvReport.errors.length > 0 && <div className="csv-errors">{csvReport.errors.map((item, index) => <div key={`${item.row}-${item.field}-${index}`}><strong>Row {item.row} · {item.field}</strong><span>{item.reason}</span></div>)}</div>}{csvReport.invalid > 0 && <p className="field-hint">No rows were imported. Fix the errors and upload the CSV again.</p>}</>}
        {dialog === 'password' && <><Field label="Current password" name="currentPassword" type="password" required maxLength={128} /><Field label="New password" name="newPassword" type="password" minLength={8} maxLength={128} required placeholder="At least 8 characters" /></>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="dialog-actions"><button type="button" className="button button-quiet" onClick={() => { setDialog(''); setEditTarget(null); setSmartLeave(null); setCsvReport(null); setCsvText('') }}>Cancel</button>{dialog !== 'csvReport' || csvReport?.invalid === 0 ? <button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : dialog === 'csvReport' ? 'Import employees' : dialog === 'correction' ? 'Send to HR' : dialog === 'announcement' ? 'Publish' : 'Save changes'}</button> : null}</div>
      </form>
    </Dialog>}
    {toast && <div className="toast"><span className="toast-check"><Icon name="check" size={15} /></span>{toast}</div>}
  </div>
}

function Dashboard({ data, user, token, onNavigate, onAction }) {
  const [summary, setSummary] = useState([])
  const [summaryAiGenerated, setSummaryAiGenerated] = useState(false)
  const [summaryBusy, setSummaryBusy] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'
  if (!data) return <div className="loading-line"><span /> Getting things ready…</div>
  if (user.role === 'EMPLOYEE') return <><div className="page-heading"><div><div className="eyebrow">YOUR WORKSPACE · {new Date().toLocaleDateString('en-PK', { month: 'long', year: 'numeric' }).toUpperCase()}</div><h1>{greeting}, {user.name.split(' ')[0]}<span className="wave">✳</span></h1><p className="muted">A little overview of your work life, all in one place.</p></div></div>
    <section className="employee-hero"><div><span className="hero-label">TODAY AT A GLANCE</span><h2>{data.today ? 'You’re checked in. Nice work.' : 'Ready to get started?'}</h2><p>{data.today ? `Checked in at ${new Date(data.today.checkIn).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })} · ${data.today.status.toLowerCase().replace('_', ' ')}` : 'Check in when you arrive. Your time is recorded securely.'}</p><button className="button button-light" disabled={Boolean(data.today?.checkOut)} onClick={() => onAction(`/attendance/check-${data.today ? 'out' : 'in'}`, { method: 'POST' }, data.today ? 'You’re checked out. Have a good one!' : 'You’re checked in. Have a great day!')}>{data.today?.checkOut ? 'Day complete ✓' : data.today ? 'Check out' : 'Check in'} <span>→</span></button></div><div className="hero-time"><span>{new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: false })}</span><small>{new Date().toLocaleDateString('en-PK', { weekday: 'long', month: 'long', day: 'numeric' })}</small></div><div className="hero-decoration" /></section>
    <div className="stats-grid"><StatCard icon="clock" label="Hours this month" value={`${data.hoursThisMonth.toFixed(1)}h`} note="Recorded work time" onClick={() => onNavigate('attendance')} /><StatCard icon="calendar" label="Paid leave remaining" value={`${Object.values(data.leaveBalance).reduce((sum, days) => sum + days, 0)} days`} note={Object.entries(data.leaveBalance).map(([type, days]) => `${type.replaceAll('_', ' ').toLowerCase()} ${days}`).join(' · ') || 'No paid leave configured'} tone="lilac" onClick={() => onNavigate('leaves')} /><StatCard icon="people" label="Late arrivals" value={data.lateThisMonth} note="This month" tone="peach" onClick={() => onNavigate('attendance')} /></div>
    <section className="content-grid employee-grid"><div className="panel"><PanelTitle title="Your attendance" action="See all" onClick={() => onNavigate('attendance')} /><div className="mini-list">{data.attendance.slice(0, 5).map((record) => <div className="mini-row" key={record._id}><span className="mini-date">{new Date(`${record.date}T12:00:00`).toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric' })}</span><span>{record.hoursWorked ? `${record.hoursWorked.toFixed(1)} hours` : new Date(record.checkIn).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</span><Badge>{record.status}</Badge></div>)}{!data.attendance.length && <EmptyState title="Your week starts here" body="Check in to see your attendance record." />}</div></div><div className="panel balance-panel"><PanelTitle title="Time off balance" action="Request leave" onClick={() => onNavigate('leaves')} /><div className="balance-lines">{data.leavePolicies.map((policy) => { const days = data.leaveBalance[policy.type] || 0; const progress = policy.annualQuota ? Math.min(100, Math.max(0, days / policy.annualQuota * 100)) : 0; return <div key={policy.type}><span>{policy.type.replaceAll('_', ' ').toLowerCase()}</span><strong>{days}<small> days</small></strong><div className="balance-track"><i style={{ width: `${progress}%` }} /></div></div> })}{!data.leavePolicies.length && <p className="muted">No paid leave policies are configured.</p>}</div><button className="text-link" onClick={() => onNavigate('leaves')}>View leave requests <span>→</span></button></div></section>
  </>
  const summarize = async () => {
    setSummaryBusy(true)
    setSummaryError('')
    try {
      const result = await api('/ai/summary', token, { method: 'POST', body: JSON.stringify({ metrics: data }) })
      setSummary(result.summary)
      setSummaryAiGenerated(result.aiGenerated)
    } catch (requestError) {
      setSummaryError(requestError.message)
    } finally {
      setSummaryBusy(false)
    }
  }
  return <><div className="page-heading"><div><div className="eyebrow">{roles[user.role].toUpperCase()} WORKSPACE · {new Date().toLocaleDateString('en-PK', { month: 'long', year: 'numeric' }).toUpperCase()}</div><h1>{greeting}, {user.name.split(' ')[0]}<span className="wave">✳</span></h1><p className="muted">Here’s what’s happening with your people today.</p></div><div className="heading-actions"><button className="button button-quiet" onClick={summarize} disabled={summaryBusy}><Icon name="spark" size={16} />{summaryBusy ? 'Summarizing…' : 'Summarize'}</button><button className="button button-dark" onClick={() => onNavigate(user.role === 'ADMIN' ? 'settings' : 'employees')}><Icon name={user.role === 'ADMIN' ? 'settings' : 'plus'} size={17} />{user.role === 'ADMIN' ? 'Company settings' : 'Add a team member'}</button></div></div>
    <div className="stats-grid"><StatCard icon="people" label="Active people" value={data.headcount} note="Across your company" onClick={() => onNavigate('employees')} /><StatCard icon="clock" label="Here today" value={data.presentToday} note={`${data.attendanceRate}% attendance`} onClick={() => onNavigate('attendance')} /><StatCard icon="calendar" label="On time off" value={data.onLeaveToday} note={`${data.absentees} not checked in`} tone="lilac" onClick={() => onNavigate('leaves')} /><StatCard icon="file" label="Needs your attention" value={data.pendingLeaves} note="Pending time-off requests" tone="peach" onClick={() => onNavigate('leaves')} /></div>
    <section className="content-grid dashboard-grid"><div className="panel"><PanelTitle title="Today’s attendance" subtitle={new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long' })} action="View attendance" onClick={() => onNavigate('attendance')} /><div className="attendance-summary"><div className="summary-main"><div className="donut" style={{ '--progress': `${data.attendanceRate}%` }}><div><strong>{data.attendanceRate}%</strong><small>attendance</small></div></div><div className="summary-legend"><span><i className="legend-dot dot-green" />Present <strong>{data.presentToday}</strong></span><span><i className="legend-dot dot-purple" />On leave <strong>{data.onLeaveToday}</strong></span><span><i className="legend-dot dot-orange" />Not checked in <strong>{data.absentees}</strong></span></div></div><div className="department-list"><div className="department-heading"><span>TEAM SIZE BY DEPARTMENT</span><button onClick={() => onNavigate('employees')}>View people →</button></div>{data.departmentCounts.slice(0, 5).map((department, index) => <button className="department-row department-action" key={department._id} type="button" onClick={() => onNavigate('employees')} aria-label={`Open people in ${department._id || 'Unassigned'} department`}><span><i className={`department-dot dept-${index % 4}`} />{department._id || 'Unassigned'}</span><div className="department-bar"><i style={{ width: `${Math.max(12, department.count / Math.max(data.headcount, 1) * 100)}%` }} /></div><strong>{department.count}</strong></button>)}{!data.departmentCounts.length && <EmptyState title="No teams yet" body="Add employees to see your teams here." />}</div></div></div>
      <div className="panel right-panel"><PanelTitle title="Needs a look" subtitle="Your team’s latest activity" /><div className="activity-list"><Activity icon="calendar" tone="lilac" title="Time-off requests" note={data.pendingLeaves ? `${data.pendingLeaves} request${data.pendingLeaves === 1 ? '' : 's'} waiting for review` : 'You’re all caught up'} value={data.pendingLeaves ? `${data.pendingLeaves} new` : 'All clear'} onClick={() => onNavigate('leaves')} /><Activity icon="clock" tone="peach" title="Late arrivals" note={`${data.lateToday} people checked in late today`} value="Today" onClick={() => onNavigate('attendance')} /><Activity icon="wallet" tone="sage" title="Payroll overview" note={data.payrollCost ? `Latest finalized gross · ${money(data.payrollCost)}` : 'No finalized payroll this month'} value={data.payrollMonth} onClick={() => onNavigate('payroll')} /></div><button className="panel-link" onClick={() => onNavigate('leaves')}>Review team requests <span>→</span></button></div>
    </section>{summary.length > 0 && <section className="panel insight-panel"><PanelTitle title={summaryAiGenerated ? 'AI dashboard summary' : 'Dashboard summary'} subtitle="Grounded in the current dashboard figures." /><ul>{summary.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul><span className="ai-label">{summaryAiGenerated ? 'AI-generated from dashboard KPIs' : 'Generated from verified dashboard KPIs · AI provider unavailable'}</span></section>}{summaryError && <div className="page-error">{summaryError}</div>}<section className="panel late-panel"><PanelTitle title="Recent late arrivals" subtitle="Latest recorded this month" action="View attendance" onClick={() => onNavigate('attendance')} />{data.topLateComers.length ? <div className="table-scroll"><table><thead><tr><th>TEAM MEMBER</th><th>DEPARTMENT</th><th>DATE</th><th>STATUS</th></tr></thead><tbody>{data.topLateComers.map((item, index) => <tr key={`${item.name}-${item.date}-${index}`}><td><span className="table-person"><span className="avatar avatar-small">{item.name?.slice(0, 1)}</span><strong>{item.name}</strong></span></td><td>{item.department || 'Unassigned'}</td><td>{shortDate(item.date)}</td><td><Badge>LATE</Badge></td></tr>)}</tbody></table></div> : <EmptyState title="A good start" body="No late arrivals have been recorded this month." />}</section>
  </>
}

function PanelTitle({ title, subtitle, action, onClick }) {
  return <div className="panel-title"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action && <button className="text-link" onClick={onClick}>{action}<span> →</span></button>}</div>
}

function Activity({ icon, tone, title, note, value, onClick }) {
  return <button type="button" className="activity-row activity-action" onClick={onClick}><span className={`activity-icon ${tone}`}><Icon name={icon} size={18} /></span><span className="activity-copy"><strong>{title}</strong><small>{note}</small></span><span className="activity-value">{value}</span></button>
}

function Employees({ users, user, query, departments: knownDepartments, busy, onQuery, onAdd, onCsv, onDownloadCsv, onEdit, onResetPassword }) {
  const [department, setDepartment] = useState('All teams')
  const filtered = users.filter((person) => department === 'All teams' || person.department === department)
  const departments = [...new Set([...knownDepartments, ...users.map((person) => person.department)].filter(Boolean))]
  return <><div className="page-heading"><div><div className="eyebrow">YOUR PEOPLE · DIRECTORY</div><h1>{user.role === 'ADMIN' ? 'Your team' : 'People directory'}</h1><p className="muted">Get to know the people who make your company what it is.</p></div><div className="heading-actions">{user.role === 'HR' && <><label className={`button button-quiet ${busy ? 'button-disabled' : ''}`}><Icon name="upload" size={16} />Import CSV<input className="visually-hidden" type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => { onCsv(event.target.files?.[0]); event.target.value = '' }} /></label><button className="button button-quiet" onClick={() => onDownloadCsv('/users/csv/template')}>Template</button><button className="button button-quiet" onClick={() => onDownloadCsv('/users/csv/export')}>Export</button></>}<button className="button button-dark" onClick={onAdd}><Icon name="plus" size={17} />{user.role === 'ADMIN' ? 'Invite HR partner' : 'Add team member'}</button></div></div>
    <div className="directory-toolbar"><div className="directory-count"><strong>{filtered.length}</strong> people <span>·</span> {departments.length} teams</div><div className="toolbar-filters"><label className="search-box"><Icon name="search" size={16} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Find a person..." /></label><select value={department} onChange={(event) => setDepartment(event.target.value)}><option>All teams</option>{departments.map((name) => <option key={name}>{name}</option>)}</select></div></div>
    <section className="panel people-panel">{filtered.length ? <div className="table-scroll"><table><thead><tr><th>PERSON</th><th>TEAM</th><th>JOB TITLE</th><th>ROLE</th><th>{user.role === 'ADMIN' ? 'ACCOUNT' : 'BASIC SALARY'}</th><th>ACTIONS</th></tr></thead><tbody>{filtered.map((person) => <tr key={person._id}><td><span className="table-person"><span className="avatar avatar-small">{person.name.slice(0, 1)}</span><span><button type="button" className="person-open" disabled={busy || (user.role !== 'ADMIN' && person.role !== 'EMPLOYEE')} onClick={() => onEdit(person)} aria-label={`Edit ${person.name}`}>{person.name}</button><small>{person.email}</small></span></span></td><td>{person.department || 'Unassigned'}</td><td>{person.designation || '—'}</td><td><span className="role-label">{roles[person.role] || person.role}</span></td><td>{user.role === 'ADMIN' ? person.isActive === false ? <Badge>INACTIVE</Badge> : <Badge>ACTIVE</Badge> : money(person.basicSalary)}</td><td><div className="flex flex-wrap gap-2">{(user.role === 'ADMIN' || person.role === 'EMPLOYEE') && <><button className="row-action" disabled={busy} onClick={() => onEdit(person)}>Edit details</button><button className="row-action" disabled={busy} onClick={() => onResetPassword(person)}>Reset password</button></>}</div></td></tr>)}</tbody></table></div> : <EmptyState title="Your people will be right here" body="Try a different search or invite your first team member." />}</section>
  </>
}

function AttendancePage({ records, corrections, user, dashboard, onAction, onCorrection, busy }) {
  const hasToday = user.role === 'EMPLOYEE' && dashboard?.today
  return <><div className="page-heading"><div><div className="eyebrow">TIME & PRESENCE</div><h1>Attendance</h1><p className="muted">A clear picture of when your team is in and ready to go.</p></div>{user.role !== 'ADMIN' && <button className="button button-dark" disabled={busy || Boolean(hasToday?.checkOut)} onClick={() => onAction(`/attendance/check-${hasToday ? 'out' : 'in'}`, { method: 'POST' }, hasToday ? 'Checked out successfully.' : 'Checked in successfully.')}><Icon name="clock" size={17} />{hasToday ? hasToday.checkOut ? 'Day complete' : 'Check out' : 'Check in'}</button>}</div>
    {user.role === 'EMPLOYEE' && <div className="attendance-banner"><span className="banner-icon"><Icon name="clock" /></span><div><strong>{hasToday ? hasToday.checkOut ? 'You’ve completed today’s attendance.' : 'You’re checked in for today.' : 'You haven’t checked in today.'}</strong><p>{hasToday ? `${new Date(hasToday.checkIn).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}${hasToday.checkOut ? ` — ${new Date(hasToday.checkOut).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}` : ''}` : 'Use check-in when you arrive at work.'}</p></div></div>}
    <section className="panel records-panel"><PanelTitle title="Attendance records" subtitle={`${records.length} records this month`} />{records.length ? <div className="table-scroll"><table><thead><tr>{user.role !== 'EMPLOYEE' && <th>TEAM MEMBER</th>}<th>DATE</th><th>CHECK IN</th><th>CHECK OUT</th><th>HOURS</th><th>STATUS</th>{user.role === 'EMPLOYEE' && <th>REQUEST</th>}</tr></thead><tbody>{records.map((record) => { const pendingCorrection = corrections.some((item) => item.attendance?._id === record._id && item.status === 'PENDING'); return <tr key={record._id}>{user.role !== 'EMPLOYEE' && <td><span className="table-person"><span className="avatar avatar-small">{record.employee?.name?.slice(0, 1) || '?'}</span><span><strong>{record.employee?.name || 'Team member'}</strong><small>{record.employee?.department}</small></span></span></td>}<td>{shortDate(record.date)}</td><td>{new Date(record.checkIn).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</td><td>{record.checkOut ? new Date(record.checkOut).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) : '—'}</td><td>{record.hoursWorked ? `${record.hoursWorked.toFixed(1)}h` : '—'}</td><td><Badge>{record.status}</Badge></td>{user.role === 'EMPLOYEE' && <td>{pendingCorrection ? <Badge>PENDING</Badge> : <button className="row-action" onClick={() => onCorrection(record)}>Request correction</button>}</td>}</tr>})}</tbody></table></div> : <EmptyState title="No attendance records yet" body="Check in to start creating your attendance history." />}</section>
  </>
}

function CorrectionsPage({ corrections, user, onAction, busy }) {
  const pending = corrections.filter((correction) => correction.status === 'PENDING')
  return <><div className="page-heading"><div><div className="eyebrow">ATTENDANCE · REVIEW QUEUE</div><h1>Attendance corrections</h1><p className="muted">Review employee-submitted changes before they update attendance records.</p></div><span className="badge badge-pending">{pending.length} awaiting review</span></div>
    <section className="panel records-panel"><PanelTitle title="Correction requests" subtitle="Employees can only request corrections for their own check-in records." />{corrections.length ? <div className="table-scroll"><table><thead><tr><th>PERSON</th><th>DATE</th><th>REQUESTED TIME</th><th>REASON</th><th>STATUS</th><th>REVIEW</th></tr></thead><tbody>{corrections.map((item) => <tr key={item._id}><td><span className="table-person"><span className="avatar avatar-small">{item.employee?.name?.slice(0, 1) || '?'}</span><span><strong>{item.employee?.name || 'Team member'}</strong><small>{item.employee?.department}</small></span></span></td><td>{shortDate(item.attendance?.date)}</td><td>{item.requestedCheckIn && <div>In {new Date(item.requestedCheckIn).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</div>}{item.requestedCheckOut && <div>Out {new Date(item.requestedCheckOut).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</div>}</td><td className="reason-cell">{item.reason}</td><td><Badge>{item.status}</Badge></td><td>{user.role === 'HR' && item.status === 'PENDING' ? <div className="review-actions"><button className="approve-button" disabled={busy} onClick={() => onAction(`/attendance/corrections/${item._id}/review`, { method: 'PATCH', body: JSON.stringify({ status: 'APPROVED' }) }, 'Attendance correction approved.')}>Approve</button><button className="reject-button" disabled={busy} onClick={() => onAction(`/attendance/corrections/${item._id}/review`, { method: 'PATCH', body: JSON.stringify({ status: 'REJECTED', comment: window.prompt('Optional note for the employee:') || '' }) }, 'Attendance correction declined.')}>Decline</button></div> : item.reviewComment || '—'}</td></tr>)}</tbody></table></div> : <EmptyState title="No corrections to review" body="Employee correction requests will appear here." />}</section>
  </>
}

function LeavesPage({ leaves, user, balance, policies, onAdd, onSmartLeave, onAction, busy }) {
  const [smartText, setSmartText] = useState('')
  const leaveTypes = policies.length ? policies : [{ type: 'ANNUAL' }, { type: 'SICK' }, { type: 'CASUAL' }, { type: 'UNPAID' }]
  return <><div className="page-heading"><div><div className="eyebrow">REST, RESET, RECHARGE</div><h1>Time off</h1><p className="muted">Time away matters. Keep requests and balances in one easy place.</p></div>{user.role === 'EMPLOYEE' && <button className="button button-dark" onClick={() => onAdd()}><Icon name="plus" size={17} />Request time off</button>}</div>
    {user.role === 'EMPLOYEE' && <section className="panel smart-leave-panel"><div className="smart-heading"><span className="smart-icon"><Icon name="spark" /></span><div><h2>Describe your time off</h2><p>We’ll pre-fill a request for you to review before submitting.</p></div></div><form className="smart-leave-form" onSubmit={(event) => { event.preventDefault(); if (smartText.trim()) onSmartLeave(smartText.trim()) }}><input value={smartText} onChange={(event) => setSmartText(event.target.value)} maxLength={500} required placeholder="e.g. I need next Monday and Tuesday off for a wedding" /><button className="button button-primary" disabled={busy || !smartText.trim()}>{busy ? 'Thinking…' : 'Fill my form'}<span>→</span></button></form><small>Available: {leaveTypes.map((policy) => policy.type.replaceAll('_', ' ').toLowerCase()).join(' · ') || 'No leave types configured'}. Suggestions are not submitted until you review and confirm the form.</small></section>}
    {balance && <div className="stats-grid leave-stats">{Object.entries(balance.balance).filter(([, days]) => days !== null).map(([type, days], index) => <StatCard key={type} icon="calendar" label={`${type.charAt(0) + type.slice(1).toLowerCase()} remaining`} value={`${days} days`} note={`${balance.used[type] || 0} used this year`} tone={['sage', 'lilac', 'peach'][index]} />)}</div>}
    <section className="panel records-panel">
      <PanelTitle title={user.role === 'EMPLOYEE' ? 'Your requests' : 'Team requests'} subtitle="A little breathing room makes a big difference." />
      {leaves.length ? <div className="table-scroll"><table>
        <thead><tr>{user.role !== 'EMPLOYEE' && <th>PERSON</th>}<th>TIME OFF</th><th>DATES</th><th>DAYS</th><th>REASON</th><th>STATUS</th>{user.role === 'HR' && <th>REVIEW</th>}</tr></thead>
        <tbody>{leaves.map((leave) => <tr key={leave._id}>
          {user.role !== 'EMPLOYEE' && <td><span className="table-person"><span className="avatar avatar-small">{leave.employee?.name?.slice(0, 1)}</span><span><strong>{leave.employee?.name}</strong><small>{leave.employee?.department}</small></span></span></td>}
          <td>{leave.type.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())}</td>
          <td>{shortDate(leave.startDate)} – {shortDate(leave.endDate)}</td><td>{leave.days}</td><td className="reason-cell">{leave.reason}</td><td><Badge>{leave.status}</Badge></td>
          {user.role === 'HR' && <td>{leave.status === 'PENDING' ? <div className="review-actions">
            <button className="approve-button" disabled={busy} onClick={() => onAction(`/leaves/${leave._id}/review`, { method: 'PATCH', body: JSON.stringify({ status: 'APPROVED' }) }, 'Leave request approved.')}>Approve</button>
            <button className="reject-button" disabled={busy} onClick={() => {
              const comment = window.prompt('Optional note for the employee:') ?? ''
              onAction(`/leaves/${leave._id}/review`, { method: 'PATCH', body: JSON.stringify({ status: 'REJECTED', comment }) }, 'Leave request declined.')
            }}>Decline</button>
          </div> : leave.reviewComment || '—'}</td>}
        </tr>)}</tbody>
      </table></div> : <EmptyState title="No time-off requests" body={user.role === 'EMPLOYEE' ? 'When you need a little time away, start a request here.' : 'Your team’s requests will appear here.'} />}
    </section>
  </>
}

function PayrollPage({ runs, user, onAction, onDownload, busy }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  return <><div className="page-heading"><div><div className="eyebrow">PAY, MADE CLEAR</div><h1>{user.role === 'EMPLOYEE' ? 'Your payslips' : 'Payroll'}</h1><p className="muted">{user.role === 'EMPLOYEE' ? 'Your finalized salary statements, ready when you need them.' : 'Prepare the monthly payroll for review, then finalize it securely.'}</p></div>{user.role === 'HR' && <div className="payroll-actions"><input aria-label="Payroll month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /><button className="button button-dark" disabled={busy} onClick={() => onAction('/payroll/draft', { method: 'POST', body: JSON.stringify({ month }) }, 'Payroll draft prepared.')}>Prepare draft <span>→</span></button></div>}</div>
    {user.role === 'ADMIN' && <div className="attendance-banner"><span className="banner-icon"><Icon name="wallet" /></span><div><strong>Final review belongs to you.</strong><p>HR prepares the monthly draft; only an admin can lock a finalized payroll run.</p></div></div>}
    <section className="panel records-panel"><PanelTitle title={user.role === 'EMPLOYEE' ? 'Available payslips' : 'Monthly payroll runs'} subtitle="Based on active employee records and approved attendance." />{runs.length ? <div className="table-scroll"><table><thead><tr><th>PAY PERIOD</th>{user.role === 'EMPLOYEE' ? <><th>GROSS PAY</th><th>DEDUCTIONS</th><th>NET PAY</th><th /></> : <><th>PEOPLE</th><th>TOTAL GROSS</th><th>STATUS</th><th>ACTION</th></>}</tr></thead><tbody>{runs.map((run) => { const entries = run.items || []; const total = entries.reduce((sum, item) => sum + item.gross, 0); const net = entries.reduce((sum, item) => sum + item.net, 0); const employeePayslip = run.payslip; return <tr key={run._id || run.id}><td><strong>{new Date(`${run.month}-15T12:00:00`).toLocaleDateString('en-PK', { month: 'long', year: 'numeric' })}</strong></td>{user.role === 'EMPLOYEE' ? <><td>{money(employeePayslip?.gross)}</td><td>{money((employeePayslip?.deductions || 0) + (employeePayslip?.tax || 0))}</td><td><strong>{money(employeePayslip?.net)}</strong></td><td><button className="download-button" onClick={() => onDownload(employeePayslip, run.month)}><Icon name="download" size={15} />Print payslip</button></td></> : <><td>{entries.length}</td><td>{money(total)}</td><td><Badge>{run.status}</Badge></td><td>{user.role === 'ADMIN' && run.status === 'DRAFT' ? <button className="button button-small button-primary" disabled={busy} onClick={() => onAction(`/payroll/${run._id}/finalize`, { method: 'POST' }, 'Payroll finalized and locked.')}>Finalize</button> : user.role === 'HR' ? <span className="muted">{money(net)} net</span> : 'Locked'}</td></>}</tr>})}</tbody></table></div> : <EmptyState title="Nothing on the books yet" body={user.role === 'EMPLOYEE' ? 'Your payslip will show up after the next payroll is finalized.' : user.role === 'HR' ? 'Choose a pay period above to prepare your first payroll draft.' : 'A finalized payroll run will appear here when it’s ready.'} />}</section>
  </>
}

function AssistantPage({ token, user }) {
  const [messages, setMessages] = useState([{ role: 'assistant', content: 'Hi! Ask me about your workplace policies, attendance, time off or payroll.' }])
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function sendMessage(event) {
    event.preventDefault()
    const message = prompt.trim()
    if (!message || busy) return
    setPrompt('')
    setError('')
    setMessages((current) => [...current, { role: 'user', content: message }])
    setBusy(true)
    try {
      const result = await api('/ai/chat', token, { method: 'POST', body: JSON.stringify({ message }) })
      setMessages((current) => [...current, { role: 'assistant', content: result.answer, aiGenerated: result.aiGenerated }])
    } catch (requestError) {
      setError(requestError.message)
      setMessages((current) => [...current, { role: 'assistant', content: 'I couldn’t reach the workspace assistant. Please try again.' }])
    } finally {
      setBusy(false)
    }
  }

  return <><div className="page-heading"><div><div className="eyebrow">YOUR WORKSPACE · PRIVATE ASSISTANT</div><h1>AI assistant</h1><p className="muted">Ask about your workplace using information your role is allowed to see.</p></div><span className="ai-label">{roles[user.role]} access</span></div>
    <section className="panel assistant-panel flex min-h-[28rem] flex-col gap-4 p-4 sm:p-6"><div className="assistant-messages flex min-h-72 flex-1 flex-col gap-4 overflow-y-auto" aria-live="polite">{messages.map((message, index) => <div key={`${message.role}-${index}`} className={`assistant-message flex max-w-[90%] gap-3 rounded-xl p-4 ${message.role === 'user' ? 'ml-auto bg-emerald-50 text-emerald-950' : 'bg-slate-50 text-slate-800'}`}><span className="assistant-avatar grid size-9 shrink-0 place-items-center rounded-full bg-white text-emerald-800 shadow-sm">{message.role === 'assistant' ? <Icon name="spark" size={16} /> : user.name.slice(0, 1)}</span><div className="min-w-0"><strong className="block text-sm font-semibold">{message.role === 'assistant' ? 'PeopleOS assistant' : 'You'}</strong><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{message.content}</p>{message.aiGenerated && <small className="mt-2 block text-xs text-slate-500">AI-generated · verify important decisions with HR.</small>}</div></div>)}{busy && <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">Finding the right workspace information…</div>}</div>
      <form className="assistant-form flex gap-2" onSubmit={sendMessage}><input className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-600" aria-label="Ask a question" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength="1500" placeholder="Ask about policies, your leave balance, attendance…" /><button className="button button-primary" disabled={busy || !prompt.trim()} aria-label="Send message"><Icon name="send" size={16} />Send</button></form>
      {error && <div className="form-error" role="alert">{error}</div>}<small className="assistant-disclaimer text-xs leading-5 text-slate-500">Answers are based on role-scoped workspace information and are not a substitute for HR guidance.</small>
    </section>
  </>
}

function AnnouncementsPage({ announcements, canPost, onAdd, onArchive }) {
  return <><div className="page-heading"><div><div className="eyebrow">WORKSPACE UPDATES</div><h1>Announcements</h1><p className="muted">Important updates shared with your audience.</p></div>{canPost && <button className="button button-dark" onClick={onAdd}><Icon name="plus" size={17} />New announcement</button>}</div>
    <div className="announcement-list grid gap-4">{announcements.length ? announcements.map((item) => <article className="panel announcement-card rounded-xl border border-slate-200 p-5 shadow-sm" key={item._id}><div className="announcement-meta flex items-center gap-3"><span className="announcement-icon grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-800"><Icon name="megaphone" size={17} /></span><span className="min-w-0 flex-1"><strong className="block text-sm font-semibold text-slate-800">{item.authorName || 'Workspace team'}</strong><small className="mt-1 block text-xs text-slate-500">{new Date(item.createdAt).toLocaleDateString('en-PK', { dateStyle: 'medium' })} · {item.audience === 'ALL' ? 'Everyone' : roles[item.audience] || item.audience}</small></span>{canPost && <button className="row-action" onClick={() => onArchive(item)}>Archive</button>}</div><h2 className="mt-4 text-lg font-semibold text-slate-900">{item.title}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.body}</p></article>) : <section className="panel"><EmptyState title="No announcements yet" body="Workspace announcements will appear here." /></section>}</div>
  </>
}

function NotificationsPage({ notifications, unread, onRead, onReadAll }) {
  return <><div className="page-heading"><div><div className="eyebrow">YOUR INBOX</div><h1>Notifications</h1><p className="muted">Stay up to date with changes that matter to you.</p></div>{unread > 0 && <button className="button button-quiet" onClick={onReadAll}>Mark all as read</button>}</div>
    <section className="panel notification-list divide-y divide-slate-100 p-2 sm:p-4">{notifications.length ? notifications.map((item) => <article className={`notification-row flex items-start gap-3 rounded-lg p-4 ${item.readAt ? 'opacity-70' : 'bg-emerald-50/60'}`} key={item._id}><span className="notification-icon grid size-9 shrink-0 place-items-center rounded-lg bg-white text-emerald-800 shadow-sm"><Icon name={item.type === 'ANNOUNCEMENT' ? 'megaphone' : item.type === 'LEAVE' ? 'calendar' : 'bell'} size={17} /></span><div className="notification-copy min-w-0 flex-1"><strong className="block text-sm font-semibold text-slate-800">{item.title}</strong><p className="mt-1 text-sm leading-5 text-slate-600">{item.body}</p><small className="mt-2 block text-xs text-slate-500">{new Date(item.createdAt).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}</small></div>{!item.readAt && <button className="row-action" onClick={() => onRead(item)}>Mark read</button>}</article>) : <EmptyState title="You’re all caught up" body="New workspace updates will show up here." />}</section>
  </>
}

function SettingsPage({ settings, logs, canEdit, onEdit, onAddDepartment, onAddHoliday, onSaveSettings, onDeleteDepartment }) {
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

  function updatePolicy(type, field, value) {
    const leavePolicies = settings.leavePolicies.map((policy) => policy.type === type ? { ...policy, [field]: value } : policy)
    onSaveSettings({ leavePolicies }, 'Leave policy updated.')
  }

  function removeHoliday(date) {
    onSaveSettings({ publicHolidays: settings.publicHolidays.filter((holiday) => holiday.date !== date) }, 'Public holiday removed.')
  }

  return <><div className="page-heading"><div><div className="eyebrow">YOUR COMPANY · CONTROL CENTRE</div><h1>Policies & audit</h1><p className="muted">Manage workplace rules, departments, holidays and important activity.</p></div>{canEdit && <button className="button button-dark" onClick={onEdit}><Icon name="settings" size={17} />Company settings</button>}</div>
    <section className="settings-grid"><div className="panel settings-card"><PanelTitle title="Company profile" subtitle="The basics that keep your workspace running." />{settings ? <div className="settings-detail"><div><span>Company name</span><strong>{settings.companyName}</strong></div><div><span>Office start</span><strong>{settings.officeStart}</strong></div><div><span>Grace period</span><strong>{settings.graceMinutes} minutes</strong></div><div><span>Weekend</span><strong>{settings.weekend.join(' & ') || 'None'}</strong></div><div><span>Office radius</span><strong>{settings.officeRadius} m</strong></div></div> : <EmptyState title="Settings are loading" body="Check back in a moment." />}</div><div className="panel security-note"><span className="secure-dot" /><div><strong>Protected by role-based access</strong><p>Only administrators can change company settings. Employee records and assistant answers follow role-based access.</p></div></div></section>
    {settings && <section className="settings-grid policy-settings">
      <div className="panel policy-panel flex flex-col gap-3"><PanelTitle title="Working days" subtitle="Choose the days that are weekends. They are excluded from leave and payroll calculations." />
        <div className="weekday-options flex flex-wrap gap-3 px-4 pb-4">{weekdays.map((day) => <label className="flex items-center gap-2 text-sm text-slate-600" key={day}><input className="accent-emerald-700" type="checkbox" disabled={!canEdit} checked={settings.weekend.includes(day)} onChange={(event) => {
          const weekend = event.target.checked ? [...settings.weekend, day] : settings.weekend.filter((value) => value !== day)
          onSaveSettings({ weekend }, 'Working days updated.')
        }} />{day}</label>)}</div>
      </div>
      <div className="panel policy-panel flex flex-col gap-3"><PanelTitle title="Leave policies" subtitle="Annual quotas and paid/unpaid status." />
        <div className="policy-list divide-y divide-slate-100 px-4">{settings.leavePolicies.map((policy) => <div className="policy-row flex flex-wrap items-center gap-4 py-3" key={policy.type}><strong className="min-w-32 flex-1 text-sm font-semibold text-slate-700">{policy.type.replaceAll('_', ' ')}</strong><label className="flex items-center gap-2 text-xs text-slate-500"><span>Days/year</span><input className="w-20 rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700" type="number" min="0" max="366" step="1" required defaultValue={policy.annualQuota} disabled={!canEdit} onBlur={(event) => { const input = event.currentTarget; if (!input.reportValidity()) { input.value = String(policy.annualQuota); return } const quota = Number(input.value); if (quota !== policy.annualQuota) updatePolicy(policy.type, 'annualQuota', quota) }} /></label><label className="paid-toggle flex items-center gap-2 text-sm text-slate-600"><input className="accent-emerald-700" type="checkbox" defaultChecked={policy.paid} disabled={!canEdit} onChange={(event) => updatePolicy(policy.type, 'paid', event.target.checked)} />Paid</label></div>)}</div>
      </div>
      <div className="panel policy-panel flex flex-col gap-3"><PanelTitle title="Departments" subtitle={`${settings.departments.length} configured`} action={canEdit ? 'Add department' : undefined} onClick={onAddDepartment} />
        {settings.departments.length ? <div className="chip-list flex flex-wrap gap-2 px-4 pb-4">{settings.departments.map((name) => <span className="department-chip inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900" key={name}>{name}{canEdit && <button onClick={() => onDeleteDepartment(name)} aria-label={`Remove ${name}`}><Icon name="close" size={13} /></button>}</span>)}</div> : <p className="px-4 pb-4 text-sm text-slate-500">No departments configured.</p>}
      </div>
      <div className="panel policy-panel flex flex-col gap-3"><PanelTitle title="Public holidays" subtitle={`${settings.publicHolidays.length} configured`} action={canEdit ? 'Add holiday' : undefined} onClick={onAddHoliday} />
        {settings.publicHolidays.length ? <div className="holiday-list divide-y divide-slate-100 px-4 pb-2">{settings.publicHolidays.slice().sort((a, b) => a.date.localeCompare(b.date)).map((holiday) => <div className="flex items-center gap-3 py-3" key={`${holiday.name}-${holiday.date}`}><span className="min-w-0 flex-1"><strong className="block text-sm font-medium text-slate-700">{holiday.name}</strong><small className="mt-1 block text-xs text-slate-500">{shortDate(holiday.date)}</small></span>{canEdit && <button className="row-action" onClick={() => removeHoliday(holiday.date)}>Remove</button>}</div>)}</div> : <p className="px-4 pb-4 text-sm text-slate-500">No public holidays configured.</p>}
      </div>
    </section>}
    <section className="panel records-panel audit-panel"><PanelTitle title="Activity log" subtitle="A record of important changes in your workspace." />{logs.length ? <div className="table-scroll"><table><thead><tr><th>WHO</th><th>ACTIVITY</th><th>RECORD</th><th>WHEN</th></tr></thead><tbody>{logs.map((log) => <tr key={log._id}><td><span className="table-person"><span className="avatar avatar-small">{log.actorName?.slice(0, 1)}</span><strong>{log.actorName}</strong></span></td><td>{log.action.replaceAll('.', ' ').replaceAll('_', ' ')}</td><td>{log.entity}</td><td>{new Date(log.createdAt).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}</td></tr>)}</tbody></table></div> : <EmptyState title="No activity recorded yet" body="Important company actions will be recorded here." />}</section>
  </>
}

function Dialog({ title, onClose, children }) {
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-heading"><div><div className="eyebrow">PEOPLEOS WORKSPACE</div><h2 id="dialog-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>{children}</section></div>
}

export default App
