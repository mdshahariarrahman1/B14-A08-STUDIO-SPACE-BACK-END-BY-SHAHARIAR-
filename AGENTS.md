# AGENTS.md

Single-purpose Express 5 backend for the StudioSpace studio-rental platform (frontend repo: `mdshahariarrahman1/B14-A08-STUDIO-SPACE-BY-SHAHARIAR`, a separate Next.js app). All routes live in `index.js`; `middleware/require-auth.js` handles auth.
Routes are mounted at bare paths (`/studios`, `/bookings`): the frontend's Next.js `/api/*` routes strip the prefix and call `${BACKEND_URL}/studios`. Challenge briefs naming `/api/studios` are satisfied by the frontend proxy — do NOT add `/api`-prefixed routes here.

## Running

- `node index.js` — no `npm run dev` script exists (README mentions one; it's wrong). No tests, no lint.
- `"type": "module"` — ESM imports only, no `require()`.
- Listens on port 5000 by default. `app.listen` is skipped when `process.env.VERCEL` is set; the module exports the `app` as default because `vercel.json` deploys `index.js` via `@vercel/node` (all routes rewritten to it).

## Environment

Copy `.env.example` to `.env`. Required:
- `MONGODB_URL` — Atlas URI. Database name `studio_Space` is hardcoded in `getMongoDatabase()`; collections: `studios`, `bookingSlots`, `bookings`.
- `FRONTEND_ORIGINS` — comma-separated origins, no trailing slashes. This is both the CORS allowlist and, by default, the JWT issuer fallback. Unset in production = browsers get CORS errors, but server-to-server calls still work.
- JWT config (`JWT_ISSUER`/`JWT_AUDIENCE`/`JWKS_URL` or `BETTER_AUTH_URL`): must match the frontend's canonical `BETTER_AUTH_URL` exactly. `JWKS_URL` defaults to `<issuer>/api/auth/jwks`.

## Auth (verify, never reimplement)

- Better Auth tokens are issued by the frontend; this server only verifies them with `jose` against the remote JWKS. Algorithm is restricted to `EdDSA`; `sub` and `email` are required claims.
- Token comes from the `studio_access_token` cookie (exported as `AUTH_COOKIE_NAME`), not the `Authorization` header.
- `req.user` shape: `{ id, email (lowercased), name, image?, role }`. `role` defaults to `"user"`; `"admin"` bypasses ownership checks. Use `requireAuth` from `middleware/require-auth.js` on any route that must be authenticated.
- The remote JWKS is cached in a module-level variable; changing issuer config requires a process restart.

## Route conventions

- All input validation is Zod-based (`safeParse`, generic 400 messages). Studio IDs must match `/^[a-f\d]{24}$/i`, so plain `_id` string vs `ObjectId` both work via the `$in: [id, ObjectId]` filter in `getStudioFilter()`.
- Ownership: studios have `ownerId` (new records) or only `ownerEmail` (legacy); `canManageStudio`/`getOwnedStudioFilter` handle both — keep that fallback if touching ownership code. Admins pass everything.
- Mutating routes share `mutationLimiter`: 60 requests / 15 min per IP. Don't attach it to reads.
- Category/amenity values are fixed allowlist Sets at the top of `index.js` — adding a new value means updating the Set and the Zod enum is derived from it (`z.enum([...set])`), but the list must stay in sync with the frontend's options.

## Booking flow (fragile, no transactions)

`POST /bookings` does manual compensation instead of MongoDB transactions:
1. Reserve hourly slots in `bookingSlots` (unique index on `{studioId, date, hour}`; duplicate key `code 11000` → 409 overlap response).
2. Insert the booking doc; if it fails, delete the reserved slots by `bookingId`.

Preserve the cleanup-on-failure order when editing — a crash between steps without cleanup permanently occupies slots. Slots are hourly floats from a fixed 09:00–17:00 start menu, durations 1–8h, dates today or later.

`createIndex` runs on every booking request (idempotent, cheap on Mongo).
