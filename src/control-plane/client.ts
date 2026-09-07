import type {
  ApiEnvelope,
  AuthResult,
  ClientConfig,
  ControlPlaneErrorBody,
  InviteCodeRecord,
  Member,
  PackageRecord,
  PartnerKeyList,
  PartnerKeyRecord,
  Portal,
  ProviderList,
  ProviderRecord,
  PublishedContent,
  Query,
  RechargeCodeRecord,
  WriteOptions,
} from "./types";

type FetchLike = typeof fetch;
type JsonObject = Record<string, unknown>;

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `web-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function queryString(query?: Query): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export class ControlPlaneClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(status: number, body: ControlPlaneErrorBody) {
    super(body.message);
    this.name = "ControlPlaneClientError";
    this.code = body.code;
    this.status = status;
    this.details = body.details;
    this.requestId = body.requestId;
  }
}

export class ControlPlaneClient {
  readonly baseUrl: string;
  readonly #fetch: FetchLike;

  constructor(options: { baseUrl?: string; fetch?: FetchLike } = {}) {
    this.baseUrl = (options.baseUrl ?? "/control").replace(/\/$/, "");
    this.#fetch = options.fetch ?? fetch.bind(globalThis);
  }

  async #request<T>(
    method: string,
    path: string,
    options: { body?: unknown; query?: Query; write?: WriteOptions; rawText?: boolean } = {},
  ): Promise<ApiEnvelope<T>> {
    const headers: Record<string, string> = { Accept: options.rawText ? "application/x-ndjson" : "application/json" };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      headers["Idempotency-Key"] = options.write?.idempotencyKey ?? newIdempotencyKey();
    }
    if (options.write?.expectedVersion !== undefined) headers["If-Match"] = String(options.write.expectedVersion);
    const response = await this.#fetch(`${this.baseUrl}${path}${queryString(options.query)}`, {
      method,
      credentials: "include",
      cache: "no-store",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (!response.ok) {
      let parsed: { error?: ControlPlaneErrorBody } = {};
      try {
        parsed = await response.json() as { error?: ControlPlaneErrorBody };
      } catch {
        // A non-JSON upstream error is normalized without exposing response HTML.
      }
      throw new ControlPlaneClientError(response.status, parsed.error ?? {
        code: "HTTP_ERROR",
        message: `控制面请求失败（HTTP ${response.status}）`,
      });
    }
    if (options.rawText) return { data: await response.text() as T };
    return await response.json() as ApiEnvelope<T>;
  }

  login(input: { username: string; password: string; portal?: Portal }): Promise<ApiEnvelope<AuthResult>> {
    return this.#request("POST", "/auth/login", { body: { ...input, portal: input.portal ?? "member" } });
  }

  logout(): Promise<ApiEnvelope<{ ok: true }>> {
    return this.#request("POST", "/auth/logout", { body: {} });
  }

  register(input: { username: string; password: string; inviteCode: string; nickname?: string }): Promise<ApiEnvelope<AuthResult>> {
    return this.#request("POST", "/auth/register", { body: input });
  }

  rotatePassword(input: { currentPassword: string; newPassword: string }): Promise<ApiEnvelope<AuthResult>> {
    return this.#request("POST", "/auth/rotate-password", { body: input });
  }

  me(): Promise<ApiEnvelope<Member>> {
    return this.#request("GET", "/me");
  }

  clientConfig(): Promise<ApiEnvelope<ClientConfig>> {
    return this.#request("GET", "/client-config");
  }

  dashboard(): Promise<ApiEnvelope<JsonObject>> {
    return this.#request("GET", "/dashboard");
  }

  listMembers(query?: Query): Promise<ApiEnvelope<Member[]>> {
    return this.#request("GET", "/members", {
      query: query ? { ...query, q: query.q ?? query.query, query: undefined } : undefined,
    });
  }

  updateMember(id: string, input: JsonObject, options?: WriteOptions): Promise<ApiEnvelope<Member>> {
    const normalized = {
      ...input,
      paidCreditsDelta: input.paidCreditsDelta ?? input.creditDelta,
      dailyQuota: input.dailyQuota ?? input.quota,
      creditDelta: undefined,
      quota: undefined,
    };
    return this.#request("PATCH", `/members/${encodeURIComponent(id)}`, { body: normalized, write: options });
  }

  listInviteCodes(query?: Query): Promise<ApiEnvelope<InviteCodeRecord[]>> {
    return this.#request("GET", "/invite-codes", { query });
  }

  generateInviteCodes(input: JsonObject, options?: WriteOptions): Promise<ApiEnvelope<InviteCodeRecord[]>> {
    return this.#request("POST", "/invite-codes", { body: input, write: options });
  }

  setInviteCodeEnabled(id: string, input: boolean | { enabled: boolean }, options?: WriteOptions): Promise<ApiEnvelope<InviteCodeRecord>> {
    return this.#request("PATCH", `/invite-codes/${encodeURIComponent(id)}`, {
      body: typeof input === "boolean" ? { enabled: input } : input,
      write: options,
    });
  }

  listRechargeCodes(query?: Query): Promise<ApiEnvelope<RechargeCodeRecord[]>> {
    return this.#request("GET", "/recharge-codes", { query });
  }

  generateRechargeCodes(input: JsonObject, options?: WriteOptions): Promise<ApiEnvelope<RechargeCodeRecord[]>> {
    return this.#request("POST", "/recharge-codes", { body: input, write: options });
  }

  setRechargeCodeEnabled(id: string, input: boolean | { enabled: boolean }, options?: WriteOptions): Promise<ApiEnvelope<RechargeCodeRecord>> {
    return this.#request("PATCH", `/recharge-codes/${encodeURIComponent(id)}`, {
      body: typeof input === "boolean" ? { enabled: input } : input,
      write: options,
    });
  }

  listPackages(): Promise<ApiEnvelope<PackageRecord[]>> {
    return this.#request("GET", "/packages");
  }

  createPackage(input: JsonObject, options?: WriteOptions): Promise<ApiEnvelope<PackageRecord>> {
    const normalized = {
      ...input,
      priceCents: input.priceCents ?? Math.round(Number(input.price ?? 0) * 100),
      price: undefined,
    };
    return this.#request("POST", "/packages", { body: normalized, write: options });
  }

  updatePackage(id: string, input: JsonObject, options?: WriteOptions): Promise<ApiEnvelope<PackageRecord>> {
    const normalized = {
      ...input,
      ...(input.priceCents === undefined && input.price !== undefined ? { priceCents: Math.round(Number(input.price) * 100) } : {}),
      price: undefined,
    };
    return this.#request("PATCH", `/packages/${encodeURIComponent(id)}`, { body: normalized, write: options });
  }

  deletePackage(id: string, options?: WriteOptions): Promise<ApiEnvelope<{ deleted: true; id: string }>> {
    return this.#request("DELETE", `/packages/${encodeURIComponent(id)}`, { body: {}, write: options });
  }

  listProviders(): Promise<ApiEnvelope<ProviderList>> {
    return this.#request("GET", "/providers");
  }

  upsertProvider(input: JsonObject, options?: WriteOptions): Promise<ApiEnvelope<ProviderRecord>> {
    const normalized = {
      slug: input.slug ?? input.id,
      name: input.name,
      category: input.category ?? "model",
      endpoint: input.endpoint ?? input.baseUrl ?? null,
      model: input.model ?? "",
    };
    return this.#request("POST", "/providers", { body: normalized, write: options });
  }

  updateProvider(id: string, input: JsonObject, options?: WriteOptions): Promise<ApiEnvelope<ProviderRecord>> {
    const normalized = {
      ...input,
      endpoint: input.endpoint ?? input.baseUrl,
      baseUrl: undefined,
      id: undefined,
    };
    return this.#request("PATCH", `/providers/${encodeURIComponent(id)}`, { body: normalized, write: options });
  }

  setProviderSecret(id: string, input: string | { secret: string }, options?: WriteOptions): Promise<ApiEnvelope<JsonObject>> {
    return this.#request("PUT", `/providers/${encodeURIComponent(id)}/secret`, {
      body: typeof input === "string" ? { secret: input } : input,
      write: options,
    });
  }

  listPartnerKeys(): Promise<ApiEnvelope<PartnerKeyList>> {
    return this.#request("GET", "/partner-keys");
  }

  addPartnerKey(input: JsonObject, options?: WriteOptions): Promise<ApiEnvelope<PartnerKeyRecord>> {
    return this.#request("POST", "/partner-keys", { body: input, write: options });
  }

  updatePartnerKey(id: string, input: JsonObject, options?: WriteOptions): Promise<ApiEnvelope<PartnerKeyRecord>> {
    return this.#request("PATCH", `/partner-keys/${encodeURIComponent(id)}`, { body: input, write: options });
  }

  deletePartnerKey(id: string, options?: WriteOptions): Promise<ApiEnvelope<{ deleted: true; id: string }>> {
    return this.#request("DELETE", `/partner-keys/${encodeURIComponent(id)}`, { body: {}, write: options });
  }

  listTutorials(): Promise<ApiEnvelope<PublishedContent[]>> { return this.#request("GET", "/tutorials"); }
  createTutorial(input: JsonObject, options?: WriteOptions): Promise<ApiEnvelope<PublishedContent>> { return this.#request("POST", "/tutorials", { body: input, write: options }); }
  updateTutorial(id: string, input: JsonObject, options?: WriteOptions): Promise<ApiEnvelope<PublishedContent>> { return this.#request("PATCH", `/tutorials/${encodeURIComponent(id)}`, { body: input, write: options }); }
  deleteTutorial(id: string, options?: WriteOptions): Promise<ApiEnvelope<{ deleted: true; id: string }>> { return this.#request("DELETE", `/tutorials/${encodeURIComponent(id)}`, { body: {}, write: options }); }
  publishTutorial(id: string, input: boolean | { published?: boolean } = true, options?: WriteOptions): Promise<ApiEnvelope<PublishedContent>> {
    return this.#request("POST", `/tutorials/${encodeURIComponent(id)}/publish`, { body: typeof input === "boolean" ? { published: input } : input, write: options });
  }

  listAnnouncements(): Promise<ApiEnvelope<PublishedContent[]>> { return this.#request("GET", "/announcements"); }
  createAnnouncement(input: JsonObject, options?: WriteOptions): Promise<ApiEnvelope<PublishedContent>> { return this.#request("POST", "/announcements", { body: input, write: options }); }
  updateAnnouncement(id: string, input: JsonObject, options?: WriteOptions): Promise<ApiEnvelope<PublishedContent>> { return this.#request("PATCH", `/announcements/${encodeURIComponent(id)}`, { body: input, write: options }); }
  deleteAnnouncement(id: string, options?: WriteOptions): Promise<ApiEnvelope<{ deleted: true; id: string }>> { return this.#request("DELETE", `/announcements/${encodeURIComponent(id)}`, { body: {}, write: options }); }
  publishAnnouncement(id: string, input: boolean | { published?: boolean } = true, options?: WriteOptions): Promise<ApiEnvelope<PublishedContent>> {
    return this.#request("POST", `/announcements/${encodeURIComponent(id)}/publish`, { body: typeof input === "boolean" ? { published: input } : input, write: options });
  }

  getRiskPolicy(): Promise<ApiEnvelope<JsonObject>> { return this.#request("GET", "/risk-policy"); }
  updateRiskPolicy(input: JsonObject, options?: WriteOptions): Promise<ApiEnvelope<JsonObject>> { return this.#request("PUT", "/risk-policy", { body: input, write: options }); }
  listAudit(query?: Query): Promise<ApiEnvelope<{ items: JsonObject[]; total: number; revision: number }>> { return this.#request("GET", "/audit", { query }); }
  exportAudit(query?: Query): Promise<ApiEnvelope<string>> { return this.#request("GET", "/audit/export", { query, rawText: true }); }

  redeem(code: string, options?: WriteOptions): Promise<ApiEnvelope<JsonObject>> {
    return this.#request("POST", "/redeem", { body: { code }, write: options });
  }

  submitFeedback(input: { category: string; subject: string; message: string }, options?: WriteOptions): Promise<ApiEnvelope<JsonObject>> {
    return this.#request("POST", "/feedback", { body: input, write: options });
  }

  recordUsageEvent(input: { kind: string; units: number }, options?: WriteOptions): Promise<ApiEnvelope<JsonObject>> {
    return this.#request("POST", "/usage-events", { body: input, write: options });
  }
}

export const controlPlaneClient = new ControlPlaneClient();
export const client = controlPlaneClient;

export const login = (input: Parameters<ControlPlaneClient["login"]>[0]) => controlPlaneClient.login(input);
export const logout = () => controlPlaneClient.logout();
export const register = (input: Parameters<ControlPlaneClient["register"]>[0]) => controlPlaneClient.register(input);
export const rotatePassword = (input: Parameters<ControlPlaneClient["rotatePassword"]>[0]) => controlPlaneClient.rotatePassword(input);
export const me = () => controlPlaneClient.me();
export const clientConfig = () => controlPlaneClient.clientConfig();
export const dashboard = () => controlPlaneClient.dashboard();
export const listMembers = (query?: Query) => controlPlaneClient.listMembers(query);
export const updateMember = (id: string, input: JsonObject, options?: WriteOptions) => controlPlaneClient.updateMember(id, input, options);
export const listInviteCodes = (query?: Query) => controlPlaneClient.listInviteCodes(query);
export const generateInviteCodes = (input: JsonObject, options?: WriteOptions) => controlPlaneClient.generateInviteCodes(input, options);
export const setInviteCodeEnabled = (id: string, input: boolean | { enabled: boolean }, options?: WriteOptions) => controlPlaneClient.setInviteCodeEnabled(id, input, options);
export const listRechargeCodes = (query?: Query) => controlPlaneClient.listRechargeCodes(query);
export const generateRechargeCodes = (input: JsonObject, options?: WriteOptions) => controlPlaneClient.generateRechargeCodes(input, options);
export const setRechargeCodeEnabled = (id: string, input: boolean | { enabled: boolean }, options?: WriteOptions) => controlPlaneClient.setRechargeCodeEnabled(id, input, options);
export const listPackages = () => controlPlaneClient.listPackages();
export const createPackage = (input: JsonObject, options?: WriteOptions) => controlPlaneClient.createPackage(input, options);
export const updatePackage = (id: string, input: JsonObject, options?: WriteOptions) => controlPlaneClient.updatePackage(id, input, options);
export const deletePackage = (id: string, options?: WriteOptions) => controlPlaneClient.deletePackage(id, options);
export const listProviders = () => controlPlaneClient.listProviders();
export const upsertProvider = (input: JsonObject, options?: WriteOptions) => controlPlaneClient.upsertProvider(input, options);
export const updateProvider = (id: string, input: JsonObject, options?: WriteOptions) => controlPlaneClient.updateProvider(id, input, options);
export const setProviderSecret = (id: string, input: string | { secret: string }, options?: WriteOptions) => controlPlaneClient.setProviderSecret(id, input, options);
export const listPartnerKeys = () => controlPlaneClient.listPartnerKeys();
export const addPartnerKey = (input: JsonObject, options?: WriteOptions) => controlPlaneClient.addPartnerKey(input, options);
export const updatePartnerKey = (id: string, input: JsonObject, options?: WriteOptions) => controlPlaneClient.updatePartnerKey(id, input, options);
export const deletePartnerKey = (id: string, options?: WriteOptions) => controlPlaneClient.deletePartnerKey(id, options);
export const listTutorials = () => controlPlaneClient.listTutorials();
export const createTutorial = (input: JsonObject, options?: WriteOptions) => controlPlaneClient.createTutorial(input, options);
export const updateTutorial = (id: string, input: JsonObject, options?: WriteOptions) => controlPlaneClient.updateTutorial(id, input, options);
export const deleteTutorial = (id: string, options?: WriteOptions) => controlPlaneClient.deleteTutorial(id, options);
export const publishTutorial = (id: string, input: boolean | { published?: boolean } = true, options?: WriteOptions) => controlPlaneClient.publishTutorial(id, input, options);
export const listAnnouncements = () => controlPlaneClient.listAnnouncements();
export const createAnnouncement = (input: JsonObject, options?: WriteOptions) => controlPlaneClient.createAnnouncement(input, options);
export const updateAnnouncement = (id: string, input: JsonObject, options?: WriteOptions) => controlPlaneClient.updateAnnouncement(id, input, options);
export const deleteAnnouncement = (id: string, options?: WriteOptions) => controlPlaneClient.deleteAnnouncement(id, options);
export const publishAnnouncement = (id: string, input: boolean | { published?: boolean } = true, options?: WriteOptions) => controlPlaneClient.publishAnnouncement(id, input, options);
export const getRiskPolicy = () => controlPlaneClient.getRiskPolicy();
export const updateRiskPolicy = (input: JsonObject, options?: WriteOptions) => controlPlaneClient.updateRiskPolicy(input, options);
export const listAudit = (query?: Query) => controlPlaneClient.listAudit(query);
export const exportAudit = (query?: Query) => controlPlaneClient.exportAudit(query);
export const redeem = (code: string, options?: WriteOptions) => controlPlaneClient.redeem(code, options);
export const submitFeedback = (input: Parameters<ControlPlaneClient["submitFeedback"]>[0], options?: WriteOptions) => controlPlaneClient.submitFeedback(input, options);
export const recordUsageEvent = (input: Parameters<ControlPlaneClient["recordUsageEvent"]>[0], options?: WriteOptions) => controlPlaneClient.recordUsageEvent(input, options);

export default controlPlaneClient;
