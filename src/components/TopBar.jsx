import { useAuth } from '../context/AuthContext.jsx'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function TopBar() {
  const { profile } = useAuth()

  return (
    <header className="shrink-0 bg-white border-b border-mist pt-[env(safe-area-inset-top)]">
      <div className="max-w-3xl mx-auto flex items-center justify-between px-4 py-2">
        {/* Greeting — left */}
        <div className="text-sm text-ink font-medium">
          {profile?.first_name
            ? <>{greeting()}, <span className="font-bold">{profile.first_name}</span></>
            : <>{greeting()}</>
          }
        </div>

        {/* Logo — right */}
        <svg
          aria-label="Spetza"
          viewBox="0 0 960 350"
          className="h-8"
          xmlns="http://www.w3.org/2000/svg"
        >
          <line x1="43.57" y1="279" x2="934.28" y2="279" stroke="#76bf6b" fill="none" strokeMiterlimit="10" strokeWidth="45" />
          <line x1="43.57" y1="322.76" x2="934.28" y2="322.76" stroke="#0071bc" fill="none" strokeMiterlimit="10" strokeWidth="45" />
          <text
            fontFamily="'Nunito', sans-serif"
            fontWeight="900"
            fontSize="280"
            fill="#1a2b3c"
            transform="translate(26.65 238.7)"
          >
            <tspan x="0" y="0">Sp</tspan>
            <tspan x="355.87" y="0">e</tspan>
            <tspan x="510.15" y="0">t</tspan>
            <tspan x="630.55" y="0">z</tspan>
            <tspan x="765.51" y="0">a</tspan>
          </text>
        </svg>
      </div>
    </header>
  )
}
