import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { geocodeAddress } from '../lib/geocode.js'

const RADIUS_OPTIONS = [5, 10, 25, 50]

export default function CourierServiceAreaSection({ profile, onProfileChange }) {
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)
  const [address, setAddress] = useState(profile?.home_address ?? '')
  const [radius, setRadius] = useState(profile?.service_radius_miles ?? 10)
  const [saving, setSaving] = useState(false)

  const configured =
    profile?.home_lat != null &&
    profile?.home_lng != null &&
    profile?.service_radius_miles != null

  const handleSave = async () => {
    if (!address.trim()) {
      toast.error('Enter your home address.')
      return
    }
    setSaving(true)
    const geo = await geocodeAddress(address)
    if (geo.error) {
      setSaving(false)
      toast.error(geo.error)
      return
    }
    const { error } = await supabase
      .from('profiles')
      .update({
        home_address: geo.formattedAddress || address,
        home_lat: geo.lat,
        home_lng: geo.lng,
        service_radius_miles: Number(radius),
      })
      .eq('id', user.id)
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Service area updated.')
    setEditing(false)
    onProfileChange?.()
  }

  if (configured && !editing) {
    return (
      <div className="space-y-2">
        <div className="text-ink">{profile.home_address}</div>
        <div className="text-sm text-slate">
          You see requests within{' '}
          <span className="text-ink">{profile.service_radius_miles} mi</span> of this address.
        </div>
        <button
          onClick={() => setEditing(true)}
          className="text-sm text-signal hover:underline"
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {!configured && (
        <p className="text-sm text-slate">
          Set your home address and service radius — you'll only see requests within range.
        </p>
      )}
      <input
        type="text"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="123 Main St, San Francisco"
        className="w-full px-4 py-3 rounded-lg bg-mist border border-mist focus:border-signal focus:outline-none"
      />
      <div>
        <div className="text-xs uppercase tracking-widest text-slate mb-2">Service radius</div>
        <div className="flex gap-2">
          {RADIUS_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRadius(r)}
              className={
                'px-3 py-1.5 rounded-lg border text-sm transition-colors ' +
                (Number(radius) === r
                  ? 'border-ink bg-ink text-cream'
                  : 'border-mist text-slate hover:border-signal hover:text-ink')
              }
            >
              {r} mi
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-ink text-cream text-sm font-medium hover:bg-signal transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {editing && (
          <button
            onClick={() => {
              setEditing(false)
              setAddress(profile?.home_address ?? '')
              setRadius(profile?.service_radius_miles ?? 10)
            }}
            className="px-4 py-2 rounded-lg border border-mist text-slate text-sm hover:text-ink"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
