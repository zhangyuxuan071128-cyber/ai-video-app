const outerTicks = Array.from({ length: 72 }, (_, index) => index);
const runeMarks = Array.from({ length: 24 }, (_, index) => index);
const nodeMarks = Array.from({ length: 12 }, (_, index) => index);

type ArcanePortalProps = {
  className?: string;
};

export function ArcanePortal({ className = "" }: ArcanePortalProps) {
  return (
    <div className={`arcane-portal ${className}`} aria-hidden="true">
      <svg
        className="arcane-portal__svg"
        viewBox="0 0 900 900"
        fill="none"
        focusable="false"
      >
        <defs>
          <radialGradient id="portal-core-fill" cx="50%" cy="48%" r="55%">
            <stop offset="0" stopColor="#f7f3ff" stopOpacity="0.98" />
            <stop offset="0.2" stopColor="#b9b4ff" stopOpacity="0.94" />
            <stop offset="0.54" stopColor="#785dff" stopOpacity="0.62" />
            <stop offset="1" stopColor="#30216f" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="portal-line" x1="100" y1="90" x2="800" y2="820">
            <stop stopColor="#8fc7ff" stopOpacity="0.1" />
            <stop offset="0.45" stopColor="#a18cff" stopOpacity="0.92" />
            <stop offset="1" stopColor="#6f58ff" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id="portal-crystal" x1="392" y1="312" x2="507" y2="586">
            <stop stopColor="#f2efff" />
            <stop offset="0.22" stopColor="#aab9ff" />
            <stop offset="0.58" stopColor="#7356ff" />
            <stop offset="1" stopColor="#292263" />
          </linearGradient>
          <filter id="portal-glow-small" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="portal-glow-wide" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <path id="portal-rune" d="M450 84l7 11-7 11-7-11 7-11Zm0 3v16m-5-8h10" />
          <path id="portal-node" d="M450 39l8 13-8 13-8-13 8-13Z" />
        </defs>

        <circle cx="450" cy="450" r="395" stroke="#796dcd" strokeOpacity="0.08" />
        <circle cx="450" cy="450" r="382" stroke="#a396ff" strokeOpacity="0.12" />

        <g className="arcane-portal__ring arcane-portal__ring--outer">
          <circle
            cx="450"
            cy="450"
            r="368"
            stroke="url(#portal-line)"
            strokeOpacity="0.54"
            strokeWidth="1.4"
          />
          <circle
            cx="450"
            cy="450"
            r="358"
            stroke="#8276d9"
            strokeDasharray="2 10 26 8"
            strokeOpacity="0.32"
          />
          {outerTicks.map((tick) => (
            <g key={tick} transform={`rotate(${tick * 5} 450 450)`}>
              <path
                d={tick % 6 === 0 ? "M450 69v17" : "M450 74v8"}
                stroke={tick % 6 === 0 ? "#c9c7ff" : "#8179c9"}
                strokeOpacity={tick % 6 === 0 ? "0.52" : "0.28"}
                strokeWidth={tick % 6 === 0 ? "1.4" : "0.8"}
              />
            </g>
          ))}
        </g>

        <g className="arcane-portal__ring arcane-portal__ring--runes">
          <circle
            cx="450"
            cy="450"
            r="337"
            stroke="#8f7aff"
            strokeDasharray="1 6"
            strokeOpacity="0.24"
          />
          {runeMarks.map((rune) => (
            <g
              className={rune % 7 === 0 ? "arcane-portal__rune is-scan" : "arcane-portal__rune"}
              key={rune}
              transform={`rotate(${rune * 15} 450 450)`}
              stroke="#aea7ff"
              strokeOpacity="0.48"
              strokeWidth="1"
            >
              <use href="#portal-rune" />
            </g>
          ))}
        </g>

        <g className="arcane-portal__ring arcane-portal__ring--mechanical">
          <circle
            cx="450"
            cy="450"
            r="310"
            stroke="#796cff"
            strokeDasharray="84 18 8 18"
            strokeOpacity="0.34"
            strokeWidth="2"
          />
          <circle
            cx="450"
            cy="450"
            r="291"
            stroke="#87adff"
            strokeDasharray="3 18"
            strokeOpacity="0.22"
          />
          {nodeMarks.map((node) => (
            <g
              key={node}
              transform={`rotate(${node * 30} 450 450)`}
              stroke="#b9b5ff"
              strokeOpacity="0.56"
              filter="url(#portal-glow-small)"
            >
              <use href="#portal-node" />
              <path d="M450 64v20" />
            </g>
          ))}
        </g>

        <g className="arcane-portal__ring arcane-portal__ring--energy">
          <circle
            cx="450"
            cy="450"
            r="264"
            stroke="#8d77ff"
            strokeDasharray="145 24 12 32"
            strokeLinecap="round"
            strokeOpacity="0.54"
            strokeWidth="2.2"
          />
          <circle
            cx="450"
            cy="450"
            r="247"
            stroke="#718bff"
            strokeDasharray="4 14"
            strokeOpacity="0.28"
          />
          <path
            d="M450 185l8 20-8 20-8-20 8-20Zm265 265-20 8-20-8 20-8 20 8ZM450 715l-8-20 8-20 8 20-8 20ZM185 450l20-8 20 8-20 8-20-8Z"
            fill="#b8b1ff"
            fillOpacity="0.55"
          />
        </g>

        <g className="arcane-portal__inner-geometry" opacity="0.7">
          <circle cx="450" cy="450" r="205" stroke="#8172e8" strokeOpacity="0.24" />
          <circle cx="450" cy="450" r="172" stroke="#8a7cff" strokeDasharray="2 7" strokeOpacity="0.3" />
          <path
            d="m450 262 163 94v188l-163 94-163-94V356l163-94Z"
            stroke="#9b8fff"
            strokeOpacity="0.16"
          />
          <path
            d="m450 288 140 243H310l140-243Zm0 324L310 369h280L450 612Z"
            stroke="#7f78d7"
            strokeOpacity="0.13"
          />
        </g>

        <g className="arcane-portal__core" filter="url(#portal-glow-small)">
          <circle cx="450" cy="450" r="128" fill="url(#portal-core-fill)" opacity="0.18" />
          <circle cx="450" cy="450" r="113" stroke="#a092ff" strokeOpacity="0.42" />
          <circle cx="450" cy="450" r="91" stroke="#a9a1ff" strokeDasharray="3 8" strokeOpacity="0.58" />
          <path
            d="M450 316l29 74 44 60-44 60-29 74-29-74-44-60 44-60 29-74Z"
            fill="url(#portal-crystal)"
            fillOpacity="0.2"
            stroke="#d7d5ff"
            strokeOpacity="0.92"
            strokeWidth="1.8"
          />
          <path
            d="m450 326 18 76-18 48-18-48 18-76Zm0 124 31 61-31 61-31-61 31-61Z"
            fill="url(#portal-crystal)"
            stroke="#d7d5ff"
            strokeOpacity="0.88"
          />
          <path
            d="m450 350-46 100 46-24 46 24-46-100Zm0 74v118m-33-31 33-20 33 20"
            stroke="#f2efff"
            strokeOpacity="0.8"
            strokeWidth="1.2"
          />
          <circle cx="450" cy="450" r="12" fill="#f4f1ff" fillOpacity="0.96" />
        </g>

        <g className="arcane-portal__pulse" filter="url(#portal-glow-wide)">
          <circle cx="450" cy="450" r="132" stroke="#846cff" strokeOpacity="0.5" strokeWidth="1.5" />
        </g>
      </svg>
    </div>
  );
}

export default ArcanePortal;
