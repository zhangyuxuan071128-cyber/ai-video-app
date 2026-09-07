import { ArrowRight, ClockCounterClockwise, CloudCheck, Pulse, ShieldWarning } from "@phosphor-icons/react";
import { asRecord, formatDate, formatNumber, itemStatus, readArray, readNumber, readString, statusTone } from "../helpers";
import type { AdminView, ResourceState, UnknownRecord } from "../types";
import { EmptyState, ErrorState, LoadingState, PageHeader, Panel, StatusBadge } from "../ui";

function interventionRoute(item: UnknownRecord): AdminView {
  const hint = `${readString(item, ["module", "type", "kind", "category"])} ${readString(item, ["title", "label"])}`.toLowerCase();
  if (hint.includes("withdraw") || hint.includes("提现") || hint.includes("member") || hint.includes("user") || hint.includes("用户")) return "members";
  if (hint.includes("provider") || hint.includes("adapter") || hint.includes("平台") || hint.includes("通道")) return "providers";
  if (hint.includes("key") || hint.includes("密钥")) return "partner-keys";
  if (hint.includes("content") || hint.includes("tutorial") || hint.includes("announcement") || hint.includes("内容")) return "content";
  if (hint.includes("risk") || hint.includes("风险")) return "risk";
  return "audit";
}

function derivedInterventions(source: UnknownRecord): UnknownRecord[] {
  const supplied = readArray(source, ["interventions", "attentionQueue", "attention", "todos", "pendingActions"]);
  if (supplied.length) return supplied;
  const candidates = [
    { key: ["failedTasks", "failedTaskCount"], title: "失败任务待复核", module: "audit", unit: "个" },
    { key: ["pendingWithdrawals", "pendingWithdrawalCount"], title: "待审提现", module: "members", unit: "笔" },
    { key: ["frozenMembers", "frozenMemberCount"], title: "冻结身份待复核", module: "members", unit: "个" },
    { key: ["providerIncidents", "providerIncidentCount"], title: "模型通道异常", module: "providers", unit: "个" },
  ];
  return candidates.flatMap((candidate) => {
    const count = readNumber(source, candidate.key, 0);
    return count > 0 ? [{ id: candidate.key[0], title: candidate.title, count, module: candidate.module, summary: `${count} ${candidate.unit}记录需要人工检查`, severity: "warning" }] : [];
  });
}

