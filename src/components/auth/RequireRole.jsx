import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

export default function RequireRole({ role, children }) {
  const { profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center text-slate">
        Loading...
      </div>
    )
  }

  if (!profile || !profile.account_type) {
    return <Navigate to="/choose-role" replace />
  }

  if (profile.account_type !== role) {
    const other = profile.account_type === 'sender' ? '/sender' : '/courier'
    return <Navigate to={other} replace />
  }

  return children
}
