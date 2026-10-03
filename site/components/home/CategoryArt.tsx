/**
 * Small category illustrations for the home «Categories» tiles, drawn in the same neo-brutalist
 * language as HeroArt: flat fills, thick ink outlines, one hard offset shadow, slight tilt.
 *
 * Every drawing uses paper / key-grey / ink plus ONE accent passed in by the tile, so the art reads
 * on any tile colour (the caller picks an accent that differs from the tile). Ink and paper are
 * literal colours on purpose: tiles are bright in both themes, so the art must not flip in dark mode.
 *
 * Categories are tags the owner creates in the admin, so the art is chosen by fuzzy slug/name
 * matching and anything unknown gets a neutral parcel box instead of breaking.
 */

const INK = "#141414";
const PAPER = "#FFFDF6";
const KEY = "#E9E5D8";
const GLASS = "#DDF1FF";

const SHADOW_ID = "cat-nb-shadow";

const line = {
  stroke: INK,
  strokeWidth: 3,
  strokeLinejoin: "round",
  strokeLinecap: "round",
} as const;

type Art = (a: string) => React.ReactNode;

/** Render once per page (before the tiles): the shared hard-shadow filter every drawing uses. */
export function CategoryArtDefs() {
  return (
    <svg width="0" height="0" aria-hidden focusable="false" style={{ position: "absolute" }}>
      <defs>
        <filter id={SHADOW_ID} x="-20%" y="-20%" width="150%" height="150%" colorInterpolationFilters="sRGB">
          <feOffset in="SourceAlpha" dx="4" dy="4" result="off" />
          <feFlood floodColor={INK} />
          <feComposite in2="off" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}

function Sparkle({ x, y, s = 1, fill }: { x: number; y: number; s?: number; fill: string }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 -9 L2.6 -2.6 L9 0 L2.6 2.6 L0 9 L-2.6 2.6 L-9 0 L-2.6 -2.6 Z"
      fill={fill}
      {...line}
      strokeWidth={2.2}
    />
  );
}

/** Small keyboard body with a grid of caps; `hi` marks caps drawn in the accent. */
function MiniKeyboard({ x, y, a, hi = [] }: { x: number; y: number; a: string; hi?: string[] }) {
  const caps: React.ReactNode[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 7; c++) {
      caps.push(
        <rect
          key={`${r}-${c}`}
          x={x + 5 + c * 11}
          y={y + 5 + r * 9}
          width={9}
          height={7}
          rx={1.5}
          fill={hi.includes(`${r}-${c}`) ? a : KEY}
          stroke={INK}
          strokeWidth={1.6}
        />
      );
    }
  }
  return (
    <>
      <rect x={x} y={y} width={86} height={38} rx={5} fill={PAPER} {...line} />
      {caps}
      <rect x={x + 27} y={y + 5 + 3 * 9 - 0.5} width={31} height={4.5} rx={1.5} fill={a} stroke={INK} strokeWidth={1.6} />
    </>
  );
}

