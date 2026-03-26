import React from 'react';
import { categoryConfig } from './PredictionCard';

/**
 * CategoryGraphics — Premium wireframe SVG illustrations per market category.
 * Dense dotted / neon / wireframe aesthetic inspired by Kalshi's 3D style.
 * Pure SVG + CSS animation, zero external assets.
 */

/* ------------------------------------------------------------------ */
/*  Shared animation keyframes                                         */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Dot helper                                                         */
/* ------------------------------------------------------------------ */
function Dots({ points, color, r = 1.5 }: { points: [number, number][]; color: string; r?: number }) {
  return (
    <>
      {points.map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill={color}
          opacity={0.4 + Math.random() * 0.6}
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  SVG glow filter — reusable neon blur                               */
/* ------------------------------------------------------------------ */
function GlowFilter({ id, color }: { id: string; color: string }) {
  return (
    <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
      <feFlood floodColor={color} floodOpacity="0.6" result="color" />
      <feComposite in="color" in2="blur" operator="in" result="glow" />
      <feMerge>
        <feMergeNode in="glow" />
        <feMergeNode in="glow" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}

/* ------------------------------------------------------------------ */
/*  Individual category SVGs                                           */
/* ------------------------------------------------------------------ */

function PoliticsGraphic({ color, filterId }: { color: string; filterId: string }) {
  return (
    <g>
      {/* Steps at base */}
      <line x1="30" y1="170" x2="170" y2="170" stroke={color} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.4" />
      <line x1="35" y1="165" x2="165" y2="165" stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />
      <line x1="40" y1="160" x2="160" y2="160" stroke={color} strokeWidth="1" strokeDasharray="2 2" opacity="0.3" />
      {/* Base platform */}
      <line x1="45" y1="155" x2="155" y2="155" stroke={color} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.5" />
      {/* Columns — 6 total */}
      {[55, 70, 85, 115, 130, 145].map((x) => (
        <g key={x}>
          <line x1={x} y1="155" x2={x} y2="105" stroke={color} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />
          {/* Column caps */}
          <rect x={x - 3} y="103" width="6" height="3" fill="none" stroke={color} strokeWidth="0.6" opacity="0.4" />
          <rect x={x - 3} y="153" width="6" height="3" fill="none" stroke={color} strokeWidth="0.6" opacity="0.4" />
        </g>
      ))}
      {/* Lintel / entablature */}
      <line x1="45" y1="105" x2="155" y2="105" stroke={color} strokeWidth="1.8" strokeDasharray="3 3" opacity="0.6" />
      <line x1="48" y1="100" x2="152" y2="100" stroke={color} strokeWidth="0.8" strokeDasharray="2 2" opacity="0.35" />
      {/* Pediment triangle */}
      <path d="M 50 100 L 100 70 L 150 100" fill="none" stroke={color} strokeWidth="1.2" strokeDasharray="3 3" opacity="0.5" />
      <path d="M 58 100 L 100 75 L 142 100" fill="none" stroke={color} strokeWidth="0.5" strokeDasharray="2 3" opacity="0.25" />
      {/* Dome arcs */}
      <path d="M 70 70 Q 100 20 130 70" fill="none" stroke={color} strokeWidth="1.8" strokeDasharray="4 4" opacity="0.7" filter={`url(#${filterId})`} />
      <path d="M 78 70 Q 100 30 122 70" fill="none" stroke={color} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.35" />
      <path d="M 85 70 Q 100 40 115 70" fill="none" stroke={color} strokeWidth="0.5" strokeDasharray="2 3" opacity="0.25" />
      {/* Dome tip + spire */}
      <circle cx="100" cy="28" r="4" fill={color} opacity="0.8" filter={`url(#${filterId})`} />
      <line x1="100" y1="24" x2="100" y2="12" stroke={color} strokeWidth="1.5" opacity="0.7" />
      <circle cx="100" cy="10" r="2" fill={color} opacity="0.6" />
      {/* Dot accents — dense along dome, columns, steps */}
      <Dots color={color} r={1.2} points={[
        [65, 95], [75, 82], [83, 55], [90, 42], [100, 35], [110, 42], [117, 55], [125, 82], [135, 95],
        [60, 170], [75, 170], [90, 170], [105, 170], [120, 170], [135, 170], [150, 170],
        [50, 130], [60, 130], [70, 130], [80, 130], [90, 130], [100, 130], [110, 130], [120, 130], [130, 130], [140, 130], [150, 130],
        [55, 115], [70, 115], [85, 115], [100, 115], [115, 115], [130, 115], [145, 115],
        [55, 140], [70, 140], [85, 140], [100, 140], [115, 140], [130, 140], [145, 140],
      ]} />
      {/* Window details between columns */}
      {[62, 77, 100, 122, 137].map((x) => (
        <rect key={x} x={x - 3} y="120" width="6" height="12" fill="none" stroke={color} strokeWidth="0.4" strokeDasharray="1 2" opacity="0.25" />
      ))}
      {/* Rotating outer ring */}
    </g>
  );
}

function CryptoGraphic({ color, filterId }: { color: string; filterId: string }) {
  return (
    <g>
      {/* Outer hexagon wireframe */}
      <polygon
        points="100,18 160,48 160,122 100,152 40,122 40,48"
        fill="none" stroke={color} strokeWidth="1.2" strokeDasharray="4 4" opacity="0.35"
       />
      {/* Middle hexagon */}
      <polygon
        points="100,30 150,55 150,115 100,140 50,115 50,55"
        fill="none" stroke={color} strokeWidth="0.7" strokeDasharray="3 3" opacity="0.25"
       />
      {/* Inner hexagon */}
      <polygon
        points="100,45 135,62 135,108 100,125 65,108 65,62"
        fill="none" stroke={color} strokeWidth="0.5" strokeDasharray="2 3" opacity="0.18"
      />
      {/* Hex grid pattern behind symbol */}
      {[
        [75, 55], [125, 55], [60, 75], [140, 75], [60, 95], [140, 95], [75, 115], [125, 115],
      ].map(([cx, cy], i) => (
        <polygon
          key={i}
          points={`${cx},${cy - 8} ${cx + 7},${cy - 4} ${cx + 7},${cy + 4} ${cx},${cy + 8} ${cx - 7},${cy + 4} ${cx - 7},${cy - 4}`}
          fill="none" stroke={color} strokeWidth="0.3" opacity="0.15"
        />
      ))}
      {/* Bitcoin B — bold, glowing */}
      <text
        x="100" y="90"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="56"
        fontWeight="900"
        fontFamily="system-ui, sans-serif"
        fill="none"
        stroke={color}
        strokeWidth="2"
        opacity="0.85"
        filter={`url(#${filterId})`}
      >
        ₿
      </text>
      {/* Circuit lines radiating out — 12 lines */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i * 30 * Math.PI) / 180;
        const x1 = 100 + Math.cos(angle) * 40;
        const y1 = 85 + Math.sin(angle) * 40;
        const x2 = 100 + Math.cos(angle) * 72;
        const y2 = 85 + Math.sin(angle) * 72;
        const x3 = 100 + Math.cos(angle) * 80;
        const y3 = 85 + Math.sin(angle) * 80;
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.5" strokeDasharray="2 4" opacity="0.3" />
            <circle cx={x2} cy={y2} r="2.5" fill={color} opacity="0.5" />
            {/* Extended circuit stub */}
            {i % 2 === 0 && (
              <>
                <line x1={x2} y1={y2} x2={x3} y2={y3} stroke={color} strokeWidth="0.3" opacity="0.2" />
                <circle cx={x3} cy={y3} r="1.5" fill={color} opacity="0.35" />
              </>
            )}
          </g>
        );
      })}
      {/* Data pulse dots on circuits */}
      <Dots color={color} r={1} points={[
        [70, 50], [130, 50], [55, 70], [145, 70], [50, 85], [150, 85],
        [55, 100], [145, 100], [70, 120], [130, 120], [100, 130],
        [85, 45], [115, 45], [85, 125], [115, 125],
      ]} />
      {/* Pulsing center glow */}
    </g>
  );
}

