/**
 * Home hero illustration: a gaming chair, a headset, a mouse on its pad and a keyboard, drawn in
 * the v3 "setup at night" language — graphite bodies, thin steel outlines, orange accents with a
 * glow (WASD, mouse edge, pad edge, ear cups). Pure inline SVG (no requests), decorative only.
 *
 * Each object is an outer <g> carrying a soft drop shadow and an inner <g> carrying the rotation.
 */

/** Dark details (pads, slots, sensor). */
const INK = "#09090B";
/** Outline colour: steel, readable on graphite. */
const STROKE = "#55555E";
/** Raised graphite bodies. */
const PAPER = "#2A2A30";
const BODY = "#1D1D21";
const KEY = "#232328";
const ORANGE = "#FF6600";

/** Shared outline props. */
const line = {
  stroke: STROKE,
  strokeWidth: 2.5,
  strokeLinejoin: "round",
  strokeLinecap: "round",
} as const;

const KEY_W = 21;
const KEY_H = 15;
const GAP = 4;
const KB_X = 150;
const KB_Y = 350;

const keyX = (col: number) => KB_X + col * (KEY_W + GAP);
const keyY = (row: number) => KB_Y + row * (KEY_H + GAP);

/** Keycaps that get a colour: Esc, WASD, Enter (drawn separately), spacebar (drawn separately). */
function keyFill(row: number, col: number): string {
  if ((row === 1 && col === 2) || (row === 2 && col >= 1 && col <= 3)) return ORANGE;
  return KEY;
}

function Keycaps() {
  const caps: React.ReactNode[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 12; col++) {
      if (col === 11 && row > 0) continue; // Enter
      caps.push(
        <rect
          key={`${row}-${col}`}
          x={keyX(col)}
          y={keyY(row)}
          width={KEY_W}
          height={KEY_H}
          rx={3}
          fill={keyFill(row, col)}
          stroke={STROKE}
          strokeWidth={1.5}
          filter={keyFill(row, col) === ORANGE ? "url(#hero-glow)" : undefined}
        />
      );
    }
  }
  for (const col of [0, 1, 2, 9, 10, 11]) {
    caps.push(
      <rect
        key={`3-${col}`}
        x={keyX(col)}
        y={keyY(3)}
        width={KEY_W}
        height={KEY_H}
        rx={3}
        fill={KEY}
        stroke={STROKE}
        strokeWidth={1.5}
      />
    );
  }
  return (
    <>
      {caps}
      {/* Enter: two rows tall */}
      <rect x={keyX(11)} y={keyY(1)} width={KEY_W} height={KEY_H * 2 + GAP} rx={3} fill={KEY} stroke={STROKE} strokeWidth={1.5} />
      {/* spacebar: columns 3–8 */}
      <rect x={keyX(3)} y={keyY(3)} width={KEY_W * 6 + GAP * 5} height={KEY_H} rx={3} fill={KEY} stroke={STROKE} strokeWidth={1.5} />
    </>
  );
}

function Sparkle({ x, y, s = 1, fill }: { x: number; y: number; s?: number; fill: string }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 -14 L4 -4 L14 0 L4 4 L0 14 L-4 4 L-14 0 L-4 -4 Z"
      fill={fill}
      stroke="none"
      strokeLinejoin="round"
    />
  );
}

