# tg-shop-v2 — Frontend (Customer Telegram Mini App)

Mobile-first Telegram Mini App for the tg-shop-v2 store, built with a custom
**Liquid Glass** design system (design doc §8 / §8bis).

## Stack

- **Next.js 15** (App Router) + **TypeScript**
- **Tailwind CSS v4** (design tokens as CSS variables, `.glass` utility)
- **TanStack Query** (data cache, background refetch)
- **@telegram-apps/sdk-react** (initData, theme, viewport)
- **framer-motion** (spring motion, bottom-sheets, tab morphing)
- **lucide-react** (icons)
- Package manager: **npm**

## Run

```bash
cp .env.example .env.local   # adjust if backend/imgproxy run elsewhere
npm install
npm run dev                  # http://localhost:3000
```

Production:

```bash
npm run build
npm run start
```

Backend may be offline — the app degrades gracefully (friendly error/empty
states, in-memory auth that no-ops without initData).

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8080` | Spring Boot REST API base |
| `NEXT_PUBLIC_IMAGE_BASE_URL` | `http://localhost:8082/img` | nginx → imgproxy → MinIO image delivery |

> Public (`NEXT_PUBLIC_*`) vars are inlined at **build time** — rebuild the
> Docker image if they change.

## Docker

```bash
docker build -t tg-shop-v2-frontend .
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_API_BASE_URL=http://localhost:8080 \
  -e NEXT_PUBLIC_IMAGE_BASE_URL=http://localhost:8082/img \
  tg-shop-v2-frontend
```

Multi-stage (`node:22-alpine`), Next `standalone` output, runs as non-root,
`EXPOSE 3000`.

## Project structure

```
frontend/
├─ app/
│  ├─ globals.css        # Tailwind v4 + Liquid Glass tokens (§8.2/§8.3)
│  ├─ layout.tsx         # root: fonts, providers, scene background, tab-bar
│  ├─ page.tsx           # SHOP catalog (grid + bottom-sheet)
│  ├─ cart/page.tsx      # placeholder "скоро"
│  └─ account/page.tsx   # placeholder "скоро"
├─ components/
│  ├─ Providers.tsx      # QueryClient + Telegram init + auth boot
│  ├─ TabBar.tsx         # bottom glass tab-bar (liquid highlight)
│  ├─ SoonPanel.tsx      # reusable placeholder panel
│  ├─ catalog/           # ProductCard, ProductCardSkeleton, ProductSheet
│  └─ ui/                # GlassButton, GlassInput, GlassChip (custom controls)
├─ lib/
│  ├─ api.ts             # typed fetch + Bearer auth + initData→JWT
│  ├─ telegram.ts        # SDK init hook (no-ops in plain browser)
│  ├─ image.tsx          # custom <Image> (imgproxy URL builder, blur-up)
│  └─ money.ts           # minor-units → integer UAH
├─ Dockerfile / .dockerignore
└─ next.config.ts / tsconfig.json / postcss.config.mjs
```

## Implemented

- Liquid Glass design tokens (dark + light + Telegram themeParams adaptation),
  `.glass` material with specular top border + bottom shadow, large radii,
  live gradient "scene" background, shimmer skeletons, reduced-motion support.
- Root layout: Inter font, QueryClient provider, Telegram SDK init
  (ready/expand/theme), safe-area insets, centered ~480px mobile container.
- Telegram provider/hook — reads initData + user + theme; no-ops in dev browser.
- Auth: typed fetch wrapper (`Authorization: Bearer`), `POST /api/auth/telegram`
  on boot (JWT stored in memory), `apiGet`/`apiPost`.
- Custom `<Image>` — unsigned imgproxy URLs, lazy-load, blur-up, error fallback.
- Custom controls (no default HTML styling): GlassButton, GlassInput
  (floating label), GlassChip.
- Catalog: `GET /api/products` via TanStack Query, 2-col glass card grid,
  loading skeletons, friendly empty/error states, framer-motion bottom-sheet
  product detail with "В корзину".
- Bottom glass tab-bar (Магазин / Корзина / Аккаунт) with morphing highlight.
- Placeholder Корзина / Аккаунт screens.
- Dockerfile + .dockerignore.
- Prices rounded to integer UAH via `money()`. Russian UI copy.

## TODO (next roadmap steps — design doc §13)

- **Cart store** + quantity stepper + optimistic add-to-cart.
- **Telegram MainButton** for the primary action (checkout).
- **Checkout wizard** (§6bis): contacts → delivery (Nova Poshta autocomplete +
  pickup) → payment option → confirmation → requisites.
- **Account**: my orders, order detail, **order chat** over WebSocket (§6).
- **Signed imgproxy URLs** (IMGPROXY_KEY/SALT, server-side) — currently using
  the unsigned `insecure` form (see `lib/image.tsx`).
- Product detail: image gallery (swipe, dots, fullscreen zoom), variants,
  tags/filters using GlassChip.
- Token refresh / persistence strategy (currently in-memory only).
- `next/image` remote loader integration + responsive `srcset`.
- TanStack Virtual for long catalog/chat lists; toasts; haptics.
- i18n (uk/ru/en) — copy currently hardcoded Russian.
```