function SportsGraphic({ color, filterId }: { color: string; filterId: string }) {
  // Generate dense dot grid on a sphere surface
  const ballDots: [number, number][] = [];
  for (let row = -5; row <= 5; row++) {
    const y = 100 + row * 10;
    const rowRadius = Math.sqrt(3600 - (row * 10) ** 2);
    const count = Math.max(3, Math.round(rowRadius / 9));
    for (let col = 0; col < count; col++) {
      const x = 100 + (col - (count - 1) / 2) * (rowRadius * 2 / count);
      if (Math.hypot(x - 100, y - 100) < 58) {
        ballDots.push([Math.round(x), Math.round(y)]);
      }
    }
  }

  return (
    <g>
      {/* Main circle — bold */}
      <circle cx="100" cy="100" r="62" fill="none" stroke={color} strokeWidth="1.8" strokeDasharray="3 3" opacity="0.6" filter={`url(#${filterId})`} />
      <circle cx="100" cy="100" r="63" fill="none" stroke={color} strokeWidth="0.4" opacity="0.15" />
      {/* Vertical seam */}
      <ellipse cx="100" cy="100" rx="22" ry="62" fill="none" stroke={color} strokeWidth="1.2" strokeDasharray="4 3" opacity="0.5" />
      {/* Horizontal seam */}
      <line x1="38" y1="100" x2="162" y2="100" stroke={color} strokeWidth="1.2" strokeDasharray="4 3" opacity="0.5" />
      {/* Curved cross-seams — thicker */}
      <path d="M 48 58 Q 100 82 152 58" fill="none" stroke={color} strokeWidth="0.9" strokeDasharray="3 3" opacity="0.4" />
      <path d="M 48 142 Q 100 118 152 142" fill="none" stroke={color} strokeWidth="0.9" strokeDasharray="3 3" opacity="0.4" />
      {/* Additional seam curves for 3D depth */}
      <path d="M 55 70 Q 100 88 145 70" fill="none" stroke={color} strokeWidth="0.4" strokeDasharray="2 4" opacity="0.2" />
      <path d="M 55 130 Q 100 112 145 130" fill="none" stroke={color} strokeWidth="0.4" strokeDasharray="2 4" opacity="0.2" />
      {/* Dense dot surface — 60+ dots creating the Kalshi dotted ball look */}
      <Dots color={color} r={1.2} points={ballDots} />
      {/* Extra accent dots along seams */}
      <Dots color={color} r={0.8} points={[
        [78, 62], [84, 56], [90, 52], [96, 50], [100, 48], [104, 50], [110, 52], [116, 56], [122, 62],
        [78, 138], [84, 144], [90, 148], [96, 150], [100, 152], [104, 150], [110, 148], [116, 144], [122, 138],
        [42, 90], [42, 100], [42, 110], [158, 90], [158, 100], [158, 110],
      ]} />
      {/* Outer glow ring */}
    </g>
  );
}