export function DashboardView({
  state,
  onNavigate,
  onRetry,
}: {
  state: ResourceState<unknown>;
  onNavigate: (view: AdminView) => void;
  onRetry: () => void;
}) {
  if (state.status === "loading" || state.status === "idle") return <LoadingState label="正在汇总真实运行态势" />;
  if (state.status === "error") return <ErrorState message={state.error} code={state.errorCode} onRetry={onRetry} />;

  const source = asRecord(state.data);
  const metrics = asRecord(source.metrics ?? source.summary ?? source);
  const interventions = derivedInterventions(source);
  const channels = readArray(source, ["channels", "providers", "adapters", "providerStatus"]);
  const audits = readArray(source, ["recentAudit", "recentAudits", "audit", "logs"]);
  const generatedAt = source.generatedAt ?? source.updatedAt ?? source.timestamp;
  const metricDefinitions = [
    { label: "待介入", value: readNumber(metrics, ["interventionCount", "pendingInterventions"], interventions.length), note: "需要人工决策", tone: interventions.length ? "warning" : "success" },
    { label: "运行任务", value: metrics.activeTasks ?? metrics.processingTasks ?? metrics.runningTasks, note: "当前全站", tone: "info" },
    { label: "有效成员", value: metrics.activeMembers ?? metrics.memberCount ?? metrics.totalMembers, note: "真实身份", tone: "neutral" },
    { label: "待审事项", value: metrics.pendingReviews ?? metrics.pendingWithdrawals ?? metrics.reviewCount, note: "不自动放行", tone: "warning" },
  ] as const;

  return <div className="sa-view sa-dashboard">
    <PageHeader eyebrow="INTERVENTION CONTROL" title="待介入优先的治理总览" description="只呈现控制面返回的真实数据；无数据时明确留空，不伪造趋势。" actions={<span className="sa-data-stamp"><ClockCounterClockwise />生成于 {formatDate(generatedAt)}</span>} />

    <section className="sa-metric-rail" aria-label="关键治理态势">
      {metricDefinitions.map((metric) => <article key={metric.label}><span>{metric.label}</span><strong>{typeof metric.value === "number" ? formatNumber(metric.value) : "—"}</strong><small><i className={`is-${metric.tone}`} />{metric.note}</small></article>)}
    </section>

    <div className="sa-dashboard__primary">
      <Panel className="sa-intervention-panel" title={<><ShieldWarning weight="duotone" />待介入队列</>} description="按控制面返回顺序展示，处置后可在审计中追溯。" actions={<StatusBadge tone={interventions.length ? "warning" : "success"}>{interventions.length ? `${interventions.length} 项待处置` : "队列已清空"}</StatusBadge>}>
        {interventions.length ? <div className="sa-intervention-list">{interventions.map((item, index) => {
          const title = readString(item, ["title", "label", "name"], `待介入事项 ${index + 1}`);
          const summary = readString(item, ["summary", "description", "message"], "控制面未提供详情摘要。");
          const severity = readString(item, ["severity", "status", "level"], "warning");
          return <button type="button" key={readString(item, ["id"], `${title}-${index}`)} onClick={() => onNavigate(interventionRoute(item))}><span className="sa-intervention-list__rank">{String(index + 1).padStart(2, "0")}</span><span><StatusBadge tone={statusTone(severity)}>{severity}</StatusBadge><strong>{title}</strong><small>{summary}</small></span><ArrowRight aria-hidden="true" /></button>;
        })}</div> : <EmptyState icon={ShieldWarning} title="当前没有待介入项" description="控制面未返回需要人工处置的记录。" />}
      </Panel>

      <Panel className="sa-channel-panel" title={<><CloudCheck weight="duotone" />通道真实状态</>} description="密钥存在不等于生成通道可用。">
        {channels.length ? <div className="sa-channel-list">{channels.map((channel, index) => {
          const status = itemStatus(channel);
          return <article key={readString(channel, ["id", "providerId"], `channel-${index}`)}><span className="sa-channel-list__glyph" aria-hidden="true">{readString(channel, ["shortName", "code", "name"], "AI").slice(0, 2).toUpperCase()}</span><div><strong>{readString(channel, ["name", "label"], "未命名通道")}</strong><small>{readString(channel, ["message", "statusMessage", "detail"], "无附加状态说明")}</small></div><StatusBadge tone={statusTone(status)}>{status}</StatusBadge></article>;
        })}</div> : <EmptyState icon={CloudCheck} title="未收到通道状态" description="请检查 dashboard 接口是否返回 providers 或 adapters。" action={<button className="sa-inline-link" type="button" onClick={() => onNavigate("providers")}>打开模型聚合</button>} />}
      </Panel>
    </div>

    <Panel title={<><Pulse weight="duotone" />最近审计脉冲</>} description="近期高权限操作，完整记录可进入审计模块导出。" actions={<button className="sa-inline-link" type="button" onClick={() => onNavigate("audit")}>查看全部 <ArrowRight /></button>}>
      {audits.length ? <div className="sa-audit-preview">{audits.slice(0, 6).map((entry, index) => <article key={readString(entry, ["id"], `audit-${index}`)}><span aria-hidden="true" /><div><strong>{readString(entry, ["action", "title", "event"], "未命名操作")}</strong><small>{readString(entry, ["actorName", "actor", "username"], "未知操作人")} · {readString(entry, ["target", "targetId", "module"], "system")}</small></div><time>{formatDate(entry.createdAt ?? entry.timestamp)}</time></article>)}</div> : <EmptyState icon={ClockCounterClockwise} title="暂无审计记录" description="dashboard 接口未返回最近审计事件。" />}
    </Panel>
  </div>;
}
