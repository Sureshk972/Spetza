import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.heat'
import { supabase, hasSupabaseConfig } from '../../lib/supabase.js'

/* ── Helpers ── */
const dollars = (c) => (c == null ? '—' : `$${(c / 100).toFixed(2)}`)
const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : ''

const STATUS_COLORS = {
  open: '#0388A6',
  accepted: '#d97706',
  picked_up: '#2563eb',
  delivered: '#76BF6B',
  cancelled: '#a8a29e',
}

/* ── Heatmap layer (imperative — no react-leaflet wrapper) ── */
function HeatLayer({ points, radius = 25, blur = 15, maxZoom = 16 }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    const heat = L.heatLayer(points, { radius, blur, maxZoom, max: 1.0 })
    heat.addTo(map)
    return () => map.removeLayer(heat)
  }, [map, points, radius, blur, maxZoom])
  return null
}

/* ── Fit map to data bounds ── */
function FitData({ points }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    const bounds = L.latLngBounds(points.map(([lat, lng]) => [lat, lng]))
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 })
  }, [map, points])
  return null
}

/* ── Pin icon ── */
function dotIcon(color) {
  return L.divIcon({
    html: `<svg width="12" height="12" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6" cy="6" r="5" fill="${color}" stroke="#fff" stroke-width="1.5" opacity="0.85"/>
    </svg>`,
    className: 'demand-dot',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  })
}

/* ── Zip/area aggregation ── */
function aggregateByArea(requests) {
  const areas = {}
  for (const r of requests) {
    if (r.pickup_lat == null || r.pickup_lng == null) continue
    // Round to ~1 mile grid cells for clustering
    const key = `${Number(r.pickup_lat).toFixed(2)},${Number(r.pickup_lng).toFixed(2)}`
    if (!areas[key]) {
      areas[key] = {
        lat: Number(r.pickup_lat),
        lng: Number(r.pickup_lng),
        count: 0,
        revenue: 0,
        addresses: new Set(),
      }
    }
    areas[key].count++
    areas[key].revenue += r.accepted_price_cents || r.max_price_cents || 0
    // Extract city/neighborhood from address (first part before comma)
    const neighborhood = r.pickup_address?.split(',')[0]?.trim()
    if (neighborhood) areas[key].addresses.add(neighborhood)
  }
  return Object.values(areas).sort((a, b) => b.count - a.count)
}

/* ── Filters ── */
const TIME_RANGES = [
  { label: 'All time', days: null },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
]