function FinanceGraphic({ color, filterId }: { color: string; filterId: string }) {
  return (
    <g>
      {/* Grid lines — horizontal */}
      {[45, 65, 85, 105, 125, 145, 165].map((y) => (
        <line key={y} x1="20" y1={y} x2="180" y2={y} stroke={color} strokeWidth="0.3" strokeDasharray="2 6" opacity="0.12" />
      ))}
      {/* Grid lines — vertical */}
      {[35, 55, 75, 95, 115, 135, 155].map((x) => (
        <line key={x} x1={x} y1="35" x2={x} y2="170" stroke={color} strokeWidth="0.2" strokeDasharray="2 8" opacity="0.08" />
      ))}
      {/* Candlesticks — larger, ascending */}
      {[
        { x: 35, high: 135, low: 165, open: 155, close: 140 },
        { x: 55, high: 125, low: 158, open: 148, close: 130 },
        { x: 75, high: 110, low: 148, open: 138, close: 115 },
        { x: 95, high: 90, low: 130, open: 120, close: 95 },
        { x: 115, high: 70, low: 115, open: 105, close: 75 },
        { x: 135, high: 50, low: 95, open: 85, close: 55 },
        { x: 155, high: 35, low: 75, open: 70, close: 40 },
      ].map((c, i) => (
        <g key={i}>
          {/* Wick */}
          <line x1={c.x} y1={c.high} x2={c.x} y2={c.low} stroke={color} strokeWidth="0.8" opacity="0.45" />
          {/* Body — larger */}
          <rect
            x={c.x - 8} y={Math.min(c.open, c.close)}
            width="16" height={Math.abs(c.close - c.open)}
            fill={color} fillOpacity="0.06"
            stroke={color} strokeWidth="1.2" strokeDasharray="2 2"
            opacity={0.4 + i * 0.08}
          />
          {/* Top/bottom dots */}
          <circle cx={c.x} cy={c.high} r="2" fill={color} opacity={0.5 + i * 0.06} />
          <circle cx={c.x} cy={c.low} r="1.2" fill={color} opacity="0.3" />
        </g>
      ))}
      {/* Moving price line — glowing */}
      <path
        d="M 35 148 C 50 140 60 130 75 120 C 85 112 90 105 95 95 C 105 80 110 72 115 68 C 125 58 130 50 135 48 C 145 40 150 38 155 35"
        fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" filter={`url(#${filterId})`}
       />
      {/* Price line fill area */}
      <path
        d="M 35 148 C 50 140 60 130 75 120 C 85 112 90 105 95 95 C 105 80 110 72 115 68 C 125 58 130 50 135 48 C 145 40 150 38 155 35 L 155 170 L 35 170 Z"
        fill={color} opacity="0.03"
      />
      {/* Arrow tip */}
      <polygon points="158,32 150,40 155,35" fill={color} opacity="0.7" />
      {/* Volume bars at bottom */}
      {[35, 55, 75, 95, 115, 135, 155].map((x, i) => (
        <rect key={x} x={x - 4} y={170 - (i + 1) * 3} width="8" height={(i + 1) * 3} fill={color} opacity="0.08" />
      ))}
    </g>
  );
}