export function HeroArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 460"
      aria-hidden
      focusable="false"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Soft depth under each object. */}
        <filter id="hero-nb-shadow" x="-20%" y="-20%" width="150%" height="150%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#000" floodOpacity=".7" />
        </filter>
        {/* Orange glow for the lit parts. */}
        <filter id="hero-glow" x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── gaming chair ─────────────────────────────────────────── */}
      <g filter="url(#hero-nb-shadow)">
        <g transform="rotate(-4 115 230)" {...line}>
          {/* base */}
          <path d="M115 380 L40 398 M115 380 L190 398 M115 380 L72 414 M115 380 L158 414" strokeWidth={7} fill="none" />
          <circle cx={40} cy={404} r={9} fill={PAPER} />
          <circle cx={190} cy={404} r={9} fill={PAPER} />
          <circle cx={72} cy={420} r={9} fill={PAPER} />
          <circle cx={158} cy={420} r={9} fill={PAPER} />
          <circle cx={115} cy={380} r={8} fill={INK} />
          {/* gas lift */}
          <rect x={107} y={322} width={16} height={56} fill={KEY} />
          <rect x={100} y={338} width={30} height={26} rx={4} fill={INK} />
          {/* armrest posts (behind the seat) */}
          <rect x={30} y={246} width={12} height={52} fill={INK} />
          <rect x={188} y={246} width={12} height={52} fill={INK} />
          {/* backrest + centre panel */}
          <path d="M66 292 L58 104 C56 62 82 40 115 40 C148 40 174 62 172 104 L164 292 Z" fill={BODY} />
          <path d="M94 284 L90 140 C90 126 100 118 115 118 C130 118 140 126 140 140 L136 284 Z" fill={PAPER} />
          <path d="M80 286 L73 110 M150 286 L157 110" stroke={ORANGE} strokeWidth={2.5} fill="none" filter="url(#hero-glow)" />
          <path d="M100 176 L130 176 M99 206 L131 206 M98 236 L132 236" strokeWidth={2} fill="none" />
          {/* shoulder harness slots + neck pillow on top of the panel */}
          <rect x={70} y={146} width={16} height={8} rx={3} fill={INK} />
          <rect x={144} y={146} width={16} height={8} rx={3} fill={INK} />
          <rect x={84} y={56} width={62} height={24} rx={9} fill={PAPER} />
          <path d="M98 68 L132 68" strokeWidth={2} fill="none" />
          {/* seat */}
          <path d="M42 296 C42 284 52 278 64 278 L166 278 C178 278 188 284 188 296 L188 312 C188 322 180 328 170 328 L60 328 C50 328 42 322 42 312 Z" fill={BODY} />
          <path d="M70 296 L160 296" stroke={ORANGE} strokeWidth={2} fill="none" filter="url(#hero-glow)" />
          {/* armrest pads */}
          <rect x={18} y={236} width={38} height={14} rx={6} fill={INK} />
          <rect x={174} y={236} width={38} height={14} rx={6} fill={INK} />
        </g>
      </g>

      {/* ── headset ──────────────────────────────────────────────── */}
      <g filter="url(#hero-nb-shadow)">
        <g transform="rotate(14 365 110)" {...line}>
          <path d="M285 150 A80 80 0 0 1 445 150 L427 150 A62 62 0 0 0 303 150 Z" fill={BODY} />
          <path d="M318 112 A54 54 0 0 1 412 112" strokeWidth={2.5} strokeDasharray="1 9" fill="none" />
          <rect x={284} y={146} width={20} height={24} rx={3} fill={INK} />
          <rect x={426} y={146} width={20} height={24} rx={3} fill={INK} />
          {/* ear cushions, then shells */}
          <rect x={300} y={172} width={18} height={58} rx={8} fill={INK} />
          <rect x={412} y={172} width={18} height={58} rx={8} fill={INK} />
          <rect x={264} y={164} width={46} height={74} rx={20} fill={PAPER} />
          <rect x={420} y={164} width={46} height={74} rx={20} fill={PAPER} />
          <circle cx={287} cy={201} r={11} fill="none" stroke={ORANGE} strokeWidth={2.5} filter="url(#hero-glow)" />
          <circle cx={443} cy={201} r={11} fill="none" stroke={ORANGE} strokeWidth={2.5} filter="url(#hero-glow)" />
          {/* boom mic */}
          <path d="M276 228 C262 266 280 290 310 290" strokeWidth={4} fill="none" />
          <rect x={306} y={281} width={20} height={17} rx={6} fill={PAPER} stroke={ORANGE} strokeWidth={2} filter="url(#hero-glow)" />
        </g>
      </g>

      {/* ── mouse pad ────────────────────────────────────────────── */}
      <g filter="url(#hero-nb-shadow)">
        <g transform="rotate(-6 352 308)" {...line}>
          <rect x={236} y={246} width={232} height={124} rx={10} fill="#131316" />
          <rect x={238} y={248} width={228} height={120} rx={9} fill="none" stroke={ORANGE} strokeWidth={2} opacity={0.85} filter="url(#hero-glow)" />
        </g>
      </g>

      {/* ── mouse ────────────────────────────────────────────────── */}
      <g filter="url(#hero-nb-shadow)">
        <g transform="rotate(16 392 300)" {...line}>
          <path
            d="M392 246 C424 246 432 274 432 302 C432 340 416 360 392 360 C368 360 352 340 352 302 C352 274 360 246 392 246 Z"
            fill={PAPER}
            stroke={ORANGE}
            filter="url(#hero-glow)"
          />
          <path d="M392 248 L392 292 M354 292 Q392 304 430 292" fill="none" />
          <rect x={385} y={258} width={14} height={26} rx={6} fill={INK} />
          <path d="M388 266 L396 266 M388 271 L396 271 M388 276 L396 276" stroke={ORANGE} strokeWidth={1.5} />
          <rect x={346} y={296} width={9} height={14} rx={3} fill={KEY} strokeWidth={1.5} />
          <rect x={346} y={314} width={9} height={14} rx={3} fill={KEY} strokeWidth={1.5} />
          <path d="M383 328 L401 328 L392 342 Z" fill={ORANGE} stroke="none" filter="url(#hero-glow)" />
        </g>
      </g>

      {/* ── keyboard ─────────────────────────────────────────────── */}
      <g filter="url(#hero-nb-shadow)">
        <g transform="rotate(-5 300 385)">
          <rect x={130} y={338} width={336} height={92} rx={10} fill={BODY} {...line} />
          <path d="M140 429 L456 429" stroke={ORANGE} strokeWidth={2} opacity={0.7} filter="url(#hero-glow)" />
          <Keycaps />
        </g>
      </g>

      <Sparkle x={236} y={62} s={0.7} fill="rgba(255,255,255,.55)" />
      <Sparkle x={222} y={214} s={0.5} fill={ORANGE} />
      <Sparkle x={462} y={30} s={0.45} fill="rgba(255,255,255,.4)" />
    </svg>
  );
}