export default function AdminDemandMap() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('heat') // 'heat' | 'pins'
  const [timeRange, setTimeRange] = useState(null) // null = all time
  const [statusFilter, setStatusFilter] = useState('all')

  const load = useCallback(async () => {
    if (!hasSupabaseConfig) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('delivery_requests')
      .select('id, pickup_address, dropoff_address, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, max_price_cents, accepted_price_cents, status, created_at')
      .order('created_at', { ascending: false })
    setRequests(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let rows = requests
    if (timeRange) {
      const cutoff = new Date(Date.now() - timeRange * 86400000).toISOString()
      rows = rows.filter((r) => r.created_at >= cutoff)
    }
    if (statusFilter !== 'all') {
      rows = rows.filter((r) => r.status === statusFilter)
    }
    return rows
  }, [requests, timeRange, statusFilter])

  const withCoords = useMemo(
    () => filtered.filter((r) => r.pickup_lat != null && r.pickup_lng != null),
    [filtered],
  )

  const heatPoints = useMemo(
    () => withCoords.map((r) => [Number(r.pickup_lat), Number(r.pickup_lng), 0.6]),
    [withCoords],
  )

  const areas = useMemo(() => aggregateByArea(withCoords), [withCoords])

  const totalRevenue = useMemo(
    () => filtered.reduce((s, r) => s + (r.accepted_price_cents || r.max_price_cents || 0), 0),
    [filtered],
  )

  const statuses = useMemo(
    () => [...new Set(requests.map((r) => r.status))].sort(),
    [requests],
  )

  if (loading) return <div className="text-slate py-16 text-center">Loading…</div>

  return (
    <div>
      <h1 className="font-display text-3xl font-black text-ink">Demand Map</h1>
      <p className="text-sm text-slate mt-1 mb-4">Where delivery requests are coming from</p>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="p-3 rounded-xl border border-mist bg-white text-center">
          <div className="text-2xl font-bold text-ink">{filtered.length}</div>
          <div className="text-xs text-slate">Requests</div>
        </div>
        <div className="p-3 rounded-xl border border-mist bg-white text-center">
          <div className="text-2xl font-bold text-ink">{areas.length}</div>
          <div className="text-xs text-slate">Areas</div>
        </div>
        <div className="p-3 rounded-xl border border-mist bg-white text-center">
          <div className="text-2xl font-bold text-green">{dollars(totalRevenue)}</div>
          <div className="text-xs text-slate">Total value</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {TIME_RANGES.map((t) => (
          <button
            key={t.label}
            onClick={() => setTimeRange(t.days)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              timeRange === t.days
                ? 'bg-ink text-white'
                : 'bg-white border border-mist text-slate hover:border-teal hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="text-slate/40">|</span>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-mist text-ink"
        >
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="text-slate/40">|</span>
        <button
          onClick={() => setView(view === 'heat' ? 'pins' : 'heat')}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-mist text-slate hover:text-ink"
        >
          {view === 'heat' ? '📍 Show pins' : '🔥 Show heatmap'}
        </button>
      </div>

      {/* Map */}
      {withCoords.length > 0 ? (
        <div className="rounded-xl overflow-hidden border border-mist" style={{ height: 400 }}>
          <MapContainer
            center={[withCoords[0].pickup_lat, withCoords[0].pickup_lng]}
            zoom={11}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitData points={heatPoints} />
            {view === 'heat' ? (
              <HeatLayer points={heatPoints} />
            ) : (
              withCoords.map((r) => (
                <Marker
                  key={r.id}
                  position={[Number(r.pickup_lat), Number(r.pickup_lng)]}
                  icon={dotIcon(STATUS_COLORS[r.status] || '#0388A6')}
                />
              ))
            )}
          </MapContainer>
        </div>
      ) : (
        <div className="text-slate text-center py-16 rounded-xl border border-mist bg-white">
          No geocoded requests yet.
        </div>
      )}

      {/* Top areas table */}
      <div className="mt-6">
        <h2 className="font-display text-xl font-bold text-ink mb-3">Top Areas</h2>
        {areas.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-mist">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-mist/50 text-left">
                  <th className="px-4 py-2 text-xs uppercase tracking-widest text-slate font-medium">#</th>
                  <th className="px-4 py-2 text-xs uppercase tracking-widest text-slate font-medium">Neighborhood</th>
                  <th className="px-4 py-2 text-xs uppercase tracking-widest text-slate font-medium text-right">Requests</th>
                  <th className="px-4 py-2 text-xs uppercase tracking-widest text-slate font-medium text-right">Value</th>
                  <th className="px-4 py-2 text-xs uppercase tracking-widest text-slate font-medium">Density</th>
                </tr>
              </thead>
              <tbody>
                {areas.slice(0, 20).map((a, i) => (
                  <tr key={i} className="border-t border-mist hover:bg-mist/20">
                    <td className="px-4 py-2 text-slate">{i + 1}</td>
                    <td className="px-4 py-2 text-ink font-medium">
                      {[...a.addresses].slice(0, 2).join(', ') || `${a.lat.toFixed(3)}, ${a.lng.toFixed(3)}`}
                    </td>
                    <td className="px-4 py-2 text-right text-ink font-bold">{a.count}</td>
                    <td className="px-4 py-2 text-right text-green font-medium">{dollars(a.revenue)}</td>
                    <td className="px-4 py-2">
                      <div className="w-full bg-mist rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 rounded-full bg-teal"
                          style={{ width: `${Math.min(100, (a.count / areas[0].count) * 100)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-slate text-center py-8">No data to show.</div>
        )}
      </div>
    </div>
  )
}
