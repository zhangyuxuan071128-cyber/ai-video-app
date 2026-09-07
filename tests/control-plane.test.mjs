import assert from "node:assert/strict";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startControlPlaneServer } from "../server/control-plane/index.mjs";

// Vitest discovers every *.test.* file in this repository, while this suite
// intentionally exercises Node's built-in HTTP runner. Register a transparent
// skip marker so `npm test` stays green; the real suite is run with `node --test`.
if (process.env.VITEST) {
  const { test: vitestTest } = await import("vitest");
  vitestTest.skip("control-plane HTTP contract is covered by node:test", () => {});
}

const ALLOWED_ORIGIN = "http://127.0.0.1:3000";

function cookieFrom(response) {
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

async function makeFixture(options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "stellar-control-plane-test-"));
  const dataFile = join(directory, "control-plane.json");
  const running = await startControlPlaneServer({
    host: "127.0.0.1",
    port: 0,
    dataFile,
    masterKey: options.masterKey ?? "integration-test-master-key",
    secureCookies: false,
  });

  async function request(path, options = {}) {
    const method = options.method ?? "GET";
    const headers = { ...(options.headers ?? {}) };
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      headers["Content-Type"] = "application/json";
      headers.Origin = options.origin ?? ALLOWED_ORIGIN;
    }
    if (options.cookie) headers.Cookie = options.cookie;
    const response = await fetch(`${running.url}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: "manual",
    });
    const contentType = response.headers.get("content-type") ?? "";
    const raw = await response.text();
    const payload = contentType.includes("application/json") && raw ? JSON.parse(raw) : raw;
    return { response, status: response.status, payload, raw, cookie: cookieFrom(response) };
  }

  return { ...running, request, dataFile };
}

async function loginAndRotateAdmin(fixture) {
  const login = await fixture.request("/api/control/v1/auth/login", {
    method: "POST",
    body: { username: "admin", password: "123456", portal: "admin" },
  });
  assert.equal(login.status, 200);
  assert.equal(login.payload.data.member.role, "super_admin");
  assert.equal(login.payload.data.mustRotatePassword, true);
  assert.match(login.response.headers.get("set-cookie") ?? "", /HttpOnly/i);
  assert.match(login.response.headers.get("set-cookie") ?? "", /SameSite=Lax/i);

  const blocked = await fixture.request("/api/control/v1/dashboard", { cookie: login.cookie });
  assert.equal(blocked.status, 428);
  assert.equal(blocked.payload.error.code, "PASSWORD_ROTATION_REQUIRED");

  const rotated = await fixture.request("/api/control/v1/auth/rotate-password", {
    method: "POST",
    cookie: login.cookie,
    body: { currentPassword: "123456", newPassword: "Admin-Secure-2026" },
  });
  assert.equal(rotated.status, 200);
  assert.equal(rotated.payload.data.mustRotatePassword, false);
  assert.notEqual(rotated.cookie, login.cookie);
  return rotated.cookie;
}

test("shared control plane enforces auth, RBAC, atomic codes, idempotent balances, session revocation, secret redaction, and audit", async (t) => {
  const fixture = await makeFixture();
  t.after(() => fixture.close());

  await t.test("health reports persisted revision and no configured external adapters", async () => {
    const health = await fixture.request("/api/control/v1/health");
    assert.equal(health.status, 200);
    assert.equal(health.payload.data.schemaVersion, 1);
    assert.equal(health.payload.data.externalAdapters, "unconfigured");
  });

  const wrongPortal = await fixture.request("/api/control/v1/auth/login", {
    method: "POST",
    body: { username: "admin", password: "123456", portal: "member" },
  });
  assert.equal(wrongPortal.status, 403);
  assert.equal(wrongPortal.payload.error.code, "PORTAL_FORBIDDEN");

  const adminCookie = await loginAndRotateAdmin(fixture);

  await t.test("state changes enforce Origin and forwarded HTTPS produces a Secure cookie", async () => {
    const rejectedOrigin = await fixture.request("/api/control/v1/auth/login", {
      method: "POST",
      origin: "https://evil.example",
      body: { username: "creator", password: "123456", portal: "member" },
    });
    assert.equal(rejectedOrigin.status, 403);
    assert.equal(rejectedOrigin.payload.error.code, "ORIGIN_NOT_ALLOWED");

    const secureLogin = await fixture.request("/api/control/v1/auth/login", {
      method: "POST",
      headers: { "X-Forwarded-Proto": "https" },
      body: { username: "creator", password: "123456", portal: "member" },
    });
    assert.equal(secureLogin.status, 200);
    assert.match(secureLogin.response.headers.get("set-cookie") ?? "", /; Secure(?:;|$)/i);
  });

  await t.test("member portal cannot cross into super-admin routes", async () => {
    const creatorLogin = await fixture.request("/api/control/v1/auth/login", {
      method: "POST",
      body: { username: "creator", password: "123456", portal: "member" },
    });
    assert.equal(creatorLogin.status, 200);
    assert.equal(creatorLogin.payload.data.mustRotatePassword, false);
    const forbidden = await fixture.request("/api/control/v1/dashboard", { cookie: creatorLogin.cookie });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.payload.error.code, "PORTAL_SESSION_MISMATCH");

    const creatorAtAdminPortal = await fixture.request("/api/control/v1/auth/login", {
      method: "POST",
      body: { username: "creator", password: "123456", portal: "admin" },
    });
    assert.equal(creatorAtAdminPortal.status, 403);
    assert.equal(creatorAtAdminPortal.payload.error.code, "PORTAL_FORBIDDEN");
  });

  const inviteGeneration = await fixture.request("/api/control/v1/invite-codes", {
    method: "POST",
    cookie: adminCookie,
    headers: { "Idempotency-Key": "invite-once-0001" },
    body: { count: 1, maxUses: 1, note: "atomic registration" },
  });
  assert.equal(inviteGeneration.status, 201);
  const invite = inviteGeneration.payload.data[0];
  assert.match(invite.code, /^INV-/);

  await t.test("invite plaintext is returned once, stored only as hash, and registration consumes atomically", async () => {
    const replay = await fixture.request("/api/control/v1/invite-codes", {
      method: "POST",
      cookie: adminCookie,
      headers: { "Idempotency-Key": "invite-once-0001" },
      body: { count: 1, maxUses: 1, note: "atomic registration" },
    });
    assert.equal(replay.status, 201);
    assert.equal(replay.payload.idempotentReplay, true);
    assert.equal(replay.payload.data[0].code, undefined);

    const listed = await fixture.request("/api/control/v1/invite-codes", { cookie: adminCookie });
    assert.equal(listed.status, 200);
    assert.equal(listed.payload.data[0].code, undefined);

    const malicious = await fixture.request("/api/control/v1/auth/register", {
      method: "POST",
      body: {
        username: "恶意超管",
        password: "safe-pass-01",
        inviteCode: invite.code,
        role: "super_admin",
      },
    });
    assert.equal(malicious.status, 403);
    assert.equal(malicious.payload.error.code, "ROLE_NOT_ALLOWED");

    const registrations = await Promise.all([
      fixture.request("/api/control/v1/auth/register", {
        method: "POST",
        headers: { "Idempotency-Key": "register-racer-a" },
        body: { username: "并发用户甲", password: "safe-pass-01", inviteCode: invite.code },
      }),
      fixture.request("/api/control/v1/auth/register", {
        method: "POST",
        headers: { "Idempotency-Key": "register-racer-b" },
        body: { username: "并发用户乙", password: "safe-pass-02", inviteCode: invite.code },
      }),
    ]);
    assert.deepEqual(registrations.map((result) => result.status).sort(), [201, 409]);
    const winner = registrations.find((result) => result.status === 201);
    assert.equal(winner.payload.data.member.role, "user");
    assert.equal(winner.payload.data.member.nickname, winner.payload.data.member.username);

    const disk = await readFile(fixture.dataFile, "utf8");
    assert.equal(disk.includes(invite.code), false);
    const persistedState = JSON.parse(disk);
    const persistedInvite = persistedState.inviteCodes.find((entry) => entry.id === invite.id);
    assert.deepEqual(Object.keys(persistedInvite).filter((key) => /code|prefix/i.test(key)).sort(), ["codeHash"]);
  });

  const packageCreation = await fixture.request("/api/control/v1/packages", {
    method: "POST",
    cookie: adminCookie,
    headers: { "Idempotency-Key": "package-create-0001" },
    body: { name: "Test Credits", description: "test package", credits: 25, priceCents: 990, enabled: true },
  });
  assert.equal(packageCreation.status, 201);
  const packageId = packageCreation.payload.data.id;

  const rechargeGeneration = await fixture.request("/api/control/v1/recharge-codes", {
    method: "POST",
    cookie: adminCookie,
    headers: { "Idempotency-Key": "recharge-generate-0001" },
    body: { count: 1, packageId },
  });
  assert.equal(rechargeGeneration.status, 201);
  const rechargeCode = rechargeGeneration.payload.data[0].code;

  const memberInviteGeneration = await fixture.request("/api/control/v1/invite-codes", {
    method: "POST",
    cookie: adminCookie,
    headers: { "Idempotency-Key": "member-invite-0002" },
    body: { count: 1, maxUses: 1 },
  });
  const memberRegistration = await fixture.request("/api/control/v1/auth/register", {
    method: "POST",
    body: { username: "ledger-user", password: "safe-pass-03", inviteCode: memberInviteGeneration.payload.data[0].code },
  });
  assert.equal(memberRegistration.status, 201);
  const memberCookie = memberRegistration.cookie;
  const memberId = memberRegistration.payload.data.member.id;

  await t.test("recharge balance mutation is idempotent", async () => {
    const redeem = () => fixture.request("/api/control/v1/redeem", {
      method: "POST",
      cookie: memberCookie,
      headers: { "Idempotency-Key": "redeem-ledger-user-0001" },
      body: { code: rechargeCode },
    });
    const first = await redeem();
    const replay = await redeem();
    assert.equal(first.status, 200);
    assert.equal(first.payload.data.credited, 25);
    assert.equal(first.payload.data.paidCredits, 25);
    assert.equal(replay.status, 200);
    assert.equal(replay.payload.idempotentReplay, true);
    assert.deepEqual(replay.payload.data, first.payload.data);

    const state = JSON.parse(await readFile(fixture.dataFile, "utf8"));
    assert.equal(state.ledgerEntries.filter((entry) => entry.kind === "recharge_code_redemption" && entry.memberId === memberId).length, 1);
    assert.equal(state.members.find((member) => member.id === memberId).paidCredits, 25);
    assert.equal(JSON.stringify(state).includes(rechargeCode), false);
    const persistedRecharge = state.rechargeCodes.find((entry) => entry.id === rechargeGeneration.payload.data[0].id);
    assert.deepEqual(Object.keys(persistedRecharge).filter((key) => /code|prefix/i.test(key)).sort(), ["codeHash"]);
  });

  await t.test("freezing a member revokes every active session immediately", async () => {
    const frozen = await fixture.request(`/api/control/v1/members/${encodeURIComponent(memberId)}`, {
      method: "PATCH",
      cookie: adminCookie,
      headers: { "Idempotency-Key": "freeze-ledger-user-0001" },
      body: { status: "frozen" },
    });
    assert.equal(frozen.status, 200);
    assert.equal(frozen.payload.data.status, "frozen");
    const me = await fixture.request("/api/control/v1/me", { cookie: memberCookie });
    assert.equal(me.status, 401);
    assert.equal(me.payload.error.code, "UNAUTHENTICATED");
  });

  await t.test("provider secrets are encrypted server-side and never echoed or audited", async () => {
    const providers = await fixture.request("/api/control/v1/providers", { cookie: adminCookie });
    assert.equal(providers.status, 200);
    assert.equal(providers.payload.data.vaultConfigured, true);
    const providerId = providers.payload.data.providers[0].id;
    const secret = "sk-live-test-VERY-SENSITIVE-9917";
    const stored = await fixture.request(`/api/control/v1/providers/${encodeURIComponent(providerId)}/secret`, {
      method: "PUT",
      cookie: adminCookie,
      headers: { "Idempotency-Key": "provider-secret-0001" },
      body: { secret },
    });
    assert.equal(stored.status, 200);
    assert.equal(stored.payload.data.secretLast4, "9917");
    assert.equal(stored.payload.data.adapterStatus, "unconfigured");
    assert.equal(stored.raw.includes(secret), false);

    const disk = await readFile(fixture.dataFile, "utf8");
    assert.equal(disk.includes(secret), false);
    const parsed = JSON.parse(disk);
    const persisted = parsed.providers.find((provider) => provider.id === providerId);
    assert.equal(persisted.secretLast4, "9917");
    assert.equal(persisted.secretEnvelope.algorithm, "aes-256-gcm");
    assert.equal(JSON.stringify(parsed.auditEvents).includes(secret), false);
  });

  await t.test("remaining admin control surfaces persist real state without inventing adapter readiness", async () => {
    const extraPackage = await fixture.request("/api/control/v1/packages", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "Disposable", description: "CRUD coverage", credits: 10, priceCents: 100, enabled: false },
    });
    assert.equal(extraPackage.status, 201);
    const updatedPackage = await fixture.request(`/api/control/v1/packages/${extraPackage.payload.data.id}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: { enabled: true },
    });
    assert.equal(updatedPackage.payload.data.status, "enabled");
    const deletedPackage = await fixture.request(`/api/control/v1/packages/${extraPackage.payload.data.id}`, {
      method: "DELETE",
      cookie: adminCookie,
      body: {},
    });
    assert.equal(deletedPackage.payload.data.deleted, true);

    const provider = await fixture.request("/api/control/v1/providers", {
      method: "POST",
      cookie: adminCookie,
      body: { slug: "test-model", name: "Test Model", category: "model", model: "none", endpoint: null },
    });
    assert.equal(provider.status, 201);
    assert.equal(provider.payload.data.adapterStatus, "unconfigured");
    assert.equal(provider.payload.data.operationalStatus, "unavailable");
    const falseEnable = await fixture.request(`/api/control/v1/providers/${provider.payload.data.id}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: { enabled: true },
    });
    assert.equal(falseEnable.status, 409);
    assert.equal(falseEnable.payload.error.code, "ADAPTER_UNCONFIGURED");

    const partner = await fixture.request("/api/control/v1/partner-keys", {
      method: "POST",
      cookie: adminCookie,
      body: { partnerName: "Test Partner", providerId: provider.payload.data.id, label: "Primary", secret: "partner-secret-7788" },
    });
    assert.equal(partner.status, 201);
    assert.equal(partner.raw.includes("partner-secret"), false);
    const disabledPartner = await fixture.request(`/api/control/v1/partner-keys/${partner.payload.data.id}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: { enabled: false },
    });
    assert.equal(disabledPartner.payload.data.status, "disabled");
    const removedPartner = await fixture.request(`/api/control/v1/partner-keys/${partner.payload.data.id}`, {
      method: "DELETE",
      cookie: adminCookie,
      body: {},
    });
    assert.equal(removedPartner.payload.data.deleted, true);

    const tutorial = await fixture.request("/api/control/v1/tutorials", {
      method: "POST",
      cookie: adminCookie,
      body: { title: "Real tutorial", summary: "Persisted", content: "Shared content", category: "getting_started" },
    });
    assert.equal(tutorial.payload.data.status, "draft");
    const publishedTutorial = await fixture.request(`/api/control/v1/tutorials/${tutorial.payload.data.id}/publish`, {
      method: "POST",
      cookie: adminCookie,
      headers: { "Idempotency-Key": "publish-tutorial-coverage-0001" },
      body: { published: true },
    });
    assert.equal(publishedTutorial.payload.data.status, "published");

    const announcement = await fixture.request("/api/control/v1/announcements", {
      method: "POST",
      cookie: adminCookie,
      body: { title: "Real announcement", summary: "Persisted", content: "Shared announcement", category: "notice" },
    });
    const publishedAnnouncement = await fixture.request(`/api/control/v1/announcements/${announcement.payload.data.id}/publish`, {
      method: "POST",
      cookie: adminCookie,
      headers: { "Idempotency-Key": "publish-announcement-coverage-0001" },
      body: { published: true },
    });
    assert.equal(publishedAnnouncement.payload.data.status, "published");

    const risk = await fixture.request("/api/control/v1/risk-policy", { cookie: adminCookie });
    const updatedRisk = await fixture.request("/api/control/v1/risk-policy", {
      method: "PUT",
      cookie: adminCookie,
      headers: { "Idempotency-Key": "risk-update-coverage-0001", "If-Match": String(risk.payload.data.version) },
      body: { maxLoginFailures: 6 },
    });
    assert.equal(updatedRisk.payload.data.maxLoginFailures, 6);

    const creatorLogin = await fixture.request("/api/control/v1/auth/login", {
      method: "POST",
      body: { username: "creator", password: "123456", portal: "member" },
    });
    const config = await fixture.request("/api/control/v1/client-config", { cookie: creatorLogin.cookie });
    assert.equal(config.status, 200);
    assert.equal(config.payload.data.externalGenerationEnabled, false);
    assert.equal(config.payload.data.providers.every((item) => item.operationalStatus === "unavailable"), true);
    assert.equal(config.payload.data.tutorials.some((item) => item.id === tutorial.payload.data.id), true);
    assert.equal(config.payload.data.announcements.some((item) => item.id === announcement.payload.data.id), true);
  });

  await t.test("audit stream records successful and denied writes with a tamper-evident chain", async () => {
    const audit = await fixture.request("/api/control/v1/audit?limit=1000", { cookie: adminCookie });
    assert.equal(audit.status, 200);
    const actions = new Set(audit.payload.data.items.map((event) => event.action));
    for (const action of [
      "auth.login",
      "auth.rotate_password",
      "invite_codes.generate",
      "auth.register",
      "package.create",
      "recharge_codes.generate",
      "recharge_code.redeem",
      "member.update",
      "provider.secret.store",
    ]) assert.equal(actions.has(action), true, `missing audit action ${action}`);
    assert.equal(audit.payload.data.items.some((event) => event.outcome === "denied"), true);

    const chronological = [...audit.payload.data.items].reverse();
    for (let index = 1; index < chronological.length; index += 1) {
      assert.equal(chronological[index].previousEventHash, chronological[index - 1].eventHash);
    }
    const exported = await fixture.request("/api/control/v1/audit/export", { cookie: adminCookie });
    assert.equal(exported.status, 200);
    assert.match(exported.response.headers.get("content-type") ?? "", /application\/x-ndjson/);
    assert.equal(exported.raw.includes(invite.code), false);
    assert.equal(exported.raw.includes(rechargeCode), false);
    assert.equal(exported.raw.includes("VERY-SENSITIVE"), false);
  });
});

