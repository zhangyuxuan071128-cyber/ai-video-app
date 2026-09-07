import * as controlPlaneModule from "../control-plane/client";
import type { AdminIdentity, EnvironmentSignal, UnknownRecord } from "./types";

type UnknownFunction = (...args: unknown[]) => unknown;

export class ControlPlaneError extends Error {
  code?: string;
  status?: number;

  constructor(message: string, options?: { code?: string; status?: number }) {
    super(message);
    this.name = "ControlPlaneError";
    this.code = options?.code;
    this.status = options?.status;
  }
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function errorFrom(value: unknown): ControlPlaneError {
  if (value instanceof ControlPlaneError) return value;
  if (value instanceof Error) {
    const details = record(value);
    return new ControlPlaneError(value.message, {
      code: stringValue(details.code) || undefined,
      status: typeof details.status === "number" ? details.status : undefined,
    });
  }
  const details = record(value);
  const nested = record(details.error);
  return new ControlPlaneError(
    stringValue(details.message)
      || stringValue(nested.message)
      || (typeof details.error === "string" ? details.error : "控制面请求未完成"),
    {
      code: stringValue(details.code) || stringValue(nested.code) || undefined,
      status: typeof details.status === "number" ? details.status : undefined,
    },
  );
}

function moduleCandidates(): UnknownRecord[] {
  const direct = controlPlaneModule as unknown as UnknownRecord;
  return [
    direct,
    record(direct.default),
    record(direct.client),
    record(direct.controlPlaneClient),
  ];
}

function resolveMethod(names: string[]): UnknownFunction {
  for (const candidate of moduleCandidates()) {
    for (const name of names) {
      const method = candidate[name];
      if (typeof method === "function") return method as UnknownFunction;
    }
  }
  throw new ControlPlaneError(`控制面客户端缺少方法：${names[0]}`, { code: "CLIENT_METHOD_MISSING" });
}

function unwrap<T>(value: unknown): T {
  const envelope = record(value);
  if (envelope.ok === false || envelope.success === false) throw errorFrom(envelope);
  if ("data" in envelope) return envelope.data as T;
  return value as T;
}

async function invoke<T>(names: string | string[], ...args: unknown[]): Promise<T> {
  try {
    const method = resolveMethod(Array.isArray(names) ? names : [names]);
    return unwrap<T>(await method(...args));
  } catch (error) {
    throw errorFrom(error);
  }
}

function normalizeIdentity(value: unknown): AdminIdentity {
  const outer = record(value);
  const source = record(outer.member ?? outer.user ?? outer.admin ?? outer.identity ?? outer.me ?? value);
  const id = stringValue(source.id ?? source.userId ?? source.adminId);
  const username = stringValue(source.username ?? source.account ?? source.email);
  const role = stringValue(source.role);
  if (!id || !username || !role) {
    throw new ControlPlaneError("控制面返回的管理身份不完整，已拒绝建立会话。", { code: "AUTH_RESPONSE_INVALID" });
  }
  return {
    id,
    username,
    displayName: stringValue(source.displayName ?? source.nickname ?? source.name, username),
    role,
    mustRotatePassword: booleanValue(outer.mustRotatePassword ?? source.mustRotatePassword ?? source.must_rotate_password),
  };
}

export function asRecord(value: unknown): UnknownRecord {
  return record(value);
}

export function asArray(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) return value.map(record);
  const source = record(value);
  for (const key of ["items", "rows", "results", "members", "codes", "packages", "providers", "keys", "tutorials", "announcements", "logs"]) {
    if (Array.isArray(source[key])) return (source[key] as unknown[]).map(record);
  }
  return [];
}

export function displayError(error: unknown): { message: string; code?: string } {
  const normalized = errorFrom(error);
  const configPrefix = normalized.code === "CONFIG_REQUIRED" ? "CONFIG_REQUIRED · " : "";
  return { message: `${configPrefix}${normalized.message}`, code: normalized.code };
}