function TechGraphic({ color, filterId }: { color: string; filterId: string }) {
  const nodes: [number, number][] = [
    // Input layer
    [30, 50], [30, 85], [30, 120], [30, 155],
    // Hidden layer 1
    [70, 35], [70, 65], [70, 95], [70, 125], [70, 155],
    // Hidden layer 2
    [110, 45], [110, 75], [110, 105], [110, 135], [110, 165],
    // Hidden layer 3
    [150, 55], [150, 85], [150, 115], [150, 145],
    // Output
    [180, 75], [180, 115],
  ];
  const layers = [
    [0, 1, 2, 3],        // input
    [4, 5, 6, 7, 8],     // h1
    [9, 10, 11, 12, 13],  // h2
    [14, 15, 16, 17],     // h3
    [18, 19],             // output
  ];

  return (
    <g>
      {/* Connections — layer to layer */}
      {[0, 1, 2, 3].map((li) =>
        layers[li].map((i) =>
          layers[li + 1].map((j) => (
            <line
              key={`${i}-${j}`}
              x1={nodes[i][0]} y1={nodes[i][1]}
              x2={nodes[j][0]} y2={nodes[j][1]}
              stroke={color} strokeWidth="0.35" strokeDasharray="2 3" opacity="0.15"
            />
          ))
        )
      )}
      {/* Highlighted signal paths — glowing */}
      {[
        [0, 5, 10, 15, 18],
        [2, 7, 11, 16, 19],
        [3, 8, 12, 14, 18],
      ].map((path, pi) => (
        <g key={pi}>
          {path.slice(0, -1).map((ni, si) => (
            <line
              key={si}
              x1={nodes[ni][0]} y1={nodes[ni][1]}
              x2={nodes[path[si + 1]][0]} y2={nodes[path[si + 1]][1]}
              stroke={color} strokeWidth="0.8" opacity="0.3" filter={`url(#${filterId})`}
            />
          ))}
        </g>
      ))}
      {/* Nodes */}
      {nodes.map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="6" fill="none" stroke={color} strokeWidth="0.8" opacity="0.5" />
          <circle cx={cx} cy={cy} r="2.5" fill={color} opacity="0.7" />
        </g>
      ))}
      {/* Outer ring */}
    </g>
  );
}

