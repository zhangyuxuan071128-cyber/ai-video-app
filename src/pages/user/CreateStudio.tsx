import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  Coins,
  FileText,
  ImageSquare,
  LinkSimple,
  MagicWand,
  Microphone,
  Plug,
  RocketLaunch,
  ShieldCheck,
  ShoppingBag,
  Sparkle,
  Trash,
  UploadSimple,
  UserFocus,
  VideoCamera,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from "react";
import { useAppStore } from "../../state/AppStore";
import type { CreditSource, FeatureKey, SourceType, VideoMode } from "../../types/domain";
import {
  ActionButton,
  DefinitionList,
  Field,
  PageHeader,
  Panel,
  SignalBanner,
  StateChip,
  cx,
  type Notify,
} from "./ui";

const modeMeta: Record<VideoMode, {
  label: string;
  description: string;
  icon: typeof VideoCamera;
  feature: FeatureKey;
  recommendedDuration: number;
}> = {
  comic_drama: {
    label: "AI 漫剧",
    description: "把故事大纲编排成连续分镜与剧集。",
    icon: Sparkle,
    feature: "comic_drama",
    recommendedDuration: 45,
  },
  commerce: {
    label: "商业成片",
    description: "围绕产品卖点批量生成竖屏投放素材。",
    icon: ShoppingBag,
    feature: "commerce_video",
    recommendedDuration: 25,
  },
  digital_human: {
    label: "数字人播报",
    description: "使用已授权形象和声音生成口播成片。",
    icon: UserFocus,
    feature: "digital_human",
    recommendedDuration: 60,
  },
};

const sourceMeta: Record<SourceType, { label: string; description: string; icon: typeof FileText }> = {
  prompt: { label: "创意文本", description: "从脚本、大纲或卖点直接生成", icon: FileText },
  link: { label: "视频链接", description: "解析你有权使用的参考链接", icon: LinkSimple },
  upload: { label: "本地素材", description: "选取本地图像、视频或压缩包", icon: UploadSimple },
};

const steps = [
  { index: 1, label: "创作模式" },
  { index: 2, label: "素材与脚本" },
  { index: 3, label: "生成规格" },
  { index: 4, label: "通道确认" },
] as const;

const directorStages = [
  { index: "01", name: "Brief", description: "目标与受众" },
  { index: "02", name: "角色", description: "人物与一致性" },
  { index: "03", name: "分镜", description: "节奏与镜头表" },
  { index: "04", name: "画面", description: "素材与视觉生成" },
  { index: "05", name: "配音", description: "对白与声音授权" },
  { index: "06", name: "合成", description: "剪辑与交付规格" },
] as const;

const CREATE_DRAFT_PREFIX = "stellar-video:create-draft:v1";
const CREATE_DRAFT_VERSION = 1;
const CREATE_DRAFT_INTERVAL_MS = 30_000;

type WizardState = {
  mode: VideoMode;
  sourceType: SourceType;
  title: string;
  sourceUrl: string;
  prompt: string;
  dialogue: string;
  batchCount: 1 | 15;
  aspectRatio: "9:16" | "16:9" | "1:1";
  resolution: "720p" | "1080p" | "2K";
  durationSeconds: number;
  language: string;
  voiceName: string;
  platformId: string;
  creditSource: CreditSource;
  copyrightConfirmed: boolean;
  voiceConfirmed: boolean;
};

type CreateDraft = {
  version: typeof CREATE_DRAFT_VERSION;
  userId: string;
  savedAt: string;
  step: number;
  form: WizardState;
};

const initialState: WizardState = {
  mode: "commerce",
  sourceType: "prompt",
  title: "",
  sourceUrl: "",
  prompt: "",
  dialogue: "",
  batchCount: 1,
  aspectRatio: "9:16",
  resolution: "1080p",
  durationSeconds: 25,
  language: "普通话",
  voiceName: "清越女声",
  platformId: "",
  creditSource: "paid",
  copyrightConfirmed: false,
  voiceConfirmed: false,
};

function browserLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function createDraftStorageKey(userId: string): string {
  return `${CREATE_DRAFT_PREFIX}:${encodeURIComponent(userId)}`;
}

