import { SCHEMA_VERSION } from "./store.mjs";
import { hashPassword } from "./security.mjs";

const PROVIDER_CATALOG = [
  ["deepseek", "DeepSeek", "llm"],
  ["glm", "智谱 GLM", "llm"],
  ["qwen", "通义千问", "llm"],
  ["jimeng", "即梦", "video"],
  ["volcengine", "火山方舟", "video"],
  ["xiling", "百度曦灵数字人", "avatar"],
];

function seedMember({ id, username, nickname, passwordHash, role, now }) {
  return {
    id,
    username,
    normalizedUsername: username.toLowerCase(),
    nickname,
    passwordHash,
    role,
    status: "active",
    mustRotatePassword: role === "super_admin",
    bootstrap: true,
    freeCredits: 0,
    paidCredits: 0,
    dailyQuota: role === "super_admin" ? 10_000 : 100,
    usageDate: now.slice(0, 10),
    usageToday: 0,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

export async function createInitialState(clock = () => new Date()) {
  const now = clock().toISOString();
  const [adminHash, creatorHash, agentHash] = await Promise.all([
    hashPassword("123456"),
    hashPassword("123456"),
    hashPassword("123456"),
  ]);
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    members: [
      seedMember({
        id: "member_admin_bootstrap",
        username: "admin",
        nickname: "首次启动超级管理员",
        passwordHash: adminHash,
        role: "super_admin",
        now,
      }),
      seedMember({
        id: "member_creator_bootstrap",
        username: "creator",
        nickname: "创作者启动账号",
        passwordHash: creatorHash,
        role: "user",
        now,
      }),
      seedMember({
        id: "member_agent_bootstrap",
        username: "agent",
        nickname: "代理商启动账号",
        passwordHash: agentHash,
        role: "agent",
        now,
      }),
    ],
    sessions: [],
    loginAttempts: [],
    inviteCodes: [],
    rechargeCodes: [],
    packages: [],
    providers: PROVIDER_CATALOG.map(([id, name, category]) => ({
      id: `provider_${id}`,
      slug: id,
      name,
      category,
      model: "",
      endpoint: null,
      adapterStatus: "unconfigured",
      enabled: false,
      secretEnvelope: null,
      secretLast4: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
    })),
    partnerKeys: [],
    tutorials: [],
    announcements: [],
    feedback: [],
    usageEvents: [],
    ledgerEntries: [],
    riskPolicy: {
      id: "risk_policy_default",
      loginWindowSeconds: 900,
      maxLoginFailures: 5,
      lockSeconds: 900,
      sessionTtlSeconds: 43_200,
      maxDailyQuota: 100_000,
      maxCreditAdjustment: 1_000_000,
      updatedAt: now,
      updatedBy: "system",
      version: 1,
    },
    idempotency: [],
    auditEvents: [],
  };
}
