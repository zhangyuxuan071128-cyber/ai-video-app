# Shared control plane

Node.js 20+ control plane for the member UI and super-admin UI. It uses only
Node built-ins and binds to `127.0.0.1:8788` by default.

```bash
node server/control-plane/index.mjs
```

The browser client calls `/control/*`; Vite rewrites that prefix to the
server's canonical `/api/control/v1/*` routes.

## Required production configuration

- `CONTROL_PLANE_DATA_FILE`: path on a persistent volume. Do not package this
  runtime JSON file with source or deployment archives.
- `CONTROL_PLANE_MASTER_KEY`: required before provider or partner credentials
  can be stored. When absent, those writes return `CONFIG_REQUIRED`.
- `CONTROL_PLANE_SECURE_COOKIE=1`: force `Secure` cookies. Forwarded HTTPS and
  HTTPS origins also enable the flag automatically.
- `CONTROL_PLANE_ALLOWED_ORIGINS`: comma-separated additional origins.
- `CONTROL_PLANE_TRUST_PROXY=1`: trust the first forwarded client IP.

Cloud Studio origins for ports 3000 and 3001 are derived from
`X_IDE_SPACE_KEY`, `X_IDE_SPACE_REGION`, and `X_IDE_SPACE_HOST`.

## Bootstrap identities

| Portal | Username | Initial password | Role | Rotation |
| --- | --- | --- | --- | --- |
| admin | `admin` | `123456` | `super_admin` | required |
| member | `creator` | `123456` | `user` | bootstrap marker |
| member | `agent` | `123456` | `agent` | bootstrap marker |

The member portal rejects the super-admin identity. The admin portal accepts
only the super-admin identity. Public registration always creates `user`; a
request containing a role is rejected.

## Interface

All responses except audit export use `{ data, revision?, auditId?,
idempotentReplay? }`. Errors use `{ error: { code, message, requestId,
details? } }`. Browser state changes require an allowed `Origin`. Send an
`Idempotency-Key` for writes; balance-changing operations require one.

| Area | Routes |
| --- | --- |
| Health/auth | `GET /health`, `POST /auth/login`, `/auth/logout`, `/auth/register`, `/auth/rotate-password` |
| Member sync | `GET /me`, `/client-config`; `POST /redeem`, `/feedback`, `/usage-events` |
| Overview/users | `GET /dashboard`, `/members`; `PATCH /members/:id` |
| Codes/packages | `GET|POST /invite-codes`, `PATCH /invite-codes/:id`; equivalent recharge routes; package CRUD |
| Providers | `GET|POST /providers`, `PATCH /providers/:id`, `PUT /providers/:id/secret` |
| Partner vault | `GET|POST /partner-keys`, `PATCH|DELETE /partner-keys/:id` |
| Content | tutorial and announcement CRUD plus `POST /:id/publish` |
| Governance | `GET|PUT /risk-policy`, `GET /audit`, `GET /audit/export` |

Every route in the table is below `/api/control/v1` on the server.

## Truth and secret invariants

- External adapters are `unconfigured` and `unavailable`. Storing a credential
  never changes that status and cannot fabricate connectivity or success.
- Dashboard totals are computed from persisted rows. `trends` is `null`.
- Provider/partner secret plaintext is accepted only by dedicated write
  routes, encrypted before persistence, never returned, and never included in
  audit events.
- Invite and recharge plaintext codes are returned only by their first
  generation response. Persistence contains the SHA-256 code hash and last
  four characters; idempotent replays return metadata without plaintext.
- Recharge and credit adjustments are atomic and idempotent. Client-reported
  usage cannot mutate credit balances and is explicitly marked
  `client_reported_non_financial`.
- Every HTTP write, including rejected writes, appends a server-authored audit
  event. Audit hashes form a chain that is checked at startup.

The JSON store is a single-process implementation. Each commit writes a mode
`0600` temporary file, fsyncs it, atomically renames it, and increments the
root `schemaVersion`/`revision`. Multi-instance deployment requires replacing
this adapter with a transactional shared database.

## Verification

```bash
node --test tests/control-plane*.test.mjs
```
