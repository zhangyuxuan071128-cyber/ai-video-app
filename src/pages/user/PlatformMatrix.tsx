import {
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  Check,
  CheckCircle,
  Key,
  LockSimple,
  Plug,
  Pulse,
  ShieldCheck,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useAppStore } from "../../state/AppStore";
import type { Platform, PlatformConnection } from "../../types/domain";
import {
  ActionButton,
  ConfirmDialog,
  DefinitionList,
  EmptyState,
  Field,
  PageHeader,
  Panel,
  SignalBanner,
  StateChip,
  cx,
  formatFullDate,
  type Notify,
} from "./ui";

const featureLabel: Record<string, string> = {
  link_parse: "链接解析",
  local_upload: "本地上传",
  shot_split: "智能分镜",
  portrait_replace: "人像替换",
  voice_clone: "音色克隆",
  comic_drama: "AI 漫剧",
  commerce_video: "商业成片",
  digital_human: "数字人",
  batch_generate: "批量生成",
  material_export: "素材导出",
};

function connectionStatus(connection?: PlatformConnection) {
  if (!connection || connection.status === "disconnected") return { label: "未绑定", tone: "neutral" as const };
  if (connection.status === "connecting") return { label: "本地校验中", tone: "accent" as const };
  if (connection.status === "degraded") return { label: "演示降级", tone: "warning" as const };
  if (connection.status === "error") return { label: "本地异常", tone: "danger" as const };
  return { label: "演示已连接", tone: "good" as const };
}

function PlatformCard({
  platform,
  connection,
  testing,
  onConfigure,
  onTest,
  onDisconnect,
}: {
  platform: Platform;
  connection?: PlatformConnection;
  testing: boolean;
  onConfigure: () => void;
  onTest: () => void;
  onDisconnect: () => void;
}) {
  const status = connectionStatus(connection);
  const isBound = Boolean(connection?.keyFingerprint && connection.status !== "disconnected");
  const remaining = Math.max(0, (connection?.dailyMaxSelfQuota ?? 0) - (connection?.dailyCallsUsed ?? 0));
  return (
    <article className="uw-platform-card" style={{ "--platform-accent": platform.accent } as CSSProperties}>
      <header className="uw-platform-card__header">
        <span className="uw-platform-card__glyph" aria-hidden="true">{platform.iconGlyph}</span>
        <div><h2>{platform.name}</h2><p>{platform.specialty}</p></div>
        <StateChip label={status.label} tone={status.tone} pulse={connection?.status === "connecting"} />
      </header>
      <p className="uw-platform-card__description">{platform.description}</p>
      <div className="uw-platform-card__features">{platform.supportedFeatures.slice(0, 5).map((feature) => <span key={feature}>{featureLabel[feature] ?? feature}</span>)}</div>
      <div className="uw-platform-card__channel">
        <div><span>API 标识</span><strong>{isBound ? connection?.apiKeyHint : "未保存"}</strong></div>
        <div><span>今日演示配额</span><strong>{isBound ? `${remaining} / ${connection?.dailyMaxSelfQuota}` : "暂无"}</strong></div>
        <div><span>上次本地检查</span><strong>{connection?.lastTestedAt ? formatFullDate(connection.lastTestedAt) : "从未检查"}</strong></div>
      </div>
      {connection?.statusMessage ? <div className="uw-platform-card__message"><Pulse weight="duotone" aria-hidden="true" /><span>{connection.statusMessage}</span></div> : null}
      <div className="uw-platform-card__actions">
        <ActionButton tone={isBound ? "secondary" : "primary"} icon={isBound ? <Key /> : <Plug />} onClick={onConfigure}>{isBound ? "更新配置" : "绑定 API"}</ActionButton>
        <ActionButton tone="quiet" icon={<Pulse />} busy={testing} onClick={onTest} disabled={!isBound} disabledReason="请先保存 API 配置">消耗 1 次演示检查</ActionButton>
        <ActionButton tone="danger" icon={<XCircle />} onClick={onDisconnect} disabled={!isBound} disabledReason="当前没有可断开的配置">断开</ActionButton>
      </div>
    </article>
  );
}

