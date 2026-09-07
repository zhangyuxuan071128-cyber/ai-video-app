import type { Tone, UnknownRecord } from "./types";

export function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

export function readString(source: UnknownRecord, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return fallback;
}

export function readNumber(source: UnknownRecord, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return fallback;
}

export function readBoolean(source: UnknownRecord, keys: string[], fallback = false): boolean {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") return value;
    if (value === 1 || value === "true") return true;
    if (value === 0 || value === "false") return false;
  }
  return fallback;
}

export function readArray(source: UnknownRecord, keys: string[]): UnknownRecord[] {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value.map(asRecord);
    const nested = asRecord(value);
    if (Array.isArray(nested.items)) return (nested.items as unknown[]).map(asRecord);
  }
  return [];
}

export function itemId(item: UnknownRecord, fallback: string): string {
  return readString(item, ["id", "keyId", "memberId", "providerId", "codeId", "packageId", "auditId"], fallback);
}

export function itemStatus(item: UnknownRecord): string {
  return readString(item, ["status", "state"], readBoolean(item, ["enabled", "isEnabled", "active"], true) ? "enabled" : "disabled").toLowerCase();
}

export function statusTone(status: string): Tone {
  const normalized = status.toLowerCase();
  if (["ready", "healthy", "active", "enabled", "connected", "published", "success", "completed", "approved"].includes(normalized)) return "success";
  if (["warning", "degraded", "partial", "pending", "queued", "processing", "review", "unconfigured", "config_required"].includes(normalized)) return "warning";
  if (["failed", "error", "offline", "blocked", "frozen", "rejected", "revoked", "critical"].includes(normalized)) return "danger";
  if (["info", "unknown", "draft"].includes(normalized)) return "info";
  return "neutral";
}

export function formatDate(value: unknown, withTime = true): string {
  if (typeof value !== "string" && typeof value !== "number") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: withTime ? undefined : "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(date);
}

export function formatNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

export function formatMoney(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  }).format(value);
}

export function maskLast4(item: UnknownRecord): string {
  const last4 = readString(item, ["last4", "secretLast4", "keyLast4", "apiKeyLast4"]);
  return last4 ? `•••• ${last4.slice(-4)}` : "未配置";
}

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{ \"error\": \"数据无法序列化\" }";
  }
}

export function extractItems(value: unknown, keys: string[]): UnknownRecord[] {
  if (Array.isArray(value)) return value.map(asRecord);
  const source = asRecord(value);
  const direct = readArray(source, keys);
  if (direct.length) return direct;
  const data = asRecord(source.data);
  return readArray(data, keys);
}
