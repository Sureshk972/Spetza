import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

// Routes that an unverified authenticated user is allowed to hit
// without being bounced back to /verify-phone. /verify-phone itself
// must be in here or we'd render a redirect loop.
const PHONE_VERIFY_EXEMPT = new Set(['/verify-phone'])

// Routes a phone-verified but nameless user is allowed to hit without
// being bounced to /name. Includes /verify-phone so the earlier gate
// still runs, and /name itself to avoid a redirect loop.
const NAME_CAPTURE_EXEMPT = new Set(['/verify-phone', '/name'])

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

  if (
    profile &&
    profile.is_phone_verified &&
    !profile.first_name &&
    !NAME_CAPTURE_EXEMPT.has(location.pathname)
  ) {
    return <Navigate to="/name" replace />
  }

  return children
}
