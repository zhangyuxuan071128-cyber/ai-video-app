import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { AtomicJsonStore } from "./store.mjs";
import { createInitialState } from "./schema.mjs";
import { ControlPlaneError, assert, asControlPlaneError, fail } from "./errors.mjs";
import {
  codeSummary,
  encryptSecret,
  hashCode,
  hashOpaqueToken,
  hashPassword,
  normalizeUsername,
  randomId,
  randomToken,
  redact,
  requestFingerprint,
  secretLast4,
  sha256,
  verifyPassword,
} from "./security.mjs";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MEMBER_ROLES = new Set(["user", "agent", "admin", "super_admin"]);
const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const MAX_BODY_STRING = 200_000;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, label = "body") {
  assert(isRecord(value), "VALIDATION_ERROR", `${label} 必须是 JSON 对象`, 400);
  return value;
}

function readString(object, key, options = {}) {
  const { optional = false, min = 1, max = 500, trim = true } = options;
  const raw = object[key];
  if ((raw === undefined || raw === null) && optional) return undefined;
  assert(typeof raw === "string", "VALIDATION_ERROR", `${key} 必须是字符串`, 400);
  const value = trim ? raw.trim() : raw;
  assert(value.length >= min && value.length <= max, "VALIDATION_ERROR", `${key} 长度无效`, 400);
  return value;
}

function readBoolean(object, key, options = {}) {
  const value = object[key];
  if (value === undefined && options.optional) return undefined;
  assert(typeof value === "boolean", "VALIDATION_ERROR", `${key} 必须是布尔值`, 400);
  return value;
}

function readInteger(object, key, options = {}) {
  const { optional = false, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = options;
  const value = object[key];
  if (value === undefined && optional) return undefined;
  assert(Number.isSafeInteger(value), "VALIDATION_ERROR", `${key} 必须是安全整数`, 400);
  assert(value >= min && value <= max, "VALIDATION_ERROR", `${key} 超出允许范围`, 400);
  return value;
}

function readNullableUrl(object, key, options = {}) {
  const raw = object[key];
  if ((raw === undefined || raw === null || raw === "") && options.optional) {
    return raw === null || raw === "" ? null : undefined;
  }
  const value = readString(object, key, { min: 1, max: 2_000 });
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("VALIDATION_ERROR", `${key} 必须是有效 URL`, 400);
  }
  assert(["https:", "http:"].includes(parsed.protocol), "VALIDATION_ERROR", `${key} 协议无效`, 400);
  return parsed.toString();
}

function readOptionalIsoDate(object, key) {
  const value = object[key];
  if (value === undefined || value === null || value === "") return value === undefined ? undefined : null;
  assert(typeof value === "string" && Number.isFinite(Date.parse(value)), "VALIDATION_ERROR", `${key} 必须是 ISO 时间`, 400);
  return new Date(value).toISOString();
}

function nowIso(clock) {
  return clock().toISOString();
}

function currentDate(clock) {
  return nowIso(clock).slice(0, 10);
}

function publicMember(member) {
  return {
    id: member.id,
    username: member.username,
    nickname: member.nickname,
    role: member.role,
    status: member.status,
    mustRotatePassword: member.mustRotatePassword,
    bootstrap: member.bootstrap,
    freeCredits: member.freeCredits,
    paidCredits: member.paidCredits,
    dailyQuota: member.dailyQuota,
    usageToday: member.usageToday,
    usageDate: member.usageDate,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
    version: member.version,
  };
}

function publicInviteCode(code) {
  const expired = Boolean(code.expiresAt && Date.parse(code.expiresAt) <= Date.now());
  return {
    id: code.id,
    prefix: "INV",
    last4: code.last4,
    enabled: code.enabled,
    status: !code.enabled ? "disabled" : expired ? "expired" : code.uses >= code.maxUses ? "used" : "active",
    maxUses: code.maxUses,
    uses: code.uses,
    usedCount: code.uses,
    giftCredits: code.giftCredits ?? 0,
    expiresAt: code.expiresAt,
    note: code.note,
    createdBy: code.createdBy,
    createdAt: code.createdAt,
    updatedAt: code.updatedAt,
    version: code.version,
  };
}

function publicRechargeCode(code) {
  const expired = Boolean(code.expiresAt && Date.parse(code.expiresAt) <= Date.now());
  return {
    id: code.id,
    prefix: "RCH",
    last4: code.last4,
    packageId: code.packageId,
    creditAmount: code.creditAmount,
    credits: code.creditAmount,
    value: code.valueCents === null || code.valueCents === undefined ? null : code.valueCents / 100,
    enabled: code.enabled,
    status: !code.enabled ? "disabled" : code.redeemedBy ? "used" : expired ? "expired" : "active",
    redeemedBy: code.redeemedBy,
    redeemedAt: code.redeemedAt,
    expiresAt: code.expiresAt,
    note: code.note,
    createdBy: code.createdBy,
    createdAt: code.createdAt,
    updatedAt: code.updatedAt,
    version: code.version,
  };
}

function publicPackage(item) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    credits: item.credits,
    priceCents: item.priceCents,
    price: item.priceCents / 100,
    status: item.enabled ? "enabled" : "disabled",
    enabled: item.enabled,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    version: item.version,
  };
}

function publicProvider(provider) {
  return {
    id: provider.id,
    slug: provider.slug,
    name: provider.name,
    category: provider.category,
    model: provider.model ?? "",
    endpoint: provider.endpoint,
    baseUrl: provider.endpoint,
    enabled: provider.enabled,
    status: provider.enabled ? "enabled" : "disabled",
    adapterStatus: provider.adapterStatus,
    credentialStatus: provider.secretEnvelope ? "stored" : "absent",
    secretLast4: provider.secretLast4,
    operationalStatus: "unavailable",
    truthfulStatusReason: "LIVE_ADAPTER_NOT_INSTALLED",
    statusMessage: "真实 Provider Adapter 未安装",
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
    version: provider.version,
  };
}

function publicPartnerKey(key) {
  return {
    id: key.id,
    partnerName: key.partnerName,
    providerId: key.providerId ?? key.partnerName,
    label: key.label,
    enabled: key.enabled,
    status: key.enabled ? "enabled" : "disabled",
    secretLast4: key.secretLast4,
    credentialStatus: key.secretEnvelope ? "stored" : "absent",
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
    version: key.version,
  };
}

function publicContent(item) {
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    content: item.content,
    category: item.category ?? "general",
    status: item.status,
    publishedAt: item.publishedAt,
    createdBy: item.createdBy,
    updatedBy: item.updatedBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    version: item.version,
  };
}

function publicAudit(event) {
  return {
    ...event,
    createdAt: event.occurredAt,
    timestamp: event.occurredAt,
    actorName: event.actorUsername,
    username: event.actorUsername,
    ipAddress: event.sourceIp,
    ip: event.sourceIp,
    targetId: event.resourceId,
    resource: event.resourceId,
    module: event.resourceType,
    result: event.outcome,
    status: event.outcome === "succeeded" ? "success" : event.outcome === "denied" ? "warning" : "failed",
  };
}

function codeValue(prefix) {
  return `${prefix}-${randomBytes(9).toString("hex").toUpperCase()}`;
}

function normalizedHeader(headers, key) {
  return headers?.[key] ?? headers?.[key.toLowerCase()] ?? undefined;
}

function expectedVersion(request) {
  const raw = normalizedHeader(request.headers, "if-match");
  if (raw === undefined) return undefined;
  const cleaned = String(raw).replace(/^W\//, "").replaceAll('"', "");
  const parsed = Number(cleaned);
  assert(Number.isSafeInteger(parsed) && parsed > 0, "VALIDATION_ERROR", "If-Match 必须是正整数版本", 400);
  return parsed;
}

function assertVersion(entity, request) {
  const expected = expectedVersion(request);
  if (expected !== undefined && entity.version !== expected) {
    fail("VERSION_CONFLICT", "资源已被其他操作修改", 409, { expected, actual: entity.version });
  }
}

function parseLimit(searchParams, fallback = 100, maximum = 500) {
  const raw = searchParams?.get("limit");
  if (!raw) return fallback;
  const value = Number(raw);
  assert(Number.isSafeInteger(value) && value > 0 && value <= maximum, "VALIDATION_ERROR", "limit 无效", 400);
  return value;
}

function filterAuditEvents(events, searchParams) {
  const action = searchParams.get("action");
  const outcome = searchParams.get("outcome");
  const actorId = searchParams.get("actorId");
  const module = searchParams.get("module");
  const actor = searchParams.get("actor")?.toLowerCase();
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const fromTime = from ? Date.parse(from) : null;
  const rawToTime = to ? Date.parse(to) : null;
  const toTime = rawToTime === null
    ? null
    : /^\d{4}-\d{2}-\d{2}$/.test(to)
      ? rawToTime + 86_400_000
      : rawToTime;
  if (from) assert(Number.isFinite(fromTime), "VALIDATION_ERROR", "from 日期无效", 400);
  if (to) assert(Number.isFinite(toTime), "VALIDATION_ERROR", "to 日期无效", 400);
  return events
    .filter((event) => !action || event.action === action)
    .filter((event) => !outcome || event.outcome === outcome)
    .filter((event) => !actorId || event.actorId === actorId)
    .filter((event) => !module || event.resourceType === module)
    .filter((event) => !actor || `${event.actorId ?? ""} ${event.actorUsername ?? ""}`.toLowerCase().includes(actor))
    .filter((event) => fromTime === null || Date.parse(event.occurredAt) >= fromTime)
    .filter((event) => toTime === null || Date.parse(event.occurredAt) < toTime);
}

function addAuditEvent(state, nextRevision, clock, details) {
  const previous = state.auditEvents.at(-1)?.eventHash ?? null;
  const base = {
    id: randomId("audit"),
    occurredAt: nowIso(clock),
    revision: nextRevision,
    actorId: details.actor?.id ?? null,
    actorUsername: details.actor?.username ?? null,
    actorRole: details.actor?.role ?? null,
    sessionId: details.sessionId ?? null,
    action: details.action,
    resourceType: details.resourceType ?? "control_plane",
    resourceId: details.resourceId ?? null,
    outcome: details.outcome,
    reasonCode: details.reasonCode ?? null,
    requestId: details.requestId,
    method: details.method,
    path: details.path,
    sourceIp: details.sourceIp ?? null,
    userAgentHash: details.userAgent ? sha256(details.userAgent) : null,
    executionMode: "control_plane",
    before: redact(details.before ?? null),
    after: redact(details.after ?? null),
    idempotencyKeyHash: details.idempotencyKey ? sha256(details.idempotencyKey) : null,
    previousEventHash: previous,
  };
  const event = { ...base, eventHash: sha256(`${previous ?? "GENESIS"}:${JSON.stringify(base)}`) };
  state.auditEvents.push(event);
  return event;
}

function actionForRoute(request) {
  return `${request.method.toLowerCase()} ${request.path}`;
}

function cleanExpiredSessions(state, at) {
  state.sessions = state.sessions.filter((session) => Date.parse(session.expiresAt) > at);
}

function removeExpiredAttempts(attempt, at, windowMs) {
  attempt.failures = attempt.failures.filter((timestamp) => at - timestamp <= windowMs);
}

function errorResult(error) {
  const normalized = asControlPlaneError(error);
  return {
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details === undefined ? {} : { details: normalized.details }),
    },
  };
}