function isWizardState(value: unknown): value is WizardState {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return (
    ["comic_drama", "commerce", "digital_human"].includes(String(draft.mode))
    && ["prompt", "link", "upload"].includes(String(draft.sourceType))
    && typeof draft.title === "string"
    && typeof draft.sourceUrl === "string"
    && typeof draft.prompt === "string"
    && typeof draft.dialogue === "string"
    && [1, 15].includes(Number(draft.batchCount))
    && ["9:16", "16:9", "1:1"].includes(String(draft.aspectRatio))
    && ["720p", "1080p", "2K"].includes(String(draft.resolution))
    && typeof draft.durationSeconds === "number"
    && Number.isFinite(draft.durationSeconds)
    && typeof draft.language === "string"
    && typeof draft.voiceName === "string"
    && typeof draft.platformId === "string"
    && ["paid", "self_api"].includes(String(draft.creditSource))
    && typeof draft.copyrightConfirmed === "boolean"
    && typeof draft.voiceConfirmed === "boolean"
  );
}

export function readCreateDraft(userId: string, storage: Storage | null = browserLocalStorage()): CreateDraft | null {
  if (!storage || !userId) return null;
  try {
    const raw = storage.getItem(createDraftStorageKey(userId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<CreateDraft>;
    if (
      draft.version !== CREATE_DRAFT_VERSION
      || draft.userId !== userId
      || typeof draft.savedAt !== "string"
      || !Number.isFinite(draft.step)
      || !isWizardState(draft.form)
    ) return null;
    return {
      version: CREATE_DRAFT_VERSION,
      userId,
      savedAt: draft.savedAt,
      step: Math.min(4, Math.max(1, Math.trunc(draft.step ?? 1))),
      form: draft.form,
    };
  } catch {
    return null;
  }
}

export function writeCreateDraft(draft: CreateDraft, storage: Storage | null = browserLocalStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(createDraftStorageKey(draft.userId), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function removeCreateDraft(userId: string, storage: Storage | null = browserLocalStorage()): boolean {
  if (!storage || !userId) return false;
  try {
    storage.removeItem(createDraftStorageKey(userId));
    return true;
  } catch {
    return false;
  }
}

export function optimizePromptLocally(prompt: string, form: Pick<WizardState, "aspectRatio" | "resolution" | "durationSeconds" | "language">): string {
  const subject = prompt.trim().replace(/\s+/g, " ");
  if (!subject) return "";
  if (["【主体】", "【环境】", "【镜头】", "【风格】", "【技术参数】"].every((heading) => subject.includes(heading))) {
    return prompt;
  }
  return [
    `【主体】${subject}`,
    "【环境】围绕主体建立清晰的时间、地点、前后景关系，并保留真实材质与可用留白。",
    "【镜头】以建立镜头交代空间，中景承接动作，细节特写突出信息；转场服务叙事，避免无意义运镜。",
    "【风格】电影级写实质感，克制用光与统一色彩，人物、产品和品牌元素在连续镜头中保持一致。",
    `【技术参数】${form.aspectRatio}，${form.resolution}，约 ${form.durationSeconds} 秒，${form.language}；构图稳定，主体清晰，预留字幕安全区。`,
  ].join("\n");
}

function hasMeaningfulDraft(form: WizardState): boolean {
  return Boolean(
    form.title.trim()
    || form.sourceUrl.trim()
    || form.prompt.trim()
    || form.dialogue.trim()
    || form.mode !== initialState.mode
    || form.sourceType !== initialState.sourceType
    || form.batchCount !== initialState.batchCount
    || form.aspectRatio !== initialState.aspectRatio
    || form.resolution !== initialState.resolution
    || form.durationSeconds !== initialState.durationSeconds
    || form.language !== initialState.language
    || form.voiceName !== initialState.voiceName
    || form.creditSource !== initialState.creditSource
    || form.copyrightConfirmed
    || form.voiceConfirmed
  );
}

function formatDraftTime(savedAt: string): string {
  const value = new Date(savedAt);
  if (Number.isNaN(value.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

export function CreateStudio({ onNavigate, notify }: { onNavigate: (view: string) => void; notify: Notify }) {
  const {
    state,
    currentUser,
    availablePaidCredits,
    reservedPaidCredits,
    userConnections,
    acceptCompliance,
    createTask,
    addMaterial,
    getFeatureAccess,
  } = useAppStore();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<WizardState>(initialState);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);
  const [detectedDraft, setDetectedDraft] = useState<CreateDraft | null>(null);
  const [draftStatus, setDraftStatus] = useState("");
  const latestDraft = useRef({ form, step });
  latestDraft.current = { form, step };

  const featureKey = modeMeta[form.mode].feature;
  const compatiblePlatforms = useMemo(
    () => state.platforms.filter((platform) => platform.isEnabled && platform.supportedFeatures.includes(featureKey)),
    [featureKey, state.platforms],
  );

  useEffect(() => {
    if (!compatiblePlatforms.some((platform) => platform.id === form.platformId)) {
      setForm((previous) => ({ ...previous, platformId: compatiblePlatforms[0]?.id ?? "" }));
    }
  }, [compatiblePlatforms, form.platformId]);

  useEffect(() => {
    if (!currentUser?.id) {
      setDetectedDraft(null);
      return;
    }
    setForm(initialState);
    setStep(1);
    setUploadFile(null);
    setDraftStatus("");
    setDetectedDraft(readCreateDraft(currentUser.id));
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id || createdTaskId) return undefined;
    const timer = window.setInterval(() => {
      if (!hasMeaningfulDraft(latestDraft.current.form)) return;
      const savedAt = new Date().toISOString();
      const saved = writeCreateDraft({
        version: CREATE_DRAFT_VERSION,
        userId: currentUser.id,
        savedAt,
        step: latestDraft.current.step,
        form: latestDraft.current.form,
      });
      setDraftStatus(saved ? `已自动保存 · ${formatDraftTime(savedAt)}` : "浏览器存储不可用，本次草稿未保存");
    }, CREATE_DRAFT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [createdTaskId, currentUser?.id]);

  const selectedPlatform = state.platforms.find((platform) => platform.id === form.platformId);
  const selectedConnection = userConnections.find((connection) => connection.platformId === form.platformId);
  const access = form.platformId ? getFeatureAccess(featureKey, form.platformId, form.creditSource) : { ok: false, message: "请选择生成平台" };
  const selfApiRemaining = Math.max(0, (selectedConnection?.dailyMaxSelfQuota ?? 0) - (selectedConnection?.dailyCallsUsed ?? 0));
  const estimatedCredits = form.batchCount;
  const paidAvailable = availablePaidCredits >= estimatedCredits;

  const update = <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setDetectedDraft(null);
    setError("");
  };

  const selectMode = (mode: VideoMode) => {
    setForm((previous) => ({
      ...previous,
      mode,
      durationSeconds: modeMeta[mode].recommendedDuration,
      voiceConfirmed: mode === "digital_human" ? previous.voiceConfirmed : false,
    }));
    setDetectedDraft(null);
    setError("");
  };

  const restoreDraft = () => {
    if (!detectedDraft) return;
    setForm(detectedDraft.form);
    // File handles cannot be persisted; resume upload drafts at the source step
    // so a stale filename can never bypass the required file selection.
    setStep(detectedDraft.form.sourceType === "upload" ? Math.min(2, detectedDraft.step) : detectedDraft.step);
    setUploadFile(null);
    setDraftStatus(`已恢复 · ${formatDraftTime(detectedDraft.savedAt)}${detectedDraft.form.sourceType === "upload" ? "；请重新选择本地文件" : ""}`);
    setDetectedDraft(null);
    setError("");
  };

  const clearDetectedDraft = () => {
    if (!currentUser?.id) return;
    const removed = removeCreateDraft(currentUser.id);
    setDetectedDraft(null);
    setDraftStatus(removed ? "已清除浏览器中的创作草稿" : "浏览器存储不可用，无法确认草稿已清除");
  };

  const optimizePrompt = () => {
    if (!form.prompt.trim()) return;
    const optimized = optimizePromptLocally(form.prompt, form);
    update("prompt", optimized);
    notify("success", optimized === form.prompt ? "当前提示已包含完整的本地结构模板" : "已用本地规则完成结构化优化，未调用 AI");
  };

  const validateStep = (current: number): string | null => {
    if (current === 1 && !form.mode) return "请选择创作模式。";
    if (current === 2) {
      if (form.title.trim().length < 2) return "请填写至少 2 个字的任务名称。";
      if (form.prompt.trim().length < 8) return "创作提示至少需要 8 个字。";
      if (form.sourceType === "link") {
        try {
          const parsed = new URL(form.sourceUrl);
          if (!/^https?:$/.test(parsed.protocol)) return "仅支持 http 或 https 参考链接。";
        } catch {
          return "请输入完整的 http/https 参考链接。";
        }
      }
      if (form.sourceType === "upload" && !uploadFile) return "请先选择本地素材文件。";
    }
    if (current === 3) {
      if (form.durationSeconds < 5 || form.durationSeconds > 180) return "单集时长需要在 5–180 秒之间。";
      if (!form.copyrightConfirmed) return "请确认素材原创性与使用授权。";
      if (form.mode === "digital_human" && !form.voiceConfirmed) return "数字人任务需确认形象和声音授权。";
    }
    if (current === 4) {
      if (!form.platformId) return "当前模式没有可用平台。";
      if (!access.ok) return access.message;
      if (form.creditSource === "paid" && !paidAvailable) return "可用共享额度不足，请充值或改用已绑定的自有 API。";
      if (form.creditSource === "self_api" && selfApiRemaining < estimatedCredits) return "所选平台的今日自有 API 剩余配额不足。";
    }
    return null;
  };

  const goNext = () => {
    const validation = validateStep(step);
    if (validation) {
      setError(validation);
      return;
    }
    setStep((current) => Math.min(4, current + 1));
    setError("");
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (file.size > 250 * 1024 * 1024) {
      setUploadFile(null);
      setError("文件大小不能超过 250 MB。");
      event.currentTarget.value = "";
      return;
    }
    setUploadFile(file);
    setError("");
  };

  const submitTask = async (event: FormEvent) => {
    event.preventDefault();
    const validation = validateStep(4);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError("");
    await new Promise<void>((resolve) => window.setTimeout(resolve, 240));

    if (form.sourceType === "link") acceptCompliance("video_parse");
    if (form.mode === "digital_human") acceptCompliance("voice_clone");

    const result = createTask({
      platformId: form.platformId,
      title: form.title,
      featureKey,
      creditSource: form.creditSource,
      input: {
        mode: form.mode,
        sourceType: form.sourceType,
        sourceName: uploadFile?.name,
        sourceUrl: form.sourceType === "link" ? form.sourceUrl.trim() : undefined,
        prompt: form.prompt,
        dialogue: form.dialogue.trim() || undefined,
        batchCount: form.batchCount,
        aspectRatio: form.aspectRatio,
        resolution: form.resolution,
        durationSeconds: form.durationSeconds,
        language: form.language,
        voiceName: form.voiceName,
      },
    });

    if (!result.ok || !result.data) {
      setBusy(false);
      setError(result.message);
      notify("error", result.message);
      return;
    }

    if (uploadFile) {
      addMaterial({
        type: uploadFile.type.startsWith("video/")
          ? "video"
          : uploadFile.type.startsWith("audio/")
            ? "audio"
            : uploadFile.type.startsWith("image/")
              ? "photo"
              : "project",
        title: uploadFile.name,
        description: `来自任务《${form.title.trim()}》的本地来源记录`,
        mimeType: uploadFile.type || undefined,
        sizeBytes: uploadFile.size,
        sourceTaskId: result.data.id,
      });
    }
    setBusy(false);
    setCreatedTaskId(result.data.id);
    if (currentUser?.id) removeCreateDraft(currentUser.id);
    setDetectedDraft(null);
    setDraftStatus("");
    notify("success", result.message);
  };

  const resetWizard = () => {
    setForm(initialState);
    setUploadFile(null);
    setCreatedTaskId(null);
    setStep(1);
    if (currentUser?.id) removeCreateDraft(currentUser.id);
    setDetectedDraft(null);
    setDraftStatus("");
    setError("");
  };

  if (createdTaskId) {
    return (
      <div className="uw-page uw-create-complete">
        <PageHeader title="任务已进入生产轨道" description="该记录由本地演示引擎驱动，不代表真实供应商已接收。" />
        <div className="uw-completion-orbit">
          <div className="uw-completion-orbit__rings" aria-hidden="true"><span /><span /><span /></div>
          <CheckCircle weight="duotone" aria-hidden="true" />
          <StateChip label="已创建" tone="good" />
          <h2>{form.title}</h2>
          <p>{modeMeta[form.mode].label} · {form.batchCount} 集 · {selectedPlatform?.name} · 预估 {estimatedCredits} 次额度</p>
          <code>{createdTaskId}</code>
          <div className="uw-completion-orbit__actions">
            <ActionButton tone="primary" icon={<ArrowRight />} onClick={() => onNavigate("tasks")}>查看任务进度</ActionButton>
            <ActionButton tone="secondary" icon={<MagicWand />} onClick={resetWizard}>继续创建</ActionButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form className="uw-page uw-create" onSubmit={submitTask} noValidate>
      <PageHeader
        title="批量创作实验台"
        description="用四步配置生成模式、来源、成片规格与额度通道；编辑内容每 30 秒保存为当前账户的浏览器草稿。"
        aside={<StateChip label={`步骤 ${step} / 4`} tone="accent" />}
      />

      <section className="uw-director-chain" aria-labelledby="uw-director-chain-title">
        <header>
          <div>
            <h2 id="uw-director-chain-title">六阶段导演链路</h2>
          </div>
          <p>这是创作结构说明，不代表后台已开始执行；任务只会在最终提交后写入本地演示队列。</p>
        </header>
        <ol>
          {directorStages.map((stage) => (
            <li key={stage.index}>
              <span>{stage.index}</span>
              <strong>{stage.name}</strong>
              <small>{stage.description}</small>
            </li>
          ))}
        </ol>
      </section>

      {detectedDraft ? (
        <SignalBanner
          tone="info"
          title={`发现 ${formatDraftTime(detectedDraft.savedAt)} 保存的草稿`}
          actions={(
            <span className="uw-draft-actions">
              <ActionButton tone="secondary" icon={<FileText />} onClick={restoreDraft}>恢复草稿</ActionButton>
              <ActionButton tone="quiet" icon={<Trash />} onClick={clearDetectedDraft}>清除草稿</ActionButton>
            </span>
          )}
        >
          草稿属于当前账户；本地文件不会被保存，恢复上传型草稿后需重新选择文件。
        </SignalBanner>
      ) : draftStatus ? <p className="uw-draft-status" role="status">{draftStatus}</p> : null}

      <nav className="uw-wizard-rail" aria-label="任务创建步骤">
        {steps.map((item) => {
          const active = item.index === step;
          const complete = item.index < step;
          const locked = item.index > step;
          return (
            <button
              type="button"
              key={item.index}
              className={cx("uw-wizard-rail__step", active && "is-active", complete && "is-complete")}
              aria-current={active ? "step" : undefined}
              disabled={locked}
              title={locked ? "请先完成当前步骤" : `返回${item.label}`}
              onClick={() => setStep(item.index)}
            >
              <span>{complete ? <Check weight="bold" /> : item.index}</span>
              <strong>{item.label}</strong>
            </button>
          );
        })}
      </nav>

      {error ? <SignalBanner tone="error" title="当前步骤还需要处理">{error}</SignalBanner> : null}

      <div className="uw-wizard-stage">
        {step === 1 ? (
          <div className="uw-wizard-section">
            <div className="uw-wizard-section__intro">
              <h2>选择这条生产轨道的核心形态</h2>
              <p>模式会决定可用平台、默认时长和合规确认项。</p>
            </div>
            <div className="uw-mode-grid">
              {(Object.keys(modeMeta) as VideoMode[]).map((mode) => {
                const item = modeMeta[mode];
                const Glyph = item.icon;
                return (
                  <button type="button" className={cx("uw-mode-card", form.mode === mode && "is-selected")} onClick={() => selectMode(mode)} aria-pressed={form.mode === mode} key={mode}>
                    <span className="uw-mode-card__glyph" aria-hidden="true"><Glyph weight="duotone" /></span>
                    <span className="uw-mode-card__copy"><strong>{item.label}</strong><small>{item.description}</small></span>
                    <span className="uw-mode-card__check" aria-hidden="true"><Check weight="bold" /></span>
                  </button>
                );
              })}
            </div>
            <SignalBanner tone="info" title="实际供应商能力仍需接入后验证">
              本版的生成进度和平台状态是可交互本地演示，不会向外部模型发送内容。
            </SignalBanner>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="uw-wizard-section">
            <div className="uw-wizard-section__intro">
              <h2>定义来源和创作意图</h2>
              <p>这些内容会作为任务记录保存在当前浏览器。</p>
            </div>
            <div className="uw-source-switch" role="radiogroup" aria-label="素材来源">
              {(Object.keys(sourceMeta) as SourceType[]).map((source) => {
                const item = sourceMeta[source];
                const Glyph = item.icon;
                return (
                  <button type="button" role="radio" aria-checked={form.sourceType === source} className={cx("uw-source-switch__item", form.sourceType === source && "is-selected")} onClick={() => update("sourceType", source)} key={source}>
                    <Glyph weight="duotone" aria-hidden="true" /><span><strong>{item.label}</strong><small>{item.description}</small></span>
                  </button>
                );
              })}
            </div>
            <div className="uw-form-grid uw-form-grid--two">
              <Field label="任务名称" required hint="建议包含品牌、主题和集数">
                <input value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="例：秋季松茸上新 · 15 集" maxLength={80} />
              </Field>
              {form.sourceType === "link" ? (
                <Field label="参考视频链接" required hint="仅支持你有权使用的 http/https 地址">
                  <input type="url" value={form.sourceUrl} onChange={(event) => update("sourceUrl", event.target.value)} placeholder="https://example.com/video" inputMode="url" />
                </Field>
              ) : form.sourceType === "upload" ? (
                <Field label="本地素材" required hint="最大 250 MB；演示版只保存文件元数据，不会上传字节内容">
                  <span className={cx("uw-upload-control", uploadFile && "has-file")}>
                    <input type="file" onChange={onFileChange} accept="image/*,video/*,audio/*,.zip" aria-label="选择本地素材" />
                    <UploadSimple weight="duotone" aria-hidden="true" />
                    <span>{uploadFile ? uploadFile.name : "点击选择素材文件"}</span>
                  </span>
                </Field>
              ) : (
                <div className="uw-source-placeholder" aria-label="创意文本模式">
                  <FileText weight="duotone" aria-hidden="true" />
                  <span><strong>纯文本生成</strong><small>无需额外来源文件</small></span>
                </div>
              )}
            </div>
            <Field label="创作提示" required hint="说明人物、场景、节奏、镜头和情绪，避免只写形容词">
              <textarea value={form.prompt} onChange={(event) => update("prompt", event.target.value)} rows={7} maxLength={1800} placeholder="例：晨雾中的高山松茸采摘，切换到都市轻食桌面。产品需保持真实质感，镜头从环境全景到细节特写，结尾留出价格和行动文案区域。" />
            </Field>
            <div className="uw-prompt-optimizer">
              <div id="uw-prompt-optimizer-note">
                <strong>本地结构化优化</strong>
                <span>{form.prompt.trim() ? "按主体、环境、镜头、风格与技术参数扩写；只运行本地规则，不会调用 AI。" : "请先输入创作提示；空内容没有可优化的主体信息。"}</span>
              </div>
              <ActionButton
                tone="secondary"
                icon={<MagicWand />}
                onClick={optimizePrompt}
                disabled={!form.prompt.trim()}
                disabledReason="请先输入创作提示"
                aria-describedby="uw-prompt-optimizer-note"
              >
                本地优化提示
              </ActionButton>
            </div>
            <Field label="台词 / 旁白（可选）" hint="不填写时由脚本引擎根据创作提示拟写">
              <textarea value={form.dialogue} onChange={(event) => update("dialogue", event.target.value)} rows={4} maxLength={1000} placeholder="输入必须保留的口播内容或角色对话…" />
            </Field>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="uw-wizard-section">
            <div className="uw-wizard-section__intro">
              <h2>编排集数与成片规格</h2>
              <p>批量数同时决定预估消耗；任务完成前只会预留共享额度。</p>
            </div>
            <div className="uw-episode-selector" role="radiogroup" aria-label="生成集数">
              <button type="button" role="radio" aria-checked={form.batchCount === 1} className={cx(form.batchCount === 1 && "is-selected")} onClick={() => update("batchCount", 1)}>
                <span>1</span><strong>单集生成</strong><small>适合试片和快速迭代</small>
              </button>
              <button type="button" role="radio" aria-checked={form.batchCount === 15} className={cx(form.batchCount === 15 && "is-selected")} onClick={() => update("batchCount", 15)}>
                <span>15</span><strong>连续剧集</strong><small>一次生成最多 15 集</small>
              </button>
            </div>
            <div className="uw-form-grid uw-form-grid--four">
              <Field label="画面比例">
                <select value={form.aspectRatio} onChange={(event) => update("aspectRatio", event.target.value as WizardState["aspectRatio"])}>
                  <option value="9:16">9:16 竖屏</option><option value="16:9">16:9 横屏</option><option value="1:1">1:1 方形</option>
                </select>
              </Field>
              <Field label="输出清晰度">
                <select value={form.resolution} onChange={(event) => update("resolution", event.target.value as WizardState["resolution"])}>
                  <option value="720p">720p</option><option value="1080p">1080p</option><option value="2K">2K</option>
                </select>
              </Field>
              <Field label="单集时长" hint="5–180 秒">
                <input type="number" min={5} max={180} value={form.durationSeconds} onChange={(event) => update("durationSeconds", Number(event.target.value))} />
              </Field>
              <Field label="语言">
                <select value={form.language} onChange={(event) => update("language", event.target.value)}>
                  <option>普通话</option><option>粤语</option><option>英语</option><option>日语</option>
                </select>
              </Field>
            </div>
            <Field label="音色名称" hint="这是任务标签；演示版不会调用真实音色模型">
              <input value={form.voiceName} onChange={(event) => update("voiceName", event.target.value)} maxLength={40} />
            </Field>
            <div className="uw-compliance-block">
              <div className="uw-compliance-block__head"><ShieldCheck weight="duotone" aria-hidden="true" /><div><strong>生成前合规确认</strong><span>同意记录仅保存在本地演示状态中。</span></div></div>
              <label className="uw-check-row"><input type="checkbox" checked={form.copyrightConfirmed} onChange={(event) => update("copyrightConfirmed", event.target.checked)} /><span><Check weight="bold" /></span><div><strong>我拥有或已获得所有文本、视频、图片与品牌素材的使用授权。</strong><small>禁止解析、复制或伪造未授权的他人内容。</small></div></label>
              {form.mode === "digital_human" ? <label className="uw-check-row"><input type="checkbox" checked={form.voiceConfirmed} onChange={(event) => update("voiceConfirmed", event.target.checked)} /><span><Check weight="bold" /></span><div><strong>我已获得形象主体与声音主体的明确授权。</strong><small>不得用于欺诈、冒用身份或未经允许的声音克隆。</small></div></label> : null}
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="uw-wizard-section">
            <div className="uw-wizard-section__intro">
              <h2>选择生成平台与计费通道</h2>
              <p>只显示支持「{modeMeta[form.mode].label}」的平台。当前连接状态为本地演示，不代表真实可用性。</p>
            </div>
            <div className="uw-platform-choice" role="radiogroup" aria-label="生成平台">
              {compatiblePlatforms.map((platform) => {
                const connection = userConnections.find((item) => item.platformId === platform.id);
                return (
                  <button type="button" role="radio" aria-checked={form.platformId === platform.id} className={cx("uw-platform-choice__item", form.platformId === platform.id && "is-selected")} onClick={() => update("platformId", platform.id)} key={platform.id}>
                    <span className="uw-platform-choice__glyph" style={{ "--platform-accent": platform.accent } as CSSProperties}>{platform.iconGlyph}</span>
                    <span><strong>{platform.name}</strong><small>{platform.specialty}</small></span>
                    <StateChip label={connection && ["connected", "degraded"].includes(connection.status) ? "演示已连接" : "未绑定"} tone={connection && ["connected", "degraded"].includes(connection.status) ? "good" : "neutral"} />
                  </button>
                );
              })}
            </div>
            <div className="uw-credit-lanes" role="radiogroup" aria-label="额度来源">
              <button type="button" role="radio" aria-checked={form.creditSource === "paid"} className={cx("uw-credit-lane", form.creditSource === "paid" && "is-selected")} onClick={() => update("creditSource", "paid")}>
                <Coins weight="duotone" aria-hidden="true" />
                <span><strong>共享创作额度</strong><small>当前可用 {availablePaidCredits} 次{reservedPaidCredits ? `，${reservedPaidCredits} 次已预留` : ""}</small></span>
                <b>{estimatedCredits} 次</b>
              </button>
              <button type="button" role="radio" aria-checked={form.creditSource === "self_api"} className={cx("uw-credit-lane", form.creditSource === "self_api" && "is-selected")} onClick={() => update("creditSource", "self_api")}>
                <Plug weight="duotone" aria-hidden="true" />
                <span><strong>自有 API 配额</strong><small>{selectedConnection ? `平台今日剩余 ${selfApiRemaining} 次` : "所选平台尚未完成绑定"}</small></span>
                <b>{estimatedCredits} 次</b>
              </button>
            </div>
            <div className="uw-submit-review">
              <Panel title="提交前校验" description="这是本次将写入任务记录的配置">
                <DefinitionList items={[
                  { term: "模式", value: modeMeta[form.mode].label },
                  { term: "来源", value: sourceMeta[form.sourceType].label },
                  { term: "规格", value: `${form.batchCount} 集 · ${form.aspectRatio} · ${form.resolution} · ${form.durationSeconds} 秒` },
                  { term: "平台", value: selectedPlatform?.name ?? "未选择" },
                  { term: "通道", value: form.creditSource === "paid" ? "共享创作额度" : "自有 API 配额" },
                  { term: "预估消耗", value: `${estimatedCredits} 次` },
                ]} />
              </Panel>
              <div className={cx("uw-access-verdict", access.ok ? "is-ready" : "is-blocked")}>
                {access.ok ? <CheckCircle weight="duotone" aria-hidden="true" /> : <WarningCircle weight="duotone" aria-hidden="true" />}
                <div><strong>{access.ok ? "任务通道已就绪" : "当前通道不可提交"}</strong><span>{access.message}</span></div>
                {!access.ok && form.creditSource === "self_api" ? <ActionButton tone="quiet" icon={<Plug />} onClick={() => onNavigate("platforms")}>前往绑定</ActionButton> : null}
                {!paidAvailable && form.creditSource === "paid" ? <ActionButton tone="quiet" icon={<Coins />} onClick={() => onNavigate("wallet")}>前往充值</ActionButton> : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <footer className="uw-wizard-actions">
        <div className="uw-wizard-actions__note"><ShieldCheck weight="duotone" aria-hidden="true" /><span>所有操作只写入当前浏览器的 V7.1 演示数据。</span></div>
        <div>
          {step > 1 ? <ActionButton tone="quiet" icon={<ArrowLeft />} onClick={() => { setStep((current) => current - 1); setError(""); }}>上一步</ActionButton> : <ActionButton tone="quiet" icon={<ArrowLeft />} onClick={() => onNavigate("dashboard")}>返回指挥舱</ActionButton>}
          {step < 4 ? <ActionButton tone="primary" icon={<ArrowRight />} onClick={goNext}>继续配置</ActionButton> : <ActionButton tone="primary" icon={<RocketLaunch />} type="submit" busy={busy} disabled={!access.ok || (form.creditSource === "paid" && !paidAvailable)} disabledReason={!access.ok ? access.message : "共享额度不足"}>提交批量任务</ActionButton>}
        </div>
      </footer>
    </form>
  );
}