const ART: Record<string, Art> = {
  // mouse flipped belly-up: PTFE skates + sensor, with two spare dot skates
  glides: (a) => (
    <g {...line}>
      <g transform="rotate(-14 42 52)">
        <path d="M42 8 C62 8 68 28 68 46 C68 74 58 92 42 92 C26 92 16 74 16 46 C16 28 22 8 42 8 Z" fill={KEY} />
        <path d="M28 20 C34 15 50 15 56 20 L54 26 C48 22 36 22 30 26 Z" fill={PAPER} strokeWidth={2.4} />
        <path d="M24 74 C30 82 54 82 60 74 L58 68 C52 74 32 74 26 68 Z" fill={PAPER} strokeWidth={2.4} />
        <circle cx={42} cy={47} r={7} fill={INK} />
        <circle cx={42} cy={47} r={2.5} fill={a} stroke="none" />
      </g>
      <circle cx={82} cy={36} r={10} fill={a} />
      <circle cx={82} cy={36} r={5.5} fill={PAPER} strokeWidth={2} />
      <circle cx={84} cy={62} r={7.5} fill={a} />
      <circle cx={84} cy={62} r={3.8} fill={PAPER} strokeWidth={2} />
    </g>
  ),

  // cordless turbo air blower: fan head on a handle, with gusts
  blower: (a) => (
    <g transform="rotate(-10 50 50)" {...line}>
      <rect x={40} y={52} width={20} height={40} rx={6} fill={PAPER} />
      <rect x={45} y={62} width={10} height={12} rx={3} fill={a} strokeWidth={2.4} />
      <circle cx={50} cy={36} r={28} fill={PAPER} />
      <circle cx={50} cy={36} r={20} fill={INK} />
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <path key={deg} transform={`rotate(${deg} 50 36)`} d="M50 36 C52 26 58 21 63 22 C60 28 56 33 50 36 Z" fill={a} strokeWidth={1.8} />
      ))}
      <circle cx={50} cy={36} r={5} fill={PAPER} strokeWidth={2.2} />
      <path d="M84 20 C90 24 90 30 84 34 M90 30 C97 36 97 44 90 50 M82 46 C87 50 87 55 82 58" strokeWidth={2.6} fill="none" />
    </g>
  ),

  // USB-C cable between two plugs
  cable: (a) => (
    <g transform="rotate(-6 50 50)">
      <path d="M26 34 C26 66 58 40 60 62 C61 74 64 78 70 78" fill="none" stroke={INK} strokeWidth={10} strokeLinecap="round" />
      <path d="M26 34 C26 66 58 40 60 62 C61 74 64 78 70 78" fill="none" stroke={a} strokeWidth={4.5} strokeLinecap="round" />
      <g {...line}>
        <rect x={20} y={6} width={12} height={9} rx={2} fill={KEY} strokeWidth={2.4} />
        <rect x={16} y={14} width={20} height={22} rx={4} fill={PAPER} />
        <path d="M21 22 L31 22 M21 27 L31 27" strokeWidth={2} />
        <rect x={68} y={68} width={20} height={20} rx={4} fill={PAPER} />
        <rect x={87} y={72} width={9} height={12} rx={2} fill={KEY} strokeWidth={2.4} />
        <path d="M74 73 L74 83 M79 73 L79 83" strokeWidth={2} />
      </g>
    </g>
  ),

  // WASD keycaps
  keycaps: (a) => {
    const cap = (x: number, y: number, label: string, fill: string) => (
      <g key={label}>
        <rect x={x} y={y} width={28} height={28} rx={5} fill={fill === PAPER ? KEY : fill} {...line} />
        <rect x={x + 4} y={y + 2.5} width={20} height={18} rx={3.5} fill={fill === PAPER ? PAPER : fill} stroke={INK} strokeWidth={2.2} />
        <text x={x + 14} y={y + 16} textAnchor="middle" fontSize={11} fontWeight={900} fill={INK} fontFamily="inherit">
          {label}
        </text>
      </g>
    );
    return (
      <g transform="rotate(-7 50 50)">
        {cap(36, 18, "W", a)}
        {cap(4, 52, "A", PAPER)}
        {cap(36, 52, "S", PAPER)}
        {cap(68, 52, "D", PAPER)}
      </g>
    );
  },

  // cloth mouse pad with a mouse on it
  mousepad: (a) => (
    <g {...line}>
      <g transform="rotate(-8 50 56)">
        <rect x={6} y={30} width={88} height={56} rx={7} fill={a} />
        <rect x={11} y={35} width={78} height={46} rx={4} fill="none" strokeWidth={1.8} strokeDasharray="4 4" />
      </g>
      <g transform="rotate(14 62 50)">
        <path d="M62 22 C78 22 82 36 82 48 C82 64 74 74 62 74 C50 74 42 64 42 48 C42 36 46 22 62 22 Z" fill={PAPER} />
        <path d="M62 23 L62 44 M43 44 Q62 50 81 44" fill="none" strokeWidth={2.4} />
        <rect x={58.5} y={29} width={7} height={12} rx={3} fill={INK} strokeWidth={1.5} />
      </g>
    </g>
  ),

  // gaming chair
  chair: (a) => (
    <g transform="rotate(-5 50 50)" {...line}>
      <path d="M50 82 L24 92 M50 82 L76 92" strokeWidth={5} fill="none" />
      <circle cx={24} cy={93} r={4} fill={PAPER} strokeWidth={2.4} />
      <circle cx={76} cy={93} r={4} fill={PAPER} strokeWidth={2.4} />
      <rect x={46} y={66} width={8} height={16} fill={KEY} strokeWidth={2.4} />
      <path d="M33 66 L30 16 C30 7 40 3 50 3 C60 3 70 7 70 16 L67 66 Z" fill={a} />
      <path d="M43 62 L42 30 C42 26 46 24 50 24 C54 24 58 26 58 30 L57 62 Z" fill={PAPER} strokeWidth={2.4} />
      <rect x={40} y={9} width={20} height={8} rx={3} fill={PAPER} strokeWidth={2.4} />
      <path d="M22 66 C22 62 26 60 30 60 L70 60 C74 60 78 62 78 66 L78 70 C78 73 75 75 72 75 L28 75 C25 75 22 73 22 70 Z" fill={a} />
      <rect x={16} y={50} width={14} height={6} rx={3} fill={INK} />
      <rect x={70} y={50} width={14} height={6} rx={3} fill={INK} />
    </g>
  ),

  // keyboard with a horseshoe magnet and field lines
  magnetic: (a) => (
    <g>
      <g transform="rotate(-6 50 72)">
        <MiniKeyboard x={7} y={56} a={a} hi={["0-0"]} />
      </g>
      <g transform="rotate(18 50 30)" {...line}>
        <path d="M30 40 L30 26 A20 20 0 0 1 70 26 L70 40 L58 40 L58 26 A8 8 0 0 0 42 26 L42 40 Z" fill={a} />
        <rect x={30} y={40} width={12} height={9} fill={PAPER} />
        <rect x={58} y={40} width={12} height={9} fill={PAPER} />
      </g>
      <path d="M16 30 C10 22 12 14 18 10 M84 52 C92 48 94 40 90 32" {...line} strokeWidth={2.4} strokeDasharray="1 5" fill="none" />
    </g>
  ),

  // keyboard with a mechanical switch popping out
  mechanical: (a) => (
    <g>
      <g transform="rotate(-6 50 72)">
        <MiniKeyboard x={7} y={56} a={a} hi={["1-1", "2-0", "2-1", "2-2"]} />
      </g>
      <g transform="rotate(12 52 30)" {...line}>
        <path d="M36 30 L68 30 L64 48 L40 48 Z" fill={PAPER} />
        <rect x={34} y={24} width={36} height={8} rx={2} fill={KEY} />
        <path d="M48 6 L56 6 L56 12 L62 12 L62 18 L56 18 L56 24 L48 24 L48 18 L42 18 L42 12 L48 12 Z" fill={a} />
        <path d="M46 48 L46 54 M58 48 L58 54" strokeWidth={2.4} />
      </g>
      <Sparkle x={84} y={20} s={0.8} fill={PAPER} />
    </g>
  ),

  // mouse with a curly cable
  mouse: (a) => (
    <g transform="rotate(16 52 56)" {...line}>
      <path d="M52 22 C52 12 60 10 62 4" fill="none" />
      <path d="M52 22 C72 22 78 40 78 54 C78 76 68 92 52 92 C36 92 26 76 26 54 C26 40 32 22 52 22 Z" fill={a} />
      <path d="M52 23 L52 50 M27 50 Q52 58 77 50" fill="none" />
      <rect x={47.5} y={29} width={9} height={16} rx={4} fill={PAPER} strokeWidth={2.4} />
      <path d="M50 34 L54 34 M50 38 L54 38" strokeWidth={1.6} />
      <rect x={24} y={58} width={6} height={9} rx={2} fill={PAPER} strokeWidth={2.2} />
      <rect x={24} y={69} width={6} height={9} rx={2} fill={PAPER} strokeWidth={2.2} />
    </g>
  ),

  // headset with boom mic
  headset: (a) => (
    <g transform="rotate(10 50 50)" {...line}>
      <path d="M14 52 A36 36 0 0 1 86 52 L77 52 A27 27 0 0 0 23 52 Z" fill={a} />
      <rect x={20} y={54} width={9} height={28} rx={4} fill={INK} />
      <rect x={71} y={54} width={9} height={28} rx={4} fill={INK} />
      <rect x={4} y={48} width={22} height={38} rx={10} fill={PAPER} />
      <rect x={74} y={48} width={22} height={38} rx={10} fill={PAPER} />
      <circle cx={15} cy={67} r={5} fill={a} strokeWidth={2.2} />
      <circle cx={85} cy={67} r={5} fill={a} strokeWidth={2.2} />
      <path d="M10 84 C6 96 18 100 30 98" strokeWidth={3.5} fill="none" />
      <rect x={28} y={93} width={10} height={8} rx={3} fill={a} strokeWidth={2.2} />
    </g>
  ),

  // compression arm sleeve: wide at the biceps, narrow at the wrist
  sleeve: (a) => (
    <g transform="rotate(-34 50 50)" {...line}>
      <path d="M30 4 L70 4 C69 34 63 66 60 96 L40 96 C37 66 31 34 30 4 Z" fill={a} />
      <path d="M30 4 L70 4 L69.6 13 L30.4 13 Z" fill={INK} />
      <path d="M39.2 88 L60.8 88 L60 96 L40 96 Z" fill={INK} />
      <path d="M32 30 L68 30 L67 40 L33 40 Z" fill={PAPER} strokeWidth={2.4} />
      <path d="M34.5 50 L65.5 50 L65 56 L35 56 Z" fill={PAPER} strokeWidth={2.4} />
      <path d="M50 64 L54.5 71 L50 78 L45.5 71 Z" fill={PAPER} strokeWidth={2.2} />
    </g>
  ),

  // glass mouse pad with shine
  glass: (a) => (
    <g>
      <g transform="rotate(-8 50 54)" {...line}>
        <rect x={8} y={24} width={84} height={58} rx={6} fill={GLASS} />
        <path d="M30 28 L16 78 M44 28 L30 78" stroke={PAPER} strokeWidth={5} />
        <path d="M74 28 L66 56" stroke={PAPER} strokeWidth={4} />
        <rect x={8} y={24} width={84} height={58} rx={6} fill="none" />
      </g>
      <Sparkle x={80} y={22} s={1.1} fill={a} />
      <Sparkle x={26} y={86} s={0.7} fill={PAPER} />
    </g>
  ),

  // desk with a monitor
  desk: (a) => (
    <g transform="rotate(-4 50 55)" {...line}>
      <rect x={24} y={10} width={52} height={34} rx={3} fill={INK} />
      <rect x={28} y={14} width={44} height={26} rx={1.5} fill={a} strokeWidth={2} />
      <path d="M34 34 L46 22 M42 36 L56 22" stroke={PAPER} strokeWidth={2.4} />
      <rect x={46} y={44} width={8} height={8} fill={INK} />
      <rect x={4} y={52} width={92} height={10} rx={2.5} fill={PAPER} />
      <path d="M10 62 L10 90 M90 62 L90 90" strokeWidth={6} />
      <path d="M2 92 L18 92 M82 92 L98 92" strokeWidth={5} />
      <rect x={4} y={58} width={92} height={4} fill={a} strokeWidth={2} />
    </g>
  ),

  // markdown price tag on a burst
  sale: (a) => (
    <g>
      <path
        transform="rotate(8 52 52)"
        d="M52 6 L60 22 L77 14 L74 33 L93 36 L80 50 L93 64 L74 67 L77 86 L60 78 L52 94 L44 78 L27 86 L30 67 L11 64 L24 50 L11 36 L30 33 L27 14 L44 22 Z"
        fill={a}
        {...line}
      />
      <g transform="rotate(-16 50 52)" {...line}>
        <path d="M30 34 L60 34 L76 52 L60 70 L30 70 Z" fill={PAPER} />
        <circle cx={64} cy={52} r={3.5} fill={a} strokeWidth={2.2} />
        <path d="M66 52 C80 50 88 40 90 30" fill="none" strokeWidth={2.4} />
        <circle cx={37} cy={44} r={3.6} fill="none" strokeWidth={2.6} />
        <circle cx={50} cy={60} r={3.6} fill="none" strokeWidth={2.6} />
        <path d="M51 42 L36 62" strokeWidth={3} />
      </g>
    </g>
  ),

  // fallback: a parcel box
  box: (a) => (
    <g transform="rotate(-6 50 56)" {...line}>
      <path d="M14 34 L50 22 L86 34 L50 46 Z" fill={PAPER} />
      <path d="M14 34 L50 46 L50 92 L14 78 Z" fill={KEY} />
      <path d="M86 34 L50 46 L50 92 L86 78 Z" fill={PAPER} />
      <path d="M32 28 L68 40 L68 50 L76 47 L76 37 L40 25 Z" fill={a} strokeWidth={2.4} />
      <path d="M58 64 L76 58 M58 70 L70 66" strokeWidth={2.2} />
      <Sparkle x={86} y={14} s={0.8} fill={a} />
    </g>
  ),
};