function EntertainmentGraphic({ color, filterId }: { color: string; filterId: string }) {
  return (
    <g>
      {/* Film reel outer — bold */}
      <circle cx="100" cy="100" r="70" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.45" />
      <circle cx="100" cy="100" r="62" fill="none" stroke={color} strokeWidth="0.7" strokeDasharray="2 3" opacity="0.3" />
      <circle cx="100" cy="100" r="55" fill="none" stroke={color} strokeWidth="0.4" strokeDasharray="2 4" opacity="0.18" />
      {/* Sprocket holes — 16 around outer ring */}
      {Array.from({ length: 16 }).map((_, i) => {
        const angle = (i * 22.5 * Math.PI) / 180;
        const cx = 100 + Math.cos(angle) * 66;
        const cy = 100 + Math.sin(angle) * 66;
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r="4" fill="none" stroke={color} strokeWidth="0.8" opacity="0.45" />
            <circle cx={cx} cy={cy} r="1.5" fill={color} opacity="0.3" />
          </g>
        );
      })}
      {/* Inner sprocket holes — 10 around inner ring */}
      {Array.from({ length: 10 }).map((_, i) => {
        const angle = (i * 36 * Math.PI) / 180;
        const cx = 100 + Math.cos(angle) * 48;
        const cy = 100 + Math.sin(angle) * 48;
        return <circle key={`inner-${i}`} cx={cx} cy={cy} r="2.5" fill="none" stroke={color} strokeWidth="0.5" opacity="0.3" />;
      })}
      {/* Film strip segments along edge */}
      {Array.from({ length: 24 }).map((_, i) => {
        const angle = (i * 15 * Math.PI) / 180;
        const cx = 100 + Math.cos(angle) * 74;
        const cy = 100 + Math.sin(angle) * 74;
        return <circle key={`dot-${i}`} cx={cx} cy={cy} r="1" fill={color} opacity="0.3" />;
      })}
      {/* Clapperboard stripe accents */}
      <line x1="75" y1="82" x2="125" y2="82" stroke={color} strokeWidth="1" strokeDasharray="3 2" opacity="0.4" />
      <line x1="78" y1="87" x2="122" y2="87" stroke={color} strokeWidth="0.6" strokeDasharray="2 2" opacity="0.25" />
      {/* Center star — glowing */}
      <polygon
        points="100,65 107,88 130,88 112,102 118,125 100,112 82,125 88,102 70,88 93,88"
        fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="2 2" opacity="0.7"
        filter={`url(#${filterId})`}
      />
      {/* Inner hub */}
      <circle cx="100" cy="100" r="18" fill="none" stroke={color} strokeWidth="0.8" strokeDasharray="2 2" opacity="0.35" />
      <circle cx="100" cy="100" r="5" fill={color} opacity="0.6" filter={`url(#${filterId})`} />
      {/* Spoke lines from center */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i * 45 * Math.PI) / 180;
        return (
          <line
            key={`spoke-${i}`}
            x1={100 + Math.cos(angle) * 18}
            y1={100 + Math.sin(angle) * 18}
            x2={100 + Math.cos(angle) * 35}
            y2={100 + Math.sin(angle) * 35}
            stroke={color} strokeWidth="0.5" strokeDasharray="2 3" opacity="0.25"
          />
        );
      })}
      {/* Rotation animation */}
</g>
  );
}

