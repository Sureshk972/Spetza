import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

export default function RequireAuth({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center text-slate">
        Loading...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/welcome" replace />
  }

  return children
}