export function PlatformMatrix({ onNavigate, notify }: { onNavigate: (view: string) => void; notify: Notify }) {
  const { state, currentUser, userConnections, connectPlatform, testPlatformConnection, disconnectPlatform } = useAppStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [platformUsername, setPlatformUsername] = useState("");
  const [appName, setAppName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [dailyQuota, setDailyQuota] = useState(20);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<Platform | null>(null);

  const selectedPlatform = state.platforms.find((platform) => platform.id === selectedId) ?? null;
  const selectedConnection = userConnections.find((connection) => connection.platformId === selectedId);
  const boundCount = userConnections.filter((connection) => connection.keyFingerprint && connection.status !== "disconnected").length;
  const totalDailyRemaining = useMemo(() => userConnections.reduce((sum, connection) => sum + Math.max(0, connection.dailyMaxSelfQuota - connection.dailyCallsUsed), 0), [userConnections]);

  const openWizard = (platform: Platform) => {
    const connection = userConnections.find((item) => item.platformId === platform.id);
    setSelectedId(platform.id);
    setPlatformUsername(connection?.platformUsername ?? "");
    setAppName(connection?.appName ?? `${currentUser?.nickname ?? "创作者"}的${platform.shortName}应用`);
    setApiKey("");
    setDailyQuota(connection?.dailyMaxSelfQuota ?? Math.max(1, Math.min(currentUser?.selfApiDailyLimit ?? 20, 200)));
    setWizardStep(1);
    setError("");
  };

  const closeWizard = () => {
    setSelectedId(null);
    setWizardStep(1);
    setError("");
    setApiKey("");
  };

  const continueWizard = () => {
    if (wizardStep === 1) {
      setWizardStep(2);
      return;
    }
    if (!appName.trim()) {
      setError("请填写应用名称。");
      return;
    }
    if (apiKey.trim().length < 8) {
      setError("请粘贴至少 8 位的完整 API Key。");
      return;
    }
    if (!Number.isFinite(dailyQuota) || dailyQuota < 1) {
      setError("每日配额至少为 1 次。");
      return;
    }
    setWizardStep(3);
    setError("");
  };

  const submitConnection = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPlatform) return;
    setSaving(true);
    const result = await connectPlatform({
      platformId: selectedPlatform.id,
      platformUsername,
      appName,
      apiKey,
      dailyMaxSelfQuota: dailyQuota,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      notify("error", result.message);
      return;
    }
    notify("success", result.message);
    closeWizard();
  };

  const testConnection = async (platform: Platform) => {
    setTestingId(platform.id);
    const result = await testPlatformConnection(platform.id);
    setTestingId(null);
    notify(result.ok ? "success" : "error", result.message);
  };

  const disconnect = () => {
    if (!disconnectTarget) return;
    const result = disconnectPlatform(disconnectTarget.id);
    setDisconnectTarget(null);
    notify(result.ok ? "success" : "error", result.message);
  };

  return (
    <div className="uw-page uw-platforms">
      <PageHeader
        title="平台接入矩阵"
        description="用掩码标识、双层日配额与明确状态管理自有 API 通道。"
        aside={<div className="uw-platform-summary"><span><strong>{boundCount}</strong>已保存</span><span><strong>{totalDailyRemaining}</strong>今日演示剩余</span></div>}
      />

      <SignalBanner tone="info" title="重要：当前不是真实供应商连接">
        绑定和测试仅执行本地演示逻辑，不向 DeepSeek、即梦、火山方舟或其他供应商发送请求。API Key 不会以明文写入应用状态，仅留下掩码提示与指纹。
      </SignalBanner>

      {state.platforms.length ? <section className="uw-platform-grid" aria-label="可配置平台">
        {state.platforms.map((platform) => <PlatformCard key={platform.id} platform={platform} connection={userConnections.find((item) => item.platformId === platform.id)} testing={testingId === platform.id} onConfigure={() => openWizard(platform)} onTest={() => testConnection(platform)} onDisconnect={() => setDisconnectTarget(platform)} />)}
      </section> : <EmptyState icon={Plug} title="尚未配置可用平台" description="管理员启用供应商后，平台列表会出现在这里。" />}

      {selectedPlatform ? (
        <div className="uw-platform-wizard-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) closeWizard(); }}>
          <form className="uw-platform-wizard" onSubmit={submitConnection} aria-labelledby="platform-wizard-title">
            <header className="uw-platform-wizard__header">
              <span className="uw-platform-card__glyph" style={{ "--platform-accent": selectedPlatform.accent } as CSSProperties} aria-hidden="true">{selectedPlatform.iconGlyph}</span>
              <div><StateChip label={`步骤 ${wizardStep} / 3`} tone="accent" /><h2 id="platform-wizard-title">绑定 {selectedPlatform.name}</h2><p>当前配置仅用于本地产品演示。</p></div>
              <ActionButton tone="quiet" onClick={closeWizard} disabled={saving} disabledReason="正在保存配置，请稍候">关闭</ActionButton>
            </header>
            <div className="uw-platform-wizard__steps" aria-hidden="true"><span className="is-active"><Check /></span><i /><span className={wizardStep >= 2 ? "is-active" : ""}>2</span><i /><span className={wizardStep >= 3 ? "is-active" : ""}>3</span></div>
            {error ? <SignalBanner tone="error" title="配置尚未完成">{error}</SignalBanner> : null}
            {wizardStep === 1 ? <div className="uw-platform-wizard__body">
              <h3>先确认你了解这条通道的边界</h3>
              <div className="uw-boundary-list"><div><ShieldCheck weight="duotone" /><span><strong>密钥不保留明文</strong><small>本地状态只保存掩码提示和单向指纹。</small></span></div><div><Pulse weight="duotone" /><span><strong>连接状态是模拟的</strong><small>当前不会检查供应商账户、余额或模型权限。</small></span></div><div><LockSimple weight="duotone" /><span><strong>上线前必须改为服务端密钥保管</strong><small>商用环境不应在浏览器内管理真实密钥。</small></span></div></div>
              <a className="uw-external-link" href={selectedPlatform.registerUrl} target="_blank" rel="noreferrer">前往供应商注册页 <ArrowSquareOut aria-hidden="true" /></a>
            </div> : null}
            {wizardStep === 2 ? <div className="uw-platform-wizard__body">
              <div className="uw-form-grid uw-form-grid--two">
                <Field label="应用名称" required><input value={appName} onChange={(event) => { setAppName(event.target.value); setError(""); }} maxLength={60} placeholder="例：灵境成片引擎" /></Field>
                <Field label="平台账号备注"><input value={platformUsername} onChange={(event) => setPlatformUsername(event.target.value)} maxLength={80} placeholder="可选，便于识别多账户" /></Field>
              </div>
              <Field label="API Key" required hint="提交后仅显示首尾掩码；更新配置时必须重新粘贴完整密钥">
                <span className="uw-key-input"><Key aria-hidden="true" /><input type="password" value={apiKey} onChange={(event) => { setApiKey(event.target.value); setError(""); }} autoComplete="new-password" placeholder="粘贴完整密钥" /></span>
              </Field>
              <Field label="每日平台配额" hint={`账号级上限为 ${currentUser?.selfApiDailyLimit ?? 0} 次；实际提交取两者的更低值`}><input type="number" min={1} max={9999} value={dailyQuota} onChange={(event) => setDailyQuota(Number(event.target.value))} /></Field>
            </div> : null}
            {wizardStep === 3 ? <div className="uw-platform-wizard__body">
              <h3>保存本地演示配置</h3>
              <DefinitionList items={[
                { term: "平台", value: selectedPlatform.name },
                { term: "应用", value: appName },
                { term: "账号备注", value: platformUsername || "未填写" },
                { term: "API Key", value: `${apiKey.slice(0, 3)}••••${apiKey.slice(-4)}` },
                { term: "每日平台配额", value: `${dailyQuota} 次` },
                { term: "实际供应商请求", value: "不会发送" },
              ]} />
              <SignalBanner tone="info" title="这不是真实连通性验证">保存后的「演示已连接」只表示本地配置通过格式校验。</SignalBanner>
            </div> : null}
            <footer className="uw-platform-wizard__actions">
              {wizardStep > 1 ? <ActionButton tone="quiet" icon={<ArrowLeft />} onClick={() => { setWizardStep((wizardStep - 1) as 1 | 2); setError(""); }}>上一步</ActionButton> : <span />}
              {wizardStep < 3 ? <ActionButton tone="primary" icon={<ArrowRight />} onClick={continueWizard}>继续</ActionButton> : <ActionButton tone="primary" type="submit" busy={saving} icon={<CheckCircle />}>保存演示连接</ActionButton>}
            </footer>
          </form>
        </div>
      ) : null}

      <Panel title="自有 API 提交条件" description="任何一项不满足时，任务会在提交前被拦截">
        <div className="uw-gate-sequence"><span><CheckCircle weight="duotone" />管理员开启全局自有 API</span><i /><span><CheckCircle weight="duotone" />用户日配额未用完</span><i /><span><CheckCircle weight="duotone" />平台已保存配置</span><i /><span><CheckCircle weight="duotone" />平台日配额足够</span></div>
        <ActionButton tone="secondary" onClick={() => onNavigate("create")}>返回批量创作</ActionButton>
      </Panel>

      <ConfirmDialog open={Boolean(disconnectTarget)} title={`断开 ${disconnectTarget?.name ?? ""} 的本地配置？`} description="掩码标识和指纹将从本地状态移除，使用该平台自有 API 的新任务将被拦截。" confirmLabel="确认断开" onConfirm={disconnect} onCancel={() => setDisconnectTarget(null)} />
    </div>
  );
}
