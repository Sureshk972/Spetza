import { useEffect } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Inline SVG pin icons — avoids Leaflet's default marker asset lookup
// (which breaks under Vite bundling).
function pinIcon(color, label) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
      <path d="M14 0C6.3 0 0 6.3 0 14c0 10 14 26 14 26s14-16 14-26c0-7.7-6.3-14-14-14z" fill="${color}"/>
      <circle cx="14" cy="14" r="6" fill="#fff"/>
      <text x="14" y="18" font-family="Georgia, serif" font-size="10" text-anchor="middle" fill="${color}" font-weight="700">${label}</text>
    </svg>
  `
  return L.divIcon({
    html: svg,
    className: 'route-pin',
    iconSize: [28, 40],
    iconAnchor: [14, 40],
  })
}

const PICKUP_ICON = pinIcon('#0f5132', 'A')
const DROPOFF_ICON = pinIcon('#1d4ed8', 'B')

function FitBounds({ pickup, dropoff }) {
  const map = useMap()
  useEffect(() => {
    const bounds = L.latLngBounds([[pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]])
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
  }, [pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, map])
  return null
}

export default function RouteMap({ pickup, dropoff, height = 240 }) {
  if (
    pickup?.lat == null ||
    pickup?.lng == null ||
    dropoff?.lat == null ||
    dropoff?.lng == null
  ) {
    return null
  }
  const p = [Number(pickup.lat), Number(pickup.lng)]
  const d = [Number(dropoff.lat), Number(dropoff.lng)]
  return (
    <div
      className="rounded-xl overflow-hidden border border-mist"
      style={{ height }}
    >
      <MapContainer
        center={p}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={p} icon={PICKUP_ICON} />
        <Marker position={d} icon={DROPOFF_ICON} />
        <Polyline positions={[p, d]} pathOptions={{ color: '#0f5132', weight: 3, opacity: 0.7, dashArray: '6 6' }} />
        <FitBounds pickup={pickup} dropoff={dropoff} />
      </MapContainer>
    </div>
  )
}
