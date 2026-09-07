import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  APP_STATE_VERSION,
  createSeedState,
  DEMO_SEED_REVISION,
  verifyDemoCredential,
} from "../data/mockData";
import {
  ControlPlaneClientError,
  controlPlaneClient,
  type ClientConfig,
  type Member as ControlPlaneMember,
} from "../control-plane";
import { ALL_FEATURES, TASK_TERMINAL_STATUSES } from "../types/domain";
import type {
  ActionResult,
  AdminSettings,
  AdminUserPatch,
  Announcement,
  AppNotification,
  AppState,
  AuditLog,
  AuditModule,
  CommissionTransaction,
  ComplianceFeature,
  ConnectPlatformInput,
  CreateFeedbackInput,
  CreateTaskInput,
  EntityId,
  FeatureKey,
  Feedback,
  FeedbackStatus,
  GenerationTask,
  LoginInput,
  Material,
  MaterialType,
  PackageTemplate,
  PlatformConnection,
  RechargeCode,
  RegisterInput,
  Session,
  TaskStage,
  Tutorial,
  User,
  UserPreferences,
  UserRole,
  WithdrawalMethod,
  WithdrawalStatus,
} from "../types/domain";

const STATE_STORAGE_KEY = "arcane-video-studio:state";
const AUTH_VAULT_STORAGE_KEY = "arcane-video-studio:auth-vault";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const LOGIN_LOCK_MS = 30 * 60 * 1_000;
const LOGIN_FAILURE_LIMIT = 5;

interface PersistedStateEnvelope {
  version: number;
  seedRevision: string;
  state: AppState;
}

type AuthVault = Record<EntityId, string>;

interface AddMaterialInput {
  type: MaterialType;
  title: string;
  description?: string;
  resourceUrl?: string;
  previewUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  sourceTaskId?: EntityId;
}

interface TaskPatch {
  title?: string;
  prompt?: string;
  dialogue?: string;
}

interface PasswordResetData {
  demoCode: string;
  expiresAt: string;
}

interface StoreSelectors {
  currentUser: User | null;
  currentSession: Session | null;
  isAuthenticated: boolean;
  userTasks: GenerationTask[];
  userMaterials: Material[];
  userConnections: PlatformConnection[];
  userNotifications: AppNotification[];
  unreadCount: number;
  reservedPaidCredits: number;
  availablePaidCredits: number;
  controlPlaneStatus: "idle" | "connected" | "offline" | "error";
  controlPlaneMessage: string;
}

export interface AppStoreValue extends StoreSelectors {
  state: AppState;
  refreshControlPlane: () => Promise<ActionResult>;
  login: (input: LoginInput) => Promise<ActionResult<{ user: User; session: Session }>>;
  register: (
    input: RegisterInput,
  ) => Promise<ActionResult<{ user: User; session: Session }>>;
  requestPasswordReset: (identifier: string) => ActionResult<PasswordResetData>;
  resetPassword: (
    identifier: string,
    code: string,
    newPassword: string,
  ) => Promise<ActionResult<{ user: User; session: Session }>>;
  logout: () => ActionResult;
  resetDemoData: () => ActionResult;
  updatePreferences: (patch: Partial<UserPreferences>) => ActionResult<User>;

  getFeatureAccess: (
    featureKey: FeatureKey,
    platformId?: EntityId,
    source?: "paid" | "self_api",
  ) => ActionResult;
  acceptCompliance: (feature: ComplianceFeature) => ActionResult;

  connectPlatform: (input: ConnectPlatformInput) => Promise<ActionResult<PlatformConnection>>;
  testPlatformConnection: (platformId: EntityId) => Promise<ActionResult<PlatformConnection>>;
  disconnectPlatform: (platformId: EntityId) => ActionResult;

  createTask: (input: CreateTaskInput) => ActionResult<GenerationTask>;
  updateTask: (taskId: EntityId, patch: TaskPatch) => ActionResult<GenerationTask>;
  retryTask: (taskId: EntityId) => ActionResult<GenerationTask>;
  cancelTask: (taskId: EntityId) => ActionResult<GenerationTask>;
  terminateTask: (taskId: EntityId) => ActionResult<GenerationTask>;
  archiveTask: (taskId: EntityId) => ActionResult<GenerationTask>;
  tickTask: (taskId: EntityId) => ActionResult<GenerationTask>;
  tickTasks: () => void;

  addMaterial: (input: AddMaterialInput) => ActionResult<Material>;
  recycleMaterial: (materialId: EntityId) => ActionResult<Material>;
  restoreMaterial: (materialId: EntityId) => ActionResult<Material>;
  purgeMaterial: (materialId: EntityId) => ActionResult;
  purgeExpiredMaterials: () => ActionResult<{ count: number }>;

  markNotificationRead: (notificationId: EntityId, isRead?: boolean) => ActionResult;
  markAllNotificationsRead: () => ActionResult;

  redeemRechargeCode: (
    rawCode: string,
  ) => Promise<ActionResult<{ credits: number; balance: number }>>;
  createRechargeCodes: (
    packageId: EntityId,
    count?: number,
    expiresAt?: string,
  ) => ActionResult<RechargeCode[]>;
  createInviteCode: (maxUses?: number, giftCredits?: number) => ActionResult<string>;
  exchangeCommissionForCredits: (
    amount: number,
  ) => ActionResult<{ credits: number; balance: number }>;
  requestWithdrawal: (
    amount: number,
    method: WithdrawalMethod,
    account: string,
  ) => ActionResult;
  reviewWithdrawal: (
    requestId: EntityId,
    status: Exclude<WithdrawalStatus, "pending">,
    remark?: string,
  ) => ActionResult;

  submitFeedback: (input: CreateFeedbackInput) => Promise<ActionResult<Feedback>>;
  updateFeedbackByAdmin: (
    feedbackId: EntityId,
    status: FeedbackStatus,
    reply?: string,
  ) => ActionResult<Feedback>;
  saveTutorial: (
    tutorial: Omit<Tutorial, "id" | "createdAt" | "updatedAt" | "createdBy"> & {
      id?: EntityId;
    },
  ) => ActionResult<Tutorial>;
  saveAnnouncement: (
    announcement: Omit<
      Announcement,
      "id" | "createdAt" | "updatedAt" | "createdBy"
    > & { id?: EntityId },
  ) => ActionResult<Announcement>;

  updateAdminSettings: (patch: Partial<AdminSettings>) => ActionResult<AdminSettings>;
  updateUserByAdmin: (userId: EntityId, patch: AdminUserPatch) => ActionResult<User>;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

function nowIso(): string {
  return new Date().toISOString();
}

function todayIso(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createId(prefix: string): string {
  const randomPart =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}_${randomPart}`;
}

function getUserAgent(): string {
  return typeof navigator === "undefined" ? "Arcane Studio" : navigator.userAgent.slice(0, 300);
}

function getCurrentSession(state: AppState): Session | null {
  if (!state.currentSessionId) return null;
  const session = state.sessions.find((item) => item.id === state.currentSessionId) ?? null;
  if (!session || session.status !== "active") return null;
  if (Date.parse(session.expiresAt) <= Date.now()) return null;
  return session;
}

function getCurrentUser(state: AppState): User | null {
  const session = getCurrentSession(state);
  return session ? state.users.find((user) => user.id === session.userId) ?? null : null;
}

function controlPlaneRole(role: ControlPlaneMember["role"]): UserRole {
  if (role === "agent") return "agent";
  if (role === "admin" || role === "super_admin") return "admin";
  return "user";
}

function controlledFreeCredits(state: AppState, amount: number): Record<EntityId, number> {
  const firstPlatform = state.platforms[0]?.id ?? "control_plane";
  return Object.fromEntries(
    state.platforms.map((platform) => [platform.id, platform.id === firstPlatform ? amount : 0]),
  );
}

function mergeControlPlaneMember(
  state: AppState,
  member: ControlPlaneMember,
  options: { markLogin?: boolean } = {},
): AppState {
  const existing = state.users.find((user) => user.id === member.id);
  const timestamp = nowIso();
  const mapped: User = {
    id: member.id,
    username: member.username,
    nickname: member.nickname,
    phone: existing?.phone,
    avatarUrl: existing?.avatarUrl,
    avatarInitials: existing?.avatarInitials ?? member.nickname.slice(0, 1).toUpperCase(),
    role: controlPlaneRole(member.role),
    status: member.status === "active" ? "active" : "frozen",
    authKind: "server",
    freezeRemark: member.status === "active" ? undefined : "账号已由超级管理端停用",
    freeCredits: controlledFreeCredits(state, member.freeCredits),
    paidCredits: member.paidCredits,
    selfApiDailyLimit: member.dailyQuota,
    selfApiCallsToday: member.usageToday,
    selfApiUsageDate: member.usageDate,
    loginFailCount: 0,
    preferences: existing?.preferences ?? {
      popupNotifications: true,
      voiceNotifications: false,
      browserNotifications: false,
      voiceName: "晓晓",
      reducedMotion: false,
    },
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
    lastLoginAt: options.markLogin ? timestamp : existing?.lastLoginAt,
    lastLoginIp: existing?.lastLoginIp,
  };

  const hasFeatures = state.featureSwitches.some((feature) => feature.userId === member.id);
  const hasCommission = state.commissionAccounts.some((account) => account.userId === member.id);

  return {
    ...state,
    users: existing
      ? state.users.map((user) => (user.id === member.id ? mapped : user))
      : [...state.users, mapped],
    featureSwitches: hasFeatures
      ? state.featureSwitches
      : [
          ...state.featureSwitches,
          ...ALL_FEATURES.map((featureKey) => ({
            id: createId("feature"),
            userId: member.id,
            featureKey,
            isEnabled: false,
            updatedAt: timestamp,
          })),
        ],
    commissionAccounts: hasCommission
      ? state.commissionAccounts
      : [
          ...state.commissionAccounts,
          {
            id: createId("commission"),
            userId: member.id,
            totalEarned: 0,
            availableBalance: 0,
            pendingWithdrawal: 0,
            exchangedCredits: 0,
            withdrawnAmount: 0,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
  };
}

function mergeControlPlaneConfig(state: AppState, config: ClientConfig): AppState {
  const withMember = mergeControlPlaneMember(state, config.member);
  const providerBySlug = new Map(config.providers.map((provider) => [provider.slug, provider]));
  const tutorials: Tutorial[] = config.tutorials.map((item, index) => ({
    id: item.id,
    category: ["getting_started", "api_binding", "video_creation", "affiliate", "faq"].includes(item.category)
      ? item.category as Tutorial["category"]
      : "getting_started",
    title: item.title,
    summary: item.summary,
    content: item.content,
    durationMinutes: 1,
    sortOrder: index + 1,
    isPinned: false,
    isPublished: true,
    viewCount: 0,
    createdBy: item.createdBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
  const announcements: Announcement[] = config.announcements.map((item, index) => ({
    id: item.id,
    type: "notice",
    title: item.title,
    content: item.content || item.summary,
    sortOrder: index + 1,
    isActive: true,
    startsAt: item.publishedAt ?? item.createdAt,
    endsAt: "2099-12-31T23:59:59.000Z",
    createdBy: item.createdBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));

  return {
    ...withMember,
    platforms: withMember.platforms.map((platform) => {
      const controlled = providerBySlug.get(platform.slug);
      return controlled
        ? {
            ...platform,
            isEnabled: controlled.enabled && controlled.operationalStatus !== "unavailable",
            apiBaseUrl: controlled.endpoint ?? platform.apiBaseUrl,
            updatedAt: controlled.updatedAt,
          }
        : platform;
    }),
    packageTemplates: config.packages.map((item) => ({
      id: item.id,
      name: item.name,
      subtitle: item.description,
      value: item.priceCents / 100,
      credits: item.credits,
      isActive: item.enabled,
      createdBy: "control_plane",
      createdAt: item.createdAt,
    })),
    tutorials,
    announcements,
    adminSettings: {
      ...withMember.adminSettings,
      globalSelfApiEnabled: config.externalGenerationEnabled,
      withdrawalsEnabled: false,
      commissionExchangeEnabled: false,
      updatedAt: nowIso(),
      updatedBy: "control_plane",
    },
  };
}

function controlPlaneFailure<T = undefined>(error: ControlPlaneClientError): ActionResult<T> {
  return {
    ok: false,
    code: error.code,
    message: error.message,
  };
}

function normalizeTemporalState(state: AppState): AppState {
  const now = Date.now();
  const today = todayIso();
  const sessions = state.sessions.map((session) =>
    session.status === "active" && Date.parse(session.expiresAt) <= now
      ? { ...session, status: "expired" as const }
      : session,
  );
  const currentSession = state.currentSessionId
    ? sessions.find((session) => session.id === state.currentSessionId)
    : undefined;
  return {
    ...state,
    currentSessionId:
      currentSession?.status === "active" ? state.currentSessionId : null,
    sessions,
    users: state.users.map((user) =>
      user.selfApiUsageDate === today
        ? user
        : {
            ...user,
            selfApiCallsToday: 0,
            selfApiUsageDate: today,
          },
    ),
    platformConnections: state.platformConnections.map((connection) =>
      connection.usageDate === today
        ? connection
        : {
            ...connection,
            dailyCallsUsed: 0,
            usageDate: today,
          },
    ),
    rechargeCodes: state.rechargeCodes.map((code) =>
      code.status === "active" && code.expiresAt && Date.parse(code.expiresAt) <= now
        ? { ...code, status: "expired" as const }
        : code,
    ),
    inviteCodes: state.inviteCodes.map((code) =>
      code.status === "active" && code.expiresAt && Date.parse(code.expiresAt) <= now
        ? { ...code, status: "expired" as const }
        : code,
    ),
    announcements: state.announcements.map((announcement) =>
      announcement.isActive && Date.parse(announcement.endsAt) <= now
        ? { ...announcement, isActive: false }
        : announcement,
    ),
    materials: state.materials.filter(
      (material) =>
        !material.isDeleted ||
        !material.recycleExpiresAt ||
        Date.parse(material.recycleExpiresAt) > now,
    ),
  };
}

function loadInitialState(): AppState {
  if (typeof window === "undefined") return normalizeTemporalState(createSeedState());
  try {
    const raw = window.localStorage.getItem(STATE_STORAGE_KEY);
    if (!raw) return normalizeTemporalState(createSeedState());
    const envelope = JSON.parse(raw) as Partial<PersistedStateEnvelope>;
    if (
      envelope.version !== APP_STATE_VERSION ||
      envelope.seedRevision !== DEMO_SEED_REVISION ||
      !envelope.state ||
      !Array.isArray(envelope.state.users) ||
      !Array.isArray(envelope.state.tasks)
    ) {
      window.localStorage.removeItem(STATE_STORAGE_KEY);
      window.localStorage.removeItem(AUTH_VAULT_STORAGE_KEY);
      return normalizeTemporalState(createSeedState());
    }

    const state = normalizeTemporalState(envelope.state);
    const session = getCurrentSession(state);
    if (!session && state.currentSessionId) {
      return {
        ...state,
        currentSessionId: null,
        sessions: state.sessions.map((item) =>
          item.id === state.currentSessionId ? { ...item, status: "expired" as const } : item,
        ),
      };
    }
    return state;
  } catch {
    return normalizeTemporalState(createSeedState());
  }
}

function readAuthVault(): AuthVault {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(AUTH_VAULT_STORAGE_KEY);
    if (!raw) return {};
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as AuthVault)
      : {};
  } catch {
    return {};
  }
}

function writeAuthVault(vault: AuthVault): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(AUTH_VAULT_STORAGE_KEY, JSON.stringify(vault));
    return true;
  } catch {
    return false;
  }
}

async function createPasswordVerifier(userId: EntityId, password: string): Promise<string> {
  const material = new TextEncoder().encode(`arcane-v7.1:${userId}:${password}`);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", material);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  }

  // Compatibility fallback for older embedded webviews. It is a verifier, never plaintext.
  let hash = 2_166_136_261;
  for (const byte of material) {
    hash ^= byte;
    hash = Math.imul(hash, 16_777_619);
  }
  return `fallback-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function fingerprintSecret(secret: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < secret.length; index += 1) {
    hash ^= secret.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function maskApiKey(secret: string): string {
  const trimmed = secret.trim();
  const prefix = trimmed.includes("-") ? trimmed.split("-")[0] : "key";
  const suffix = trimmed.slice(-4).replace(/[^a-zA-Z0-9]/g, "").padStart(4, "•");
  return `${prefix}-••••-${suffix}`;
}

function maskPaymentAccount(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("@")) {
    const [name, domain] = trimmed.split("@");
    return `${name.slice(0, 3)}***@${domain ?? "***"}`;
  }
  if (trimmed.length <= 4) return "****";
  return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
}

function daysFromNowIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1_000).toISOString();
}

function asCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function createSession(userId: EntityId): Session {
  const createdAt = nowIso();
  return {
    id: createId("session"),
    userId,
    status: "active",
    createdAt,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    lastSeenAt: createdAt,
    userAgent: getUserAgent(),
  };
}

function createAudit(
  actor: User,
  module: AuditModule,
  action: string,
  targetId?: EntityId,
  targetType?: string,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
): AuditLog {
  return {
    id: createId("audit"),
    actorUserId: actor.id,
    actorRole: actor.role,
    action,
    module,
    targetId,
    targetType,
    before,
    after,
    ipAddress: "127.0.0.1",
    userAgent: getUserAgent(),
    createdAt: nowIso(),
  };
}

function notification(
  userId: EntityId,
  type: AppNotification["type"],
  title: string,
  content: string,
  extra: Partial<AppNotification> = {},
): AppNotification {
  return {
    id: createId("notice"),
    userId,
    type,
    title,
    content,
    priority: extra.priority ?? "normal",
    isRead: false,
    relatedTaskId: extra.relatedTaskId,
    relatedRechargeId: extra.relatedRechargeId,
    actionHref: extra.actionHref,
    createdAt: nowIso(),
  };
}

function hasConsent(state: AppState, userId: EntityId, feature: ComplianceFeature): boolean {
  return state.complianceConsents.some(
    (consent) => consent.userId === userId && consent.feature === feature,
  );
}

function featureGate(
  state: AppState,
  user: User,
  featureKey: FeatureKey,
  platformId?: EntityId,
  source: "paid" | "self_api" = "paid",
): ActionResult {
  if (user.status === "frozen") {
    return { ok: false, code: "ACCOUNT_FROZEN", message: user.freezeRemark || "账号已被冻结" };
  }

  const platform = platformId
    ? state.platforms.find((item) => item.id === platformId)
    : undefined;
  if (platformId && (!platform || !platform.isEnabled)) {
    return { ok: false, code: "PLATFORM_DISABLED", message: "所选平台当前不可用" };
  }
  if (platform && !platform.supportedFeatures.includes(featureKey)) {
    return { ok: false, code: "FEATURE_UNSUPPORTED", message: "所选平台不支持此项能力" };
  }

  if (source === "paid") {
    const enabled = state.featureSwitches.some(
      (item) =>
        item.userId === user.id && item.featureKey === featureKey && item.isEnabled,
    );
    if (!enabled) {
      return {
        ok: false,
        code: "FEATURE_LOCKED",
        message: "该能力尚未激活，请使用充值码或绑定自有 API",
      };
    }
    if (user.paidCredits <= 0) {
      return { ok: false, code: "NO_CREDITS", message: "创作额度不足，请先充值" };
    }
    return { ok: true, message: "共享额度可用" };
  }

  if (!state.adminSettings.globalSelfApiEnabled) {
    return { ok: false, code: "SELF_API_DISABLED", message: "管理员暂未开放自有 API 通道" };
  }
  if (user.selfApiDailyLimit <= 0) {
    return { ok: false, code: "USER_QUOTA_DISABLED", message: "当前账号未配置自有 API 配额" };
  }
  const callsToday = user.selfApiUsageDate === todayIso() ? user.selfApiCallsToday : 0;
  if (callsToday >= user.selfApiDailyLimit) {
    return { ok: false, code: "USER_QUOTA_REACHED", message: "今日自有 API 调用额度已用完" };
  }
  if (!platformId) return { ok: true, message: "自有 API 通道可用" };
  const connection = state.platformConnections.find(
    (item) => item.userId === user.id && item.platformId === platformId,
  );
  if (!connection || !["connected", "degraded"].includes(connection.status)) {
    return { ok: false, code: "PLATFORM_NOT_CONNECTED", message: "请先完成平台 API 绑定" };
  }
  const used = connection.usageDate === todayIso() ? connection.dailyCallsUsed : 0;
  if (connection.dailyMaxSelfQuota <= 0 || used >= connection.dailyMaxSelfQuota) {
    return { ok: false, code: "PLATFORM_QUOTA_REACHED", message: "该平台今日配额已用完" };
  }
  return { ok: true, message: connection.status === "degraded" ? "通道可用，但响应偏慢" : "通道可用" };
}

function stageForProgress(progress: number): TaskStage {
  if (progress < 12) return "preparing";
  if (progress < 25) return "parsing";
  if (progress < 40) return "storyboarding";
  if (progress < 68) return "generating_visuals";
  if (progress < 80) return "synthesizing_voice";
  if (progress < 94) return "compositing";
  if (progress < 100) return "packaging";
  return "done";
}

function estimateTaskCredits(input: CreateTaskInput): number {
  return Math.max(1, Math.min(15, Math.round(input.input.batchCount || 1)));
}

function reservedPaidCreditsFor(state: AppState, userId: EntityId): number {
  return state.tasks
    .filter(
      (task) =>
        task.userId === userId &&
        task.creditSource === "paid" &&
        ["pending", "queued", "processing"].includes(task.status),
    )
    .reduce((total, task) => total + task.creditsEstimated, 0);
}

function reservedSelfApiCallsFor(
  state: AppState,
  userId: EntityId,
  platformId?: EntityId,
): number {
  return state.tasks
    .filter(
      (task) =>
        task.userId === userId &&
        task.creditSource === "self_api" &&
        (!platformId || task.platformId === platformId) &&
        ["pending", "queued", "processing"].includes(task.status),
    )
    .reduce((total, task) => total + task.creditsEstimated, 0);
}

function buildTaskOutputs(task: GenerationTask): GenerationTask["outputs"] {
  return Array.from({ length: task.input.batchCount }, (_, index) => ({
    id: createId("output"),
    episode: index + 1,
    title:
      task.input.batchCount > 1 ? `${task.title} · 第 ${index + 1} 集` : task.title,
    durationSeconds: task.input.durationSeconds,
    downloadUrl: `demo://renders/${task.id}/episode-${index + 1}.mp4`,
    subtitleUrl: `demo://renders/${task.id}/episode-${index + 1}.srt`,
    createdAt: nowIso(),
  }));
}

