import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

// Routes that an unverified authenticated user is allowed to hit
// without being bounced back to /verify-phone. /verify-phone itself
// must be in here or we'd render a redirect loop.
const PHONE_VERIFY_EXEMPT = new Set(['/verify-phone'])

export default function RequireAuth({ children }) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

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

  // Once the profile has loaded, gate on phone verification. We only
  // act when profile is non-null — otherwise a slow profile fetch
  // would bounce the user to /verify-phone before we know their state.
  if (
    profile &&
    !profile.is_phone_verified &&
    !PHONE_VERIFY_EXEMPT.has(location.pathname)
  ) {
    return <Navigate to="/verify-phone" replace />
  }

  return children
}
