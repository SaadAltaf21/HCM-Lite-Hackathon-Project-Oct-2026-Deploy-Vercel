import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errMsg } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function ChangePassword() {
  const [oldPassword, setOld] = useState('')
  const [newPassword, setNew] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const { user, setUser } = useAuth()
  const nav = useNavigate()
  const submit = async (e) => {
    e.preventDefault(); setError(''); setDone('')
    try {
      await api.post('/auth/change-password', { oldPassword, currentPassword: oldPassword, newPassword })
      setDone('Password changed.')
      if (user) setUser({ ...user, mustChangePassword: false })
      setTimeout(() => nav('/dashboard'), 600)
    } catch (err) { setError(errMsg(err)) }
  }
  return (
    <div className="auth-wrap"><div className="card">
      <h1>Change password</h1>
      <p className="muted">You must change your password before continuing.</p>
      {error && <div className="error">{error}</div>}
      {done && <p>{done}</p>}
      <form className="form" onSubmit={submit}>
        <label>Current password<input required type="password" value={oldPassword} onChange={(e) => setOld(e.target.value)} /></label>
        <label>New password<input required type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} /></label>
        <button className="btn primary">Change password</button>
      </form>
    </div></div>
  )
}
