# Pokerplanner

A small planning poker app inspired by [Planning Poker Online](https://planningpokeronline.com/). Create a game, choose a deck, share the room URL, and estimate together. No accounts, database, Redis, or external services.

## Run locally

Requires Node.js 22.12+ and pnpm 11.5.0.

```sh
corepack enable
pnpm install
pnpm dev
```

Open `http://localhost:5173`. Vite proxies `/ws` to the Node server on port 3001. The frontend and backend reload during development; restarting the backend clears rooms.

For the production server:

```sh
pnpm build
pnpm start
```

Open `http://localhost:3000`. The same Node process serves the built frontend, WebSocket endpoint, and `/healthz`. Fonts and icons are bundled locally.

## Play

1. Click **Start game**, enter your name, name the game, and pick a deck. Choose Fibonacci, modified Fibonacci, T-shirt sizes, or 2–20 custom cards.
2. Click **Invite team** and share the URL. Teammates only need a display name.
3. Optionally add the current story or ticket under **This round**.
4. Pick a card. Click it again to withdraw your vote. Others see that you voted, but the server does not send them your card value yet.
5. The host starts a shared three-second countdown when ready. Votes lock during the countdown, and the server reveals all cards together at the end. The result shows the distribution, numeric average (excluding nonnumeric cards), and whether the votes agree.
6. Click **Next round** to clear the votes and topic. The host can edit the deck in **Game settings**, which starts a fresh round.

## Deploy on Coolify

1. Add this repository as an application and select the **Dockerfile** build pack. Use `/Dockerfile` with build context `/`.
2. Set the exposed/container port to **3000**.
3. Set your public HTTPS domain and the runtime variable `APP_ORIGIN=https://poker.example.com` to that exact origin.
4. Deploy **one replica**. No volume or database is needed. The Docker image includes a health check at `GET /healthz`.
5. Route HTTP and WebSocket traffic to the same service. `/ws` upgrades on the same port; the browser uses `wss://` automatically on HTTPS. Coolify's standard reverse proxy handles the upgrade.

This follows Coolify's [Dockerfile deployment](https://coolify.io/docs/applications/builds/dockerfile) and [health check](https://coolify.io/docs/applications/configuration/health-checks) documentation. TLS terminates at the proxy; the container speaks HTTP internally. Do not expose a separate WebSocket port.

For local Docker testing:

```sh
docker compose up --build
```

This defaults to `http://localhost:3000`. Set `APP_ORIGIN` when using a different origin. Docker Compose reads `.env` automatically; for direct Node commands, export variables in your shell. No secrets are required.

| Variable     | Default                                             | Purpose                                                               |
| ------------ | --------------------------------------------------- | --------------------------------------------------------------------- |
| `PORT`       | `3000` in production; `3001` in development         | HTTP and WebSocket listening port                                     |
| `APP_ORIGIN` | Request host                                        | Allowed WebSocket origin; set your exact public origin behind Coolify |
| `NODE_ENV`   | Production behavior unless explicitly `development` | Controls static file serving and default port                         |

## Ephemeral state and reconnects

“Stateless” here means **no persistent storage**. A live multiplayer game necessarily has state: rooms, members, and votes live only in a `Map` in the Node process. This is intentionally a single-instance deployment, not a horizontally distributed service.

- Restarting or redeploying the server clears every room. Existing clients show an expired-room message and can start a new game.
- Empty rooms expire after one hour. Occupied rooms expire after 24 hours without game activity. Cleanup runs every ten seconds.
- A random, unguessable token identifies each seat. It is stored in that tab's `sessionStorage`, never in the share URL. Reloading or a temporary network interruption resumes the seat, host role, and vote.
- When other people remain online, a disconnected seat is held for 60 seconds (plus up to 10 seconds for cleanup), then removed. If it belonged to the host, an online teammate becomes host. Explicitly leaving transfers the role immediately.
- When everyone disconnects, seats remain available until the empty-room expiry. Closing a tab normally loses its tab-scoped token; opening the link elsewhere joins as a new person.
- Share links allow anyone who has the link to join. There are no accounts, passwords, permanent room history, or tracking cookies.
- Multiple replicas and rolling deployments cannot share these in-memory rooms. Keep one replica and expect active sessions to end on deployment.

## Implementation

- **React + TypeScript + Vite** for the frontend. No SSR is needed for this room-based app, so TanStack Start is omitted.
- **Node.js + Express + `ws`** for static serving and native WebSockets.
- **Zod** validates client messages and deck settings. The server authorizes host actions and rejects invalid/stale votes.
- Heartbeats detect dead connections; the client reconnects automatically with backoff. Hidden votes are removed from every other participant's payload.
- Limits: 1,000 rooms, 50 people per room, 2,000 concurrent sockets, 8 KiB messages, and 80 messages per socket per 10-second window. These are basic resource bounds, not a substitute for proxy-level abuse controls on a public service.
- The Docker image uses a non-root runtime and a multi-stage build.

Main files:

- `shared/protocol.ts`: message validation, shared types, and preset decks.
- `server/app.ts`: room lifecycle, authorization, broadcasting, cleanup, and health checks.
- `server/index.ts`: application startup and graceful shutdown.
- `src/useGame.ts`: WebSocket session and reconnect handling.
- `src/main.tsx` / `src/styles.css`: responsive landing page, setup, join, room, and results.

## Checks

```sh
pnpm test
pnpm build
pnpm format:check
```

Integration tests open actual WebSocket connections and cover private voting, owner permissions, reveal/reset, stale votes, custom decks, reconnecting, host transfer, room expiry, malformed input, origin checks, and health checks.