export class ControlPlane {
  #store;
  #masterKey;
  #clock;
  #secureCookies;

  constructor({ store, masterKey = "", clock = () => new Date(), secureCookies = false }) {
    this.#store = store;
    this.#masterKey = masterKey;
    this.#clock = clock;
    this.#secureCookies = secureCookies;
  }

  get store() {
    return this.#store;
  }

  async init() {
    await this.#store.init();
    await this.#store.read((state) => {
      let previous = null;
      for (const event of state.auditEvents) {
        const { eventHash, ...base } = event;
        assert(
          event.previousEventHash === previous
            && eventHash === sha256(`${previous ?? "GENESIS"}:${JSON.stringify(base)}`),
          "AUDIT_CHAIN_INVALID",
          "审计链校验失败，拒绝启动控制平面",
          500,
        );
        previous = eventHash;
      }
    });
    return this;
  }

  async handle(request) {
    const normalized = {
      ...request,
      method: String(request.method ?? "GET").toUpperCase(),
      path: String(request.path ?? "/"),
      query: request.query ?? new URLSearchParams(),
      body: request.body ?? {},
      headers: request.headers ?? {},
      requestId: request.requestId ?? randomId("req"),
      sourceIp: request.sourceIp ?? null,
      userAgent: request.userAgent ?? null,
      secure: Boolean(request.secure || this.#secureCookies),
    };

    try {
      const response = await this.#route(normalized);
      if (WRITE_METHODS.has(normalized.method) && !response.auditRecorded) {
        const actorContext = await this.#findActorContext(normalized.token).catch(() => null);
        const event = await this.#auditOnly(normalized, {
          actorContext,
          action: actionForRoute(normalized),
          outcome: "succeeded",
          reasonCode: "GENERIC_WRITE",
        });
        response.auditId = event.id;
      }
      return response;
    } catch (error) {
      const normalizedError = asControlPlaneError(error);
      if (WRITE_METHODS.has(normalized.method) && !normalizedError.auditRecorded) {
        const actorContext = await this.#findActorContext(normalized.token).catch(() => null);
        try {
          await this.#auditOnly(normalized, {
            actorContext,
            action: actionForRoute(normalized),
            outcome: normalizedError.status === 403 ? "denied" : "failed",
            reasonCode: normalizedError.code,
          });
          normalizedError.auditRecorded = true;
        } catch {
          // Preserve the original failure. Store failures are surfaced by the original operation.
        }
      }
      throw normalizedError;
    }
  }

  async recordRejectedWrite(request, error) {
    const normalized = {
      ...request,
      method: String(request.method ?? "POST").toUpperCase(),
      path: String(request.path ?? "/"),
      requestId: request.requestId ?? randomId("req"),
      sourceIp: request.sourceIp ?? null,
      userAgent: request.userAgent ?? null,
    };
    const actorContext = await this.#findActorContext(normalized.token).catch(() => null);
    return this.#auditOnly(normalized, {
      actorContext,
      action: actionForRoute(normalized),
      outcome: "failed",
      reasonCode: asControlPlaneError(error).code,
    });
  }

  async #findActorContext(token) {
    if (!token) return null;
    const tokenHash = hashOpaqueToken(token);
    const at = this.#clock().getTime();
    return this.#store.read((state) => {
      const session = state.sessions.find(
        (candidate) => candidate.tokenHash === tokenHash && Date.parse(candidate.expiresAt) > at,
      );
      if (!session) return null;
      const member = state.members.find((candidate) => candidate.id === session.memberId);
      if (!member) return null;
      return { actor: publicMember(member), session };
    });
  }

  async #requireActor(request, options = {}) {
    const context = await this.#findActorContext(request.token);
    assert(context, "UNAUTHENTICATED", "请先登录", 401);
    assert(context.actor.status === "active", "ACCOUNT_FROZEN", "账号已冻结", 401);
    if (!options.allowPasswordRotation) {
      assert(
        !context.actor.mustRotatePassword,
        "PASSWORD_ROTATION_REQUIRED",
        "首次登录必须先修改初始密码",
        428,
      );
    }
    if (options.portal) {
      assert(context.session.portal === options.portal, "PORTAL_SESSION_MISMATCH", "会话不属于当前入口", 403);
    }
    return context;
  }

  #requireAdmin(context, permission = "admin") {
    assert(ADMIN_ROLES.has(context.actor.role), "FORBIDDEN", "无权访问管理控制面", 403);
    if (permission === "super_admin") {
      assert(context.actor.role === "super_admin", "FORBIDDEN", "该操作需要超级管理员权限", 403);
    }
  }

  async #auditOnly(request, details) {
    const transaction = await this.#store.transact((state, nextRevision) => {
      const event = addAuditEvent(state, nextRevision, this.#clock, {
        actor: details.actorContext?.actor,
        sessionId: details.actorContext?.session?.id,
        action: details.action,
        resourceType: details.resourceType,
        resourceId: details.resourceId,
        outcome: details.outcome,
        reasonCode: details.reasonCode,
        requestId: request.requestId,
        method: request.method,
        path: request.path,
        sourceIp: request.sourceIp,
        userAgent: request.userAgent,
        idempotencyKey: normalizedHeader(request.headers, "idempotency-key"),
        before: details.before,
        after: details.after,
      });
      return event;
    });
    return transaction.result;
  }

  async #mutate(request, context, options, mutator) {
    const idempotencyKey = normalizedHeader(request.headers, "idempotency-key");
    if (options.requireIdempotency) {
      assert(
        typeof idempotencyKey === "string" && idempotencyKey.trim().length >= 8,
        "IDEMPOTENCY_KEY_REQUIRED",
        "该操作需要至少 8 位 Idempotency-Key",
        400,
      );
    }
    const fingerprint = requestFingerprint({
      action: options.action,
      resourceId: options.resourceId ?? null,
      body: request.body,
    });
    const scope = context?.actor.id ?? `anonymous:${request.sourceIp ?? "unknown"}`;

    const transaction = await this.#store.transact(async (state, nextRevision) => {
      let liveContext = context;
      if (context) {
        const liveSession = state.sessions.find((session) => session.id === context.session.id);
        const liveActor = state.members.find((member) => member.id === context.actor.id);
        assert(
          liveSession
            && liveSession.memberId === context.actor.id
            && Date.parse(liveSession.expiresAt) > this.#clock().getTime(),
          "UNAUTHENTICATED",
          "会话已失效",
          401,
        );
        assert(liveActor?.status === "active", "ACCOUNT_FROZEN", "账号已冻结或停用", 401);
        assert(liveActor.role === context.actor.role, "SESSION_STALE", "权限已变更，请重新登录", 401);
        liveContext = { actor: publicMember(liveActor), session: liveSession };
      }
      if (idempotencyKey) {
        const existing = state.idempotency.find(
          (entry) => entry.scope === scope && entry.action === options.action && entry.keyHash === sha256(idempotencyKey),
        );
        if (existing) {
          assert(
            existing.requestFingerprint === fingerprint,
            "IDEMPOTENCY_CONFLICT",
            "同一 Idempotency-Key 不能用于不同请求",
            409,
          );
          const audit = addAuditEvent(state, nextRevision, this.#clock, {
            actor: liveContext?.actor,
            sessionId: liveContext?.session?.id,
            action: options.action,
            resourceType: options.resourceType,
            resourceId: options.resourceId,
            outcome: "succeeded",
            reasonCode: "IDEMPOTENT_REPLAY",
            requestId: request.requestId,
            method: request.method,
            path: request.path,
            sourceIp: request.sourceIp,
            userAgent: request.userAgent,
            idempotencyKey,
          });
          return { data: existing.responseData, auditId: audit.id, idempotentReplay: true };
        }
      }

      const mutation = await mutator(state, nextRevision, liveContext);
      const audit = addAuditEvent(state, nextRevision, this.#clock, {
        actor: liveContext?.actor,
        sessionId: liveContext?.session?.id,
        action: options.action,
        resourceType: options.resourceType,
        resourceId: mutation.resourceId ?? options.resourceId,
        outcome: "succeeded",
        requestId: request.requestId,
        method: request.method,
        path: request.path,
        sourceIp: request.sourceIp,
        userAgent: request.userAgent,
        idempotencyKey,
        before: mutation.before,
        after: mutation.after,
      });

      if (idempotencyKey) {
        state.idempotency.push({
          id: randomId("idem"),
          scope,
          action: options.action,
          keyHash: sha256(idempotencyKey),
          requestFingerprint: fingerprint,
          responseData: mutation.idempotencyData ?? mutation.data,
          createdAt: nowIso(this.#clock),
        });
        if (state.idempotency.length > 5_000) state.idempotency.splice(0, state.idempotency.length - 5_000);
      }
      return { data: mutation.data, auditId: audit.id, idempotentReplay: false };
    });

    return {
      status: options.status ?? 200,
      data: transaction.result.data,
      revision: transaction.revision,
      auditId: transaction.result.auditId,
      idempotentReplay: transaction.result.idempotentReplay,
      auditRecorded: true,
    };
  }

  async #route(request) {
    if (request.method === "GET" && request.path === "/api/control/v1/health") {
      const summary = await this.#store.read((state) => ({
        status: "ok",
        schemaVersion: state.schemaVersion,
        revision: state.revision,
        externalAdapters: "unconfigured",
      }));
      return { status: 200, data: summary, auditRecorded: true };
    }

    if (request.method === "POST" && request.path === "/api/control/v1/auth/login") {
      return this.#login(request);
    }
    if (request.method === "POST" && request.path === "/api/control/v1/auth/register") {
      return this.#register(request);
    }
    if (request.method === "POST" && request.path === "/api/control/v1/auth/logout") {
      return this.#logout(request);
    }
    if (request.method === "POST" && request.path === "/api/control/v1/auth/rotate-password") {
      return this.#rotatePassword(request);
    }

    if (request.method === "GET" && request.path === "/api/control/v1/me") {
      const context = await this.#requireActor(request, { allowPasswordRotation: true });
      return { status: 200, data: context.actor, revision: await this.#store.read((state) => state.revision), auditRecorded: true };
    }
    if (request.method === "GET" && request.path === "/api/control/v1/client-config") {
      const context = await this.#requireActor(request, { portal: "member" });
      const data = await this.#store.read((state) => ({
        executionMode: "unconfigured",
        externalGenerationEnabled: false,
        externalAdaptersConfigured: false,
        features: {
          rechargeRedemption: true,
          feedback: true,
          nonFinancialUsageReporting: true,
          liveProviderExecution: false,
          livePayments: false,
        },
        visibleSettings: {
          dailyQuota: context.actor.dailyQuota,
          maxDailyQuota: state.riskPolicy.maxDailyQuota,
        },
        packages: state.packages.filter((item) => item.enabled).map(publicPackage),
        tutorials: state.tutorials.filter((item) => item.status === "published").map(publicContent),
        announcements: state.announcements.filter((item) => item.status === "published").map(publicContent),
        providers: state.providers.map(publicProvider),
        member: publicMember(state.members.find((member) => member.id === context.actor.id)),
        revision: state.revision,
      }));
      return { status: 200, data, revision: data.revision, auditRecorded: true };
    }
    if (request.method === "POST" && request.path === "/api/control/v1/redeem") {
      return this.#redeem(request);
    }
    if (request.method === "POST" && request.path === "/api/control/v1/feedback") {
      return this.#submitFeedback(request);
    }
    if (request.method === "POST" && request.path === "/api/control/v1/usage-events") {
      return this.#recordUsageEvent(request);
    }

    if (request.method === "GET" && request.path === "/api/control/v1/dashboard") {
      return this.#dashboard(request);
    }
    if (request.method === "GET" && request.path === "/api/control/v1/members") {
      return this.#listMembers(request);
    }
    let match = request.path.match(/^\/api\/control\/v1\/members\/([^/]+)$/);
    if (request.method === "PATCH" && match) return this.#updateMember(request, decodeURIComponent(match[1]));

    if (request.method === "GET" && request.path === "/api/control/v1/invite-codes") {
      return this.#listInviteCodes(request);
    }
    if (request.method === "POST" && request.path === "/api/control/v1/invite-codes") {
      return this.#generateInviteCodes(request);
    }
    match = request.path.match(/^\/api\/control\/v1\/invite-codes\/([^/]+)$/);
    if (request.method === "PATCH" && match) return this.#updateInviteCode(request, decodeURIComponent(match[1]));

    if (request.method === "GET" && request.path === "/api/control/v1/recharge-codes") {
      return this.#listRechargeCodes(request);
    }
    if (request.method === "POST" && request.path === "/api/control/v1/recharge-codes") {
      return this.#generateRechargeCodes(request);
    }
    match = request.path.match(/^\/api\/control\/v1\/recharge-codes\/([^/]+)$/);
    if (request.method === "PATCH" && match) return this.#updateRechargeCode(request, decodeURIComponent(match[1]));

    if (request.method === "GET" && request.path === "/api/control/v1/packages") {
      return this.#listPackages(request);
    }
    if (request.method === "POST" && request.path === "/api/control/v1/packages") {
      return this.#createPackage(request);
    }
    match = request.path.match(/^\/api\/control\/v1\/packages\/([^/]+)$/);
    if (request.method === "PATCH" && match) return this.#updatePackage(request, decodeURIComponent(match[1]));
    if (request.method === "DELETE" && match) return this.#deletePackage(request, decodeURIComponent(match[1]));

    if (request.method === "GET" && request.path === "/api/control/v1/providers") {
      return this.#listProviders(request);
    }
    if (request.method === "POST" && request.path === "/api/control/v1/providers") {
      return this.#createProvider(request);
    }
    match = request.path.match(/^\/api\/control\/v1\/providers\/([^/]+)\/secret$/);
    if (request.method === "PUT" && match) return this.#setProviderSecret(request, decodeURIComponent(match[1]));
    match = request.path.match(/^\/api\/control\/v1\/providers\/([^/]+)$/);
    if (request.method === "PATCH" && match) return this.#updateProvider(request, decodeURIComponent(match[1]));

    if (request.method === "GET" && request.path === "/api/control/v1/partner-keys") {
      return this.#listPartnerKeys(request);
    }
    if (request.method === "POST" && request.path === "/api/control/v1/partner-keys") {
      return this.#createPartnerKey(request);
    }
    match = request.path.match(/^\/api\/control\/v1\/partner-keys\/([^/]+)$/);
    if (request.method === "PATCH" && match) return this.#updatePartnerKey(request, decodeURIComponent(match[1]));
    if (request.method === "DELETE" && match) return this.#deletePartnerKey(request, decodeURIComponent(match[1]));

    for (const kind of ["tutorials", "announcements"]) {
      if (request.method === "GET" && request.path === `/api/control/v1/${kind}`) {
        return this.#listContent(request, kind);
      }
      if (request.method === "POST" && request.path === `/api/control/v1/${kind}`) {
        return this.#createContent(request, kind);
      }
      match = request.path.match(new RegExp(`^/api/control/v1/${kind}/([^/]+)/publish$`));
      if (request.method === "POST" && match) return this.#publishContent(request, kind, decodeURIComponent(match[1]));
      match = request.path.match(new RegExp(`^/api/control/v1/${kind}/([^/]+)$`));
      if (request.method === "PATCH" && match) return this.#updateContent(request, kind, decodeURIComponent(match[1]));
      if (request.method === "DELETE" && match) return this.#deleteContent(request, kind, decodeURIComponent(match[1]));
    }

    if (request.method === "GET" && request.path === "/api/control/v1/risk-policy") {
      return this.#getRiskPolicy(request);
    }
    if (request.method === "PUT" && request.path === "/api/control/v1/risk-policy") {
      return this.#updateRiskPolicy(request);
    }
    if (request.method === "GET" && request.path === "/api/control/v1/audit") {
      return this.#listAudit(request);
    }
    if (request.method === "GET" && request.path === "/api/control/v1/audit/export") {
      return this.#exportAudit(request);
    }

    fail("NOT_FOUND", "接口不存在", 404);
  }

  async #login(request) {
    const body = requireObject(request.body);
    const username = normalizeUsername(readString(body, "username", { min: 2, max: 80 }));
    const password = readString(body, "password", { min: 1, max: 500, trim: false });
    const portal = body.portal === undefined ? "member" : readString(body, "portal", { min: 5, max: 6 });
    assert(portal === "member" || portal === "admin", "VALIDATION_ERROR", "portal 必须是 member 或 admin", 400);
    const at = this.#clock().getTime();
    const token = randomToken(32);
    const tokenHash = hashOpaqueToken(token);
    const sourceKey = `${username}|${request.sourceIp ?? "unknown"}`;

    const transaction = await this.#store.transact(async (state, nextRevision) => {
      cleanExpiredSessions(state, at);
      const policy = state.riskPolicy;
      let attempt = state.loginAttempts.find((item) => item.key === sourceKey);
      if (!attempt) {
        attempt = { key: sourceKey, failures: [], lockedUntil: null };
        state.loginAttempts.push(attempt);
      }
      removeExpiredAttempts(attempt, at, policy.loginWindowSeconds * 1_000);
      const member = state.members.find((candidate) => candidate.normalizedUsername === username);
      const comparisonHash = member?.passwordHash ?? state.members[0]?.passwordHash;
      const passwordMatches = comparisonHash ? await verifyPassword(password, comparisonHash) : false;
      let failure = null;

      if (attempt.lockedUntil && Date.parse(attempt.lockedUntil) > at) {
        failure = new ControlPlaneError("LOGIN_RATE_LIMITED", "登录尝试过多，请稍后再试", 429, {
          retryAt: attempt.lockedUntil,
        });
      } else if (!member || !passwordMatches) {
        attempt.failures.push(at);
        if (attempt.failures.length >= policy.maxLoginFailures) {
          attempt.lockedUntil = new Date(at + policy.lockSeconds * 1_000).toISOString();
        }
        failure = new ControlPlaneError("INVALID_CREDENTIALS", "用户名或密码错误", 401);
      } else if (member.status !== "active") {
        failure = new ControlPlaneError("ACCOUNT_FROZEN", "账号已冻结", 401);
      } else if ((portal === "admin" && member.role !== "super_admin") || (portal === "member" && member.role === "super_admin")) {
        failure = new ControlPlaneError("PORTAL_FORBIDDEN", "该账号不能从当前入口登录", 403);
      }

      if (failure) {
        const audit = addAuditEvent(state, nextRevision, this.#clock, {
          actor: member ? publicMember(member) : null,
          action: "auth.login",
          resourceType: "session",
          resourceId: null,
          outcome: failure.status === 403 ? "denied" : "failed",
          reasonCode: failure.code,
          requestId: request.requestId,
          method: request.method,
          path: request.path,
          sourceIp: request.sourceIp,
          userAgent: request.userAgent,
          after: { username, portal },
        });
        return { failure: errorResult(failure), status: failure.status, code: failure.code, auditId: audit.id };
      }

      attempt.failures = [];
      attempt.lockedUntil = null;
      const session = {
        id: randomId("session"),
        tokenHash,
        memberId: member.id,
        portal,
        createdAt: nowIso(this.#clock),
        expiresAt: new Date(at + policy.sessionTtlSeconds * 1_000).toISOString(),
      };
      state.sessions.push(session);
      const audit = addAuditEvent(state, nextRevision, this.#clock, {
        actor: publicMember(member),
        sessionId: session.id,
        action: "auth.login",
        resourceType: "session",
        resourceId: session.id,
        outcome: "succeeded",
        requestId: request.requestId,
        method: request.method,
        path: request.path,
        sourceIp: request.sourceIp,
        userAgent: request.userAgent,
        after: { portal, expiresAt: session.expiresAt },
      });
      return { member: publicMember(member), session, token, auditId: audit.id };
    });

    if (transaction.result.failure) {
      const error = new ControlPlaneError(
        transaction.result.code,
        transaction.result.failure.error.message,
        transaction.result.status,
        transaction.result.failure.error.details,
      );
      error.auditRecorded = true;
      throw error;
    }

    return {
      status: 200,
      data: {
        member: transaction.result.member,
        user: transaction.result.member,
        mustRotatePassword: transaction.result.member.mustRotatePassword,
        portal,
      },
      revision: transaction.revision,
      auditId: transaction.result.auditId,
      setSessionToken: transaction.result.token,
      sessionMaxAgeSeconds: Math.max(
        0,
        Math.floor((Date.parse(transaction.result.session.expiresAt) - this.#clock().getTime()) / 1_000),
      ),
      secureCookie: request.secure,
      auditRecorded: true,
    };
  }

  async #register(request) {
    const body = requireObject(request.body);
    if (body.role !== undefined) fail("ROLE_NOT_ALLOWED", "注册接口不接受角色字段", 403);
    const username = normalizeUsername(readString(body, "username", { min: 3, max: 24 }));
    assert(/^[a-z0-9_.\-\u4e00-\u9fa5]+$/i.test(username), "VALIDATION_ERROR", "用户名只能包含中文、字母、数字、点、横线或下划线", 400);
    const nickname = readString(body, "nickname", { optional: true, min: 1, max: 80 }) ?? username;
    const password = readString(body, "password", { min: 6, max: 500, trim: false });
    const inviteCode = readString(body, "inviteCode", { min: 6, max: 100 });
    const passwordHash = await hashPassword(password);
    const codeHashValue = hashCode(inviteCode);
    const token = randomToken(32);
    const tokenHash = hashOpaqueToken(token);
    const at = this.#clock().getTime();

    const transaction = await this.#store.transact((state, nextRevision) => {
      assert(
        !state.members.some((candidate) => candidate.normalizedUsername === username),
        "USERNAME_TAKEN",
        "用户名已存在",
        409,
      );
      const invite = state.inviteCodes.find((candidate) => candidate.codeHash === codeHashValue);
      assert(invite, "INVITE_INVALID", "邀请码无效", 400);
      assert(invite.enabled, "INVITE_DISABLED", "邀请码已停用", 409);
      assert(!invite.expiresAt || Date.parse(invite.expiresAt) > at, "INVITE_EXPIRED", "邀请码已过期", 409);
      assert(invite.uses < invite.maxUses, "INVITE_EXHAUSTED", "邀请码已达使用上限", 409);

      const now = nowIso(this.#clock);
      const member = {
        id: randomId("member"),
        username,
        normalizedUsername: username,
        nickname,
        passwordHash,
        role: "user",
        status: "active",
        mustRotatePassword: false,
        bootstrap: false,
        freeCredits: invite.giftCredits ?? 0,
        paidCredits: 0,
        dailyQuota: 100,
        usageDate: now.slice(0, 10),
        usageToday: 0,
        invitedBy: invite.createdBy,
        inviteCodeId: invite.id,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      invite.uses += 1;
      invite.updatedAt = now;
      invite.version += 1;
      state.members.push(member);
      if ((invite.giftCredits ?? 0) > 0) {
        state.ledgerEntries.push({
          id: randomId("ledger"),
          memberId: member.id,
          kind: "invite_registration_credit",
          freeCreditsDelta: invite.giftCredits,
          paidCreditsDelta: 0,
          freeCreditsAfter: member.freeCredits,
          paidCreditsAfter: member.paidCredits,
          inviteCodeId: invite.id,
          idempotencyKeyHash: normalizedHeader(request.headers, "idempotency-key")
            ? sha256(normalizedHeader(request.headers, "idempotency-key"))
            : null,
          createdAt: now,
        });
      }
      const session = {
        id: randomId("session"),
        tokenHash,
        memberId: member.id,
        portal: "member",
        createdAt: now,
        expiresAt: new Date(at + state.riskPolicy.sessionTtlSeconds * 1_000).toISOString(),
      };
      state.sessions.push(session);
      const audit = addAuditEvent(state, nextRevision, this.#clock, {
        actor: publicMember(member),
        sessionId: session.id,
        action: "auth.register",
        resourceType: "member",
        resourceId: member.id,
        outcome: "succeeded",
        requestId: request.requestId,
        method: request.method,
        path: request.path,
        sourceIp: request.sourceIp,
        userAgent: request.userAgent,
        after: { member: publicMember(member), inviteCodeId: invite.id },
      });
      return { member: publicMember(member), session, token, auditId: audit.id };
    });

    return {
      status: 201,
      data: { member: transaction.result.member, user: transaction.result.member, mustRotatePassword: false, portal: "member" },
      revision: transaction.revision,
      auditId: transaction.result.auditId,
      setSessionToken: transaction.result.token,
      sessionMaxAgeSeconds: Math.max(
        0,
        Math.floor((Date.parse(transaction.result.session.expiresAt) - this.#clock().getTime()) / 1_000),
      ),
      secureCookie: request.secure,
      auditRecorded: true,
    };
  }

  async #logout(request) {
    const tokenHash = request.token ? hashOpaqueToken(request.token) : null;
    const transaction = await this.#store.transact((state, nextRevision) => {
      const session = tokenHash ? state.sessions.find((candidate) => candidate.tokenHash === tokenHash) : null;
      const member = session ? state.members.find((candidate) => candidate.id === session.memberId) : null;
      if (session) state.sessions = state.sessions.filter((candidate) => candidate.id !== session.id);
      const audit = addAuditEvent(state, nextRevision, this.#clock, {
        actor: member ? publicMember(member) : null,
        sessionId: session?.id,
        action: "auth.logout",
        resourceType: "session",
        resourceId: session?.id,
        outcome: "succeeded",
        reasonCode: session ? null : "NO_ACTIVE_SESSION",
        requestId: request.requestId,
        method: request.method,
        path: request.path,
        sourceIp: request.sourceIp,
        userAgent: request.userAgent,
      });
      return { auditId: audit.id };
    });
    return {
      status: 200,
      data: { ok: true },
      revision: transaction.revision,
      auditId: transaction.result.auditId,
      clearSession: true,
      secureCookie: request.secure,
      auditRecorded: true,
    };
  }

  async #rotatePassword(request) {
    const context = await this.#requireActor(request, { allowPasswordRotation: true });
    const body = requireObject(request.body);
    const currentPassword = readString(body, "currentPassword", { min: 1, max: 500, trim: false });
    const newPassword = readString(body, "newPassword", { min: 10, max: 500, trim: false });
    assert(currentPassword !== newPassword, "VALIDATION_ERROR", "新密码不能与原密码相同", 400);
    const newHash = await hashPassword(newPassword);
    const newToken = randomToken(32);
    const at = this.#clock().getTime();

    const transaction = await this.#store.transact(async (state, nextRevision) => {
      const member = state.members.find((candidate) => candidate.id === context.actor.id);
      const currentSession = state.sessions.find((candidate) => candidate.id === context.session.id);
      assert(currentSession && Date.parse(currentSession.expiresAt) > this.#clock().getTime(), "UNAUTHENTICATED", "会话已失效", 401);
      assert(member?.status === "active", "ACCOUNT_FROZEN", "账号已冻结或停用", 401);
      assert(member.role === context.actor.role, "SESSION_STALE", "权限已变更，请重新登录", 401);
      assert(member && (await verifyPassword(currentPassword, member.passwordHash)), "INVALID_CREDENTIALS", "原密码错误", 401);
      const before = { mustRotatePassword: member.mustRotatePassword, version: member.version };
      member.passwordHash = newHash;
      member.mustRotatePassword = false;
      member.updatedAt = nowIso(this.#clock);
      member.version += 1;
      state.sessions = state.sessions.filter((session) => session.memberId !== member.id);
      const session = {
        id: randomId("session"),
        tokenHash: hashOpaqueToken(newToken),
        memberId: member.id,
        portal: context.session.portal,
        createdAt: nowIso(this.#clock),
        expiresAt: new Date(at + state.riskPolicy.sessionTtlSeconds * 1_000).toISOString(),
      };
      state.sessions.push(session);
      const audit = addAuditEvent(state, nextRevision, this.#clock, {
        actor: publicMember(member),
        sessionId: session.id,
        action: "auth.rotate_password",
        resourceType: "member",
        resourceId: member.id,
        outcome: "succeeded",
        requestId: request.requestId,
        method: request.method,
        path: request.path,
        sourceIp: request.sourceIp,
        userAgent: request.userAgent,
        before,
        after: { mustRotatePassword: false, version: member.version },
      });
      return { member: publicMember(member), session, auditId: audit.id };
    });

    return {
      status: 200,
      data: { member: transaction.result.member, user: transaction.result.member, mustRotatePassword: false, portal: context.session.portal },
      revision: transaction.revision,
      auditId: transaction.result.auditId,
      setSessionToken: newToken,
      sessionMaxAgeSeconds: Math.max(
        0,
        Math.floor((Date.parse(transaction.result.session.expiresAt) - this.#clock().getTime()) / 1_000),
      ),
      secureCookie: request.secure,
      auditRecorded: true,
    };
  }

  async #dashboard(request) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    const data = await this.#store.read((state) => {
      const counts = {
        accounts: state.members.length,
        members: state.members.filter((member) => member.role !== "super_admin" && member.role !== "admin").length,
        administrators: state.members.filter((member) => member.role === "admin").length,
        superAdministrators: state.members.filter((member) => member.role === "super_admin").length,
        activeMembers: state.members.filter((member) => member.status === "active").length,
        frozenMembers: state.members.filter((member) => member.status === "frozen").length,
        inviteCodes: state.inviteCodes.length,
        rechargeCodes: state.rechargeCodes.length,
        redeemedRechargeCodes: state.rechargeCodes.filter((code) => code.redeemedBy).length,
        providers: state.providers.length,
        operationalProviders: 0,
        feedbackOpen: state.feedback.filter((item) => item.status === "open").length,
      };
      const interventions = [
        ...state.members.filter((member) => member.status === "frozen").map((member) => ({
          id: `member:${member.id}`,
          title: "冻结成员待复核",
          summary: `${member.nickname} (@${member.username}) 当前处于冻结状态`,
          module: "members",
          severity: "warning",
        })),
        ...state.feedback.filter((item) => item.status === "open").map((item) => ({
          id: `feedback:${item.id}`,
          title: "用户反馈待处理",
          summary: item.subject,
          module: "content",
          severity: "warning",
        })),
      ];
      const providers = state.providers.map(publicProvider);
      return {
        source: "persisted_control_plane",
        generatedAt: nowIso(this.#clock),
        trends: null,
        externalAdapters: "unconfigured",
        environment: {
          name: "shared-control-plane",
          adapterState: "unconfigured",
          adapterLabel: "外部适配器未配置",
        },
        counts,
        metrics: {
          interventionCount: interventions.length,
          activeMembers: counts.activeMembers,
          memberCount: counts.members,
          pendingReviews: counts.feedbackOpen,
        },
        interventions,
        providers,
        recentAudit: state.auditEvents.slice(-6).reverse().map(publicAudit),
        balances: state.members.reduce(
        (totals, member) => ({
          freeCredits: totals.freeCredits + member.freeCredits,
          paidCredits: totals.paidCredits + member.paidCredits,
        }),
        { freeCredits: 0, paidCredits: 0 },
      ),
        revision: state.revision,
      };
    });
    return { status: 200, data, revision: data.revision, auditRecorded: true };
  }

  async #listMembers(request) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    const query = request.query.get("q")?.trim().toLowerCase() ?? "";
    const status = request.query.get("status");
    const role = request.query.get("role");
    const limit = parseLimit(request.query);
    const data = await this.#store.read((state) => state.members
      .filter((member) => !query || member.username.toLowerCase().includes(query) || member.nickname.toLowerCase().includes(query))
      .filter((member) => !status || member.status === status)
      .filter((member) => !role || member.role === role)
      .slice(0, limit)
      .map(publicMember));
    return { status: 200, data, revision: await this.#store.read((state) => state.revision), auditRecorded: true };
  }

  async #updateMember(request, memberId) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    const body = requireObject(request.body);
    const status = body.status === undefined ? undefined : readString(body, "status", { min: 6, max: 8 });
    if (status !== undefined) assert(["active", "frozen", "disabled"].includes(status), "VALIDATION_ERROR", "status 无效", 400);
    const role = body.role === undefined ? undefined : readString(body, "role", { min: 4, max: 20 });
    if (role !== undefined) {
      this.#requireAdmin(context, "super_admin");
      assert(MEMBER_ROLES.has(role) && role !== "super_admin", "ROLE_NOT_ALLOWED", "API 不允许创建或授予超级管理员", 403);
    }
    const freeCreditsDelta = readInteger(body, "freeCreditsDelta", { optional: true });
    const paidCreditsDelta = body.paidCreditsDelta === undefined
      ? readInteger(body, "creditDelta", { optional: true })
      : readInteger(body, "paidCreditsDelta", { optional: true });
    const dailyQuota = body.dailyQuota === undefined
      ? readInteger(body, "quota", { optional: true, min: 0 })
      : readInteger(body, "dailyQuota", { optional: true, min: 0 });
    assert(
      status !== undefined || role !== undefined || freeCreditsDelta !== undefined || paidCreditsDelta !== undefined || dailyQuota !== undefined,
      "VALIDATION_ERROR",
      "没有可更新字段",
      400,
    );

    return this.#mutate(
      request,
      context,
      { action: "member.update", resourceType: "member", resourceId: memberId, requireIdempotency: true },
      (state) => {
        const member = state.members.find((candidate) => candidate.id === memberId);
        assert(member, "NOT_FOUND", "用户不存在", 404);
        assertVersion(member, request);
        assert(member.role !== "super_admin", "PROTECTED_ACCOUNT", "超级管理员不能通过此接口修改", 403);
        assert(member.id !== context.actor.id, "SELF_MUTATION_FORBIDDEN", "不能修改自己的管理权限或账务", 403);
        if (member.role === "admin") this.#requireAdmin(context, "super_admin");
        const policy = state.riskPolicy;
        for (const delta of [freeCreditsDelta, paidCreditsDelta]) {
          if (delta !== undefined) {
            assert(Math.abs(delta) <= policy.maxCreditAdjustment, "POLICY_VIOLATION", "额度调整超出风控上限", 422);
          }
        }
        if (dailyQuota !== undefined) {
          assert(dailyQuota <= policy.maxDailyQuota, "POLICY_VIOLATION", "每日配额超出风控上限", 422);
        }
        assert(member.freeCredits + (freeCreditsDelta ?? 0) >= 0, "INSUFFICIENT_CREDITS", "免费额度不能为负", 409);
        assert(member.paidCredits + (paidCreditsDelta ?? 0) >= 0, "INSUFFICIENT_CREDITS", "付费额度不能为负", 409);

        const before = publicMember(member);
        if (status !== undefined) member.status = status;
        if (role !== undefined) member.role = role;
        if (freeCreditsDelta !== undefined) member.freeCredits += freeCreditsDelta;
        if (paidCreditsDelta !== undefined) member.paidCredits += paidCreditsDelta;
        if (dailyQuota !== undefined) member.dailyQuota = dailyQuota;
        member.updatedAt = nowIso(this.#clock);
        member.version += 1;
        if ((status !== undefined && status !== "active") || role !== undefined) {
          state.sessions = state.sessions.filter((session) => session.memberId !== member.id);
        }
        if ((freeCreditsDelta ?? 0) !== 0 || (paidCreditsDelta ?? 0) !== 0) {
          state.ledgerEntries.push({
            id: randomId("ledger"),
            memberId: member.id,
            kind: "admin_adjustment",
            freeCreditsDelta: freeCreditsDelta ?? 0,
            paidCreditsDelta: paidCreditsDelta ?? 0,
            freeCreditsAfter: member.freeCredits,
            paidCreditsAfter: member.paidCredits,
            actorId: context.actor.id,
            idempotencyKeyHash: sha256(normalizedHeader(request.headers, "idempotency-key")),
            createdAt: nowIso(this.#clock),
          });
        }
        return { data: publicMember(member), before, after: publicMember(member) };
      },
    );
  }

  async #listInviteCodes(request) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    const data = await this.#store.read((state) => state.inviteCodes.slice(-parseLimit(request.query)).reverse().map(publicInviteCode));
    return { status: 200, data, revision: await this.#store.read((state) => state.revision), auditRecorded: true };
  }

  async #generateInviteCodes(request) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    const body = requireObject(request.body);
    const count = readInteger(body, "count", { min: 1, max: 100 });
    const maxUses = readInteger(body, "maxUses", { min: 1, max: 10_000 });
    const giftCredits = readInteger(body, "giftCredits", { optional: true, min: 0, max: 1_000_000 }) ?? 0;
    const expiresAt = readOptionalIsoDate(body, "expiresAt") ?? null;
    const note = body.note === undefined ? "" : readString(body, "note", { min: 0, max: 200 });
    if (expiresAt) assert(Date.parse(expiresAt) > this.#clock().getTime(), "VALIDATION_ERROR", "expiresAt 必须在未来", 400);

    return this.#mutate(
      request,
      context,
      { action: "invite_codes.generate", resourceType: "invite_code", requireIdempotency: true, status: 201 },
      (state) => {
        const now = nowIso(this.#clock);
        const generated = [];
        const persisted = [];
        for (let index = 0; index < count; index += 1) {
          const code = codeValue("INV");
          const { last4 } = codeSummary(code);
          const entry = {
            id: randomId("invite"),
            codeHash: hashCode(code),
            last4,
            enabled: true,
            maxUses,
            uses: 0,
            giftCredits,
            expiresAt,
            note,
            createdBy: context.actor.id,
            createdAt: now,
            updatedAt: now,
            version: 1,
          };
          state.inviteCodes.push(entry);
          const publicEntry = publicInviteCode(entry);
          persisted.push(publicEntry);
          generated.push({ ...publicEntry, code });
        }
        return {
          data: generated,
          idempotencyData: persisted,
          after: { generatedCount: generated.length, ids: generated.map((item) => item.id) },
        };
      },
    );
  }

  async #updateInviteCode(request, codeId) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    const body = requireObject(request.body);
    const enabled = readBoolean(body, "enabled");
    return this.#mutate(
      request,
      context,
      { action: "invite_code.set_enabled", resourceType: "invite_code", resourceId: codeId },
      (state) => {
        const entry = state.inviteCodes.find((candidate) => candidate.id === codeId);
        assert(entry, "NOT_FOUND", "邀请码不存在", 404);
        assertVersion(entry, request);
        const before = publicInviteCode(entry);
        entry.enabled = enabled;
        entry.updatedAt = nowIso(this.#clock);
        entry.version += 1;
        return { data: publicInviteCode(entry), before, after: publicInviteCode(entry) };
      },
    );
  }

  async #listRechargeCodes(request) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    const data = await this.#store.read((state) => state.rechargeCodes.slice(-parseLimit(request.query)).reverse().map(publicRechargeCode));
    return { status: 200, data, revision: await this.#store.read((state) => state.revision), auditRecorded: true };
  }

  async #generateRechargeCodes(request) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    const body = requireObject(request.body);
    const count = readInteger(body, "count", { min: 1, max: 100 });
    const packageId = readString(body, "packageId", { optional: true, min: 4, max: 100 });
    const directCredits = readInteger(body, "credits", { optional: true, min: 1, max: 10_000_000 });
    const directValue = body.value === undefined ? undefined : Number(body.value);
    if (directValue !== undefined) {
      assert(Number.isFinite(directValue) && directValue >= 0 && directValue <= 10_000_000, "VALIDATION_ERROR", "value 超出允许范围", 400);
    }
    assert(packageId !== undefined || directCredits !== undefined, "VALIDATION_ERROR", "packageId 或 credits 至少需要一项", 400);
    const expiresAt = readOptionalIsoDate(body, "expiresAt") ?? null;
    const note = body.note === undefined ? "" : readString(body, "note", { min: 0, max: 200 });
    if (expiresAt) assert(Date.parse(expiresAt) > this.#clock().getTime(), "VALIDATION_ERROR", "expiresAt 必须在未来", 400);

    return this.#mutate(
      request,
      context,
      { action: "recharge_codes.generate", resourceType: "recharge_code", requireIdempotency: true, status: 201 },
      (state) => {
        const rechargePackage = packageId ? state.packages.find((candidate) => candidate.id === packageId) : null;
        if (packageId) assert(rechargePackage && rechargePackage.enabled, "PACKAGE_UNAVAILABLE", "充值套餐不存在或已停用", 409);
        const creditAmount = rechargePackage?.credits ?? directCredits;
        const valueCents = rechargePackage?.priceCents ?? (directValue === undefined ? null : Math.round(directValue * 100));
        const now = nowIso(this.#clock);
        const generated = [];
        const persisted = [];
        for (let index = 0; index < count; index += 1) {
          const code = codeValue("RCH");
          const { last4 } = codeSummary(code);
          const entry = {
            id: randomId("recharge"),
            codeHash: hashCode(code),
            last4,
            packageId: rechargePackage?.id ?? null,
            creditAmount,
            valueCents,
            enabled: true,
            redeemedBy: null,
            redeemedAt: null,
            expiresAt,
            note,
            createdBy: context.actor.id,
            createdAt: now,
            updatedAt: now,
            version: 1,
          };
          state.rechargeCodes.push(entry);
          const publicEntry = publicRechargeCode(entry);
          persisted.push(publicEntry);
          generated.push({ ...publicEntry, code });
        }
        return {
          data: generated,
          idempotencyData: persisted,
          after: { generatedCount: generated.length, ids: generated.map((item) => item.id), packageId },
        };
      },
    );
  }

  async #updateRechargeCode(request, codeId) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    const body = requireObject(request.body);
    const enabled = readBoolean(body, "enabled");
    return this.#mutate(
      request,
      context,
      { action: "recharge_code.set_enabled", resourceType: "recharge_code", resourceId: codeId },
      (state) => {
        const entry = state.rechargeCodes.find((candidate) => candidate.id === codeId);
        assert(entry, "NOT_FOUND", "充值码不存在", 404);
        assertVersion(entry, request);
        const before = publicRechargeCode(entry);
        entry.enabled = enabled;
        entry.updatedAt = nowIso(this.#clock);
        entry.version += 1;
        return { data: publicRechargeCode(entry), before, after: publicRechargeCode(entry) };
      },
    );
  }

  async #redeem(request) {
    const context = await this.#requireActor(request, { portal: "member" });
    const body = requireObject(request.body);
    const code = readString(body, "code", { min: 6, max: 100 });
    const codeHashValue = hashCode(code);
    return this.#mutate(
      request,
      context,
      { action: "recharge_code.redeem", resourceType: "recharge_code", requireIdempotency: true },
      (state) => {
        const entry = state.rechargeCodes.find((candidate) => candidate.codeHash === codeHashValue);
        assert(entry, "RECHARGE_CODE_INVALID", "充值码无效", 400);
        assert(entry.enabled, "RECHARGE_CODE_DISABLED", "充值码已停用", 409);
        assert(!entry.redeemedBy, "RECHARGE_CODE_USED", "充值码已使用", 409);
        assert(!entry.expiresAt || Date.parse(entry.expiresAt) > this.#clock().getTime(), "RECHARGE_CODE_EXPIRED", "充值码已过期", 409);
        const member = state.members.find((candidate) => candidate.id === context.actor.id);
        const before = { paidCredits: member.paidCredits, code: publicRechargeCode(entry) };
        const now = nowIso(this.#clock);
        entry.redeemedBy = member.id;
        entry.redeemedAt = now;
        entry.updatedAt = now;
        entry.version += 1;
        member.paidCredits += entry.creditAmount;
        member.updatedAt = now;
        member.version += 1;
        const ledger = {
          id: randomId("ledger"),
          memberId: member.id,
          kind: "recharge_code_redemption",
          freeCreditsDelta: 0,
          paidCreditsDelta: entry.creditAmount,
          freeCreditsAfter: member.freeCredits,
          paidCreditsAfter: member.paidCredits,
          rechargeCodeId: entry.id,
          idempotencyKeyHash: sha256(normalizedHeader(request.headers, "idempotency-key")),
          createdAt: now,
        };
        state.ledgerEntries.push(ledger);
        const data = {
          ledgerEntryId: ledger.id,
          credited: entry.creditAmount,
          freeCredits: member.freeCredits,
          paidCredits: member.paidCredits,
          rechargeCode: publicRechargeCode(entry),
        };
        return {
          data,
          resourceId: entry.id,
          before,
          after: { paidCredits: member.paidCredits, rechargeCodeId: entry.id, ledgerEntryId: ledger.id },
        };
      },
    );
  }

  async #listPackages(request) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    const data = await this.#store.read((state) => state.packages.map(publicPackage));
    return { status: 200, data, revision: await this.#store.read((state) => state.revision), auditRecorded: true };
  }

  #packageInput(body, partial = false) {
    return {
      name: readString(body, "name", { optional: partial, min: 1, max: 100 }),
      description: readString(body, "description", { optional: partial, min: 0, max: 1_000 }),
      credits: readInteger(body, "credits", { optional: partial, min: 1, max: 10_000_000 }),
      priceCents: readInteger(body, "priceCents", { optional: partial, min: 0, max: 1_000_000_000 }),
      enabled: readBoolean(body, "enabled", { optional: partial }),
    };
  }

  async #createPackage(request) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    const input = this.#packageInput(requireObject(request.body));
    return this.#mutate(
      request,
      context,
      { action: "package.create", resourceType: "package", status: 201 },
      (state) => {
        const now = nowIso(this.#clock);
        const item = { id: randomId("package"), ...input, createdAt: now, updatedAt: now, version: 1 };
        state.packages.push(item);
        return { data: publicPackage(item), resourceId: item.id, after: publicPackage(item) };
      },
    );
  }

  async #updatePackage(request, packageId) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    const input = this.#packageInput(requireObject(request.body), true);
    assert(Object.values(input).some((value) => value !== undefined), "VALIDATION_ERROR", "没有可更新字段", 400);
    return this.#mutate(request, context, { action: "package.update", resourceType: "package", resourceId: packageId }, (state) => {
      const item = state.packages.find((candidate) => candidate.id === packageId);
      assert(item, "NOT_FOUND", "套餐不存在", 404);
      assertVersion(item, request);
      const before = publicPackage(item);
      for (const [key, value] of Object.entries(input)) if (value !== undefined) item[key] = value;
      item.updatedAt = nowIso(this.#clock);
      item.version += 1;
      return { data: publicPackage(item), before, after: publicPackage(item) };
    });
  }

  async #deletePackage(request, packageId) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    return this.#mutate(request, context, { action: "package.delete", resourceType: "package", resourceId: packageId }, (state) => {
      const index = state.packages.findIndex((candidate) => candidate.id === packageId);
      assert(index >= 0, "NOT_FOUND", "套餐不存在", 404);
      const item = state.packages[index];
      assertVersion(item, request);
      assert(!state.rechargeCodes.some((code) => code.packageId === packageId), "RESOURCE_IN_USE", "已生成充值码的套餐不能删除，请停用", 409);
      state.packages.splice(index, 1);
      return { data: { deleted: true, id: packageId }, before: publicPackage(item), after: null };
    });
  }

  async #listProviders(request) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    const data = await this.#store.read((state) => {
      const providers = state.providers.map(publicProvider);
      return {
        providers,
        items: providers,
        vaultConfigured: Boolean(this.#masterKey),
        adapterState: "unconfigured",
      };
    });
    return { status: 200, data, revision: await this.#store.read((state) => state.revision), auditRecorded: true };
  }

  async #createProvider(request) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context, "super_admin");
    const body = requireObject(request.body);
    assert(body.secret === undefined, "SECRET_ENDPOINT_REQUIRED", "密钥必须通过专用 secret 接口录入", 400);
    const slug = readString(body, "slug", { min: 2, max: 80 }).toLowerCase();
    assert(/^[a-z0-9_-]+$/.test(slug), "VALIDATION_ERROR", "slug 格式无效", 400);
    const name = readString(body, "name", { min: 1, max: 100 });
    const category = readString(body, "category", { min: 2, max: 50 });
    const model = readString(body, "model", { optional: true, min: 0, max: 200 }) ?? "";
    const endpoint = readNullableUrl(body, "endpoint", { optional: true }) ?? null;
    return this.#mutate(request, context, { action: "provider.create", resourceType: "provider", status: 201 }, (state) => {
      assert(!state.providers.some((provider) => provider.slug === slug), "CONFLICT", "Provider slug 已存在", 409);
      const now = nowIso(this.#clock);
      const provider = {
        id: randomId("provider"),
        slug,
        name,
        category,
        model,
        endpoint,
        adapterStatus: "unconfigured",
        enabled: false,
        secretEnvelope: null,
        secretLast4: null,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      state.providers.push(provider);
      return { data: publicProvider(provider), resourceId: provider.id, after: publicProvider(provider) };
    });
  }

  async #updateProvider(request, providerId) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context, "super_admin");
    const body = requireObject(request.body);
    assert(body.secret === undefined, "SECRET_ENDPOINT_REQUIRED", "密钥必须通过专用 secret 接口录入", 400);
    const name = readString(body, "name", { optional: true, min: 1, max: 100 });
    const category = readString(body, "category", { optional: true, min: 2, max: 50 });
    const model = readString(body, "model", { optional: true, min: 0, max: 200 });
    const endpoint = readNullableUrl(body, "endpoint", { optional: true });
    const enabled = readBoolean(body, "enabled", { optional: true });
    assert(name !== undefined || category !== undefined || model !== undefined || endpoint !== undefined || enabled !== undefined, "VALIDATION_ERROR", "没有可更新字段", 400);
    if (enabled === true) fail("ADAPTER_UNCONFIGURED", "真实 Provider Adapter 尚未安装，不能启用", 409);
    return this.#mutate(request, context, { action: "provider.update", resourceType: "provider", resourceId: providerId }, (state) => {
      const provider = state.providers.find((candidate) => candidate.id === providerId);
      assert(provider, "NOT_FOUND", "Provider 不存在", 404);
      assertVersion(provider, request);
      const before = publicProvider(provider);
      if (name !== undefined) provider.name = name;
      if (category !== undefined) provider.category = category;
      if (model !== undefined) provider.model = model;
      if (endpoint !== undefined) provider.endpoint = endpoint;
      if (enabled !== undefined) provider.enabled = enabled;
      provider.updatedAt = nowIso(this.#clock);
      provider.version += 1;
      return { data: publicProvider(provider), before, after: publicProvider(provider) };
    });
  }

  async #setProviderSecret(request, providerId) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context, "super_admin");
    assert(this.#masterKey, "CONFIG_REQUIRED", "未配置 CONTROL_PLANE_MASTER_KEY，拒绝录入真实密钥", 503);
    const body = requireObject(request.body);
    const secret = readString(body, "secret", { min: 8, max: 10_000, trim: false });
    const envelope = encryptSecret(secret, this.#masterKey);
    const last4 = secretLast4(secret);
    return this.#mutate(request, context, { action: "provider.secret.store", resourceType: "provider", resourceId: providerId }, (state) => {
      const provider = state.providers.find((candidate) => candidate.id === providerId);
      assert(provider, "NOT_FOUND", "Provider 不存在", 404);
      assertVersion(provider, request);
      const before = publicProvider(provider);
      provider.secretEnvelope = envelope;
      provider.secretLast4 = last4;
      provider.updatedAt = nowIso(this.#clock);
      provider.version += 1;
      return {
        data: {
          providerId: provider.id,
          credentialStatus: "stored",
          secretLast4: provider.secretLast4,
          adapterStatus: "unconfigured",
          operationalStatus: "unavailable",
        },
        before,
        after: publicProvider(provider),
      };
    });
  }

  async #listPartnerKeys(request) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context, "super_admin");
    const data = await this.#store.read((state) => {
      const keys = state.partnerKeys.map(publicPartnerKey);
      return { keys, partnerKeys: keys, items: keys, vaultConfigured: Boolean(this.#masterKey) };
    });
    return { status: 200, data, revision: await this.#store.read((state) => state.revision), auditRecorded: true };
  }

  async #createPartnerKey(request) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context, "super_admin");
    assert(this.#masterKey, "CONFIG_REQUIRED", "未配置 CONTROL_PLANE_MASTER_KEY，拒绝录入真实密钥", 503);
    const body = requireObject(request.body);
    const partnerName = body.partnerName === undefined
      ? readString(body, "providerId", { min: 1, max: 100 })
      : readString(body, "partnerName", { min: 1, max: 100 });
    const providerId = body.providerId === undefined ? partnerName : readString(body, "providerId", { min: 1, max: 100 });
    const label = readString(body, "label", { min: 1, max: 100 });
    const enabled = readBoolean(body, "enabled", { optional: true }) ?? true;
    const secret = readString(body, "secret", { min: 8, max: 10_000, trim: false });
    const envelope = encryptSecret(secret, this.#masterKey);
    const last4 = secretLast4(secret);
    return this.#mutate(request, context, { action: "partner_key.create", resourceType: "partner_key", status: 201 }, (state) => {
      const now = nowIso(this.#clock);
      const key = {
        id: randomId("partner_key"),
        partnerName,
        providerId,
        label,
        enabled,
        secretEnvelope: envelope,
        secretLast4: last4,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      state.partnerKeys.push(key);
      return { data: publicPartnerKey(key), resourceId: key.id, after: publicPartnerKey(key) };
    });
  }

  async #updatePartnerKey(request, keyId) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context, "super_admin");
    const body = requireObject(request.body);
    const partnerName = readString(body, "partnerName", { optional: true, min: 1, max: 100 });
    const providerId = readString(body, "providerId", { optional: true, min: 1, max: 100 });
    const label = readString(body, "label", { optional: true, min: 1, max: 100 });
    const enabled = readBoolean(body, "enabled", { optional: true });
    let envelope;
    let last4;
    if (body.secret !== undefined) {
      assert(this.#masterKey, "CONFIG_REQUIRED", "未配置 CONTROL_PLANE_MASTER_KEY，拒绝录入真实密钥", 503);
      const secret = readString(body, "secret", { min: 8, max: 10_000, trim: false });
      envelope = encryptSecret(secret, this.#masterKey);
      last4 = secretLast4(secret);
    }
    assert(partnerName !== undefined || providerId !== undefined || label !== undefined || enabled !== undefined || envelope !== undefined, "VALIDATION_ERROR", "没有可更新字段", 400);
    return this.#mutate(request, context, { action: "partner_key.update", resourceType: "partner_key", resourceId: keyId }, (state) => {
      const key = state.partnerKeys.find((candidate) => candidate.id === keyId);
      assert(key, "NOT_FOUND", "合作方密钥不存在", 404);
      assertVersion(key, request);
      const before = publicPartnerKey(key);
      if (partnerName !== undefined) key.partnerName = partnerName;
      if (providerId !== undefined) key.providerId = providerId;
      if (label !== undefined) key.label = label;
      if (enabled !== undefined) key.enabled = enabled;
      if (envelope !== undefined) {
        key.secretEnvelope = envelope;
        key.secretLast4 = last4;
      }
      key.updatedAt = nowIso(this.#clock);
      key.version += 1;
      return { data: publicPartnerKey(key), before, after: publicPartnerKey(key) };
    });
  }

  async #deletePartnerKey(request, keyId) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context, "super_admin");
    return this.#mutate(request, context, { action: "partner_key.delete", resourceType: "partner_key", resourceId: keyId }, (state) => {
      const index = state.partnerKeys.findIndex((candidate) => candidate.id === keyId);
      assert(index >= 0, "NOT_FOUND", "合作方密钥不存在", 404);
      const before = publicPartnerKey(state.partnerKeys[index]);
      state.partnerKeys.splice(index, 1);
      return { data: { deleted: true, id: keyId }, before, after: null };
    });
  }

  async #listContent(request, kind) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    const data = await this.#store.read((state) => state[kind].map(publicContent));
    return { status: 200, data, revision: await this.#store.read((state) => state.revision), auditRecorded: true };
  }

  #contentInput(body, partial = false) {
    return {
      title: readString(body, "title", { optional: partial, min: 1, max: 200 }),
      summary: readString(body, "summary", { optional: partial, min: 0, max: 1_000 }),
      content: readString(body, "content", { optional: partial, min: 0, max: MAX_BODY_STRING, trim: false }),
      category: readString(body, "category", { optional: true, min: 1, max: 80 }) ?? (partial ? undefined : "general"),
    };
  }

  async #createContent(request, kind) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    const input = this.#contentInput(requireObject(request.body));
    const singular = kind === "tutorials" ? "tutorial" : "announcement";
    return this.#mutate(request, context, { action: `${singular}.create`, resourceType: singular, status: 201 }, (state) => {
      const now = nowIso(this.#clock);
      const item = {
        id: randomId(singular),
        ...input,
        status: "draft",
        publishedAt: null,
        createdBy: context.actor.id,
        updatedBy: context.actor.id,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      state[kind].push(item);
      return { data: publicContent(item), resourceId: item.id, after: publicContent(item) };
    });
  }

  async #updateContent(request, kind, contentId) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    const input = this.#contentInput(requireObject(request.body), true);
    assert(Object.values(input).some((value) => value !== undefined), "VALIDATION_ERROR", "没有可更新字段", 400);
    const singular = kind === "tutorials" ? "tutorial" : "announcement";
    return this.#mutate(request, context, { action: `${singular}.update`, resourceType: singular, resourceId: contentId }, (state) => {
      const item = state[kind].find((candidate) => candidate.id === contentId);
      assert(item, "NOT_FOUND", "内容不存在", 404);
      assertVersion(item, request);
      const before = publicContent(item);
      for (const [key, value] of Object.entries(input)) if (value !== undefined) item[key] = value;
      item.updatedBy = context.actor.id;
      item.updatedAt = nowIso(this.#clock);
      item.version += 1;
      return { data: publicContent(item), before, after: publicContent(item) };
    });
  }

  async #publishContent(request, kind, contentId) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    const singular = kind === "tutorials" ? "tutorial" : "announcement";
    const body = requireObject(request.body);
    const published = readBoolean(body, "published", { optional: true }) ?? true;
    return this.#mutate(request, context, { action: `${singular}.publish`, resourceType: singular, resourceId: contentId, requireIdempotency: true }, (state) => {
      const item = state[kind].find((candidate) => candidate.id === contentId);
      assert(item, "NOT_FOUND", "内容不存在", 404);
      assertVersion(item, request);
      const before = publicContent(item);
      item.status = published ? "published" : "draft";
      item.publishedAt = published ? (item.publishedAt ?? nowIso(this.#clock)) : null;
      item.updatedBy = context.actor.id;
      item.updatedAt = nowIso(this.#clock);
      item.version += 1;
      return { data: publicContent(item), before, after: publicContent(item) };
    });
  }

  async #deleteContent(request, kind, contentId) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    const singular = kind === "tutorials" ? "tutorial" : "announcement";
    return this.#mutate(request, context, { action: `${singular}.delete`, resourceType: singular, resourceId: contentId }, (state) => {
      const index = state[kind].findIndex((candidate) => candidate.id === contentId);
      assert(index >= 0, "NOT_FOUND", "内容不存在", 404);
      const before = publicContent(state[kind][index]);
      state[kind].splice(index, 1);
      return { data: { deleted: true, id: contentId }, before, after: null };
    });
  }

  async #submitFeedback(request) {
    const context = await this.#requireActor(request, { portal: "member" });
    const body = requireObject(request.body);
    const category = readString(body, "category", { min: 2, max: 50 });
    const subject = readString(body, "subject", { min: 2, max: 200 });
    const message = readString(body, "message", { min: 2, max: 10_000, trim: false });
    return this.#mutate(request, context, { action: "feedback.submit", resourceType: "feedback", status: 201 }, (state) => {
      const now = nowIso(this.#clock);
      const item = {
        id: randomId("feedback"),
        memberId: context.actor.id,
        category,
        subject,
        message,
        status: "open",
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      state.feedback.push(item);
      return { data: item, resourceId: item.id, after: { ...item, message: "[CONTENT_REDACTED_FROM_AUDIT]" } };
    });
  }

  async #recordUsageEvent(request) {
    const context = await this.#requireActor(request, { portal: "member" });
    const body = requireObject(request.body);
    const kind = readString(body, "kind", { min: 2, max: 80 });
    const units = readInteger(body, "units", { min: 1, max: 10_000 });
    if (body.creditsDelta !== undefined || body.creditCost !== undefined) {
      fail("NOT_AUTHORITATIVE", "客户端 usage-event 不得直接改变生产余额", 403);
    }
    return this.#mutate(
      request,
      context,
      { action: "usage_event.record", resourceType: "usage_event", requireIdempotency: true, status: 201 },
      (state) => {
        const member = state.members.find((candidate) => candidate.id === context.actor.id);
        const today = currentDate(this.#clock);
        if (member.usageDate !== today) {
          member.usageDate = today;
          member.usageToday = 0;
        }
        assert(member.usageToday + units <= member.dailyQuota, "DAILY_QUOTA_EXCEEDED", "已超出每日使用配额", 429);
        const event = {
          id: randomId("usage"),
          memberId: member.id,
          kind,
          units,
          accountingAuthority: "client_reported_non_financial",
          chargedCredits: 0,
          providerEvidence: null,
          createdAt: nowIso(this.#clock),
        };
        state.usageEvents.push(event);
        member.usageToday += units;
        member.updatedAt = nowIso(this.#clock);
        member.version += 1;
        return {
          data: { event, member: publicMember(member) },
          resourceId: event.id,
          after: { id: event.id, kind, units, chargedCredits: 0, usageToday: member.usageToday },
        };
      },
    );
  }

  async #getRiskPolicy(request) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    const data = await this.#store.read((state) => ({ ...state.riskPolicy }));
    return { status: 200, data, revision: await this.#store.read((state) => state.revision), auditRecorded: true };
  }

  async #updateRiskPolicy(request) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context, "super_admin");
    const body = requireObject(request.body);
    const fields = {
      loginWindowSeconds: readInteger(body, "loginWindowSeconds", { optional: true, min: 60, max: 86_400 }),
      maxLoginFailures: readInteger(body, "maxLoginFailures", { optional: true, min: 2, max: 100 }),
      lockSeconds: readInteger(body, "lockSeconds", { optional: true, min: 30, max: 604_800 }),
      sessionTtlSeconds: readInteger(body, "sessionTtlSeconds", { optional: true, min: 300, max: 2_592_000 }),
      maxDailyQuota: readInteger(body, "maxDailyQuota", { optional: true, min: 1, max: 100_000_000 }),
      maxCreditAdjustment: readInteger(body, "maxCreditAdjustment", { optional: true, min: 1, max: 1_000_000_000 }),
    };
    assert(Object.values(fields).some((value) => value !== undefined), "VALIDATION_ERROR", "没有可更新字段", 400);
    return this.#mutate(request, context, { action: "risk_policy.update", resourceType: "risk_policy", resourceId: "risk_policy_default", requireIdempotency: true }, (state) => {
      assertVersion(state.riskPolicy, request);
      const before = { ...state.riskPolicy };
      for (const [key, value] of Object.entries(fields)) if (value !== undefined) state.riskPolicy[key] = value;
      state.riskPolicy.updatedAt = nowIso(this.#clock);
      state.riskPolicy.updatedBy = context.actor.id;
      state.riskPolicy.version += 1;
      return { data: { ...state.riskPolicy }, before, after: { ...state.riskPolicy } };
    });
  }

  async #listAudit(request) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    const limit = parseLimit(request.query, 100, 1_000);
    const data = await this.#store.read((state) => {
      const filtered = filterAuditEvents(state.auditEvents, request.query);
      return {
        items: filtered.slice(-limit).reverse().map(publicAudit),
        total: filtered.length,
        immutableAtInterface: true,
        revision: state.revision,
      };
    });
    return { status: 200, data, revision: data.revision, auditRecorded: true };
  }

  async #exportAudit(request) {
    const context = await this.#requireActor(request, { portal: "admin" });
    this.#requireAdmin(context);
    const rows = await this.#store.read((state) => filterAuditEvents(state.auditEvents, request.query));
    return {
      status: 200,
      data: rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""),
      contentType: "application/x-ndjson; charset=utf-8",
      headers: { "Content-Disposition": `attachment; filename="control-plane-audit-${currentDate(this.#clock)}.jsonl"` },
      auditRecorded: true,
    };
  }
}

export async function createControlPlane(options = {}) {
  const clock = options.clock ?? (() => new Date());
  const dataFile = resolve(options.dataFile ?? process.env.CONTROL_PLANE_DATA_FILE ?? "server/control-plane/data/control-plane.json");
  const store = options.store ?? new AtomicJsonStore({
    filePath: dataFile,
    createInitialState: () => createInitialState(clock),
  });
  const controlPlane = new ControlPlane({
    store,
    masterKey: options.masterKey ?? process.env.CONTROL_PLANE_MASTER_KEY ?? "",
    clock,
    secureCookies: options.secureCookies ?? process.env.CONTROL_PLANE_SECURE_COOKIE === "1",
  });
  return controlPlane.init();
}

export { ControlPlaneError };