function ScienceGraphic({ color, filterId }: { color: string; filterId: string }) {
  return (
    <g>
      {/* Nucleus — larger, glowing */}
      <circle cx="100" cy="100" r="10" fill={color} opacity="0.15" filter={`url(#${filterId})`} />
      <circle cx="100" cy="100" r="7" fill={color} opacity="0.3" filter={`url(#${filterId})`} />
      <circle cx="100" cy="100" r="4" fill={color} opacity="0.8" />
      {/* Proton/neutron dots in nucleus */}
      <Dots color={color} r={1.5} points={[
        [96, 97], [104, 97], [100, 103], [97, 100], [103, 100], [100, 96],
      ]} />
      {/* Orbital 1 — thicker */}
      <ellipse cx="100" cy="100" rx="75" ry="28" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.45" />
      {/* Orbital 2 */}
      <ellipse cx="100" cy="100" rx="75" ry="28" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.45" transform="rotate(60 100 100)" />
      {/* Orbital 3 */}
      <ellipse cx="100" cy="100" rx="75" ry="28" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.45" transform="rotate(-60 100 100)" />
      {/* Inner orbitals — smaller, fainter */}
      <ellipse cx="100" cy="100" rx="45" ry="16" fill="none" stroke={color} strokeWidth="0.5" strokeDasharray="2 4" opacity="0.2" />
      <ellipse cx="100" cy="100" rx="45" ry="16" fill="none" stroke={color} strokeWidth="0.5" strokeDasharray="2 4" opacity="0.2" transform="rotate(90 100 100)" />
      {/* Static electron dots — placed along orbitals */}
      <circle cx="175" cy="100" r="4" fill={color} opacity="0.85" filter={`url(#${filterId})`} />
      <circle cx="25" cy="100" r="4" fill={color} opacity="0.85" filter={`url(#${filterId})`} />
      <circle cx="137" cy="65" r="3.5" fill={color} opacity="0.7" filter={`url(#${filterId})`} />
      <circle cx="63" cy="135" r="3.5" fill={color} opacity="0.7" filter={`url(#${filterId})`} />
      {/* Dense dot accents — scattered in orbital field */}
      <Dots color={color} r={1} points={[
        [30, 85], [35, 105], [40, 75], [45, 120],
        [165, 80], [170, 100], [160, 115], [155, 70],
        [100, 25], [100, 175], [85, 30], [115, 170],
        [70, 40], [130, 160], [60, 55], [140, 145],
        [130, 40], [70, 160], [140, 55], [60, 145],
        [50, 90], [150, 110], [55, 115], [145, 85],
      ]} />
      {/* Outer decay ring */}
    </g>
  );
}

function WeatherGraphic({ color, filterId }: { color: string; filterId: string }) {
  return (
    <g>
      {/* Cloud shape — bold wireframe */}
      <path
        d="M 45 100 Q 45 70 70 65 Q 75 42 100 42 Q 125 42 132 65 Q 155 65 162 88 Q 168 108 150 115 L 50 115 Q 32 115 45 100 Z"
        fill="none" stroke={color} strokeWidth="1.8" strokeDasharray="4 3" opacity="0.55" filter={`url(#${filterId})`}
      />
      {/* Inner cloud layers */}
      <path
        d="M 55 102 Q 55 80 75 75 Q 78 58 100 58 Q 118 58 122 75 Q 140 75 146 92"
        fill="none" stroke={color} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.3"
      />
      <path
        d="M 65 100 Q 65 85 82 82 Q 84 70 100 70 Q 112 70 115 82 Q 130 82 134 95"
        fill="none" stroke={color} strokeWidth="0.4" strokeDasharray="2 3" opacity="0.18"
      />
      {/* Cloud surface dots */}
      <Dots color={color} r={1.2} points={[
        [55, 95], [65, 82], [75, 70], [85, 58], [95, 50], [105, 50], [115, 58], [125, 70], [135, 82], [145, 95],
        [60, 108], [75, 105], [90, 100], [105, 98], [120, 100], [135, 105], [148, 108],
        [70, 90], [85, 78], [100, 65], [115, 78], [130, 90],
        [80, 88], [95, 75], [105, 75], [120, 88],
      ]} />
      {/* Lightning bolt — dramatic, glowing */}
      <polygon
        points="108,115 95,145 110,142 98,178 122,135 107,138 118,115"
        fill="none" stroke={color} strokeWidth="2" opacity="0.8" filter={`url(#${filterId})`}
      />
      <polygon
        points="108,115 95,145 110,142 98,178 122,135 107,138 118,115"
        fill={color} opacity="0.1"
      />
      {/* Rain drops — many, animated */}
      {[55, 65, 75, 85, 95, 108, 118, 128, 138, 148].map((x, i) => (
        <g key={i}>
          <line
            x1={x} y1={120 + (i % 3) * 4} x2={x - 4} y2={135 + (i % 3) * 4}
            stroke={color} strokeWidth="0.8" opacity="0.35" strokeDasharray="2 4"
          >

</line>
          {/* Rain drop dots */}
        </g>
      ))}
      {/* Secondary lightning branch */}
      <path d="M 105 140 L 92 155 L 98 153 L 88 170" fill="none" stroke={color} strokeWidth="0.8" opacity="0.3" />
      {/* Wind lines */}
      <line x1="25" y1="85" x2="42" y2="85" stroke={color} strokeWidth="0.5" strokeDasharray="2 3" opacity="0.2" />
      <line x1="20" y1="95" x2="40" y2="95" stroke={color} strokeWidth="0.5" strokeDasharray="2 3" opacity="0.15" />
      <line x1="158" y1="80" x2="178" y2="80" stroke={color} strokeWidth="0.5" strokeDasharray="2 3" opacity="0.2" />
    </g>
  );
}