test("missing master key rejects real credentials with CONFIG_REQUIRED and audits the rejection", async (t) => {
  const fixture = await makeFixture({ masterKey: "" });
  t.after(() => fixture.close());
  const adminCookie = await loginAndRotateAdmin(fixture);
  const providers = await fixture.request("/api/control/v1/providers", { cookie: adminCookie });
  assert.equal(providers.payload.data.vaultConfigured, false);
  const providerId = providers.payload.data.providers[0].id;
  const secret = "should-never-persist-1234";
  const rejected = await fixture.request(`/api/control/v1/providers/${encodeURIComponent(providerId)}/secret`, {
    method: "PUT",
    cookie: adminCookie,
    headers: { "Idempotency-Key": "missing-vault-secret-0001" },
    body: { secret },
  });
  assert.equal(rejected.status, 503);
  assert.equal(rejected.payload.error.code, "CONFIG_REQUIRED");
  assert.equal((await readFile(fixture.dataFile, "utf8")).includes(secret), false);

  const audit = await fixture.request("/api/control/v1/audit?limit=100", { cookie: adminCookie });
  assert.equal(audit.payload.data.items.some((event) => event.reasonCode === "CONFIG_REQUIRED"), true);
});

test("login rate limit persists failed attempts", async (t) => {
  const fixture = await makeFixture();
  t.after(() => fixture.close());
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await fixture.request("/api/control/v1/auth/login", {
      method: "POST",
      body: { username: "creator", password: "wrong-password", portal: "member" },
    });
    assert.equal(result.status, 401);
    assert.equal(result.payload.error.code, "INVALID_CREDENTIALS");
  }
  const limited = await fixture.request("/api/control/v1/auth/login", {
    method: "POST",
    body: { username: "creator", password: "123456", portal: "member" },
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.payload.error.code, "LOGIN_RATE_LIMITED");
});
