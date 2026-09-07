import {
  Bell,
  Browser,
  CheckCircle,
  Copy,
  GearSix,
  Key,
  LockSimple,
  MoonStars,
  ShieldCheck,
  SpeakerHigh,
} from "@phosphor-icons/react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useAppStore } from "../../state/AppStore";
import type { UserPreferences } from "../../types/domain";
import {
  ActionButton,
  DefinitionList,
  PageHeader,
  Panel,
  SignalBanner,
  StateChip,
  copyText,
  formatFullDate,
  type Notify,
} from "./ui";

function PreferenceSwitch({
  checked,
  onChange,
  icon,
  title,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <label className="uw-preference-switch">
      <span className="uw-preference-switch__icon" aria-hidden="true">{icon}</span>
      <span><strong>{title}</strong><small>{description}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true"><span /></i>
    </label>
  );
}

export function SettingsCenter({ onNavigate, notify }: { onNavigate: (view: string) => void; notify: Notify }) {
  const { currentUser, currentSession, updatePreferences } = useAppStore();
  const [preferences, setPreferences] = useState<UserPreferences>(() => currentUser?.preferences ?? {
    popupNotifications: true,
    voiceNotifications: false,
    browserNotifications: false,
    voiceName: "晓晓",
    reducedMotion: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentUser) setPreferences(currentUser.preferences);
  }, [currentUser]);

  const update = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setPreferences((previous) => ({ ...previous, [key]: value }));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 220));
    const result = updatePreferences(preferences);
    setSaving(false);
    notify(result.ok ? "success" : "error", result.message);
  };

  const previewVoice = () => {
    if (!("speechSynthesis" in window)) {
      notify("error", "当前浏览器不支持本地语音预览。");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("本地模拟任务已完成，演示产物已进入素材库。");
    utterance.lang = "zh-CN";
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
    notify("info", "正在使用浏览器本地语音进行预览。");
  };

  const copyUserId = async () => {
    if (!currentUser) return;
    const copied = await copyText(currentUser.id);
    notify(copied ? "success" : "info", copied ? "用户 ID 已复制。" : `剪贴板不可用，用户 ID 为 ${currentUser.id}。`);
  };

  return (
    <div className="uw-page uw-settings">
      <PageHeader
        title="个人设置"
        description="管理提醒方式、语音偏好、减少动效和当前会话信息。"
        aside={<StateChip label={currentUser?.role === "agent" ? "代理账号" : "创作者账号"} tone="accent" />}
      />

      <div className="uw-settings-grid">
        <Panel title="提醒与动效" description="保存后写入当前账号的本地偏好">
          <form className="uw-preference-form" onSubmit={save}>
            <PreferenceSwitch checked={preferences.popupNotifications} onChange={(value) => update("popupNotifications", value)} icon={<Bell weight="duotone" />} title="应用内弹窗偏好" description="仅保存偏好；接入真实任务事件服务后生效" />
            <PreferenceSwitch checked={preferences.voiceNotifications} onChange={(value) => update("voiceNotifications", value)} icon={<SpeakerHigh weight="duotone" />} title="语音播报偏好" description="仅保存偏好；自动播报需任务事件服务，可在下方本地试听" />
            <PreferenceSwitch checked={preferences.browserNotifications} onChange={(value) => update("browserNotifications", value)} icon={<Browser weight="duotone" />} title="浏览器系统通知偏好" description="仅保存偏好；演示版不会主动申请系统通知权限" />
            <PreferenceSwitch checked={preferences.reducedMotion} onChange={(value) => update("reducedMotion", value)} icon={<MoonStars weight="duotone" />} title="减少动效" description="减少轨道、入场和状态过渡动画" />
            <div className="uw-voice-setting"><label><span>提醒音色名称</span><select value={preferences.voiceName} onChange={(event) => update("voiceName", event.target.value)}><option>晓晓</option><option>云希</option><option>清越女声</option><option>沉稳男声</option></select></label><ActionButton tone="secondary" icon={<SpeakerHigh />} onClick={previewVoice} disabled={typeof window !== "undefined" && !("speechSynthesis" in window)} disabledReason="当前浏览器不支持本地语音预览">试听</ActionButton></div>
            <ActionButton tone="primary" type="submit" icon={<CheckCircle />} busy={saving}>保存偏好</ActionButton>
          </form>
        </Panel>

        <Panel title="账号身份" description="当前会话中可验证的本地账号信息">
          <div className="uw-account-identity"><span className="uw-account-identity__avatar">{currentUser?.avatarInitials ?? "星"}</span><div><h2>{currentUser?.nickname ?? "未知用户"}</h2><p>@{currentUser?.username ?? "unknown"}</p></div><StateChip label={currentUser?.status === "active" ? "账号正常" : "账号已冻结"} tone={currentUser?.status === "active" ? "good" : "danger"} /></div>
          <DefinitionList items={[
            { term: "账号角色", value: currentUser?.role === "agent" ? "代理运营" : currentUser?.role === "admin" ? "管理员" : "创作者" },
            {
              term: "认证类型",
              value: currentUser?.authKind === "server"
                ? "共享控制平面账号"
                : currentUser?.authKind === "demo"
                  ? "内置引导账号"
                  : "本地邀请账号",
            },
            { term: "绑定手机", value: currentUser?.phone ? currentUser.phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1••••$2") : "未绑定" },
            { term: "创建时间", value: formatFullDate(currentUser?.createdAt) },
            { term: "最后登录", value: formatFullDate(currentUser?.lastLoginAt) },
            { term: "用户 ID", value: <span className="uw-inline-id"><code>{currentUser?.id}</code><ActionButton tone="quiet" icon={<Copy />} onClick={copyUserId}>复制</ActionButton></span> },
          ]} />
        </Panel>
      </div>

      <div className="uw-settings-grid">
        <Panel title="会话安全" description="本地演示会话的有效期与设备摘要">
          <div className="uw-security-state"><ShieldCheck weight="duotone" aria-hidden="true" /><div><strong>当前会话有效</strong><span>会话过期后会自动返回登录界面。</span></div></div>
          <DefinitionList items={[
            { term: "会话创建", value: formatFullDate(currentSession?.createdAt) },
            { term: "会话过期", value: formatFullDate(currentSession?.expiresAt) },
            { term: "状态", value: currentSession?.status === "active" ? "有效" : "已失效" },
            { term: "设备摘要", value: currentSession?.userAgent ? currentSession.userAgent.slice(0, 72) : "未记录" },
          ]} />
          <SignalBanner tone="info" title="商用上线前的安全边界">
            真实密码、支付、API Key 与权限校验必须由服务端管理；当前页面不声称已完成这些线上基础设施。
          </SignalBanner>
        </Panel>

        <Panel title="需要帮助？" description="查看教程或保存本地反馈记录">
          <div className="uw-settings-help"><span><GearSix weight="duotone" /></span><h2>每个设置都应该有清晰的影响边界。</h2><p>如果你不确定 API 配额、扣额规则或合规确认的含义，可先查看支持中心。</p><ActionButton tone="secondary" icon={<Key />} onClick={() => onNavigate("support")}>打开支持中心</ActionButton></div>
        </Panel>
      </div>
    </div>
  );
}