export function readEnvironment(value: unknown): EnvironmentSignal {
  const source = record(value);
  const environment = record(source.environment);
  const adapters = record(source.adapters ?? source.adapter);
  const rawState = stringValue(
    environment.adapterState
      ?? source.adapterState
      ?? adapters.state
      ?? adapters.status,
    "unknown",
  ).toLowerCase();
  const adapterState: EnvironmentSignal["adapterState"] =
    ["ready", "healthy", "connected", "ok"].includes(rawState) ? "ready"
      : ["degraded", "partial", "warning", "config_required"].includes(rawState) ? "degraded"
        : ["offline", "down", "error", "failed"].includes(rawState) ? "offline"
          : "unknown";
  return {
    environment: stringValue(environment.name ?? source.environmentName ?? source.env, "真实环境状态未上报"),
    adapterState,
    adapterLabel: stringValue(environment.adapterLabel ?? source.adapterLabel ?? adapters.message, adapterState === "unknown" ? "适配器状态未上报" : rawState),
  };
}

export const controlApi = {
  login: async (payload: { username: string; password: string }) => normalizeIdentity(await invoke("login", { ...payload, portal: "admin" })),
  logout: async () => invoke<void>("logout"),
  rotatePassword: async (payload: { currentPassword: string; newPassword: string }) => invoke("rotatePassword", payload),
  me: async () => normalizeIdentity(await invoke("me")),
  dashboard: async () => invoke<unknown>("dashboard"),
  listMembers: async (query?: UnknownRecord) => invoke<unknown>("listMembers", query),
  updateMember: async (id: string, payload: UnknownRecord) => invoke<unknown>("updateMember", id, payload),
  generateInviteCodes: async (payload: UnknownRecord) => invoke<unknown>("generateInviteCodes", payload),
  setInviteCodeEnabled: async (id: string, enabled: boolean) => invoke<unknown>("setInviteCodeEnabled", id, { enabled }),
  generateRechargeCodes: async (payload: UnknownRecord) => invoke<unknown>("generateRechargeCodes", payload),
  setRechargeCodeEnabled: async (id: string, enabled: boolean) => invoke<unknown>("setRechargeCodeEnabled", id, { enabled }),
  listPackages: async () => invoke<unknown>("listPackages"),
  createPackage: async (payload: UnknownRecord) => invoke<unknown>("createPackage", payload),
  updatePackage: async (id: string, payload: UnknownRecord) => invoke<unknown>("updatePackage", id, payload),
  deletePackage: async (id: string) => invoke<unknown>("deletePackage", id),
  listProviders: async () => invoke<unknown>("listProviders"),
  upsertProvider: async (payload: UnknownRecord) => invoke<unknown>("upsertProvider", payload),
  updateProvider: async (id: string, payload: UnknownRecord) => invoke<unknown>("updateProvider", id, payload),
  setProviderSecret: async (id: string, secret: string) => invoke<unknown>("setProviderSecret", id, { secret }),
  listPartnerKeys: async () => invoke<unknown>("listPartnerKeys"),
  addPartnerKey: async (payload: UnknownRecord) => invoke<unknown>("addPartnerKey", payload),
  updatePartnerKey: async (id: string, payload: UnknownRecord) => invoke<unknown>("updatePartnerKey", id, payload),
  deletePartnerKey: async (id: string) => invoke<unknown>("deletePartnerKey", id),
  listTutorials: async () => invoke<unknown>(["listTutorials", "listTutorial"]),
  createTutorial: async (payload: UnknownRecord) => invoke<unknown>("createTutorial", payload),
  updateTutorial: async (id: string, payload: UnknownRecord) => invoke<unknown>("updateTutorial", id, payload),
  deleteTutorial: async (id: string) => invoke<unknown>("deleteTutorial", id),
  publishTutorial: async (id: string, published: boolean) => invoke<unknown>("publishTutorial", id, { published }),
  listAnnouncements: async () => invoke<unknown>(["listAnnouncements", "listAnnouncement"]),
  createAnnouncement: async (payload: UnknownRecord) => invoke<unknown>("createAnnouncement", payload),
  updateAnnouncement: async (id: string, payload: UnknownRecord) => invoke<unknown>("updateAnnouncement", id, payload),
  deleteAnnouncement: async (id: string) => invoke<unknown>("deleteAnnouncement", id),
  publishAnnouncement: async (id: string, published: boolean) => invoke<unknown>("publishAnnouncement", id, { published }),
  getRiskPolicy: async () => invoke<unknown>("getRiskPolicy"),
  updateRiskPolicy: async (payload: UnknownRecord) => invoke<unknown>("updateRiskPolicy", payload),
  listAudit: async (query?: UnknownRecord) => invoke<unknown>("listAudit", query),
  exportAudit: async (query?: UnknownRecord) => invoke<unknown>("exportAudit", query),
};
