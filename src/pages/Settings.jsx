import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Settings() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/welcome', { replace: true })
  }

  const homePath = profile?.account_type === 'courier' ? '/courier' : '/sender'

  return (
    <div className="min-h-full px-6 py-12 max-w-xl mx-auto">
      <Link to={homePath} className="text-sm text-slate hover:text-ink">&larr; back</Link>
      <h1 className="font-serif text-3xl text-ink mt-6">Settings</h1>

      <div className="mt-8 space-y-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-slate">Signed in as</div>
          <div className="text-ink mt-1">{user?.email}</div>
        </div>
        {profile?.account_type && (
          <div>
            <div className="text-xs uppercase tracking-widest text-slate">Role</div>
            <div className="text-ink mt-1 capitalize">{profile.account_type}</div>
          </div>
        )}
        <button
          onClick={handleSignOut}
          className="px-4 py-2 rounded-lg border border-mist text-ink hover:bg-mist transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
