import { FloppyDisk, ShieldCheck, ShieldWarning } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { controlApi, displayError } from "../api";
import { asRecord, safeJson } from "../helpers";
import { useResource } from "../hooks";
import type { UnknownRecord } from "../types";
import { Button, EmptyState, ErrorState, Field, LoadingState, PageHeader, Panel } from "../ui";
import type { ViewProps } from "../viewTypes";

const labels: Record<string, string> = {
  loginWindowSeconds: "登录失败统计窗口（秒）",
  maxLoginFailures: "窗口内最大登录失败次数",
  lockSeconds: "账号锁定时长（秒）",
  sessionTtlSeconds: "管理会话有效期（秒）",
  maxDailyQuota: "单账号每日调用配额上限",
  maxCreditAdjustment: "单次额度调整绝对值上限",
  maxLoginAttempts: "最大登录失败次数",
  lockMinutes: "登录锁定时长（分钟）",
  maxRequestsPerMinute: "单身份每分钟请求上限",
  maxGenerationPerMinute: "每分钟生成上限",
  maxWithdrawalAmount: "单笔提现上限",
  requireMfaForSensitiveActions: "高风险操作要求 MFA",
  blockOnProviderAnomaly: "通道异常时阻断新任务",
  enabled: "启用该风险策略",
};

function isSensitiveKey(key: string): boolean {
  return /(password|secret|token|api.?key|credential)/i.test(key);
}

export function RiskView({ refreshKey, notify, requestConfirmation }: ViewProps) {
  const resource = useResource(() => controlApi.getRiskPolicy(), {} as UnknownRecord, [refreshKey]);
  const [draft, setDraft] = useState<UnknownRecord>({});
  useEffect(() => { if (resource.status === "success") setDraft(asRecord(resource.data)); }, [resource.status, resource.data]);
  const editable = useMemo(() => Object.entries(draft).filter(([key, value]) => !isSensitiveKey(key) && !["id", "createdAt", "updatedAt", "updatedBy", "version"].includes(key) && ["string", "number", "boolean"].includes(typeof value)), [draft]);
  const metadata = useMemo(() => Object.fromEntries(Object.entries(draft).filter(([key, value]) => !isSensitiveKey(key) && !editable.some(([editableKey]) => editableKey === key) && value !== undefined)), [draft, editable]);

  const save = () => requestConfirmation({ title: "写入全局风险策略？", description: "该请求可能影响所有管理员、成员和新生产任务。服务端应记录完整变更差异。", confirmLabel: "确认保存风险策略", tone: "danger", action: async () => {
    try { await controlApi.updateRiskPolicy(draft); notify("success", "风险策略已更新", "请在审计模块复核变更记录。"); resource.reload(); }
    catch (error) { const detail = displayError(error); notify("error", "风险策略保存失败", detail.message); throw new Error(detail.message); }
  } });

  return <div className="sa-view">
    <PageHeader eyebrow="RISK POLICY" title="风险策略" description="根据控制面实际返回的策略字段生成编辑器，密钥、令牌与密码类字段始终过滤。" />
    {resource.status === "loading" || resource.status === "idle" ? <LoadingState label="正在读取风险策略" /> : resource.status === "error" ? <ErrorState message={resource.error} code={resource.errorCode} onRetry={resource.reload} /> : !editable.length ? <EmptyState icon={ShieldWarning} title="控制面未返回可编辑策略" description="只有字符串、数字和布尔类型的非敏感字段会出现在编辑器中。" /> : <div className="sa-risk-layout">
      <Panel title={<><ShieldCheck />可编辑策略</>} description="数值和开关来自真实策略对象。"><div className="sa-policy-grid">{editable.map(([key, value]) => typeof value === "boolean" ? <label className="sa-switch" key={key}><span><strong>{labels[key] ?? key}</strong><small>{key}</small></span><input type="checkbox" checked={Boolean(draft[key])} onChange={(event) => setDraft({ ...draft, [key]: event.target.checked })} /><i aria-hidden="true"><b /></i></label> : <Field key={key} label={labels[key] ?? key} hint={key}><input type={typeof value === "number" ? "number" : "text"} value={String(draft[key] ?? "")} onChange={(event) => setDraft({ ...draft, [key]: typeof value === "number" ? Number(event.target.value) : event.target.value })} /></Field>)}</div><div className="sa-policy-actions"><div className="sa-caution"><ShieldWarning /><p>保存前请检查锁定、限额与阻断策略的连锁影响。</p></div><Button tone="primary" icon={<FloppyDisk />} onClick={save}>复核并保存</Button></div></Panel>
      <Panel title="只读策略元数据" description="嵌套对象与版本元数据不在通用编辑器中修改。"><pre className="sa-json">{safeJson(metadata)}</pre></Panel>
    </div>}
  </div>;
}
