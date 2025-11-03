import React from 'react'
import { Navigate } from 'react-router-dom'
import { getToken, api } from '../api/client'

export default function ProtectedRoute({ children, allowed }) {
  const token = getToken()
  const [me, setMe] = React.useState(null)
  const [loading, setLoading] = React.useState(!!allowed)

  React.useEffect(() => {
    if (!allowed) return
    let mounted = true
    api.me().then((u) => { if(mounted){ setMe(u); setLoading(false) } }).catch(() => { if(mounted){ setLoading(false) } })
    return () => { mounted = false }
  }, [allowed])

  if (!token) return <Navigate to="/login" replace />
  if (loading) return null

  if (allowed && me) {
    const isAllowed = allowed.includes(me.role) || (allowed.includes('ADMIN') && me.is_superuser)
    if (!isAllowed) {
      const dest = me.role === 'ADMIN' ? '/admin' : me.role === 'TEACHER' ? '/teacher' : me.role === 'PARENT' ? '/parent' : '/student'
      return <Navigate to={dest} replace />
    }
  }

  return children
}