/** Ordered: the first rule whose any keyword appears in the slug or name wins. */
const RULES: [keyof typeof ART, string[]][] = [
  ["glass", ["steklyan", "steklan", "glass", "скло", "скля", "стекл"]],
  ["glides", ["glayd", "glaid", "glide", "skate", "глайд"]],
  ["blower", ["duyk", "duik", "blower", "duster", "дуйк", "воздуходув", "повітродув"]],
  ["cable", ["kabel", "cable", "кабел", "провод", "дрот"]],
  ["keycaps", ["keykap", "keycap", "keikap", "кейкап"]],
  ["magnetic", ["magnit", "magnet", "hall", "магніт", "магнит"]],
  ["mechanical", ["mekh", "meh", "mech", "klv", "klav", "keyboard", "клав", "механ"]],
  ["mousepad", ["kovr", "kovrik", "pad", "mousemat", "килим", "ковр"]],
  ["chair", ["kresl", "chair", "крісл", "кресл"]],
  ["headset", ["naush", "headph", "headset", "навушн", "наушн", "гарнітур", "гарнитур"]],
  ["mouse", ["mysh", "mish", "mouse", "mice", "миш", "мыш"]],
  ["sleeve", ["rukav", "sleeve", "рукав"]],
  ["desk", ["stol", "desk", "table", "стіл", "стол"]],
  ["sale", ["utsen", "ucen", "sale", "discount", "outlet", "уцін", "уцен", "знижк", "скидк"]],
];

export function categoryArtKind(slug: string, name = ""): keyof typeof ART {
  const hay = `${slug} ${name}`.toLowerCase();
  for (const [kind, words] of RULES) {
    if (words.some((w) => hay.includes(w))) return kind;
  }
  return "box";
}

export function CategoryArt({
  slug,
  name,
  accent,
  className,
}: {
  slug: string;
  name?: string;
  /** Accent fill — pick one that differs from the tile background. */
  accent: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden focusable="false" className={className} xmlns="http://www.w3.org/2000/svg" overflow="visible">
      <g filter={`url(#${SHADOW_ID})`}>{ART[categoryArtKind(slug, name)](accent)}</g>
    </svg>
  );
}
