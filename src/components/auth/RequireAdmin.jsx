import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

export default function RequireAdmin({ children }) {
  const { profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center text-slate">
        Loading...
      </div>
    )
  }

  if (!profile?.is_admin) {
    return <Navigate to="/" replace />
  }

  return children
}
