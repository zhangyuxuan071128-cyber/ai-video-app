const orbitalNodes = Array.from({ length: 8 }, (_, index) => index);

function CrystalScanner() {
  return (
    <svg viewBox="0 0 300 300" fill="none" aria-hidden="true" focusable="false">
      <g className="hud-spin hud-spin--slow">
        <circle cx="150" cy="150" r="118" stroke="#8a7adf" strokeOpacity="0.28" />
        <circle cx="150" cy="150" r="105" stroke="#a297ff" strokeDasharray="2 11 42 12" strokeOpacity="0.48" />
        <circle cx="150" cy="150" r="87" stroke="#7799ff" strokeDasharray="40 15" strokeOpacity="0.34" />
        {orbitalNodes.map((node) => (
          <g key={node} transform={`rotate(${node * 45} 150 150)`}>
            <circle cx="150" cy="38" r="3" fill="#d5d1ff" fillOpacity="0.7" />
            <path d="M150 43v8" stroke="#8e84e7" strokeOpacity="0.7" />
          </g>
        ))}
      </g>
      <g className="hud-spin hud-spin--reverse">
        <path d="M42 150h32m152 0h32M150 42v32m0 152v32" stroke="#8d83df" strokeOpacity="0.28" />
        <circle cx="150" cy="150" r="71" stroke="#8c7aff" strokeDasharray="4 10" strokeOpacity="0.38" />
      </g>
      <g className="hud-float hud-crystal" filter="url(#hud-crystal-glow)">
        <defs>
          <linearGradient id="hud-crystal-fill" x1="111" y1="72" x2="190" y2="226">
            <stop stopColor="#f1efff" />
            <stop offset="0.28" stopColor="#a8adff" />
            <stop offset="0.72" stopColor="#7458ff" />
            <stop offset="1" stopColor="#312265" />
          </linearGradient>
          <filter id="hud-crystal-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d="m150 68 41 66-41 98-41-98 41-66Z" fill="url(#hud-crystal-fill)" fillOpacity="0.78" stroke="#e4e1ff" />
        <path d="m150 68 1 164m-42-98 42 20 40-20-40 20-22 43m62-63-40 20 21 43" stroke="#fbfaff" strokeOpacity="0.62" />
        <path d="m150 83 24 51-23 20-24-20 23-51Z" fill="#d9d6ff" fillOpacity="0.24" />
      </g>
    </svg>
  );
}

function VerticalRelic() {
  return (
    <svg viewBox="0 0 180 390" fill="none" aria-hidden="true" focusable="false">
      <path d="M90 10v370" stroke="#8075c7" strokeOpacity="0.2" />
      <path d="M29 60h122l17 17v236l-17 17H29l-17-17V77L29 60Z" stroke="#7168b4" strokeOpacity="0.18" />
      <g className="hud-float hud-float--delayed" filter="url(#relic-glow)">
        <defs>
          <filter id="relic-glow" x="-100%" y="-50%" width="300%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d="m90 71 13 30-13 27-13-27 13-30Zm0 52 11 65-11 139-11-139 11-65Z" fill="#7157ff" fillOpacity="0.42" stroke="#c7c3ff" />
        <path d="m90 155 25 41-25 46-25-46 25-41Z" fill="#9b8cff" fillOpacity="0.36" stroke="#ddd9ff" />
        <path d="M65 196h50M90 128v199" stroke="#eceaff" strokeOpacity="0.64" />
        <circle cx="90" cy="198" r="8" fill="#f1efff" fillOpacity="0.85" />
      </g>
      <g className="hud-spin hud-spin--scan" transform="translate(90 347)">
        <circle r="24" stroke="#8177d8" strokeDasharray="5 6" strokeOpacity="0.5" />
        <path d="M0-30 5-20 0-10-5-20 0-30Z" fill="#aaa0ff" />
      </g>
    </svg>
  );
}

function EnergyPlatform() {
  return (
    <svg viewBox="0 0 350 210" fill="none" aria-hidden="true" focusable="false">
      <g transform="translate(175 127)" className="hud-platform-ring">
        <ellipse rx="151" ry="59" stroke="#8578df" strokeOpacity="0.28" />
        <ellipse rx="123" ry="46" stroke="#8f83f0" strokeDasharray="2 9" strokeOpacity="0.44" />
        <ellipse rx="92" ry="34" stroke="#a28fff" strokeDasharray="34 12" strokeOpacity="0.55" />
        <ellipse rx="59" ry="22" stroke="#8dc1ff" strokeOpacity="0.72" />
      </g>
      <path d="M175 20v120m-7-88 7-16 7 16-7 16-7-16Z" stroke="#a69aff" strokeOpacity="0.5" />
      <path className="hud-platform-spire" d="m175 48 19 60-19 31-19-31 19-60Z" fill="#7760ff" fillOpacity="0.35" stroke="#d0cdff" />
      <ellipse className="hud-platform-core" cx="175" cy="127" rx="35" ry="13" fill="#d8e7ff" fillOpacity="0.78" />
      <path d="M45 178h260l-19 15H64l-19-15Z" stroke="#736bc0" strokeOpacity="0.3" />
    </svg>
  );
}

function EnergyOrb() {
  return (
    <svg viewBox="0 0 330 330" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="orb-core" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.16" stopColor="#d9d2ff" />
          <stop offset="0.46" stopColor="#8a64ff" stopOpacity="0.88" />
          <stop offset="1" stopColor="#38216f" stopOpacity="0" />
        </radialGradient>
        <filter id="orb-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="7" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g className="hud-spin hud-spin--orbital">
        <ellipse cx="165" cy="165" rx="124" ry="68" transform="rotate(18 165 165)" stroke="#9a86ff" strokeOpacity="0.38" />
        <ellipse cx="165" cy="165" rx="117" ry="55" transform="rotate(74 165 165)" stroke="#7ba4ff" strokeOpacity="0.27" />
        <ellipse cx="165" cy="165" rx="99" ry="45" transform="rotate(132 165 165)" stroke="#b4a4ff" strokeDasharray="4 8" strokeOpacity="0.34" />
      </g>
      <g className="hud-spin hud-spin--reverse-fast">
        <circle cx="165" cy="165" r="137" stroke="#776ed2" strokeDasharray="2 12 44 8" strokeOpacity="0.3" />
        <path d="M165 20v24m0 242v24M20 165h24m242 0h24" stroke="#aaa0ff" strokeOpacity="0.44" />
      </g>
      <circle className="hud-orb__aura" cx="165" cy="165" r="78" fill="url(#orb-core)" filter="url(#orb-glow)" />
      <path className="hud-orb__plasma" d="M90 171c30-27 38-67 75-63 39 5 41 41 76 63-32 27-43 59-76 55-36-4-42-36-75-55Z" fill="#6f4cff" fillOpacity="0.16" stroke="#c3b8ff" strokeOpacity="0.42" />
      <path d="m110 179 34-28 21 15 34-31 23 43-39-6-23 23-50-16Z" stroke="#eeeaff" strokeOpacity="0.65" />
      <circle cx="165" cy="165" r="9" fill="#fff" />
    </svg>
  );
}

type MiniInstrumentProps = {
  variant: "sigil" | "radar" | "core";
};

function MiniInstrument({ variant }: MiniInstrumentProps) {
  return (
    <svg viewBox="0 0 116 116" fill="none" aria-hidden="true" focusable="false">
      <circle cx="58" cy="58" r="46" stroke="#786fc6" strokeOpacity="0.28" />
      <circle className={`mini-spin mini-spin--${variant}`} cx="58" cy="58" r="37" stroke="#9c8aff" strokeDasharray="2 7 22 8" strokeOpacity="0.58" />
      {variant === "sigil" && (
        <path className="mini-core" d="m58 23 10 25 22 10-22 10-10 25-10-25-22-10 22-10 10-25Zm0 16 7 19-7 19-7-19 7-19Z" stroke="#d7d2ff" fill="#7358ff" fillOpacity="0.18" />
      )}
      {variant === "radar" && (
        <g>
          <circle cx="58" cy="58" r="24" stroke="#879fff" strokeOpacity="0.38" />
          <path className="mini-radar" d="M58 58V30a28 28 0 0 1 24 14Z" fill="#9d8cff" fillOpacity="0.22" stroke="#c7c2ff" strokeOpacity="0.48" />
          <circle cx="58" cy="58" r="5" fill="#d8d4ff" />
        </g>
      )}
      {variant === "core" && (
        <g className="mini-core">
          <path d="m58 30 15 28-15 28-15-28 15-28Z" fill="#8068ff" fillOpacity="0.42" stroke="#d9d5ff" />
          <circle cx="58" cy="58" r="7" fill="#f4f1ff" />
        </g>
      )}
      <path d="M5 42V16l11-11h26M111 74v26l-11 11H74" stroke="#8177c9" strokeOpacity="0.22" />
    </svg>
  );
}

export function LeftHUD() {
  return (
    <aside className="arcane-hud arcane-hud--left" aria-hidden="true">
      <div className="left-hud__crystal"><CrystalScanner /></div>
      <div className="left-hud__relic"><VerticalRelic /></div>
      <div className="left-hud__platform"><EnergyPlatform /></div>
    </aside>
  );
}

export function RightHUD() {
  return (
    <aside className="arcane-hud arcane-hud--right" aria-hidden="true">
      <div className="right-hud__orb"><EnergyOrb /></div>
      <div className="right-hud__rail">
        <MiniInstrument variant="sigil" />
        <MiniInstrument variant="radar" />
        <MiniInstrument variant="core" />
      </div>
      <div className="right-hud__scanner"><CrystalScanner /></div>
    </aside>
  );
}

export function ArcaneCorners() {
  return (
    <svg className="arcane-corners" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true">
      <g stroke="#8178cb" strokeOpacity="0.34" fill="none">
        <path d="M14 102V22h82m-82 20 28-28h74M14 72l14-14V35h23" />
        <path d="M1586 102V22h-82m82 20-28-28h-74m102 58-14-14V35h-23" />
        <path d="M14 798v80h82m-82-20 28 28h74M14 828l14 14v23h23" />
        <path d="M1586 798v80h-82m82-20-28 28h-74m102-58-14 14v23h-23" />
        <path d="M110 14h480l14 8h392l14-8h480M110 886h480l14-8h392l14 8h480" strokeOpacity="0.2" />
      </g>
      <g fill="#b3abff" fillOpacity="0.48">
        <path d="M28 16l7 12-7 12-7-12 7-12Zm1544 0 7 12-7 12-7-12 7-12ZM28 860l7 12-7 12-7-12 7-12Zm1544 0 7 12-7 12-7-12 7-12Z" />
      </g>
    </svg>
  );
}
