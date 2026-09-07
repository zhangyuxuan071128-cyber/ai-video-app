export type Portal = "member" | "admin";
export type MemberRole = "user" | "agent" | "admin" | "super_admin";
export type MemberStatus = "active" | "frozen" | "disabled";

export interface ApiEnvelope<T> {
  data: T;
  revision?: number;
  auditId?: string;
  idempotentReplay?: boolean;
}

export interface ControlPlaneErrorBody {
  code: string;
  message: string;
  requestId?: string;
  details?: unknown;
}

export interface Member {
  id: string;
  username: string;
  nickname: string;
  role: MemberRole;
  status: MemberStatus;
  mustRotatePassword: boolean;
  bootstrap: boolean;
  freeCredits: number;
  paidCredits: number;
  dailyQuota: number;
  usageToday: number;
  usageDate: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface AuthResult {
  member: Member;
  user: Member;
  mustRotatePassword: boolean;
  portal: Portal;
}

export interface PackageRecord {
  id: string;
  name: string;
  description: string;
  credits: number;
  priceCents: number;
  price: number;
  enabled: boolean;
  status: "enabled" | "disabled";
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ProviderRecord {
  id: string;
  slug: string;
  name: string;
  category: string;
  model: string;
  endpoint: string | null;
  baseUrl: string | null;
  enabled: boolean;
  adapterStatus: "unconfigured";
  credentialStatus: "absent" | "stored";
  secretLast4: string | null;
  operationalStatus: "unavailable";
  truthfulStatusReason: "LIVE_ADAPTER_NOT_INSTALLED";
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ProviderList {
  providers: ProviderRecord[];
  items: ProviderRecord[];
  vaultConfigured: boolean;
  adapterState: "unconfigured";
}

export interface PartnerKeyRecord {
  id: string;
  partnerName: string;
  providerId: string;
  label: string;
  enabled: boolean;
  secretLast4: string;
  credentialStatus: "stored";
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface PartnerKeyList {
  keys: PartnerKeyRecord[];
  partnerKeys: PartnerKeyRecord[];
  items: PartnerKeyRecord[];
  vaultConfigured: boolean;
}

export interface InviteCodeRecord {
  id: string;
  prefix: string;
  last4: string;
  code?: string;
  enabled: boolean;
  maxUses: number;
  uses: number;
  usedCount: number;
  giftCredits: 0;
  expiresAt: string | null;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface RechargeCodeRecord {
  id: string;
  prefix: string;
  last4: string;
  code?: string;
  packageId: string | null;
  creditAmount: number;
  credits: number;
  value: number | null;
  enabled: boolean;
  redeemedBy: string | null;
  redeemedAt: string | null;
  expiresAt: string | null;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface PublishedContent {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  status: "draft" | "published";
  publishedAt: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ClientConfig {
  executionMode: "unconfigured";
  externalGenerationEnabled: false;
  externalAdaptersConfigured: false;
  features: {
    rechargeRedemption: boolean;
    feedback: boolean;
    nonFinancialUsageReporting: boolean;
    liveProviderExecution: false;
    livePayments: false;
  };
  visibleSettings: { dailyQuota: number; maxDailyQuota: number };
  packages: PackageRecord[];
  tutorials: PublishedContent[];
  announcements: PublishedContent[];
  providers: ProviderRecord[];
  member: Member;
  revision: number;
}

export interface WriteOptions {
  idempotencyKey?: string;
  expectedVersion?: number;
}

export type Query = Record<string, string | number | boolean | undefined | null>;
