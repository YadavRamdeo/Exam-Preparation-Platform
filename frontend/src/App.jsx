import React, { useEffect, useState } from 'react'
import { Routes, Route, Link, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import AdminDashboard from './pages/dashboard/AdminDashboard'
import StudentDashboard from './pages/dashboard/StudentDashboard'
import TeacherDashboard from './pages/dashboard/TeacherDashboard'
import ParentDashboard from './pages/dashboard/ParentDashboard'
import ScheduleDetail from './pages/dashboard/ScheduleDetail'
import ProtectedRoute from './components/ProtectedRoute'
import { api, getToken, clearToken, clearRefreshToken } from './api/client'

export default function App() {
  const [me, setMe] = useState(null)
  const [installEvt, setInstallEvt] = useState(null)

  useEffect(() => {
    if (getToken()) api.me().then(setMe).catch(() => setMe(null))
  }, [])

  useEffect(() => {
    function onBIP(e){ e.preventDefault(); setInstallEvt(e) }
    window.addEventListener('beforeinstallprompt', onBIP)
    return () => window.removeEventListener('beforeinstallprompt', onBIP)
  }, [])

  async function installApp(){
    if (!installEvt) return
    installEvt.prompt()
    await installEvt.userChoice.catch(()=>{})
    setInstallEvt(null)
  }

  function logout() {
    clearToken(); clearRefreshToken()
    setMe(null)
    window.location.href = '/login'
  }

  return (
    <div className="app">
      <header className="nav">
        <div className="nav__brand">FinTram Exam</div>
        <nav className="nav__links">
          {installEvt && <button className="btn" onClick={installApp}>Install</button>}
          {me ? (
            <>
              {(me.role === 'ADMIN' || me.is_superuser) && <Link className="link" to="/admin">Admin</Link>}
              {me.role === 'TEACHER' && <Link className="link" to="/teacher">Teacher</Link>}
              {me.role === 'PARENT' && <Link className="link" to="/parent">Parent</Link>}
              {me.role === 'STUDENT' && <Link className="link" to="/student">Student</Link>}
              <span className="muted">|</span>
              <span className="muted">{me.username}</span>
              <button className="btn btn-ghost" onClick={logout}>Logout</button>
            </>
          ) : (
            <Link className="btn btn-primary" to="/login">Login</Link>
          )}
        </nav>
      </header>

      <main className="container">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<ProtectedRoute allowed={['ADMIN']}><AdminDashboard /></ProtectedRoute>} />
          <Route path="/student" element={<ProtectedRoute allowed={['STUDENT']}><StudentDashboard /></ProtectedRoute>} />
          <Route path="/teacher" element={<ProtectedRoute allowed={['TEACHER']}><TeacherDashboard /></ProtectedRoute>} />
          <Route path="/teacher/schedule/:id" element={<ProtectedRoute allowed={['TEACHER']}><ScheduleDetail /></ProtectedRoute>} />
          <Route path="/parent" element={<ProtectedRoute allowed={['PARENT']}><ParentDashboard /></ProtectedRoute>} />
          <Route path="/" element={<Navigate to={me ? (me.role === 'ADMIN' ? '/admin' : me.role === 'TEACHER' ? '/teacher' : me.role === 'PARENT' ? '/parent' : '/student') : '/login'} />} />
        </Routes>
      </main>

      {installEvt && (
        <div style={{position:'fixed',left:16,right:16,bottom:16,zIndex:1000}}>
          <div className="card" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'.75rem'}}>
            <div>
              <div className="h4">Install FinTram Exam</div>
              <div className="muted">Get a faster, fullscreen experience on your device.</div>
            </div>
            <div style={{display:'flex',gap:'.5rem'}}>
              <button className="btn" onClick={()=>setInstallEvt(null)}>Not now</button>
              <button className="btn btn-primary" onClick={installApp}>Install</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
