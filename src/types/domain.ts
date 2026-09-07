/**
 * Shared domain language for the local V7.1 product demo.
 *
 * Security boundary: user passwords and provider API keys are deliberately not
 * represented in this model. Password verifiers live in a separate local vault
 * and platform connections retain only a masked hint plus a one-way fingerprint.
 */

export type EntityId = string;
export type ISODateTime = string;
export type ISODate = string;

export type UserRole = "user" | "agent" | "admin";
export type UserStatus = "active" | "frozen";
export type AuthKind = "demo" | "local" | "server";

export interface UserPreferences {
  popupNotifications: boolean;
  voiceNotifications: boolean;
  browserNotifications: boolean;
  voiceName: string;
  reducedMotion: boolean;
}

export interface User {
  id: EntityId;
  username: string;
  nickname: string;
  phone?: string;
  avatarUrl?: string;
  avatarInitials: string;
  role: UserRole;
  status: UserStatus;
  authKind: AuthKind;
  freezeRemark?: string;
  freeCredits: Record<EntityId, number>;
  paidCredits: number;
  selfApiDailyLimit: number;
  selfApiCallsToday: number;
  selfApiUsageDate: ISODate;
  loginFailCount: number;
  lockedUntil?: ISODateTime;
  lastLoginAt?: ISODateTime;
  lastLoginIp?: string;
  preferences: UserPreferences;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type SessionStatus = "active" | "revoked" | "expired";

export interface Session {
  id: EntityId;
  userId: EntityId;
  status: SessionStatus;
  createdAt: ISODateTime;
  expiresAt: ISODateTime;
  lastSeenAt: ISODateTime;
  userAgent: string;
}

export type LoginStatus = "success" | "failed" | "locked" | "frozen";

export interface LoginLog {
  id: EntityId;
  userId?: EntityId;
  username: string;
  ipAddress: string;
  userAgent: string;
  status: LoginStatus;
  failureReason?: string;
  createdAt: ISODateTime;
}

export type FeatureKey =
  | "link_parse"
  | "local_upload"
  | "shot_split"
  | "portrait_replace"
  | "voice_clone"
  | "comic_drama"
  | "commerce_video"
  | "digital_human"
  | "batch_generate"
  | "material_export";

export interface FeatureSwitch {
  id: EntityId;
  userId: EntityId;
  featureKey: FeatureKey;
  isEnabled: boolean;
  enabledAt?: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Platform {
  id: EntityId;
  sortOrder: number;
  slug: "deepseek" | "glm" | "qwen" | "jimeng" | "volcengine" | "xiling";
  name: string;
  shortName: string;
  description: string;
  specialty: string;
  accent: string;
  iconGlyph: string;
  freeCredits: number;
  isEnabled: boolean;
  apiBaseUrl: string;
  registerUrl: string;
  loginUrl: string;
  supportedFeatures: FeatureKey[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type PlatformConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "degraded"
  | "error";

export interface PlatformConnection {
  id: EntityId;
  userId: EntityId;
  platformId: EntityId;
  platformUsername?: string;
  appName: string;
  apiKeyHint: string;
  keyFingerprint: string;
  status: PlatformConnectionStatus;
  statusMessage?: string;
  latencyMs?: number;
  dailyMaxSelfQuota: number;
  dailyCallsUsed: number;
  usageDate: ISODate;
  connectedAt?: ISODateTime;
  lastTestedAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type VideoMode = "comic_drama" | "commerce" | "digital_human";
export type SourceType = "prompt" | "link" | "upload";
export type TaskStatus =
  | "pending"
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "terminated";
export type TaskStage =
  | "preparing"
  | "parsing"
  | "storyboarding"
  | "generating_visuals"
  | "synthesizing_voice"
  | "compositing"
  | "packaging"
  | "done";
export type CreditSource = "paid" | "self_api";

export interface TaskInput {
  mode: VideoMode;
  sourceType: SourceType;
  sourceName?: string;
  sourceUrl?: string;
  prompt: string;
  dialogue?: string;
  batchCount: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  resolution: "720p" | "1080p" | "2K";
  durationSeconds: number;
  language: string;
  voiceName?: string;
  characterMaterialId?: EntityId;
  productMaterialIds?: EntityId[];
  simulateFailure?: boolean;
}

export interface TaskOutput {
  id: EntityId;
  episode: number;
  title: string;
  durationSeconds: number;
  previewUrl?: string;
  downloadUrl?: string;
  subtitleUrl?: string;
  createdAt: ISODateTime;
}

export interface GenerationTask {
  id: EntityId;
  userId: EntityId;
  platformId: EntityId;
  featureKey: FeatureKey;
  title: string;
  status: TaskStatus;
  stage: TaskStage;
  progress: number;
  queuePosition?: number;
  input: TaskInput;
  outputs: TaskOutput[];
  creditSource: CreditSource;
  creditsEstimated: number;
  creditsCharged: number;
  errorCode?: string;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  isArchived: boolean;
  startedAt?: ISODateTime;
  completedAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type MaterialType =
  | "photo"
  | "product"
  | "audio"
  | "voice"
  | "project"
  | "video"
  | "subtitle";

export interface Material {
  id: EntityId;
  userId: EntityId;
  type: MaterialType;
  title: string;
  description?: string;
  resourceUrl?: string;
  previewUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  durationSeconds?: number;
  sourceTaskId?: EntityId;
  isDeleted: boolean;
  recycledAt?: ISODateTime;
  recycleExpiresAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type NotificationType =
  | "task_complete"
  | "task_failed"
  | "commission"
  | "withdraw"
  | "system"
  | "recharge";
export type NotificationPriority = "low" | "normal" | "high";

export interface AppNotification {
  id: EntityId;
  userId: EntityId;
  type: NotificationType;
  title: string;
  content: string;
  priority: NotificationPriority;
  isRead: boolean;
  relatedTaskId?: EntityId;
  relatedRechargeId?: EntityId;
  actionHref?: string;
  createdAt: ISODateTime;
}

export type CreditType = "paid" | "free" | "self_api";

export interface UsageLog {
  id: EntityId;
  userId: EntityId;
  platformId?: EntityId;
  featureKey: FeatureKey;
  creditsUsed: number;
  creditType: CreditType;
  remainingCredits: number;
  taskId?: EntityId;
  description: string;
  createdAt: ISODateTime;
}

export interface PackageTemplate {
  id: EntityId;
  name: string;
  subtitle: string;
  value: number;
  credits: number;
  badge?: string;
  isActive: boolean;
  createdBy: EntityId;
  createdAt: ISODateTime;
}

export type CodeStatus = "active" | "disabled" | "expired" | "used";
export type CreditValidity = "permanent" | "time_limit";

export interface RechargeCode {
  id: EntityId;
  code: string;
  value: number;
  credits: number;
  status: CodeStatus;
  validity: CreditValidity;
  packageId?: EntityId;
  usedBy?: EntityId;
  usedAt?: ISODateTime;
  expiresAt?: ISODateTime;
  createdBy: EntityId;
  createdAt: ISODateTime;
}

export interface RechargeLog {
  id: EntityId;
  userId: EntityId;
  rechargeCodeId: EntityId;
  rechargeCode: string;
  amount: number;
  credits: number;
  createdAt: ISODateTime;
}

export interface InviteCode {
  id: EntityId;
  code: string;
  createdBy: EntityId;
  creatorRole: UserRole;
  maxUses: number;
  usedCount: number;
  status: CodeStatus;
  giftCredits: number;
  validity: CreditValidity;
  expiresAt?: ISODateTime;
  createdAt: ISODateTime;
}

export interface InviteRelation {
  id: EntityId;
  userId: EntityId;
  invitedBy: EntityId;
  inviteCodeId: EntityId;
  createdAt: ISODateTime;
}

export interface CommissionAccount {
  id: EntityId;
  userId: EntityId;
  totalEarned: number;
  availableBalance: number;
  pendingWithdrawal: number;
  exchangedCredits: number;
  withdrawnAmount: number;
  updatedAt: ISODateTime;
  createdAt: ISODateTime;
}

export type CommissionTransactionType =
  | "level_1"
  | "level_2"
  | "credit_exchange"
  | "withdrawal";

export interface CommissionTransaction {
  id: EntityId;
  userId: EntityId;
  type: CommissionTransactionType;
  fromUserId?: EntityId;
  level?: 1 | 2;
  rechargeAmount?: number;
  rate?: number;
  amount: number;
  credits?: number;
  rechargeLogId?: EntityId;
  description: string;
  createdAt: ISODateTime;
}

export type WithdrawalMethod = "wechat" | "alipay";
export type WithdrawalStatus = "pending" | "approved" | "rejected";

export interface WithdrawalRequest {
  id: EntityId;
  userId: EntityId;
  amount: number;
  fee: number;
  actualAmount: number;
  method: WithdrawalMethod;
  accountMasked: string;
  status: WithdrawalStatus;
  adminRemark?: string;
  processedAt?: ISODateTime;
  createdAt: ISODateTime;
}

export type TutorialCategory =
  | "getting_started"
  | "api_binding"
  | "video_creation"
  | "affiliate"
  | "faq";

export interface Tutorial {
  id: EntityId;
  category: TutorialCategory;
  title: string;
  summary: string;
  content: string;
  videoUrl?: string;
  durationMinutes: number;
  sortOrder: number;
  isPinned: boolean;
  isPublished: boolean;
  viewCount: number;
  createdBy: EntityId;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type AnnouncementType = "banner" | "notice" | "popup";
export type AnnouncementJumpType = "inner" | "outer";

export interface Announcement {
  id: EntityId;
  type: AnnouncementType;
  title: string;
  eyebrow?: string;
  imageUrl?: string;
  content: string;
  jumpUrl?: string;
  jumpType?: AnnouncementJumpType;
  sortOrder: number;
  isActive: boolean;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  createdBy: EntityId;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type FeedbackType = "recommendation" | "suggestion" | "bug" | "question";
export type FeedbackStatus = "pending" | "processing" | "adopted" | "closed";

export interface Feedback {
  id: EntityId;
  userId: EntityId;
  platformId?: EntityId;
  type: FeedbackType;
  title: string;
  content: string;
  images: string[];
  status: FeedbackStatus;
  adminReply?: string;
  adminReplyAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type ComplianceFeature = "video_parse" | "voice_clone";

export interface ComplianceConsent {
  id: EntityId;
  userId: EntityId;
  feature: ComplianceFeature;
  statementVersion: string;
  acceptedAt: ISODateTime;
}

export interface AdminSettings {
  globalSelfApiEnabled: boolean;
  maxConcurrentTasks: number;
  autoRetryLimit: number;
  recycleRetentionDays: 7 | 15 | 30;
  compliancePopupEnabled: boolean;
  commissionExchangeEnabled: boolean;
  withdrawalsEnabled: boolean;
  firstLevelCommissionRate: number;
  secondLevelCommissionRate: number;
  commissionCreditsPerYuan: number;
  lowCreditWarningThreshold: number;
  popupNotificationText: string;
  updatedAt: ISODateTime;
  updatedBy: EntityId;
}

export type AuditModule =
  | "auth"
  | "platform"
  | "invite"
  | "recharge"
  | "content"
  | "risk"
  | "withdrawal"
  | "settings"
  | "task"
  | "material"
  | "feedback";

export interface AuditLog {
  id: EntityId;
  actorUserId: EntityId;
  actorRole: UserRole;
  action: string;
  module: AuditModule;
  targetId?: EntityId;
  targetType?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  createdAt: ISODateTime;
}

export interface AppState {
  schemaVersion: number;
  seedRevision: string;
  currentSessionId: EntityId | null;
  users: User[];
  sessions: Session[];
  loginLogs: LoginLog[];
  platforms: Platform[];
  platformConnections: PlatformConnection[];
  featureSwitches: FeatureSwitch[];
  tasks: GenerationTask[];
  materials: Material[];
  notifications: AppNotification[];
  usageLogs: UsageLog[];
  packageTemplates: PackageTemplate[];
  rechargeCodes: RechargeCode[];
  rechargeLogs: RechargeLog[];
  inviteCodes: InviteCode[];
  inviteRelations: InviteRelation[];
  commissionAccounts: CommissionAccount[];
  commissionTransactions: CommissionTransaction[];
  withdrawalRequests: WithdrawalRequest[];
  tutorials: Tutorial[];
  announcements: Announcement[];
  feedbacks: Feedback[];
  complianceConsents: ComplianceConsent[];
  adminSettings: AdminSettings;
  auditLogs: AuditLog[];
}

export interface ActionResult<T = undefined> {
  ok: boolean;
  message: string;
  data?: T;
  code?: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface RegisterInput {
  username: string;
  password: string;
  inviteCode: string;
  nickname?: string;
  phone?: string;
}

export interface PasswordResetChallenge {
  userId: EntityId;
  code: string;
  expiresAt: ISODateTime;
}

export interface ConnectPlatformInput {
  platformId: EntityId;
  platformUsername?: string;
  appName: string;
  apiKey: string;
  dailyMaxSelfQuota?: number;
}

export interface CreateTaskInput {
  platformId: EntityId;
  title: string;
  featureKey: FeatureKey;
  creditSource: CreditSource;
  input: TaskInput;
}

export interface CreateFeedbackInput {
  platformId?: EntityId;
  type: FeedbackType;
  title: string;
  content: string;
  images?: string[];
}

export interface AdminUserPatch {
  role?: UserRole;
  status?: UserStatus;
  freezeRemark?: string;
  selfApiDailyLimit?: number;
  paidCreditsDelta?: number;
}

export const ALL_FEATURES: FeatureKey[] = [
  "link_parse",
  "local_upload",
  "shot_split",
  "portrait_replace",
  "voice_clone",
  "comic_drama",
  "commerce_video",
  "digital_human",
  "batch_generate",
  "material_export",
];

export const TASK_TERMINAL_STATUSES: TaskStatus[] = [
  "completed",
  "failed",
  "cancelled",
  "terminated",
];