function GeopoliticsGraphic({ color, filterId }: { color: string; filterId: string }) {
  return (
    <g>
      {/* Outer circle — bold */}
      <circle cx="100" cy="100" r="70" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.5" />
      <circle cx="100" cy="100" r="71" fill="none" stroke={color} strokeWidth="0.3" opacity="0.12" />
      {/* Latitude lines — more of them */}
      {[-55, -40, -25, -10, 10, 25, 40, 55].map((offset) => {
        const ry = 6;
        const rFactor = Math.sqrt(4900 - offset * offset) / 70;
        return (
          <ellipse
            key={offset}
            cx="100" cy={100 + offset * 0.9}
            rx={70 * rFactor}
            ry={ry}
            fill="none" stroke={color} strokeWidth="0.5" strokeDasharray="2 4" opacity="0.25"
          />
        );
      })}
      {/* Equator — bold */}
      <ellipse cx="100" cy="100" rx="70" ry="8" fill="none" stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
      {/* Longitude lines — more */}
      {[15, 30, 45, 60].map((rx) => (
        <ellipse key={rx} cx="100" cy="100" rx={rx} ry="70" fill="none" stroke={color} strokeWidth="0.5" strokeDasharray="2 4" opacity="0.2" />
      ))}
      {/* Center meridian */}
      <line x1="100" y1="30" x2="100" y2="170" stroke={color} strokeWidth="0.5" strokeDasharray="2 4" opacity="0.25" />
      {/* Continent hint shapes — subtle filled areas */}
      <path d="M 75 65 Q 85 58 95 62 Q 100 55 110 60 Q 118 65 115 72 Q 108 78 95 75 Q 82 72 75 65" fill={color} fillOpacity="0.06" stroke={color} strokeWidth="0.4" opacity="0.15" />
      <path d="M 60 90 Q 68 82 78 85 Q 82 78 72 88 Q 65 95 60 90" fill={color} fillOpacity="0.05" stroke={color} strokeWidth="0.3" opacity="0.12" />
      <path d="M 110 95 Q 125 88 135 95 Q 140 105 130 110 Q 118 108 110 95" fill={color} fillOpacity="0.05" stroke={color} strokeWidth="0.3" opacity="0.12" />
      <path d="M 80 115 Q 95 108 105 115 Q 110 125 100 132 Q 88 128 80 115" fill={color} fillOpacity="0.04" stroke={color} strokeWidth="0.3" opacity="0.1" />
      {/* City dots — many more */}
      <Dots color={color} r={2} points={[
        [80, 72], [120, 68], [90, 88], [115, 95], [72, 105], [135, 92],
        [100, 62], [88, 100], [128, 108], [105, 120], [78, 118], [140, 80],
      ]} />
      <Dots color={color} r={1} points={[
        [65, 78], [68, 92], [75, 112], [82, 130], [95, 138], [110, 135],
        [125, 125], [132, 100], [138, 85], [128, 65], [108, 55], [88, 55],
        [72, 62], [58, 88], [55, 100], [62, 118], [90, 145], [115, 142],
        [142, 108], [145, 92], [140, 72], [122, 55], [98, 48], [78, 52],
      ]} />
      {/* Connection arcs between cities */}
      <path d="M 80 72 Q 95 55 120 68" fill="none" stroke={color} strokeWidth="0.4" strokeDasharray="2 3" opacity="0.2" />
      <path d="M 90 88 Q 110 80 115 95" fill="none" stroke={color} strokeWidth="0.4" strokeDasharray="2 3" opacity="0.15" />
      <path d="M 72 105 Q 100 95 135 92" fill="none" stroke={color} strokeWidth="0.3" strokeDasharray="2 4" opacity="0.12" />
      {/* Slow rotation rings */}
    </g>
  );
}

