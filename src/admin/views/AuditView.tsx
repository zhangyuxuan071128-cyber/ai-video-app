import { Archive, CaretRight, DownloadSimple, ShieldCheck } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import { controlApi, displayError } from "../api";
import { extractItems, formatDate, itemId, readString, safeJson, statusTone } from "../helpers";
import { useResource } from "../hooks";
import type { UnknownRecord } from "../types";
import { Button, EmptyState, ErrorState, Field, LoadingState, PageHeader, Panel, StatusBadge } from "../ui";
import type { ViewProps } from "../viewTypes";

function downloadPayload(value: unknown) {
  const blob = value instanceof Blob ? value : new Blob([typeof value === "string" ? value : safeJson(value)], { type: value instanceof Blob ? value.type : "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `stellar-control-audit-${new Date().toISOString().slice(0, 10)}.${blob.type.includes("csv") ? "csv" : "json"}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function AuditView({ refreshKey, notify }: ViewProps) {
  const [draft, setDraft] = useState({ module: "", actor: "", from: "", to: "" });
  const [filters, setFilters] = useState(draft);
  const [exporting, setExporting] = useState(false);
  const resource = useResource(() => controlApi.listAudit({ ...filters, module: filters.module || undefined, actor: filters.actor || undefined, from: filters.from || undefined, to: filters.to || undefined }), [] as UnknownRecord[], [refreshKey, filters.module, filters.actor, filters.from, filters.to]);
  const logs = extractItems(resource.data, ["logs", "audit", "items", "rows"]);

  const filter = (event: FormEvent) => { event.preventDefault(); setFilters({ ...draft }); };
  const exportLogs = async () => {
    setExporting(true);
    try { const payload = await controlApi.exportAudit({ ...filters, module: filters.module || undefined, actor: filters.actor || undefined, from: filters.from || undefined, to: filters.to || undefined }); downloadPayload(payload); notify("success", "审计导出已生成", "已将控制面返回的原始导出内容下载到本地。"); }
    catch (error) { notify("error", "审计导出失败", displayError(error).message); }
    finally { setExporting(false); }
  };

  return <div className="sa-view">
    <PageHeader eyebrow="IMMUTABLE TRACE" title="审计" description="查看真实控制面操作记录与变更差异，导出保留服务端返回的原始语义。" actions={<Button tone="secondary" icon={<DownloadSimple />} busy={exporting} onClick={exportLogs}>导出当前结果</Button>} />
    <form className="sa-toolbar sa-toolbar--audit" onSubmit={filter}><Field label="模块"><input value={draft.module} onChange={(event) => setDraft({ ...draft, module: event.target.value })} placeholder="risk / member / provider" /></Field><Field label="操作人"><input value={draft.actor} onChange={(event) => setDraft({ ...draft, actor: event.target.value })} placeholder="账号或 ID" /></Field><Field label="起始日期"><input type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></Field><Field label="结束日期"><input type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></Field><Button tone="secondary" type="submit">应用筛选</Button></form>
    {resource.status === "loading" || resource.status === "idle" ? <LoadingState label="正在读取审计轨迹" /> : resource.status === "error" ? <ErrorState message={resource.error} code={resource.errorCode} onRetry={resource.reload} /> : !logs.length ? <EmptyState icon={Archive} title="没有匹配的审计记录" description="调整模块、操作人或日期范围后重试。" /> : <Panel className="sa-panel--flush"><div className="sa-audit-timeline">{logs.map((entry, index) => {
      const status = readString(entry, ["severity", "result", "status"], "info");
      return <article key={itemId(entry, `audit-${index}`)}><span className="sa-audit-timeline__node"><ShieldCheck /></span><div className="sa-audit-timeline__body"><header><span><StatusBadge tone={statusTone(status)}>{readString(entry, ["module"], "system")}</StatusBadge><strong>{readString(entry, ["action", "event", "title"], "未命名操作")}</strong></span><time>{formatDate(entry.createdAt ?? entry.timestamp)}</time></header><p>{readString(entry, ["actorName", "actor", "username"], "未知操作人")} · {readString(entry, ["ipAddress", "ip"], "IP 未上报")}</p><div className="sa-audit-timeline__target"><span>影响对象</span><code>{readString(entry, ["target", "targetId", "resource"], "system")}</code></div>{entry.before !== undefined || entry.after !== undefined ? <details><summary>查看变更差异 <CaretRight /></summary><div className="sa-json-diff"><div><span>变更前</span><pre>{safeJson(entry.before)}</pre></div><CaretRight /><div><span>变更后</span><pre>{safeJson(entry.after)}</pre></div></div></details> : null}</div></article>;
    })}</div></Panel>}
  </div>;
}
