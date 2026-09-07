export type AdminView =
  | "dashboard"
  | "members"
  | "codes"
  | "packages"
  | "providers"
  | "partner-keys"
  | "content"
  | "risk"
  | "audit";

export type AsyncStatus = "idle" | "loading" | "success" | "error";
export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

export interface AdminIdentity {
  id: string;
  username: string;
  displayName: string;
  role: string;
  mustRotatePassword: boolean;
}

export interface EnvironmentSignal {
  environment: string;
  adapterState: "ready" | "degraded" | "offline" | "unknown";
  adapterLabel: string;
}

export interface NavItem {
  id: AdminView;
  label: string;
  shortLabel: string;
  description: string;
  keywords: string;
}

export interface Notice {
  id: number;
  tone: "success" | "error" | "info";
  title: string;
  message?: string;
}

export interface ResourceState<T> {
  status: AsyncStatus;
  data: T;
  error: string;
  errorCode?: string;
}

export type UnknownRecord = Record<string, unknown>;