function DefaultGraphic({ color, filterId }: { color: string; filterId: string }) {
  return (
    <g>
      <rect x="55" y="55" width="90" height="90" rx="8" fill="none" stroke={color} strokeWidth="0.8" strokeDasharray="3 4" opacity="0.25" transform="rotate(15 100 100)" />
      <polygon points="100,40 155,130 45,130" fill="none" stroke={color} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.25" />
      <circle cx="100" cy="100" r="25" fill="none" stroke={color} strokeWidth="0.6" strokeDasharray="2 3" opacity="0.3" />
      <circle cx="100" cy="100" r="5" fill={color} opacity="0.6" filter={`url(#${filterId})`} />
      <Dots color={color} r={1.5} points={[
        [55, 55], [145, 55], [55, 145], [145, 145],
        [100, 35], [100, 165], [35, 100], [165, 100],
        [70, 45], [130, 45], [70, 155], [130, 155],
        [42, 70], [158, 70], [42, 130], [158, 130],
      ]} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/*  Graphic registry                                                   */
/* ------------------------------------------------------------------ */
const graphicMap: Record<string, React.FC<{ color: string; filterId: string }>> = {
  politics: PoliticsGraphic,
  crypto: CryptoGraphic,
  sports: SportsGraphic,
  economics: FinanceGraphic,
  economy: FinanceGraphic,
  finance: FinanceGraphic,
  business: FinanceGraphic,
  entertainment: EntertainmentGraphic,
  pop_culture: EntertainmentGraphic,
  culture: EntertainmentGraphic,
  science: ScienceGraphic,
  tech: TechGraphic,
  esports: SportsGraphic,
  weather: WeatherGraphic,
  geopolitics: GeopoliticsGraphic,
  other: DefaultGraphic,
};

/* ------------------------------------------------------------------ */
/*  Public component                                                   */
/* ------------------------------------------------------------------ */
export default function CategoryGraphic({
  category,
  size = 200,
  color,
}: {
  category: string;
  size?: number;
  color?: string;
}) {

  const catKey = category.toLowerCase();
  const resolvedColor = color || categoryConfig[catKey]?.color || '#6B7280';
  const Graphic = graphicMap[catKey] || DefaultGraphic;
  const filterId = `neon-glow-${catKey}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: 'visible' }}
    >
      <defs>
        {/* Stronger ambient radial glow */}
        <radialGradient id={`glow-${catKey}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={resolvedColor} stopOpacity="0.25" />
          <stop offset="50%" stopColor={resolvedColor} stopOpacity="0.08" />
          <stop offset="100%" stopColor={resolvedColor} stopOpacity="0" />
        </radialGradient>
        {/* Neon glow filter for key strokes */}
        <GlowFilter id={filterId} color={resolvedColor} />
      </defs>
      {/* Ambient glow — larger, stronger */}
      <circle cx="100" cy="100" r="95" fill={`url(#glow-${catKey})`} />
      <Graphic color={resolvedColor} filterId={filterId} />
    </svg>
  );
}
