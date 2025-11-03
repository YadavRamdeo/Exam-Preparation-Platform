import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [twoFA, setTwoFA] = useState(null) // {challenge_id}
  const [otp, setOtp] = useState('')
  const navigate = useNavigate()

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      const res = await api.login(username, password, twoFA ? otp : undefined, twoFA?.challenge_id)
      if (res?.two_factor_required) {
        setTwoFA({ challenge_id: res.challenge_id })
        return
      }
      if (!res?.access) throw new Error('No token')
      // Prefer role from login response (works even if /me is delayed)
      if (res?.role) {
        if (res.role === 'ADMIN' || res.is_superuser) navigate('/admin')
        else if (res.role === 'TEACHER') navigate('/teacher')
        else if (res.role === 'PARENT') navigate('/parent')
        else navigate('/student')
        return
      }
      const me = await api.me()
      if (me.role === 'ADMIN' || me.is_superuser) navigate('/admin')
      else if (me.role === 'TEACHER') navigate('/teacher')
      else if (me.role === 'PARENT') navigate('/parent')
      else navigate('/student')
    } catch (e) {
      setError(twoFA ? 'Invalid OTP' : 'Invalid credentials')
    }
  }

  return (
    <div className="auth">
      <div className="card auth__card">
        <h2 className="h2">Welcome back</h2>
        <p className="muted">Sign in to continue</p>
        <form className="form" onSubmit={onSubmit}>
          <label className="label">Username</label>
          <input className="input" placeholder="e.g. john" value={username} onChange={(e) => setUsername(e.target.value)} />

          <label className="label">Password</label>
          <input className="input" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />

          {twoFA && (
            <>
              <label className="label">OTP</label>
              <input className="input" placeholder="6-digit code" value={otp} onChange={(e)=>setOtp(e.target.value)} />
            </>
          )}

          {error && <div className="alert alert-error">{error}</div>}

          <button className="btn btn-primary w-full" type="submit">{twoFA ? 'Verify OTP' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  )
}