function completeTask(state: AppState, task: GenerationTask): AppState {
  const account = state.users.find((user) => user.id === task.userId);
  if (!account) return state;
  const timestamp = nowIso();

  if (task.creditSource === "paid" && account.paidCredits < task.creditsEstimated) {
    const failedTask: GenerationTask = {
      ...task,
      status: "failed",
      errorCode: "CREDIT_SETTLEMENT_FAILED",
      errorMessage: "任务结算时额度不足，本次没有扣除额度。",
      completedAt: timestamp,
      updatedAt: timestamp,
    };
    return {
      ...state,
      tasks: state.tasks.map((item) => (item.id === task.id ? failedTask : item)),
      notifications: [
        notification(
          task.userId,
          "task_failed",
          "任务未能结算",
          `《${task.title}》因额度不足已停止，本次未扣费。`,
          { relatedTaskId: task.id, priority: "high", actionHref: `/tasks/${task.id}` },
        ),
        ...state.notifications,
      ],
    };
  }

  const outputs = buildTaskOutputs(task);
  const completedTask: GenerationTask = {
    ...task,
    status: "completed",
    stage: "done",
    progress: 100,
    queuePosition: undefined,
    outputs,
    creditsCharged: task.creditsEstimated,
    completedAt: timestamp,
    updatedAt: timestamp,
  };
  const users = state.users.map((user) => {
    if (user.id !== account.id) return user;
    if (task.creditSource === "paid") {
      return {
        ...user,
        paidCredits: Math.max(0, user.paidCredits - task.creditsEstimated),
        updatedAt: timestamp,
      };
    }
    const calls = user.selfApiUsageDate === todayIso() ? user.selfApiCallsToday : 0;
    return {
      ...user,
      selfApiCallsToday: calls + task.creditsEstimated,
      selfApiUsageDate: todayIso(),
      updatedAt: timestamp,
    };
  });
  const updatedAccount = users.find((user) => user.id === account.id) ?? account;
  const connections = state.platformConnections.map((connection) => {
    if (
      task.creditSource !== "self_api" ||
      connection.userId !== task.userId ||
      connection.platformId !== task.platformId
    ) {
      return connection;
    }
    const calls = connection.usageDate === todayIso() ? connection.dailyCallsUsed : 0;
    return {
      ...connection,
      dailyCallsUsed: calls + task.creditsEstimated,
      usageDate: todayIso(),
      updatedAt: timestamp,
    };
  });
  const generatedMaterials: Material[] = [
    {
      id: createId("material"),
      userId: task.userId,
      type: "project",
      title: task.title,
      description: `${task.input.batchCount} 集生成工程与全部中间素材`,
      resourceUrl: `demo://projects/${task.id}.project`,
      sourceTaskId: task.id,
      isDeleted: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId("material"),
      userId: task.userId,
      type: "video",
      title: `${task.title} · 成片包`,
      description: `${task.input.batchCount} 条 ${task.input.resolution} 成片`,
      resourceUrl: `demo://renders/${task.id}/all-videos.zip`,
      mimeType: "application/zip",
      sourceTaskId: task.id,
      isDeleted: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];

  return {
    ...state,
    users,
    platformConnections: connections,
    tasks: state.tasks.map((item) => (item.id === task.id ? completedTask : item)),
    materials: [...generatedMaterials, ...state.materials],
    usageLogs: [
      {
        id: createId("usage"),
        userId: task.userId,
        platformId: task.platformId,
        featureKey: task.featureKey,
        creditsUsed: task.creditsEstimated,
        creditType: task.creditSource,
        remainingCredits: updatedAccount.paidCredits,
        taskId: task.id,
        description: task.title,
        createdAt: timestamp,
      },
      ...state.usageLogs,
    ],
    notifications: [
      notification(
        task.userId,
        "task_complete",
        "本地模拟任务已完成",
        `《${task.title}》：${state.adminSettings.popupNotificationText || "演示产物已进入素材库。"}当前是本地模拟结果，不可作为真实供应商交付。`,
        { relatedTaskId: task.id, actionHref: `/tasks/${task.id}` },
      ),
      ...state.notifications,
    ],
  };
}

function advanceTask(state: AppState, taskId: EntityId): AppState {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || TASK_TERMINAL_STATUSES.includes(task.status)) return state;
  const timestamp = nowIso();

  if (task.status === "pending") {
    return {
      ...state,
      tasks: state.tasks.map((item) =>
        item.id === task.id
          ? { ...item, status: "queued", progress: 3, queuePosition: 1, updatedAt: timestamp }
          : item,
      ),
    };
  }

  if (task.status === "queued") {
    const processingCount = state.tasks.filter((item) => item.status === "processing").length;
    if (processingCount >= state.adminSettings.maxConcurrentTasks) return state;
    return {
      ...state,
      tasks: state.tasks.map((item) =>
        item.id === task.id
          ? {
              ...item,
              status: "processing",
              stage: "preparing",
              progress: Math.max(8, item.progress),
              queuePosition: undefined,
              startedAt: item.startedAt ?? timestamp,
              updatedAt: timestamp,
            }
          : item,
      ),
    };
  }

  const increment = 7 + ((task.id.length + task.progress) % 7);
  const progress = Math.min(100, task.progress + increment);
  if (task.input.simulateFailure && progress >= 62) {
    const retryLimit = Math.min(task.maxRetries, state.adminSettings.autoRetryLimit);
    if (task.retryCount < retryLimit) {
      return {
        ...state,
        tasks: state.tasks.map((item) =>
          item.id === task.id
            ? {
                ...item,
                status: "queued",
                stage: "preparing",
                progress: 5,
                retryCount: item.retryCount + 1,
                errorCode: "LOCAL_SIMULATED_RETRY",
                errorMessage: `本地失败演练：正在执行第 ${item.retryCount + 1} 次自动重试，未请求真实上游。`,
                updatedAt: timestamp,
              }
            : item,
        ),
      };
    }
    const failedTask: GenerationTask = {
      ...task,
      status: "failed",
      errorCode: "LOCAL_SIMULATED_RETRY_EXHAUSTED",
      errorMessage: "本地失败演练已达到自动重试上限；未请求真实上游，本次未扣除额度。",
      completedAt: timestamp,
      updatedAt: timestamp,
    };
    return {
      ...state,
      tasks: state.tasks.map((item) => (item.id === task.id ? failedTask : item)),
      notifications: [
        notification(
          task.userId,
          "task_failed",
          "本地失败演练已停止",
          `《${task.title}》的模拟任务已停止，未请求真实上游，本次未扣除额度。`,
          { relatedTaskId: task.id, priority: "high", actionHref: `/tasks/${task.id}` },
        ),
        ...state.notifications,
      ],
    };
  }

  if (progress >= 100) return completeTask(state, task);
  return {
    ...state,
    tasks: state.tasks.map((item) =>
      item.id === task.id
        ? { ...item, progress, stage: stageForProgress(progress), updatedAt: timestamp }
        : item,
    ),
  };
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadInitialState);
  const [controlPlaneStatus, setControlPlaneStatus] = useState<StoreSelectors["controlPlaneStatus"]>("idle");
  const [controlPlaneMessage, setControlPlaneMessage] = useState("登录时将验证共享控制平面");
  const stateRef = useRef(state);
  const passwordResetChallenges = useRef(
    new Map<EntityId, { code: string; expiresAt: string }>(),
  );

  const applyState = useCallback((updater: (previous: AppState) => AppState): AppState => {
    const next = updater(stateRef.current);
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  const refreshControlPlane = useCallback(async (): Promise<ActionResult> => {
    const account = getCurrentUser(stateRef.current);
    if (!account || account.authKind !== "server") {
      return { ok: false, code: "REMOTE_SESSION_REQUIRED", message: "当前不是共享控制平面会话" };
    }

    try {
      const response = await controlPlaneClient.clientConfig();
      applyState((previous) => mergeControlPlaneConfig(previous, response.data));
      setControlPlaneStatus("connected");
      setControlPlaneMessage(`共享控制平面在线 · 版本 ${response.data.revision}`);
      return { ok: true, message: "会员配置已与超级管理端同步" };
    } catch (error) {
      if (error instanceof ControlPlaneClientError) {
        if (["ACCOUNT_FROZEN", "UNAUTHENTICATED", "PORTAL_SESSION_MISMATCH"].includes(error.code)) {
          applyState((previous) => ({ ...previous, currentSessionId: null }));
        }
        setControlPlaneStatus("error");
        setControlPlaneMessage(error.message);
        return controlPlaneFailure(error);
      }
      setControlPlaneStatus("offline");
      setControlPlaneMessage("共享控制平面暂不可达，当前保留本地验收状态");
      return { ok: false, code: "CONTROL_PLANE_OFFLINE", message: "共享控制平面暂不可达" };
    }
  }, [applyState]);

  useEffect(() => {
    stateRef.current = state;
    if (typeof window === "undefined") return;
    try {
      const envelope: PersistedStateEnvelope = {
        version: APP_STATE_VERSION,
        seedRevision: DEMO_SEED_REVISION,
        state,
      };
      window.localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(envelope));
    } catch {
      // The app remains fully usable in memory when storage is blocked or full.
    }
  }, [state]);

  useEffect(() => {
    const account = getCurrentUser(stateRef.current);
    if (!account || account.authKind !== "server") return;
    void refreshControlPlane();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshControlPlane();
    }, 20_000);
    return () => window.clearInterval(interval);
  }, [state.currentSessionId, refreshControlPlane]);

  const login = useCallback(
    async (input: LoginInput): Promise<ActionResult<{ user: User; session: Session }>> => {
      const username = input.username.trim().toLowerCase();
      try {
        const remote = await controlPlaneClient.login({
          username,
          password: input.password,
          portal: "member",
        });
        const session = createSession(remote.data.member.id);
        const timestamp = nowIso();
        const next = applyState((previous) => {
          const controlled = mergeControlPlaneMember(previous, remote.data.member, { markLogin: true });
          return {
            ...controlled,
            currentSessionId: session.id,
            sessions: [session, ...controlled.sessions].slice(0, 40),
            loginLogs: [
              {
                id: createId("login"),
                userId: remote.data.member.id,
                username,
                ipAddress: "control-plane",
                userAgent: getUserAgent(),
                status: "success" as const,
                createdAt: timestamp,
              },
              ...controlled.loginLogs,
            ].slice(0, 250),
          };
        });
        setControlPlaneStatus("connected");
        setControlPlaneMessage(`共享控制平面在线 · 版本 ${remote.revision ?? "最新"}`);
        return {
          ok: true,
          message: `欢迎回来，${remote.data.member.nickname}`,
          data: {
            user: next.users.find((user) => user.id === remote.data.member.id)!,
            session,
          },
        };
      } catch (error) {
        if (error instanceof ControlPlaneClientError) {
          setControlPlaneStatus("error");
          setControlPlaneMessage(error.message);
          return controlPlaneFailure<{ user: User; session: Session }>(error);
        }
        setControlPlaneStatus("offline");
        setControlPlaneMessage("共享控制平面暂不可达，使用本地验收身份");
      }

      const snapshot = stateRef.current;
      const account = snapshot.users.find((user) => user.username.toLowerCase() === username);
      const timestamp = nowIso();

      if (!account) {
        applyState((previous) => ({
          ...previous,
          loginLogs: [
            {
              id: createId("login"),
              username,
              ipAddress: "127.0.0.1",
              userAgent: getUserAgent(),
              status: "failed" as const,
              failureReason: "账号或密码错误",
              createdAt: timestamp,
            },
            ...previous.loginLogs,
          ].slice(0, 250),
        }));
        return { ok: false, code: "INVALID_CREDENTIALS", message: "账号或密码错误" };
      }

      if (account.lockedUntil && Date.parse(account.lockedUntil) > Date.now()) {
        return {
          ok: false,
          code: "ACCOUNT_LOCKED",
          message: `连续登录失败次数过多，请在 ${new Date(account.lockedUntil).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 后重试`,
        };
      }
      if (account.status === "frozen") {
        applyState((previous) => ({
          ...previous,
          loginLogs: [
            {
              id: createId("login"),
              userId: account.id,
              username,
              ipAddress: "127.0.0.1",
              userAgent: getUserAgent(),
              status: "frozen" as const,
              failureReason: account.freezeRemark || "账号冻结",
              createdAt: timestamp,
            },
            ...previous.loginLogs,
          ].slice(0, 250),
        }));
        return {
          ok: false,
          code: "ACCOUNT_FROZEN",
          message: account.freezeRemark || "账号已被冻结，请联系管理员",
        };
      }

      const vault = readAuthVault();
      const storedVerifier = vault[account.id];
      const valid = storedVerifier
        ? (await createPasswordVerifier(account.id, input.password)) === storedVerifier
        : verifyDemoCredential(username, input.password) === account.id;

      if (!valid) {
        const failureCount =
          account.lockedUntil && Date.parse(account.lockedUntil) <= Date.now()
            ? 1
            : account.loginFailCount + 1;
        const lockedUntil =
          failureCount >= LOGIN_FAILURE_LIMIT
            ? new Date(Date.now() + LOGIN_LOCK_MS).toISOString()
            : undefined;
        applyState((previous) => ({
          ...previous,
          users: previous.users.map((user) =>
            user.id === account.id
              ? { ...user, loginFailCount: failureCount, lockedUntil, updatedAt: timestamp }
              : user,
          ),
          loginLogs: [
            {
              id: createId("login"),
              userId: account.id,
              username,
              ipAddress: "127.0.0.1",
              userAgent: getUserAgent(),
              status: lockedUntil ? ("locked" as const) : ("failed" as const),
              failureReason: lockedUntil ? "连续失败 5 次，锁定 30 分钟" : "账号或密码错误",
              createdAt: timestamp,
            },
            ...previous.loginLogs,
          ].slice(0, 250),
        }));
        return lockedUntil
          ? { ok: false, code: "ACCOUNT_LOCKED", message: "连续失败 5 次，账号已锁定 30 分钟" }
          : {
              ok: false,
              code: "INVALID_CREDENTIALS",
              message: `账号或密码错误，还可尝试 ${LOGIN_FAILURE_LIMIT - failureCount} 次`,
            };
      }

      const session = createSession(account.id);
      const next = applyState((previous) => ({
        ...previous,
        currentSessionId: session.id,
        sessions: [session, ...previous.sessions].slice(0, 40),
        users: previous.users.map((user) =>
          user.id === account.id
            ? {
                ...user,
                loginFailCount: 0,
                lockedUntil: undefined,
                lastLoginAt: timestamp,
                lastLoginIp: "127.0.0.1",
                updatedAt: timestamp,
              }
            : user,
        ),
        loginLogs: [
          {
            id: createId("login"),
            userId: account.id,
            username,
            ipAddress: "127.0.0.1",
            userAgent: getUserAgent(),
            status: "success" as const,
            createdAt: timestamp,
          },
          ...previous.loginLogs,
        ].slice(0, 250),
      }));
      return {
        ok: true,
        message: `欢迎回来，${account.nickname}`,
        data: { user: next.users.find((user) => user.id === account.id)!, session },
      };
    },
    [applyState],
  );

  const register = useCallback(
    async (
      input: RegisterInput,
    ): Promise<ActionResult<{ user: User; session: Session }>> => {
      const username = input.username.trim().toLowerCase();
      const inviteValue = input.inviteCode.trim().toUpperCase();
      const snapshot = stateRef.current;
      if (!/^[a-z0-9_\-\u4e00-\u9fa5]{3,24}$/i.test(username)) {
        return { ok: false, code: "INVALID_USERNAME", message: "账号需为 3–24 位字母、数字、中文或下划线" };
      }
      if (input.password.length < 6) {
        return { ok: false, code: "WEAK_PASSWORD", message: "密码至少需要 6 位" };
      }

      try {
        const remote = await controlPlaneClient.register({
          username,
          password: input.password,
          inviteCode: inviteValue,
          nickname: input.nickname?.trim() || username,
        });
        const session = createSession(remote.data.member.id);
        const next = applyState((previous) => {
          const controlled = mergeControlPlaneMember(previous, remote.data.member, { markLogin: true });
          return {
            ...controlled,
            currentSessionId: session.id,
            sessions: [session, ...controlled.sessions].slice(0, 40),
          };
        });
        setControlPlaneStatus("connected");
        setControlPlaneMessage(`共享控制平面在线 · 版本 ${remote.revision ?? "最新"}`);
        return {
          ok: true,
          message: "注册成功，账号已写入共享控制平面",
          data: {
            user: next.users.find((user) => user.id === remote.data.member.id)!,
            session,
          },
        };
      } catch (error) {
        if (error instanceof ControlPlaneClientError) {
          setControlPlaneStatus("error");
          setControlPlaneMessage(error.message);
          return controlPlaneFailure<{ user: User; session: Session }>(error);
        }
        setControlPlaneStatus("offline");
        setControlPlaneMessage("共享控制平面暂不可达，注册仅保存到当前浏览器");
      }

      if (snapshot.users.some((user) => user.username.toLowerCase() === username)) {
        return { ok: false, code: "USERNAME_TAKEN", message: "该账号已被注册" };
      }
      if (input.phone && snapshot.users.some((user) => user.phone === input.phone?.trim())) {
        return { ok: false, code: "PHONE_TAKEN", message: "该手机号已绑定其他账号" };
      }
      const invite = snapshot.inviteCodes.find((code) => code.code === inviteValue);
      if (
        !invite ||
        invite.status !== "active" ||
        invite.usedCount >= invite.maxUses ||
        (invite.expiresAt && Date.parse(invite.expiresAt) <= Date.now())
      ) {
        return { ok: false, code: "INVALID_INVITE", message: "邀请码无效、已用完或已过期" };
      }

      const timestamp = nowIso();
      const userId = createId("usr");
      const verifier = await createPasswordVerifier(userId, input.password);
      const latest = stateRef.current;
      const latestInvite = latest.inviteCodes.find((code) => code.id === invite.id);
      if (latest.users.some((user) => user.username.toLowerCase() === username)) {
        return { ok: false, code: "USERNAME_TAKEN", message: "该账号刚刚已被注册" };
      }
      if (input.phone && latest.users.some((user) => user.phone === input.phone?.trim())) {
        return { ok: false, code: "PHONE_TAKEN", message: "该手机号刚刚已绑定其他账号" };
      }
      if (
        !latestInvite ||
        latestInvite.status !== "active" ||
        latestInvite.usedCount >= latestInvite.maxUses ||
        (latestInvite.expiresAt && Date.parse(latestInvite.expiresAt) <= Date.now())
      ) {
        return { ok: false, code: "INVITE_EXHAUSTED", message: "邀请码刚刚已达到使用上限" };
      }
      const vault = readAuthVault();
      if (!writeAuthVault({ ...vault, [userId]: verifier })) {
        return { ok: false, code: "STORAGE_UNAVAILABLE", message: "浏览器未允许本地安全存储，暂时无法注册" };
      }

      const newUser: User = {
        id: userId,
        username,
        nickname: input.nickname?.trim() || username,
        phone: input.phone?.trim() || undefined,
        avatarInitials: (input.nickname?.trim() || username).slice(0, 1).toUpperCase(),
        role: "user",
        status: "active",
        authKind: "local",
        freeCredits: Object.fromEntries(
          snapshot.platforms.map((platform) => [
            platform.id,
            Math.max(platform.freeCredits, invite.giftCredits),
          ]),
        ),
        paidCredits: 0,
        selfApiDailyLimit: 0,
        selfApiCallsToday: 0,
        selfApiUsageDate: todayIso(),
        loginFailCount: 0,
        preferences: {
          popupNotifications: true,
          voiceNotifications: false,
          browserNotifications: false,
          voiceName: "晓晓",
          reducedMotion: false,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const session = createSession(userId);
      applyState((previous) => ({
        ...previous,
        currentSessionId: session.id,
        users: [...previous.users, newUser],
        sessions: [session, ...previous.sessions],
        featureSwitches: [
          ...previous.featureSwitches,
          ...ALL_FEATURES.map((featureKey) => ({
            id: createId("feature"),
            userId,
            featureKey,
            isEnabled: false,
            updatedAt: timestamp,
          })),
        ],
        inviteCodes: previous.inviteCodes.map((code) =>
          code.id === invite.id ? { ...code, usedCount: code.usedCount + 1 } : code,
        ),
        inviteRelations: [
          ...previous.inviteRelations,
          {
            id: createId("relation"),
            userId,
            invitedBy: invite.createdBy,
            inviteCodeId: invite.id,
            createdAt: timestamp,
          },
        ],
        commissionAccounts: [
          ...previous.commissionAccounts,
          {
            id: createId("commission"),
            userId,
            totalEarned: 0,
            availableBalance: 0,
            pendingWithdrawal: 0,
            exchangedCredits: 0,
            withdrawnAmount: 0,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        notifications: [
          notification(
            userId,
            "system",
            "欢迎进入灵境创作中枢",
            "免费额度仅用于平台连接测试；充值或绑定自有 API 后即可开始生成。",
            { actionHref: "/workspace" },
          ),
          ...previous.notifications,
        ],
        loginLogs: [
          {
            id: createId("login"),
            userId,
            username,
            ipAddress: "127.0.0.1",
            userAgent: getUserAgent(),
            status: "success",
            createdAt: timestamp,
          },
          ...previous.loginLogs,
        ],
        auditLogs: [
          createAudit(newUser, "auth", "REGISTER_WITH_INVITE", userId, "user", undefined, {
            inviteCodeId: invite.id,
          }),
          ...previous.auditLogs,
        ],
      }));
      return { ok: true, message: "注册成功，已进入创作中枢", data: { user: newUser, session } };
    },
    [applyState],
  );

  const requestPasswordReset = useCallback(
    (identifier: string): ActionResult<PasswordResetData> => {
      const normalized = identifier.trim().toLowerCase();
      const account = stateRef.current.users.find(
        (user) => user.username.toLowerCase() === normalized || user.phone === identifier.trim(),
      );
      if (!account) {
        return { ok: false, code: "ACCOUNT_NOT_FOUND", message: "未找到与该信息匹配的账号" };
      }
      if (!account.phone) {
        return { ok: false, code: "PHONE_NOT_BOUND", message: "该账号尚未绑定手机号，请联系管理员" };
      }
      const code = "686868";
      const expiresAt = new Date(Date.now() + 5 * 60 * 1_000).toISOString();
      passwordResetChallenges.current.set(account.id, { code, expiresAt });
      return {
        ok: true,
        message: `本地演示验证码已生成（绑定号码 ${account.phone.slice(0, 3)}****${account.phone.slice(-4)}，未发送真实短信）`,
        data: { demoCode: code, expiresAt },
      };
    },
    [],
  );

  const resetPassword = useCallback(
    async (
      identifier: string,
      code: string,
      newPassword: string,
    ): Promise<ActionResult<{ user: User; session: Session }>> => {
      if (newPassword.length < 6) {
        return { ok: false, code: "WEAK_PASSWORD", message: "新密码至少需要 6 位" };
      }
      const normalized = identifier.trim().toLowerCase();
      const account = stateRef.current.users.find(
        (user) => user.username.toLowerCase() === normalized || user.phone === identifier.trim(),
      );
      if (!account) return { ok: false, code: "ACCOUNT_NOT_FOUND", message: "账号不存在" };
      const challenge = passwordResetChallenges.current.get(account.id);
      if (!challenge || challenge.code !== code.trim() || Date.parse(challenge.expiresAt) <= Date.now()) {
        return { ok: false, code: "INVALID_CODE", message: "验证码错误或已过期" };
      }
      const verifier = await createPasswordVerifier(account.id, newPassword);
      const vault = readAuthVault();
      if (!writeAuthVault({ ...vault, [account.id]: verifier })) {
        return { ok: false, code: "STORAGE_UNAVAILABLE", message: "无法写入本地安全存储" };
      }
      passwordResetChallenges.current.delete(account.id);
      const session = createSession(account.id);
      const timestamp = nowIso();
      const next = applyState((previous) => ({
        ...previous,
        currentSessionId: session.id,
        sessions: [session, ...previous.sessions],
        users: previous.users.map((user) =>
          user.id === account.id
            ? { ...user, loginFailCount: 0, lockedUntil: undefined, updatedAt: timestamp }
            : user,
        ),
        auditLogs: [
          createAudit(account, "auth", "RESET_PASSWORD", account.id, "user"),
          ...previous.auditLogs,
        ],
      }));
      return {
        ok: true,
        message: "密码已重置并自动登录",
        data: { user: next.users.find((user) => user.id === account.id)!, session },
      };
    },
    [applyState],
  );

  const logout = useCallback((): ActionResult => {
    const sessionId = stateRef.current.currentSessionId;
    if (!sessionId) return { ok: true, message: "当前已退出" };
    const account = getCurrentUser(stateRef.current);
    if (account?.authKind === "server") {
      void controlPlaneClient.logout().catch(() => {
        // The local session is still revoked immediately; an expired server cookie is harmless.
      });
    }
    applyState((previous) => ({
      ...previous,
      currentSessionId: null,
      sessions: previous.sessions.map((session) =>
        session.id === sessionId ? { ...session, status: "revoked" } : session,
      ),
    }));
    setControlPlaneStatus("idle");
    setControlPlaneMessage("登录时将验证共享控制平面");
    return { ok: true, message: "已安全退出" };
  }, [applyState]);

  const resetDemoData = useCallback((): ActionResult => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STATE_STORAGE_KEY);
        window.localStorage.removeItem(AUTH_VAULT_STORAGE_KEY);
      } catch {
        // Reset still succeeds for the in-memory session when storage is blocked.
      }
    }
    passwordResetChallenges.current.clear();
    const seed = createSeedState();
    stateRef.current = seed;
    setState(seed);
    return { ok: true, message: "演示数据已恢复为 V7.1 初始版本" };
  }, []);

  const updatePreferences = useCallback(
    (patch: Partial<UserPreferences>): ActionResult<User> => {
      const account = getCurrentUser(stateRef.current);
      if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
      const updated: User = {
        ...account,
        preferences: { ...account.preferences, ...patch },
        updatedAt: nowIso(),
      };
      applyState((previous) => ({
        ...previous,
        users: previous.users.map((user) => (user.id === account.id ? updated : user)),
      }));
      return { ok: true, message: "提醒偏好已保存", data: updated };
    },
    [applyState],
  );

  const getFeatureAccess = useCallback(
    (
      featureKey: FeatureKey,
      platformId?: EntityId,
      source: "paid" | "self_api" = "paid",
    ): ActionResult => {
      const account = getCurrentUser(stateRef.current);
      if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
      return featureGate(stateRef.current, account, featureKey, platformId, source);
    },
    [],
  );

  const acceptCompliance = useCallback(
    (feature: ComplianceFeature): ActionResult => {
      const account = getCurrentUser(stateRef.current);
      if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
      if (hasConsent(stateRef.current, account.id, feature)) {
        return { ok: true, message: "已完成合规确认" };
      }
      applyState((previous) => ({
        ...previous,
        complianceConsents: [
          ...previous.complianceConsents,
          {
            id: createId("consent"),
            userId: account.id,
            feature,
            statementVersion: "2026.08",
            acceptedAt: nowIso(),
          },
        ],
      }));
      return { ok: true, message: "已记录原创与授权声明" };
    },
    [applyState],
  );

  const connectPlatform = useCallback(
    async (input: ConnectPlatformInput): Promise<ActionResult<PlatformConnection>> => {
      const account = getCurrentUser(stateRef.current);
      if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
      if (account.authKind === "server") {
        return {
          ok: false,
          code: "MEMBER_PROVIDER_VAULT_NOT_CONFIGURED",
          message: "会员自有 API 的服务端凭据库尚未配置，本次未保存密钥",
        };
      }
      if (!stateRef.current.adminSettings.globalSelfApiEnabled) {
        return { ok: false, code: "SELF_API_DISABLED", message: "管理员暂未开放自有 API 通道" };
      }
      const platform = stateRef.current.platforms.find((item) => item.id === input.platformId);
      if (!platform || !platform.isEnabled) {
        return { ok: false, code: "PLATFORM_DISABLED", message: "平台当前不可用" };
      }
      if (input.apiKey.trim().length < 8) {
        return { ok: false, code: "INVALID_API_KEY", message: "请粘贴完整的 API Key" };
      }
      if (!input.appName.trim()) {
        return { ok: false, code: "APP_NAME_REQUIRED", message: "请填写应用名称" };
      }

      const timestamp = nowIso();
      const fingerprint = `${platform.slug}:${fingerprintSecret(input.apiKey.trim())}`;
      const existing = stateRef.current.platformConnections.find(
        (item) => item.userId === account.id && item.platformId === platform.id,
      );
      const connecting: PlatformConnection = {
        id: existing?.id ?? createId("connection"),
        userId: account.id,
        platformId: platform.id,
        platformUsername: input.platformUsername?.trim() || undefined,
        appName: input.appName.trim(),
        apiKeyHint: maskApiKey(input.apiKey),
        keyFingerprint: fingerprint,
        status: "connecting",
        statusMessage: "正在验证连接",
        dailyMaxSelfQuota: Math.max(
          1,
          input.dailyMaxSelfQuota ?? (account.selfApiDailyLimit || 20),
        ),
        dailyCallsUsed: existing?.usageDate === todayIso() ? existing.dailyCallsUsed : 0,
        usageDate: todayIso(),
        connectedAt: existing?.connectedAt,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      applyState((previous) => ({
        ...previous,
        platformConnections: existing
          ? previous.platformConnections.map((item) =>
              item.id === existing.id ? connecting : item,
            )
          : [...previous.platformConnections, connecting],
      }));

      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 420));
      const connected: PlatformConnection = {
        ...connecting,
        status: "connected",
        statusMessage: "本地演示连接 · 未调用真实平台",
        latencyMs: 120 + (Number.parseInt(fingerprint.slice(-2), 16) % 240),
        connectedAt: connecting.connectedAt ?? nowIso(),
        lastTestedAt: nowIso(),
        updatedAt: nowIso(),
      };
      let didCommit = false;
      applyState((previous) => {
        const current = previous.platformConnections.find((item) => item.id === connected.id);
        if (!current || current.keyFingerprint !== fingerprint) return previous;
        didCommit = true;
        return {
          ...previous,
          platformConnections: previous.platformConnections.map((item) =>
            item.id === connected.id ? connected : item,
          ),
          auditLogs: [
            createAudit(account, "platform", "CONNECT_PLATFORM", platform.id, "platform", undefined, {
              appName: connected.appName,
              apiKeyHint: connected.apiKeyHint,
              keyFingerprint: connected.keyFingerprint,
            }),
            ...previous.auditLogs,
          ],
        };
      });
      if (!didCommit) {
        return {
          ok: false,
          code: "CONNECTION_CHANGED",
          message: "连接配置已被另一项操作更新，请查看最新状态",
        };
      }
      return {
        ok: true,
        message: `${platform.name} 演示连接已保存（未调用真实平台）`,
        data: connected,
      };
    },
    [applyState],
  );

  const testPlatformConnection = useCallback(
    async (platformId: EntityId): Promise<ActionResult<PlatformConnection>> => {
      const account = getCurrentUser(stateRef.current);
      if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
      if (account.authKind === "server") {
        return {
          ok: false,
          code: "LIVE_ADAPTER_NOT_CONFIGURED",
          message: "真实供应商测试适配器尚未安装，本次未测试、未扣除额度",
        };
      }
      const connection = stateRef.current.platformConnections.find(
        (item) => item.userId === account.id && item.platformId === platformId,
      );
      if (!connection || !connection.keyFingerprint) {
        return { ok: false, code: "NOT_CONNECTED", message: "请先绑定平台 API" };
      }
      if (connection.status === "connecting") {
        return { ok: false, code: "CONNECTION_BUSY", message: "该连接正在校验，请稍候" };
      }
      const freeBalance = account.freeCredits[platformId] ?? 0;
      if (freeBalance <= 0 && account.paidCredits <= 0) {
        return { ok: false, code: "NO_TEST_CREDITS", message: "该平台免费测试次数已用完" };
      }
      applyState((previous) => ({
        ...previous,
        platformConnections: previous.platformConnections.map((item) =>
          item.id === connection.id
            ? { ...item, status: "connecting", statusMessage: "正在进行连通测试" }
            : item,
        ),
      }));
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 320));
      const tested: PlatformConnection = {
        ...connection,
        status: "connected",
        statusMessage: "本地演示检查 · 未调用真实平台",
        latencyMs: 110 + (Number.parseInt(connection.keyFingerprint.slice(-2), 16) % 260),
        lastTestedAt: nowIso(),
        updatedAt: nowIso(),
      };
      const currentConnection = stateRef.current.platformConnections.find(
        (item) => item.id === connection.id,
      );
      const currentAccount = stateRef.current.users.find((user) => user.id === account.id);
      if (
        !currentConnection ||
        !currentAccount ||
        currentConnection.keyFingerprint !== connection.keyFingerprint
      ) {
        return {
          ok: false,
          code: "CONNECTION_CHANGED",
          message: "连接已在检查期间被更新或断开，本次未扣除测试额度",
        };
      }
      const currentFreeBalance = currentAccount.freeCredits[platformId] ?? 0;
      if (currentFreeBalance <= 0 && currentAccount.paidCredits <= 0) {
        return { ok: false, code: "NO_TEST_CREDITS", message: "测试额度已被其他操作使用" };
      }
      applyState((previous) => ({
        ...previous,
        users: previous.users.map((user) => {
          if (user.id !== account.id) return user;
          return currentFreeBalance > 0
            ? {
                ...user,
                freeCredits: {
                  ...user.freeCredits,
                  [platformId]: Math.max(0, currentFreeBalance - 1),
                },
                updatedAt: nowIso(),
              }
            : {
                ...user,
                paidCredits: Math.max(0, user.paidCredits - 1),
                updatedAt: nowIso(),
              };
        }),
        platformConnections: previous.platformConnections.map((item) =>
          item.id === connection.id ? tested : item,
        ),
        usageLogs: [
          {
            id: createId("usage"),
            userId: account.id,
            platformId,
            featureKey: "local_upload",
            creditsUsed: 1,
            creditType: currentFreeBalance > 0 ? "free" : "paid",
            remainingCredits:
              currentFreeBalance > 0
                ? Math.max(0, currentFreeBalance - 1)
                : Math.max(0, currentAccount.paidCredits - 1),
            description: "平台 API 连通测试",
            createdAt: nowIso(),
          },
          ...previous.usageLogs,
        ],
      }));
      return {
        ok: true,
        message: `演示连通检查完成 · 模拟 ${tested.latencyMs}ms（未调用真实平台）`,
        data: tested,
      };
    },
    [applyState],
  );

  const disconnectPlatform = useCallback(
    (platformId: EntityId): ActionResult => {
      const account = getCurrentUser(stateRef.current);
      if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
      if (account.authKind === "server") {
        return {
          ok: false,
          code: "MEMBER_PROVIDER_VAULT_NOT_CONFIGURED",
          message: "共享会话没有可由浏览器删除的本地供应商密钥",
        };
      }
      const connection = stateRef.current.platformConnections.find(
        (item) => item.userId === account.id && item.platformId === platformId,
      );
      if (!connection) return { ok: false, code: "NOT_CONNECTED", message: "尚未绑定该平台" };
      applyState((previous) => ({
        ...previous,
        platformConnections: previous.platformConnections.map((item) =>
          item.id === connection.id
            ? {
                ...item,
                status: "disconnected",
                statusMessage: "已断开",
                apiKeyHint: "",
                keyFingerprint: "",
                updatedAt: nowIso(),
              }
            : item,
        ),
        auditLogs: [
          createAudit(account, "platform", "DISCONNECT_PLATFORM", platformId, "platform"),
          ...previous.auditLogs,
        ],
      }));
      return { ok: true, message: "平台连接已安全移除" };
    },
    [applyState],
  );

  const createTask = useCallback(
    (input: CreateTaskInput): ActionResult<GenerationTask> => {
      const snapshot = stateRef.current;
      const account = getCurrentUser(snapshot);
      if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
      if (account.authKind === "server") {
        return {
          ok: false,
          code: "LIVE_ADAPTER_NOT_CONFIGURED",
          message: "超级管理端尚未安装真实生成适配器，本次未创建任务、未预留额度",
        };
      }
      if (!input.title.trim() || !input.input.prompt.trim()) {
        return { ok: false, code: "INVALID_TASK", message: "请填写任务名称和创作提示" };
      }
      if (input.input.batchCount < 1 || input.input.batchCount > 15) {
        return { ok: false, code: "INVALID_BATCH", message: "单次生成数量需为 1–15 集" };
      }
      if (
        snapshot.adminSettings.compliancePopupEnabled &&
        input.featureKey === "link_parse" &&
        !hasConsent(snapshot, account.id, "video_parse")
      ) {
        return { ok: false, code: "COMPLIANCE_REQUIRED", message: "请先确认视频素材原创与授权声明" };
      }
      if (
        snapshot.adminSettings.compliancePopupEnabled &&
        input.featureKey === "voice_clone" &&
        !hasConsent(snapshot, account.id, "voice_clone")
      ) {
        return { ok: false, code: "COMPLIANCE_REQUIRED", message: "请先确认声音为本人或已获得授权" };
      }
      const access = featureGate(snapshot, account, input.featureKey, input.platformId, input.creditSource);
      if (!access.ok) {
        return { ok: false, code: access.code, message: access.message };
      }
      const credits = estimateTaskCredits(input);
      if (input.creditSource === "self_api") {
        const connection = snapshot.platformConnections.find(
          (item) => item.userId === account.id && item.platformId === input.platformId,
        );
        const userCalls = account.selfApiUsageDate === todayIso() ? account.selfApiCallsToday : 0;
        const platformCalls =
          connection?.usageDate === todayIso() ? connection.dailyCallsUsed : 0;
        const reservedForUser = reservedSelfApiCallsFor(snapshot, account.id);
        const reservedForPlatform = reservedSelfApiCallsFor(
          snapshot,
          account.id,
          input.platformId,
        );
        if (userCalls + reservedForUser + credits > account.selfApiDailyLimit) {
          return {
            ok: false,
            code: "USER_QUOTA_INSUFFICIENT",
            message: `今日账号配额不足，当前还可提交 ${Math.max(0, account.selfApiDailyLimit - userCalls - reservedForUser)} 次`,
          };
        }
        if (
          !connection ||
          platformCalls + reservedForPlatform + credits > connection.dailyMaxSelfQuota
        ) {
          return {
            ok: false,
            code: "PLATFORM_QUOTA_INSUFFICIENT",
            message: `该平台今日配额不足，当前还可提交 ${Math.max(0, (connection?.dailyMaxSelfQuota ?? 0) - platformCalls - reservedForPlatform)} 次`,
          };
        }
      }
      if (
        input.creditSource === "paid" &&
        account.paidCredits - reservedPaidCreditsFor(snapshot, account.id) < credits
      ) {
        return { ok: false, code: "CREDITS_RESERVED", message: "可用额度已被进行中的任务预留，请充值或等待任务完成" };
      }
      const timestamp = nowIso();
      const task: GenerationTask = {
        id: createId("task"),
        userId: account.id,
        platformId: input.platformId,
        featureKey: input.featureKey,
        title: input.title.trim(),
        status: "pending",
        stage: "preparing",
        progress: 0,
        input: { ...input.input, batchCount: Math.round(input.input.batchCount) },
        outputs: [],
        creditSource: input.creditSource,
        creditsEstimated: credits,
        creditsCharged: 0,
        retryCount: 0,
        maxRetries: snapshot.adminSettings.autoRetryLimit,
        isArchived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      applyState((previous) => ({ ...previous, tasks: [task, ...previous.tasks] }));
      return { ok: true, message: "任务已创建，正在进入队列", data: task };
    },
    [applyState],
  );

  const updateTask = useCallback(
    (taskId: EntityId, patch: TaskPatch): ActionResult<GenerationTask> => {
      const snapshot = stateRef.current;
      const account = getCurrentUser(snapshot);
      if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
      if (account.authKind === "server") {
        return {
          ok: false,
          code: "LIVE_ADAPTER_NOT_CONFIGURED",
          message: "共享控制面任务执行器尚未接入，未修改任务内容",
        };
      }
      const task = snapshot.tasks.find((item) => item.id === taskId);
      if (!task) return { ok: false, code: "TASK_NOT_FOUND", message: "任务不存在" };
      if (task.userId !== account.id && account.role !== "admin") {
        return { ok: false, code: "FORBIDDEN", message: "无权编辑该任务" };
      }
      if (!["pending", "queued"].includes(task.status)) {
        return { ok: false, code: "TASK_ALREADY_STARTED", message: "任务开始处理后不能修改" };
      }
      const updated: GenerationTask = {
        ...task,
        title: patch.title?.trim() || task.title,
        input: {
          ...task.input,
          prompt: patch.prompt?.trim() || task.input.prompt,
          dialogue: patch.dialogue ?? task.input.dialogue,
        },
        updatedAt: nowIso(),
      };
      applyState((previous) => ({
        ...previous,
        tasks: previous.tasks.map((item) => (item.id === task.id ? updated : item)),
      }));
      return { ok: true, message: "任务内容已更新", data: updated };
    },
    [applyState],
  );

  const retryTask = useCallback(
    (taskId: EntityId): ActionResult<GenerationTask> => {
      const snapshot = stateRef.current;
      const account = getCurrentUser(snapshot);
      if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
      if (account.authKind === "server") {
        return {
          ok: false,
          code: "LIVE_ADAPTER_NOT_CONFIGURED",
          message: "共享控制面任务执行器尚未接入，未发起重试、未改变额度",
        };
      }
      const task = snapshot.tasks.find((item) => item.id === taskId);
      if (!task) return { ok: false, code: "TASK_NOT_FOUND", message: "任务不存在" };
      if (task.userId !== account.id && account.role !== "admin") {
        return { ok: false, code: "FORBIDDEN", message: "无权重试该任务" };
      }
      if (task.status !== "failed") {
        return { ok: false, code: "INVALID_STATUS", message: "只有失败任务可以重试" };
      }
      const taskOwner = snapshot.users.find((user) => user.id === task.userId);
      if (!taskOwner) return { ok: false, code: "USER_NOT_FOUND", message: "任务所属用户不存在" };
      const access = featureGate(
        snapshot,
        taskOwner,
        task.featureKey,
        task.platformId,
        task.creditSource,
      );
      if (!access.ok) {
        return { ok: false, code: access.code, message: access.message };
      }
      if (
        task.creditSource === "paid" &&
        taskOwner.paidCredits - reservedPaidCreditsFor(snapshot, taskOwner.id) < task.creditsEstimated
      ) {
        return { ok: false, code: "NO_CREDITS", message: "当前可用额度不足，暂时不能重试" };
      }
      if (task.creditSource === "self_api") {
        const connection = snapshot.platformConnections.find(
          (item) => item.userId === taskOwner.id && item.platformId === task.platformId,
        );
        const userCalls =
          taskOwner.selfApiUsageDate === todayIso() ? taskOwner.selfApiCallsToday : 0;
        const platformCalls =
          connection?.usageDate === todayIso() ? connection.dailyCallsUsed : 0;
        if (
          userCalls + reservedSelfApiCallsFor(snapshot, taskOwner.id) + task.creditsEstimated >
            taskOwner.selfApiDailyLimit ||
          !connection ||
          platformCalls +
              reservedSelfApiCallsFor(snapshot, taskOwner.id, task.platformId) +
              task.creditsEstimated >
            connection.dailyMaxSelfQuota
        ) {
          return { ok: false, code: "NO_SELF_API_QUOTA", message: "当前自有 API 配额不足，暂时不能重试" };
        }
      }
      const updated: GenerationTask = {
        ...task,
        status: "queued",
        stage: "preparing",
        progress: 3,
        queuePosition: 1,
        retryCount: task.retryCount + 1,
        errorCode: undefined,
        errorMessage: undefined,
        completedAt: undefined,
        input: { ...task.input, simulateFailure: false },
        updatedAt: nowIso(),
      };
      applyState((previous) => ({
        ...previous,
        tasks: previous.tasks.map((item) => (item.id === task.id ? updated : item)),
      }));
      return { ok: true, message: "任务已重新加入队列", data: updated };
    },
    [applyState],
  );

  const cancelTask = useCallback(
    (taskId: EntityId): ActionResult<GenerationTask> => {
      const snapshot = stateRef.current;
      const account = getCurrentUser(snapshot);
      if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
      const task = snapshot.tasks.find((item) => item.id === taskId);
      if (!task) return { ok: false, code: "TASK_NOT_FOUND", message: "任务不存在" };
      if (task.userId !== account.id && account.role !== "admin") {
        return { ok: false, code: "FORBIDDEN", message: "无权取消该任务" };
      }
      if (!["pending", "queued"].includes(task.status)) {
        return { ok: false, code: "INVALID_STATUS", message: "只有待创建或排队中的任务可以取消" };
      }
      const updated: GenerationTask = {
        ...task,
        status: "cancelled",
        queuePosition: undefined,
        completedAt: nowIso(),
        updatedAt: nowIso(),
      };
      applyState((previous) => ({
        ...previous,
        tasks: previous.tasks.map((item) => (item.id === task.id ? updated : item)),
      }));
      return { ok: true, message: "任务已取消，未扣除额度", data: updated };
    },
    [applyState],
  );

  const terminateTask = useCallback(
    (taskId: EntityId): ActionResult<GenerationTask> => {
      const snapshot = stateRef.current;
      const admin = getCurrentUser(snapshot);
      if (!admin || admin.role !== "admin") {
        return { ok: false, code: "ADMIN_REQUIRED", message: "只有管理员可以终止异常任务" };
      }
      const task = snapshot.tasks.find((item) => item.id === taskId);
      if (!task) return { ok: false, code: "TASK_NOT_FOUND", message: "任务不存在" };
      if (!['pending', 'queued', 'processing'].includes(task.status)) {
        return { ok: false, code: "INVALID_STATUS", message: "该任务已结束" };
      }
      const updated: GenerationTask = {
        ...task,
        status: "terminated",
        queuePosition: undefined,
        errorCode: "ADMIN_TERMINATED",
        errorMessage: "管理员已手动终止异常任务，本次未扣除额度。",
        completedAt: nowIso(),
        updatedAt: nowIso(),
      };
      applyState((previous) => ({
        ...previous,
        tasks: previous.tasks.map((item) => (item.id === task.id ? updated : item)),
        notifications: [
          notification(task.userId, "task_failed", "任务已由管理员终止", `《${task.title}》未扣除额度。`, {
            relatedTaskId: task.id,
            priority: "high",
          }),
          ...previous.notifications,
        ],
        auditLogs: [
          createAudit(admin, "task", "TERMINATE_TASK", task.id, "generation_task", {
            status: task.status,
            progress: task.progress,
          }, { status: "terminated" }),
          ...previous.auditLogs,
        ],
      }));
      return { ok: true, message: "异常任务已终止", data: updated };
    },
    [applyState],
  );

  const archiveTask = useCallback(
    (taskId: EntityId): ActionResult<GenerationTask> => {
      const snapshot = stateRef.current;
      const account = getCurrentUser(snapshot);
      if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
      const task = snapshot.tasks.find((item) => item.id === taskId);
      if (!task) return { ok: false, code: "TASK_NOT_FOUND", message: "任务不存在" };
      if (task.userId !== account.id && account.role !== "admin") {
        return { ok: false, code: "FORBIDDEN", message: "无权归档该任务" };
      }
      if (!TASK_TERMINAL_STATUSES.includes(task.status)) {
        return { ok: false, code: "TASK_ACTIVE", message: "进行中的任务不能归档" };
      }
      const updated = { ...task, isArchived: true, updatedAt: nowIso() };
      applyState((previous) => ({
        ...previous,
        tasks: previous.tasks.map((item) => (item.id === task.id ? updated : item)),
      }));
      return { ok: true, message: "任务已归档", data: updated };
    },
    [applyState],
  );

  const tickTask = useCallback(
    (taskId: EntityId): ActionResult<GenerationTask> => {
      const before = stateRef.current.tasks.find((task) => task.id === taskId);
      if (!before) return { ok: false, code: "TASK_NOT_FOUND", message: "任务不存在" };
      const next = applyState((previous) => advanceTask(previous, taskId));
      const task = next.tasks.find((item) => item.id === taskId)!;
      return { ok: true, message: "任务进度已刷新", data: task };
    },
    [applyState],
  );

  const tickTasks = useCallback(() => {
    const activeIds = stateRef.current.tasks
      .filter((task) => ["pending", "queued", "processing"].includes(task.status))
      .map((task) => task.id);
    if (activeIds.length === 0) return;
    applyState((previous) => activeIds.reduce(advanceTask, previous));
  }, [applyState]);

  const hasActiveSession = Boolean(getCurrentSession(state));
  useEffect(() => {
    if (!hasActiveSession) return;
    const timer = globalThis.setInterval(tickTasks, 2_200);
    return () => globalThis.clearInterval(timer);
  }, [hasActiveSession, state.currentSessionId, tickTasks]);

  const addMaterial = useCallback(
    (input: AddMaterialInput): ActionResult<Material> => {
      const account = getCurrentUser(stateRef.current);
      if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
      if (!input.title.trim()) return { ok: false, code: "TITLE_REQUIRED", message: "请填写素材名称" };
      const timestamp = nowIso();
      const material: Material = {
        id: createId("material"),
        userId: account.id,
        type: input.type,
        title: input.title.trim(),
        description: input.description?.trim(),
        resourceUrl: input.resourceUrl,
        previewUrl: input.previewUrl,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        durationSeconds: input.durationSeconds,
        sourceTaskId: input.sourceTaskId,
        isDeleted: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      applyState((previous) => ({ ...previous, materials: [material, ...previous.materials] }));
      return { ok: true, message: "素材已加入资料库", data: material };
    },
    [applyState],
  );

  const recycleMaterial = useCallback(
    (materialId: EntityId): ActionResult<Material> => {
      const snapshot = stateRef.current;
      const account = getCurrentUser(snapshot);
      if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
      const material = snapshot.materials.find((item) => item.id === materialId);
      if (!material) return { ok: false, code: "MATERIAL_NOT_FOUND", message: "素材不存在" };
      if (material.userId !== account.id && account.role !== "admin") {
        return { ok: false, code: "FORBIDDEN", message: "无权删除该素材" };
      }
      if (material.isDeleted) return { ok: true, message: "素材已在回收站", data: material };
      const timestamp = nowIso();
      const updated: Material = {
        ...material,
        isDeleted: true,
        recycledAt: timestamp,
        recycleExpiresAt: daysFromNowIso(snapshot.adminSettings.recycleRetentionDays),
        updatedAt: timestamp,
      };
      applyState((previous) => ({
        ...previous,
        materials: previous.materials.map((item) => (item.id === material.id ? updated : item)),
      }));
      return { ok: true, message: `素材已移入回收站，${snapshot.adminSettings.recycleRetentionDays} 天内可恢复`, data: updated };
    },
    [applyState],
  );

  const restoreMaterial = useCallback(
    (materialId: EntityId): ActionResult<Material> => {
      const snapshot = stateRef.current;
      const account = getCurrentUser(snapshot);
      if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
      const material = snapshot.materials.find((item) => item.id === materialId);
      if (!material) return { ok: false, code: "MATERIAL_NOT_FOUND", message: "素材不存在或已被清理" };
      if (material.userId !== account.id && account.role !== "admin") {
        return { ok: false, code: "FORBIDDEN", message: "无权恢复该素材" };
      }
      if (!material.isDeleted) return { ok: true, message: "素材已在资料库", data: material };
      const updated: Material = {
        ...material,
        isDeleted: false,
        recycledAt: undefined,
        recycleExpiresAt: undefined,
        updatedAt: nowIso(),
      };
      applyState((previous) => ({
        ...previous,
        materials: previous.materials.map((item) => (item.id === material.id ? updated : item)),
      }));
      return { ok: true, message: "素材已恢复", data: updated };
    },
    [applyState],
  );

  const purgeMaterial = useCallback(
    (materialId: EntityId): ActionResult => {
      const snapshot = stateRef.current;
      const account = getCurrentUser(snapshot);
      if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
      const material = snapshot.materials.find((item) => item.id === materialId);
      if (!material) return { ok: false, code: "MATERIAL_NOT_FOUND", message: "素材不存在" };
      if (material.userId !== account.id && account.role !== "admin") {
        return { ok: false, code: "FORBIDDEN", message: "无权清理该素材" };
      }
      if (!material.isDeleted) {
        return { ok: false, code: "RECYCLE_FIRST", message: "请先将素材移入回收站" };
      }
      applyState((previous) => ({
        ...previous,
        materials: previous.materials.filter((item) => item.id !== material.id),
        auditLogs: [
          createAudit(account, "material", "PURGE_MATERIAL", material.id, "material", {
            title: material.title,
            type: material.type,
          }),
          ...previous.auditLogs,
        ],
      }));
      return { ok: true, message: "素材已永久清理，无法恢复" };
    },
    [applyState],
  );

  const purgeExpiredMaterials = useCallback((): ActionResult<{ count: number }> => {
    const snapshot = stateRef.current;
    const admin = getCurrentUser(snapshot);
    if (!admin || admin.role !== "admin") {
      return { ok: false, code: "ADMIN_REQUIRED", message: "只有管理员可以执行到期清理" };
    }
    const expired = snapshot.materials.filter(
      (item) => item.isDeleted && item.recycleExpiresAt && Date.parse(item.recycleExpiresAt) <= Date.now(),
    );
    if (expired.length === 0) return { ok: true, message: "没有到期素材", data: { count: 0 } };
    const ids = new Set(expired.map((item) => item.id));
    applyState((previous) => ({
      ...previous,
      materials: previous.materials.filter((item) => !ids.has(item.id)),
      auditLogs: [
        createAudit(admin, "material", "PURGE_EXPIRED_MATERIALS", undefined, "material", {
          count: expired.length,
        }),
        ...previous.auditLogs,
      ],
    }));
    return { ok: true, message: `已清理 ${expired.length} 个到期素材`, data: { count: expired.length } };
  }, [applyState]);

  const markNotificationRead = useCallback(
    (notificationId: EntityId, isRead = true): ActionResult => {
      const snapshot = stateRef.current;
      const account = getCurrentUser(snapshot);
      if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
      const target = snapshot.notifications.find((item) => item.id === notificationId);
      if (!target || (target.userId !== account.id && account.role !== "admin")) {
        return { ok: false, code: "NOTIFICATION_NOT_FOUND", message: "消息不存在" };
      }
      applyState((previous) => ({
        ...previous,
        notifications: previous.notifications.map((item) =>
          item.id === notificationId ? { ...item, isRead } : item,
        ),
      }));
      return { ok: true, message: isRead ? "已标为已读" : "已标为未读" };
    },
    [applyState],
  );

  const markAllNotificationsRead = useCallback((): ActionResult => {
    const account = getCurrentUser(stateRef.current);
    if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
    applyState((previous) => ({
      ...previous,
      notifications: previous.notifications.map((item) =>
        item.userId === account.id ? { ...item, isRead: true } : item,
      ),
    }));
    return { ok: true, message: "全部消息已读" };
  }, [applyState]);

  const redeemRechargeCode = useCallback(
    async (rawCode: string): Promise<ActionResult<{ credits: number; balance: number }>> => {
      const snapshot = stateRef.current;
      const account = getCurrentUser(snapshot);
      if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
      const value = rawCode.trim().toUpperCase();

      if (account.authKind === "server") {
        try {
          const remote = await controlPlaneClient.redeem(value);
          const credits = Number(remote.data.credited);
          const balance = Number(remote.data.paidCredits);
          if (!Number.isFinite(credits) || !Number.isFinite(balance)) {
            return {
              ok: false,
              code: "CONTROL_PLANE_RESPONSE_INVALID",
              message: "共享控制面返回了无法识别的额度结果，请联系管理员核查审计日志",
            };
          }
          const timestamp = nowIso();
          const rechargeCode = remote.data.rechargeCode;
          const rechargeCodeId =
            rechargeCode && typeof rechargeCode === "object" && "id" in rechargeCode
              ? String(rechargeCode.id)
              : createId("remote_recharge_code");
          const rechargeLogId = createId("remote_recharge");
          applyState((previous) => ({
            ...previous,
            users: previous.users.map((user) =>
              user.id === account.id
                ? { ...user, paidCredits: balance, updatedAt: timestamp }
                : user,
            ),
            rechargeLogs: [
              {
                id: rechargeLogId,
                userId: account.id,
                rechargeCodeId,
                rechargeCode: `${value.slice(0, 4)}••••${value.slice(-4)}`,
                amount: 0,
                credits,
                createdAt: timestamp,
              },
              ...previous.rechargeLogs,
            ],
            notifications: [
              notification(account.id, "recharge", "共享额度已到账", `${credits} 次创作额度已由超级管理端控制面入账。`, {
                relatedRechargeId: rechargeLogId,
                actionHref: "/billing",
              }),
              ...previous.notifications,
            ],
          }));
          setControlPlaneStatus("connected");
          setControlPlaneMessage(`共享控制平面在线 · 版本 ${remote.revision ?? "最新"}`);
          return { ok: true, message: `充值成功，到账 ${credits} 次`, data: { credits, balance } };
        } catch (error) {
          if (error instanceof ControlPlaneClientError) {
            setControlPlaneStatus("error");
            setControlPlaneMessage(error.message);
            return controlPlaneFailure<{ credits: number; balance: number }>(error);
          }
          setControlPlaneStatus("offline");
          setControlPlaneMessage("共享控制面暂不可达，充值码未在本地代兑");
          return {
            ok: false,
            code: "CONTROL_PLANE_OFFLINE",
            message: "共享控制面暂不可达。为避免重复入账，本次未执行本地兑换，请稍后重试",
          };
        }
      }

      const code = snapshot.rechargeCodes.find((item) => item.code === value);
      if (!code) return { ok: false, code: "CODE_NOT_FOUND", message: "充值码不存在" };
      if (code.status !== "active") {
        return { ok: false, code: "CODE_UNAVAILABLE", message: code.status === "used" ? "充值码已被使用" : "充值码不可用" };
      }
      if (code.expiresAt && Date.parse(code.expiresAt) <= Date.now()) {
        return { ok: false, code: "CODE_EXPIRED", message: "充值码已过期" };
      }
      const timestamp = nowIso();
      const rechargeLogId = createId("recharge");
      const notifications: AppNotification[] = [
        notification(account.id, "recharge", "充值成功", `${code.credits} 次创作额度已到账。`, {
          relatedRechargeId: rechargeLogId,
          actionHref: "/billing",
        }),
      ];
      let commissionAccounts = snapshot.commissionAccounts.map((item) => ({ ...item }));
      const commissionTransactions: CommissionTransaction[] = [];
      const parentRelation = snapshot.inviteRelations.find((item) => item.userId === account.id);
      const parent = parentRelation
        ? snapshot.users.find((user) => user.id === parentRelation.invitedBy)
        : undefined;
      const grandRelation = parent
        ? snapshot.inviteRelations.find((item) => item.userId === parent.id)
        : undefined;
      const grandParent = grandRelation
        ? snapshot.users.find((user) => user.id === grandRelation.invitedBy)
        : undefined;

      const grantCommission = (beneficiary: User | undefined, level: 1 | 2, rate: number) => {
        if (!beneficiary) return;
        const amount = asCurrency(code.value * rate);
        if (amount <= 0) return;
        const existingAccount = commissionAccounts.find((item) => item.userId === beneficiary.id);
        if (existingAccount) {
          commissionAccounts = commissionAccounts.map((item) =>
            item.userId === beneficiary.id
              ? {
                  ...item,
                  totalEarned: asCurrency(item.totalEarned + amount),
                  availableBalance: asCurrency(item.availableBalance + amount),
                  updatedAt: timestamp,
                }
              : item,
          );
        } else {
          commissionAccounts.push({
            id: createId("commission"),
            userId: beneficiary.id,
            totalEarned: amount,
            availableBalance: amount,
            pendingWithdrawal: 0,
            exchangedCredits: 0,
            withdrawnAmount: 0,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        }
        commissionTransactions.push({
          id: createId("commission_tx"),
          userId: beneficiary.id,
          type: level === 1 ? "level_1" : "level_2",
          fromUserId: account.id,
          level,
          rechargeAmount: code.value,
          rate,
          amount,
          rechargeLogId,
          description: `${account.nickname}充值 · ${level === 1 ? "一级" : "二级"}佣金`,
          createdAt: timestamp,
        });
        notifications.push(
          notification(beneficiary.id, "commission", `获得${level === 1 ? "一级" : "二级"}佣金`, `${amount.toFixed(2)} 元已计入可用余额。`, {
            actionHref: "/affiliate",
          }),
        );
      };

      grantCommission(parent, 1, snapshot.adminSettings.firstLevelCommissionRate);
      grantCommission(grandParent, 2, snapshot.adminSettings.secondLevelCommissionRate);

      const balance = account.paidCredits + code.credits;
      applyState((previous) => ({
        ...previous,
        users: previous.users.map((user) =>
          user.id === account.id ? { ...user, paidCredits: balance, updatedAt: timestamp } : user,
        ),
        featureSwitches: previous.featureSwitches.map((item) =>
          item.userId === account.id
            ? { ...item, isEnabled: true, enabledAt: item.enabledAt ?? timestamp, updatedAt: timestamp }
            : item,
        ),
        rechargeCodes: previous.rechargeCodes.map((item) =>
          item.id === code.id
            ? { ...item, status: "used", usedBy: account.id, usedAt: timestamp }
            : item,
        ),
        rechargeLogs: [
          {
            id: rechargeLogId,
            userId: account.id,
            rechargeCodeId: code.id,
            rechargeCode: code.code,
            amount: code.value,
            credits: code.credits,
            createdAt: timestamp,
          },
          ...previous.rechargeLogs,
        ],
        commissionAccounts,
        commissionTransactions: [...commissionTransactions, ...previous.commissionTransactions],
        notifications: [...notifications, ...previous.notifications],
        auditLogs: [
          createAudit(account, "recharge", "REDEEM_RECHARGE_CODE", code.id, "recharge_code", undefined, {
            credits: code.credits,
            packageId: code.packageId,
          }),
          ...previous.auditLogs,
        ],
      }));
      return { ok: true, message: `充值成功，到账 ${code.credits} 次`, data: { credits: code.credits, balance } };
    },
    [applyState],
  );

  const createRechargeCodes = useCallback(
    (packageId: EntityId, count = 1, expiresAt?: string): ActionResult<RechargeCode[]> => {
      const snapshot = stateRef.current;
      const admin = getCurrentUser(snapshot);
      if (!admin || admin.role !== "admin") {
        return { ok: false, code: "ADMIN_REQUIRED", message: "只有管理员可以生成充值码" };
      }
      const packageTemplate = snapshot.packageTemplates.find(
        (item: PackageTemplate) => item.id === packageId && item.isActive,
      );
      if (!packageTemplate) return { ok: false, code: "PACKAGE_NOT_FOUND", message: "套餐模板不存在或已停用" };
      const safeCount = Math.max(1, Math.min(100, Math.floor(count)));
      const timestamp = nowIso();
      const codes: RechargeCode[] = Array.from({ length: safeCount }, () => {
        const token = createId("x").replace("x_", "").slice(0, 10).toUpperCase();
        return {
          id: createId("recharge_code"),
          code: `ARC-${packageTemplate.credits}-${token}`,
          value: packageTemplate.value,
          credits: packageTemplate.credits,
          status: "active",
          validity: expiresAt ? "time_limit" : "permanent",
          expiresAt,
          packageId: packageTemplate.id,
          createdBy: admin.id,
          createdAt: timestamp,
        };
      });
      applyState((previous) => ({
        ...previous,
        rechargeCodes: [...codes, ...previous.rechargeCodes],
        auditLogs: [
          createAudit(admin, "recharge", "CREATE_RECHARGE_CODES", packageId, "package_template", undefined, {
            count: codes.length,
            credits: packageTemplate.credits,
            expiresAt,
          }),
          ...previous.auditLogs,
        ],
      }));
      return { ok: true, message: `已生成 ${codes.length} 个充值码`, data: codes };
    },
    [applyState],
  );

  const createInviteCode = useCallback(
    (maxUses = 20, giftCredits = 3): ActionResult<string> => {
      const account = getCurrentUser(stateRef.current);
      if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
      if (account.authKind === "server") {
        return {
          ok: false,
          code: "MANAGED_BY_SUPER_ADMIN",
          message: "共享账号的邀请码由独立超级管理端统一生成和审计",
        };
      }
      const token = createId("invite").replace("invite_", "").slice(0, 8).toUpperCase();
      const codeValue = `${account.username.slice(0, 5).toUpperCase()}-${token}`;
      applyState((previous) => ({
        ...previous,
        inviteCodes: [
          {
            id: createId("invite_code"),
            code: codeValue,
            createdBy: account.id,
            creatorRole: account.role,
            maxUses: Math.max(1, Math.min(500, Math.floor(maxUses))),
            usedCount: 0,
            status: "active",
            giftCredits: Math.max(0, Math.min(20, Math.floor(giftCredits))),
            validity: "permanent",
            createdAt: nowIso(),
          },
          ...previous.inviteCodes,
        ],
        auditLogs: [
          createAudit(account, "invite", "CREATE_INVITE_CODE", undefined, "invite_code", undefined, {
            code: codeValue,
            maxUses,
            giftCredits,
          }),
          ...previous.auditLogs,
        ],
      }));
      return { ok: true, message: "专属邀请码已生成", data: codeValue };
    },
    [applyState],
  );

  const exchangeCommissionForCredits = useCallback(
    (amount: number): ActionResult<{ credits: number; balance: number }> => {
      const snapshot = stateRef.current;
      const account = getCurrentUser(snapshot);
      if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
      if (!snapshot.adminSettings.commissionExchangeEnabled) {
        return { ok: false, code: "EXCHANGE_DISABLED", message: "管理员暂未开放佣金兑换" };
      }
      const commission = snapshot.commissionAccounts.find((item) => item.userId === account.id);
      const normalizedAmount = asCurrency(amount);
      if (!commission || normalizedAmount <= 0 || commission.availableBalance < normalizedAmount) {
        return { ok: false, code: "INSUFFICIENT_COMMISSION", message: "可用佣金余额不足" };
      }
      const credits = Math.floor(normalizedAmount * snapshot.adminSettings.commissionCreditsPerYuan);
      if (credits <= 0) return { ok: false, code: "AMOUNT_TOO_SMALL", message: "兑换金额过小" };
      const balance = asCurrency(commission.availableBalance - normalizedAmount);
      const timestamp = nowIso();
      applyState((previous) => ({
        ...previous,
        users: previous.users.map((user) =>
          user.id === account.id
            ? { ...user, paidCredits: user.paidCredits + credits, updatedAt: timestamp }
            : user,
        ),
        commissionAccounts: previous.commissionAccounts.map((item) =>
          item.userId === account.id
            ? {
                ...item,
                availableBalance: balance,
                exchangedCredits: item.exchangedCredits + credits,
                updatedAt: timestamp,
              }
            : item,
        ),
        commissionTransactions: [
          {
            id: createId("commission_tx"),
            userId: account.id,
            type: "credit_exchange",
            amount: -normalizedAmount,
            credits,
            description: `佣金兑换 ${credits} 次创作额度`,
            createdAt: timestamp,
          },
          ...previous.commissionTransactions,
        ],
        notifications: [
          notification(account.id, "recharge", "佣金兑换成功", `${credits} 次创作额度已到账。`, {
            actionHref: "/billing",
          }),
          ...previous.notifications,
        ],
      }));
      return { ok: true, message: `已兑换 ${credits} 次额度`, data: { credits, balance } };
    },
    [applyState],
  );

  const requestWithdrawal = useCallback(
    (amount: number, method: WithdrawalMethod, paymentAccount: string): ActionResult => {
      const snapshot = stateRef.current;
      const account = getCurrentUser(snapshot);
      if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
      if (!snapshot.adminSettings.withdrawalsEnabled) {
        return { ok: false, code: "WITHDRAWALS_DISABLED", message: "管理员暂未开放提现入口" };
      }
      const commission = snapshot.commissionAccounts.find((item) => item.userId === account.id);
      const normalizedAmount = asCurrency(amount);
      if (!commission || normalizedAmount <= 0 || commission.availableBalance < normalizedAmount) {
        return { ok: false, code: "INSUFFICIENT_COMMISSION", message: "可提现余额不足" };
      }
      if (paymentAccount.trim().length < 4) {
        return { ok: false, code: "INVALID_PAYMENT_ACCOUNT", message: "请填写有效的收款账号" };
      }
      const timestamp = nowIso();
      applyState((previous) => ({
        ...previous,
        commissionAccounts: previous.commissionAccounts.map((item) =>
          item.userId === account.id
            ? {
                ...item,
                availableBalance: asCurrency(item.availableBalance - normalizedAmount),
                pendingWithdrawal: asCurrency(item.pendingWithdrawal + normalizedAmount),
                updatedAt: timestamp,
              }
            : item,
        ),
        withdrawalRequests: [
          {
            id: createId("withdraw"),
            userId: account.id,
            amount: normalizedAmount,
            fee: 0,
            actualAmount: normalizedAmount,
            method,
            accountMasked: maskPaymentAccount(paymentAccount),
            status: "pending",
            createdAt: timestamp,
          },
          ...previous.withdrawalRequests,
        ],
      }));
      return { ok: true, message: "提现申请已提交，等待管理员人工转账" };
    },
    [applyState],
  );

  const reviewWithdrawal = useCallback(
    (
      requestId: EntityId,
      status: Exclude<WithdrawalStatus, "pending">,
      remark?: string,
    ): ActionResult => {
      const snapshot = stateRef.current;
      const admin = getCurrentUser(snapshot);
      if (!admin || admin.role !== "admin") {
        return { ok: false, code: "ADMIN_REQUIRED", message: "只有管理员可以审核提现" };
      }
      const request = snapshot.withdrawalRequests.find((item) => item.id === requestId);
      if (!request) return { ok: false, code: "REQUEST_NOT_FOUND", message: "提现申请不存在" };
      if (request.status !== "pending") return { ok: false, code: "ALREADY_REVIEWED", message: "该申请已审核" };
      const timestamp = nowIso();
      applyState((previous) => ({
        ...previous,
        withdrawalRequests: previous.withdrawalRequests.map((item) =>
          item.id === request.id
            ? { ...item, status, adminRemark: remark?.trim(), processedAt: timestamp }
            : item,
        ),
        commissionAccounts: previous.commissionAccounts.map((item) => {
          if (item.userId !== request.userId) return item;
          return status === "approved"
            ? {
                ...item,
                pendingWithdrawal: Math.max(0, asCurrency(item.pendingWithdrawal - request.amount)),
                withdrawnAmount: asCurrency(item.withdrawnAmount + request.actualAmount),
                updatedAt: timestamp,
              }
            : {
                ...item,
                pendingWithdrawal: Math.max(0, asCurrency(item.pendingWithdrawal - request.amount)),
                availableBalance: asCurrency(item.availableBalance + request.amount),
                updatedAt: timestamp,
              };
        }),
        commissionTransactions:
          status === "approved"
            ? [
                {
                  id: createId("commission_tx"),
                  userId: request.userId,
                  type: "withdrawal",
                  amount: -request.actualAmount,
                  description: `${request.method === "wechat" ? "微信" : "支付宝"}提现已完成`,
                  createdAt: timestamp,
                },
                ...previous.commissionTransactions,
              ]
            : previous.commissionTransactions,
        notifications: [
          notification(
            request.userId,
            "withdraw",
            status === "approved" ? "提现审核通过" : "提现申请已退回",
            status === "approved"
              ? `${request.actualAmount.toFixed(2)} 元已完成管理员人工转账。`
              : `申请金额已退回佣金余额。${remark ? ` 原因：${remark}` : ""}`,
            { priority: status === "approved" ? "normal" : "high", actionHref: "/affiliate" },
          ),
          ...previous.notifications,
        ],
        auditLogs: [
          createAudit(admin, "withdrawal", status === "approved" ? "APPROVE_WITHDRAWAL" : "REJECT_WITHDRAWAL", request.id, "withdrawal_request", {
            status: "pending",
          }, { status, remark }),
          ...previous.auditLogs,
        ],
      }));
      return { ok: true, message: status === "approved" ? "提现已审核通过" : "提现已拒绝并退回余额" };
    },
    [applyState],
  );

  const submitFeedback = useCallback(
    async (input: CreateFeedbackInput): Promise<ActionResult<Feedback>> => {
      const account = getCurrentUser(stateRef.current);
      if (!account) return { ok: false, code: "AUTH_REQUIRED", message: "请先登录" };
      if (!input.title.trim() || input.content.trim().length < 5) {
        return { ok: false, code: "INVALID_FEEDBACK", message: "请填写标题和至少 5 个字的详细说明" };
      }

      if (account.authKind === "server") {
        try {
          const remote = await controlPlaneClient.submitFeedback({
            category: input.type,
            subject: input.title.trim(),
            message: input.content.trim(),
          });
          const timestamp = nowIso();
          const remoteId = typeof remote.data.id === "string" ? remote.data.id : createId("feedback");
          const feedback: Feedback = {
            id: remoteId,
            userId: account.id,
            platformId: input.platformId,
            type: input.type,
            title: input.title.trim(),
            content: input.content.trim(),
            images: input.images?.slice(0, 6) ?? [],
            status: "pending",
            createdAt: typeof remote.data.createdAt === "string" ? remote.data.createdAt : timestamp,
            updatedAt: typeof remote.data.updatedAt === "string" ? remote.data.updatedAt : timestamp,
          };
          applyState((previous) => ({ ...previous, feedbacks: [feedback, ...previous.feedbacks] }));
          setControlPlaneStatus("connected");
          setControlPlaneMessage(`共享控制平面在线 · 版本 ${remote.revision ?? "最新"}`);
          return { ok: true, message: "反馈已提交到超级管理端待处理队列", data: feedback };
        } catch (error) {
          if (error instanceof ControlPlaneClientError) {
            setControlPlaneStatus("error");
            setControlPlaneMessage(error.message);
            return controlPlaneFailure<Feedback>(error);
          }
          setControlPlaneStatus("offline");
          setControlPlaneMessage("共享控制面暂不可达，反馈未提交");
          return {
            ok: false,
            code: "CONTROL_PLANE_OFFLINE",
            message: "共享控制面暂不可达，反馈未提交，请保留内容后稍后重试",
          };
        }
      }

      const timestamp = nowIso();
      const feedback: Feedback = {
        id: createId("feedback"),
        userId: account.id,
        platformId: input.platformId,
        type: input.type,
        title: input.title.trim(),
        content: input.content.trim(),
        images: input.images?.slice(0, 6) ?? [],
        status: "pending",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      applyState((previous) => ({ ...previous, feedbacks: [feedback, ...previous.feedbacks] }));
      return { ok: true, message: "反馈已保存在当前浏览器，本地管理员视图可查看", data: feedback };
    },
    [applyState],
  );

  const updateFeedbackByAdmin = useCallback(
    (feedbackId: EntityId, status: FeedbackStatus, reply?: string): ActionResult<Feedback> => {
      const snapshot = stateRef.current;
      const admin = getCurrentUser(snapshot);
      if (!admin || admin.role !== "admin") {
        return { ok: false, code: "ADMIN_REQUIRED", message: "只有管理员可以处理反馈" };
      }
      const feedback = snapshot.feedbacks.find((item) => item.id === feedbackId);
      if (!feedback) return { ok: false, code: "FEEDBACK_NOT_FOUND", message: "反馈不存在" };
      const timestamp = nowIso();
      const updated: Feedback = {
        ...feedback,
        status,
        adminReply: reply?.trim() || feedback.adminReply,
        adminReplyAt: reply?.trim() ? timestamp : feedback.adminReplyAt,
        updatedAt: timestamp,
      };
      applyState((previous) => ({
        ...previous,
        feedbacks: previous.feedbacks.map((item) => (item.id === feedback.id ? updated : item)),
        notifications: reply?.trim()
          ? [
              notification(feedback.userId, "system", "你的反馈收到回复", `《${feedback.title}》已有新的管理员回复。`, {
                actionHref: "/feedback",
              }),
              ...previous.notifications,
            ]
          : previous.notifications,
        auditLogs: [
          createAudit(admin, "feedback", "UPDATE_FEEDBACK", feedback.id, "feedback", {
            status: feedback.status,
          }, { status, replied: Boolean(reply?.trim()) }),
          ...previous.auditLogs,
        ],
      }));
      return { ok: true, message: "反馈状态已更新", data: updated };
    },
    [applyState],
  );

  const saveTutorial = useCallback(
    (
      input: Omit<Tutorial, "id" | "createdAt" | "updatedAt" | "createdBy"> & {
        id?: EntityId;
      },
    ): ActionResult<Tutorial> => {
      const snapshot = stateRef.current;
      const admin = getCurrentUser(snapshot);
      if (!admin || admin.role !== "admin") {
        return { ok: false, code: "ADMIN_REQUIRED", message: "只有管理员可以维护使用手册" };
      }
      const existing = input.id
        ? snapshot.tutorials.find((tutorial) => tutorial.id === input.id)
        : undefined;
      const timestamp = nowIso();
      const tutorial: Tutorial = {
        ...input,
        id: existing?.id ?? createId("tutorial"),
        createdBy: existing?.createdBy ?? admin.id,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      applyState((previous) => ({
        ...previous,
        tutorials: existing
          ? previous.tutorials.map((item) => (item.id === tutorial.id ? tutorial : item))
          : [tutorial, ...previous.tutorials],
        auditLogs: [
          createAudit(admin, "content", existing ? "UPDATE_TUTORIAL" : "CREATE_TUTORIAL", tutorial.id, "tutorial", undefined, {
            title: tutorial.title,
            isPublished: tutorial.isPublished,
          }),
          ...previous.auditLogs,
        ],
      }));
      return { ok: true, message: existing ? "教程已更新" : "教程已创建", data: tutorial };
    },
    [applyState],
  );

  const saveAnnouncement = useCallback(
    (
      input: Omit<Announcement, "id" | "createdAt" | "updatedAt" | "createdBy"> & {
        id?: EntityId;
      },
    ): ActionResult<Announcement> => {
      const snapshot = stateRef.current;
      const admin = getCurrentUser(snapshot);
      if (!admin || admin.role !== "admin") {
        return { ok: false, code: "ADMIN_REQUIRED", message: "只有管理员可以维护公告" };
      }
      const existing = input.id
        ? snapshot.announcements.find((announcement) => announcement.id === input.id)
        : undefined;
      const timestamp = nowIso();
      const announcement: Announcement = {
        ...input,
        id: existing?.id ?? createId("announcement"),
        createdBy: existing?.createdBy ?? admin.id,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      applyState((previous) => ({
        ...previous,
        announcements: existing
          ? previous.announcements.map((item) =>
              item.id === announcement.id ? announcement : item,
            )
          : [announcement, ...previous.announcements],
        auditLogs: [
          createAudit(admin, "content", existing ? "UPDATE_ANNOUNCEMENT" : "CREATE_ANNOUNCEMENT", announcement.id, "announcement", undefined, {
            title: announcement.title,
            type: announcement.type,
            isActive: announcement.isActive,
          }),
          ...previous.auditLogs,
        ],
      }));
      return { ok: true, message: existing ? "公告已更新" : "公告已创建", data: announcement };
    },
    [applyState],
  );

  const updateAdminSettings = useCallback(
    (patch: Partial<AdminSettings>): ActionResult<AdminSettings> => {
      const snapshot = stateRef.current;
      const admin = getCurrentUser(snapshot);
      if (!admin || admin.role !== "admin") {
        return { ok: false, code: "ADMIN_REQUIRED", message: "只有管理员可以修改全局设置" };
      }
      const safePatch: Partial<AdminSettings> = { ...patch };
      delete safePatch.updatedAt;
      delete safePatch.updatedBy;
      if (safePatch.maxConcurrentTasks !== undefined) {
        safePatch.maxConcurrentTasks = Math.max(1, Math.min(50, Math.floor(safePatch.maxConcurrentTasks)));
      }
      if (safePatch.autoRetryLimit !== undefined) {
        safePatch.autoRetryLimit = Math.max(0, Math.min(3, Math.floor(safePatch.autoRetryLimit)));
      }
      if (
        safePatch.recycleRetentionDays !== undefined &&
        ![7, 15, 30].includes(safePatch.recycleRetentionDays)
      ) {
        return { ok: false, code: "INVALID_RETENTION", message: "回收站周期只能为 7、15 或 30 天" };
      }
      const updated: AdminSettings = {
        ...snapshot.adminSettings,
        ...safePatch,
        updatedAt: nowIso(),
        updatedBy: admin.id,
      };
      applyState((previous) => ({
        ...previous,
        adminSettings: updated,
        auditLogs: [
          createAudit(admin, "settings", "UPDATE_GLOBAL_SETTINGS", undefined, "admin_settings", {
            ...previous.adminSettings,
          }, { ...updated }),
          ...previous.auditLogs,
        ],
      }));
      return { ok: true, message: "全局设置已保存", data: updated };
    },
    [applyState],
  );

  const updateUserByAdmin = useCallback(
    (userId: EntityId, patch: AdminUserPatch): ActionResult<User> => {
      const snapshot = stateRef.current;
      const admin = getCurrentUser(snapshot);
      if (!admin || admin.role !== "admin") {
        return { ok: false, code: "ADMIN_REQUIRED", message: "只有管理员可以调整用户" };
      }
      const account = snapshot.users.find((user) => user.id === userId);
      if (!account) return { ok: false, code: "USER_NOT_FOUND", message: "用户不存在" };
      if (account.id === admin.id && patch.status === "frozen") {
        return { ok: false, code: "SELF_FREEZE_BLOCKED", message: "不能冻结当前管理员账号" };
      }
      const updated: User = {
        ...account,
        role: patch.role ?? account.role,
        status: patch.status ?? account.status,
        freezeRemark:
          patch.status === "active" ? undefined : patch.freezeRemark ?? account.freezeRemark,
        selfApiDailyLimit:
          patch.selfApiDailyLimit === undefined
            ? account.selfApiDailyLimit
            : Math.max(0, Math.floor(patch.selfApiDailyLimit)),
        paidCredits: Math.max(0, account.paidCredits + (patch.paidCreditsDelta ?? 0)),
        updatedAt: nowIso(),
      };
      applyState((previous) => ({
        ...previous,
        users: previous.users.map((user) => (user.id === account.id ? updated : user)),
        tasks:
          updated.status === "frozen"
            ? previous.tasks.map((task) =>
                task.userId === account.id &&
                ["pending", "queued", "processing"].includes(task.status)
                  ? {
                      ...task,
                      status: "terminated" as const,
                      queuePosition: undefined,
                      errorCode: "ACCOUNT_FROZEN",
                      errorMessage: "账号已被冻结，任务由风控系统终止；本次未扣除额度。",
                      completedAt: nowIso(),
                      updatedAt: nowIso(),
                    }
                  : task,
              )
            : previous.tasks,
        sessions:
          updated.status === "frozen"
            ? previous.sessions.map((session) =>
                session.userId === account.id ? { ...session, status: "revoked" } : session,
              )
            : previous.sessions,
        currentSessionId:
          updated.status === "frozen" &&
          previous.sessions.find((session) => session.id === previous.currentSessionId)?.userId === account.id
            ? null
            : previous.currentSessionId,
        auditLogs: [
          createAudit(admin, "risk", updated.status === "frozen" ? "FREEZE_USER" : "UPDATE_USER", account.id, "user", {
            role: account.role,
            status: account.status,
            selfApiDailyLimit: account.selfApiDailyLimit,
            paidCredits: account.paidCredits,
          }, {
            role: updated.role,
            status: updated.status,
            selfApiDailyLimit: updated.selfApiDailyLimit,
            paidCredits: updated.paidCredits,
            freezeRemark: updated.freezeRemark,
          }),
          ...previous.auditLogs,
        ],
      }));
      return { ok: true, message: "用户设置已更新并记录审计日志", data: updated };
    },
    [applyState],
  );

  const selectors = useMemo<StoreSelectors>(() => {
    const currentSession = getCurrentSession(state);
    const currentUser = currentSession
      ? state.users.find((user) => user.id === currentSession.userId) ?? null
      : null;
    const userTasks = currentUser
      ? state.tasks
          .filter((task) => task.userId === currentUser.id)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      : [];
    const userMaterials = currentUser
      ? state.materials
          .filter((material) => material.userId === currentUser.id)
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      : [];
    const userConnections = currentUser
      ? state.platformConnections.filter((connection) => connection.userId === currentUser.id)
      : [];
    const userNotifications = currentUser
      ? state.notifications
          .filter((item) => item.userId === currentUser.id)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      : [];
    const reservedPaidCredits = currentUser
      ? reservedPaidCreditsFor(state, currentUser.id)
      : 0;
    return {
      currentUser,
      currentSession,
      isAuthenticated: Boolean(currentUser && currentSession),
      userTasks,
      userMaterials,
      userConnections,
      userNotifications,
      unreadCount: userNotifications.filter((item) => !item.isRead).length,
      reservedPaidCredits,
      availablePaidCredits: currentUser
        ? Math.max(0, currentUser.paidCredits - reservedPaidCredits)
        : 0,
      controlPlaneStatus,
      controlPlaneMessage,
    };
  }, [state, controlPlaneMessage, controlPlaneStatus]);

  const value = useMemo<AppStoreValue>(
    () => ({
      state,
      ...selectors,
      refreshControlPlane,
      login,
      register,
      requestPasswordReset,
      resetPassword,
      logout,
      resetDemoData,
      updatePreferences,
      getFeatureAccess,
      acceptCompliance,
      connectPlatform,
      testPlatformConnection,
      disconnectPlatform,
      createTask,
      updateTask,
      retryTask,
      cancelTask,
      terminateTask,
      archiveTask,
      tickTask,
      tickTasks,
      addMaterial,
      recycleMaterial,
      restoreMaterial,
      purgeMaterial,
      purgeExpiredMaterials,
      markNotificationRead,
      markAllNotificationsRead,
      redeemRechargeCode,
      createRechargeCodes,
      createInviteCode,
      exchangeCommissionForCredits,
      requestWithdrawal,
      reviewWithdrawal,
      submitFeedback,
      updateFeedbackByAdmin,
      saveTutorial,
      saveAnnouncement,
      updateAdminSettings,
      updateUserByAdmin,
    }),
    [
      state,
      selectors,
      refreshControlPlane,
      login,
      register,
      requestPasswordReset,
      resetPassword,
      logout,
      resetDemoData,
      updatePreferences,
      getFeatureAccess,
      acceptCompliance,
      connectPlatform,
      testPlatformConnection,
      disconnectPlatform,
      createTask,
      updateTask,
      retryTask,
      cancelTask,
      terminateTask,
      archiveTask,
      tickTask,
      tickTasks,
      addMaterial,
      recycleMaterial,
      restoreMaterial,
      purgeMaterial,
      purgeExpiredMaterials,
      markNotificationRead,
      markAllNotificationsRead,
      redeemRechargeCode,
      createRechargeCodes,
      createInviteCode,
      exchangeCommissionForCredits,
      requestWithdrawal,
      reviewWithdrawal,
      submitFeedback,
      updateFeedbackByAdmin,
      saveTutorial,
      saveAnnouncement,
      updateAdminSettings,
      updateUserByAdmin,
    ],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const context = useContext(AppStoreContext);
  if (!context) throw new Error("useAppStore must be used inside <AppStoreProvider>");
  return context;
}
