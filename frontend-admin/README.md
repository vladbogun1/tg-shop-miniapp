# tg-shop-v2 — Admin panel (frontend-admin)

Desktop-first **Liquid Glass** admin panel for tg-shop-v2, separate Next.js app
(deploys independently from the customer Mini App). Russian UI.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS v4
- TanStack Query (data layer)
- @dnd-kit/core + sortable (kanban drag & drop)
- framer-motion (springs, sheets, toasts)
- lucide-react (icons)
- @stomp/stompjs + sockjs-client (realtime chat over `/ws`)

## Ports

Runs on **3001** (`next dev -p 3001` / `next start -p 3001`) so it does not
clash with the customer frontend on `:3000`.

## Environment

Copy `.env.example` → `.env.local`:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080   # origin WITHOUT /api
NEXT_PUBLIC_IMAGE_BASE_URL=http://localhost:8082/img
```

Public env vars are inlined at build time.

## Run

```bash
npm install
npm run dev      # http://localhost:3001
npm run build    # production build (output: standalone)
npm start        # serve the production build on :3001
```

## Docker

```bash
docker build -t tg-shop-admin .
docker run -p 3001:3001 \
  -e NEXT_PUBLIC_API_BASE_URL=http://localhost:8080 \
  -e NEXT_PUBLIC_IMAGE_BASE_URL=http://localhost:8082/img \
  tg-shop-admin
```

Multi-stage `node:22-alpine`, standalone output, `EXPOSE 3001`.

## Auth

- **Primary:** opened inside Telegram → `window.Telegram.WebApp.initData` is
  auto-exchanged via `POST /api/auth/admin/telegram`.
- **DEV fallback** (on the login screen): paste raw `initData`, or craft an
  unsigned `initData` from a Telegram user id. The latter only works when the
  backend has `ALLOW_UNSIGNED_INIT_DATA=true`.
- JWT is stored in `sessionStorage` and attached as `Authorization: Bearer` on
  every request. Any `401/403` clears the token and bounces back to login.

## Features (routes)

| Route          | What                                                                       |
| -------------- | -------------------------------------------------------------------------- |
| `/`            | Orders **kanban** board (dnd-kit) + table toggle + order detail drawer     |
| `/orders/[id]` | Deep-link target for bot notifications — opens the detail drawer           |
| `/products`    | Products grid + archived view, create/edit modal (tags, variants, images)  |
| `/tags`        | Tags CRUD                                                                  |
| `/promocodes`  | Promocodes CRUD                                                            |
| `/payment`     | Payment options list + requisites editor with live preview                 |

### Kanban (design doc §6ter)

- Columns NEW / APPROVED / SHIPPED / DELIVERED / REJECTED with count + sum headers.
- Drag a card between columns → `PATCH /api/admin/orders/{id}/status`.
  Dropping to **SHIPPED** prompts for ТТН, to **REJECTED** prompts for a reason.
- Transitions are validated (e.g. nothing leaves DELIVERED/REJECTED); only valid
  target columns highlight during a drag.
- Optimistic move with rollback on server error.
- Realtime: the board polls every 10s; the chat uses STOMP push.

### Mobile fallback (§6ter.3 / §8bis.2)

- Sidebar → hamburger drawer.
- Kanban → status segment-control + card list; status change via a
  "Переместить в…" bottom-sheet (no drag).
- Tables → cards. Modals → full-screen sheets. Order drawer → full-screen.

## Money

All amounts are minor units (kopecks). `lib/money.ts` formats with `÷100`
(`money()`), and converts form input UAH ↔ minor (`toMinor` / `toMajor`).

## Notes / assumptions

- Image URLs are built client-side via unsigned imgproxy (`lib/image.tsx`),
  matching the customer app; signed URLs can be swapped in later.
- `OrderDetailDto` is consumed with the SPEC fields plus optional admin extras
  (`tgUserId`, `tgUsername`) returned by `GET /api/admin/orders/{id}`.
- The board has no dedicated WS topic in the SPEC, so it refreshes via polling;
  only the per-order chat uses STOMP (`/topic/orders/{id}/chat`).
