import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'
import { placeCourier, FLEET_COLORS } from '../../lib/courierLocation.js'

// Where every verified courier is right now (last position the app reported,
// while it was open) — or at home, greyed out, if we haven't heard from them
// in the last four hours.

const { live: FRESH_COLOR, stale: STALE_COLOR, home: HOME_COLOR } = FLEET_COLORS

function pinIcon(color) {
  return L.divIcon({
    html: `<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6.5" fill="${color}" stroke="#fff" stroke-width="2"/>
    </svg>`,
    className: 'fleet-dot',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

function FitData({ points }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 12 })
  }, [map, points])
  return null
}

function ago(iso) {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.round(mins / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

const name = (c) => [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed courier'

export default function AdminFleetMap() {
  const [couriers, setCouriers] = useState([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  const load = useCallback(async () => {
    if (!hasSupabaseConfig) { setLoading(false); return }
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, background_check_status, service_radius_miles, home_lat, home_lng, last_lat, last_lng, last_located_at')
      .eq('account_type', 'courier')
      .eq('background_check_status', 'clear')
    setCouriers(data ?? [])
    setLoading(false)
  }, [])

  // Refresh every minute so the map keeps up with couriers on the move.
  useEffect(() => { load() }, [load, tick])
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const placed = useMemo(
    () => couriers
      .map((c) => ({ ...c, pos: placeCourier(c) }))
      .filter((c) => c.pos)
      .sort((a, b) => new Date(b.last_located_at || 0) - new Date(a.last_located_at || 0)),
    [couriers],
  )
  const points = useMemo(() => placed.map((c) => [c.pos.lat, c.pos.lng]), [placed])
  const live = placed.filter((c) => c.pos.kind === 'live').length

  if (loading) return <div className="text-slate py-16 text-center">Loading…</div>

  return (
    <div>
      <h1 className="font-display text-3xl font-black text-ink">Fleet</h1>
      <p className="text-sm text-slate mt-1 mb-4">Where your couriers are right now</p>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="p-3 rounded-xl border border-mist bg-white text-center">
          <div className="text-2xl font-bold text-green">{live}</div>
          <div className="text-xs text-slate">Active now</div>
        </div>
        <div className="p-3 rounded-xl border border-mist bg-white text-center">
          <div className="text-2xl font-bold text-ink">{placed.length - live}</div>
          <div className="text-xs text-slate">Not seen in 4 h</div>
        </div>
        <div className="p-3 rounded-xl border border-mist bg-white text-center">
          <div className="text-2xl font-bold text-ink">{couriers.length}</div>
          <div className="text-xs text-slate">Verified couriers</div>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate mb-3">
        <span><span className="inline-block w-3 h-3 rounded-full align-middle mr-1" style={{ background: FRESH_COLOR }} />Seen in last 4 h</span>
        <span><span className="inline-block w-3 h-3 rounded-full align-middle mr-1" style={{ background: STALE_COLOR }} />Last known</span>
        <span><span className="inline-block w-3 h-3 rounded-full align-middle mr-1" style={{ background: HOME_COLOR }} />Home (never located)</span>
      </div>

      {placed.length > 0 ? (
        <div className="rounded-xl overflow-hidden border border-mist" style={{ height: 420 }}>
          <MapContainer center={points[0]} zoom={11} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitData points={points} />
            {placed.map((c) => (
              <Marker key={c.id} position={[c.pos.lat, c.pos.lng]} icon={pinIcon(c.pos.color)}>
                <Popup>
                  <div className="text-sm">
                    <div className="font-semibold">{name(c)}</div>
                    <div className="text-xs text-slate">
                      {c.pos.kind === 'home' ? 'Home address' : `Seen ${ago(c.last_located_at)}`}
                      {c.service_radius_miles ? ` · ${c.service_radius_miles} mi radius` : ''}
                    </div>
                    <Link to={`/admin/users/${c.id}`} className="text-xs text-teal hover:underline">Open profile</Link>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      ) : (
        <div className="text-slate text-center py-16 rounded-xl border border-mist bg-white">
          No verified couriers with a location yet.
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-mist">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-mist/50 text-left">
              <th className="px-4 py-2 text-xs uppercase tracking-widest text-slate font-medium">Courier</th>
              <th className="px-4 py-2 text-xs uppercase tracking-widest text-slate font-medium">Status</th>
              <th className="px-4 py-2 text-xs uppercase tracking-widest text-slate font-medium">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {placed.map((c) => (
              <tr key={c.id} className="border-t border-mist hover:bg-mist/20">
                <td className="px-4 py-2 text-ink font-medium">
                  <Link to={`/admin/users/${c.id}`} className="hover:underline">{name(c)}</Link>
                </td>
                <td className="px-4 py-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ background: c.pos.color }} />
                  {c.pos.kind === 'live' ? 'Active' : c.pos.kind === 'stale' ? 'Last known' : 'Home'}
                </td>
                <td className="px-4 py-2 text-slate">{c.pos.kind === 'home' ? '—' : ago(c.last_located_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
