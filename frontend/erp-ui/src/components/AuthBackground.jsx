// A quiet, original SVG illustration for the auth screens — factory skyline
// with sawtooth roofs, smokestacks, and interlocking gears. No external image
// assets, so it renders identically online or fully offline.
export default function AuthBackground() {
  const bigGearTeeth = Array.from({ length: 12 })
  const smallGearTeeth = Array.from({ length: 8 })

  return (
    <svg className="auth-bg-illustration" viewBox="0 0 1440 600" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g transform="translate(1180,120)" opacity="0.55">
        <circle r="70" fill="none" stroke="currentColor" strokeWidth="14" />
        <circle r="20" fill="none" stroke="currentColor" strokeWidth="9" />
        {bigGearTeeth.map((_, i) => (
          <rect key={i} x="-9" y="-92" width="18" height="26" fill="currentColor" transform={`rotate(${(i / bigGearTeeth.length) * 360})`} />
        ))}
      </g>

      <g transform="translate(1295,215)" opacity="0.42">
        <circle r="38" fill="none" stroke="currentColor" strokeWidth="9" />
        {smallGearTeeth.map((_, i) => (
          <rect key={i} x="-6" y="-50" width="12" height="16" fill="currentColor" transform={`rotate(${(i / smallGearTeeth.length) * 360})`} />
        ))}
      </g>

      <g opacity="0.9" fill="currentColor">
        <rect x="30" y="390" width="150" height="210" />
        <polygon points="30,390 65,352 100,390 135,352 180,390" />

        <rect x="225" y="300" width="220" height="300" />
        <polygon points="225,300 262,262 300,300 337,262 375,300 412,262 445,300" />
        <rect x="255" y="200" width="20" height="108" />
        <rect x="335" y="178" width="20" height="130" />

        <rect x="475" y="358" width="270" height="242" />
        <rect x="500" y="326" width="36" height="32" />
        <rect x="595" y="326" width="36" height="32" />
        <rect x="690" y="326" width="36" height="32" />
        <rect x="715" y="228" width="18" height="138" />

        <rect x="775" y="410" width="130" height="190" />
      </g>

      <g opacity="0.32" fill="currentColor">
        <ellipse cx="266" cy="183" rx="15" ry="9" />
        <ellipse cx="279" cy="158" rx="19" ry="11" />
        <ellipse cx="294" cy="130" rx="23" ry="13" />
        <ellipse cx="346" cy="163" rx="13" ry="8" />
        <ellipse cx="359" cy="138" rx="17" ry="10" />
        <ellipse cx="724" cy="213" rx="14" ry="8" />
        <ellipse cx="738" cy="186" rx="18" ry="10" />
      </g>

      <line x1="0" y1="600" x2="1440" y2="600" stroke="currentColor" strokeWidth="3" strokeDasharray="18 14" opacity="0.38" />
    </svg>
  )
}
