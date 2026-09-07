import { CloudSlash, Key, PencilSimple, Plus, Power, ShieldCheck } from "@phosphor-icons/react";
import { useState } from "react";
import { controlApi, displayError } from "../api";
import { asRecord, extractItems, itemId, itemStatus, maskLast4, readBoolean, readString, statusTone } from "../helpers";
import { useResource } from "../hooks";
import type { UnknownRecord } from "../types";
import { Button, EmptyState, ErrorState, Field, FormDialog, LoadingState, PageHeader, Panel, StatusBadge } from "../ui";
import type { ViewProps } from "../viewTypes";

type ProviderDraft = { id: string; name: string; baseUrl: string; model: string; enabled: boolean };
const emptyDraft: ProviderDraft = { id: "", name: "", baseUrl: "", model: "", enabled: true };

export function ProvidersView({ refreshKey, notify, requestConfirmation }: ViewProps) {
  const resource = useResource(() => controlApi.listProviders(), [] as UnknownRecord[], [refreshKey]);
  const responseRecord = asRecord(resource.data);
  const providers = extractItems(resource.data, ["providers", "items", "rows"]);
  const vaultRecord = asRecord(responseRecord.vault);
  const vaultKnown = "vaultConfigured" in responseRecord || "configured" in vaultRecord || "available" in vaultRecord;
  const vaultReady = readBoolean(responseRecord, ["vaultConfigured"], readBoolean(vaultRecord, ["configured", "available"], false));
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<UnknownRecord | null>(null);
  const [draft, setDraft] = useState<ProviderDraft>(emptyDraft);
  const [secretTarget, setSecretTarget] = useState<UnknownRecord | null>(null);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);

  const edit = (item?: UnknownRecord) => {
    setEditing(item ?? null);
    setDraft(item ? { id: itemId(item, ""), name: readString(item, ["name", "label"]), baseUrl: readString(item, ["baseUrl", "endpoint"]), model: readString(item, ["model", "modelId", "defaultModel"]), enabled: !["disabled", "offline"].includes(itemStatus(item)) } : emptyDraft);
    setEditorOpen(true);
  };

  const save = async () => {
    if (!draft.id.trim() || !draft.name.trim()) { notify("error", "请填写通道 ID 和名称"); return; }
    setBusy(true);
    try {
      const payload = { id: draft.id.trim(), name: draft.name.trim(), baseUrl: draft.baseUrl.trim(), model: draft.model.trim(), enabled: draft.enabled };
      if (editing) await controlApi.updateProvider(itemId(editing, ""), payload);
      else await controlApi.upsertProvider(payload);
      notify("success", editing ? "模型通道已更新" : "模型通道已创建");
      setEditorOpen(false);
      resource.reload();
    } catch (error) { notify("error", "通道写入失败", displayError(error).message); }
    finally { setBusy(false); }
  };

  const saveSecret = async () => {
    if (!secretTarget || !secret.trim()) return;
    setBusy(true);
    try {
      await controlApi.setProviderSecret(itemId(secretTarget, ""), secret);
      setSecret("");
      setSecretTarget(null);
      notify("success", "凭据已送入 Vault", "界面不会保留或回显密钥原文。");
      resource.reload();
    } catch (error) { notify("error", "凭据写入失败", displayError(error).message); }
    finally { setBusy(false); }
  };

  const toggle = (item: UnknownRecord) => {
    const enabled = !["disabled", "offline"].includes(itemStatus(item));
    requestConfirmation({ title: `${enabled ? "停用" : "启用"}模型通道？`, description: `操作对象：${readString(item, ["name", "label"], itemId(item, ""))}。停用可能影响新生产任务的路由。`, confirmLabel: enabled ? "确认停用" : "确认启用", tone: enabled ? "danger" : "primary", action: async () => {
      try { await controlApi.updateProvider(itemId(item, ""), { enabled: !enabled }); notify("success", "通道状态已更新"); resource.reload(); }
      catch (error) { const detail = displayError(error); notify("error", "通道状态更新失败", detail.message); throw new Error(detail.message); }
    } });
  };

  return <div className="sa-view">
    <PageHeader eyebrow="MODEL AGGREGATION" title="模型聚合" description="分开表达目录、适配器和 Vault 凭据三层真实状态，绝不把“已录入”表达为“可调用”。" actions={<Button tone="primary" icon={<Plus />} onClick={() => edit()}>新增通道</Button>} />
    {vaultKnown && !vaultReady ? <div className="sa-config-required" role="status"><CloudSlash /><div><strong>CONFIG_REQUIRED</strong><p>Vault 未配置，密钥输入操作已禁用。其他非密钥配置仍可审阅。</p></div></div> : null}
    {resource.status === "loading" || resource.status === "idle" ? <LoadingState label="正在读取模型通道" /> : resource.status === "error" ? <ErrorState message={resource.error} code={resource.errorCode} onRetry={resource.reload} /> : !providers.length ? <EmptyState icon={CloudSlash} title="尚未配置模型通道" description="新增通道只建立目录；生产可用性仍需后端适配器与 Vault。" action={<Button tone="primary" onClick={() => edit()}>新增通道</Button>} /> : <div className="sa-provider-stack">{providers.map((item, index) => {
      const status = itemStatus(item);
      const adapter = readString(item, ["adapterStatus", "readiness", "health"], "unknown");
      return <Panel className="sa-provider" key={itemId(item, `provider-${index}`)}><div className="sa-provider__row"><span className="sa-provider__index">{String(index + 1).padStart(2, "0")}</span><span className="sa-provider__mark" aria-hidden="true">{readString(item, ["shortName", "code", "name"], "AI").slice(0, 2).toUpperCase()}</span><div className="sa-provider__identity"><h2>{readString(item, ["name", "label"], "未命名通道")}</h2><p>{readString(item, ["baseUrl", "endpoint"], "未上报 endpoint")}</p></div><dl><div><dt>目录状态</dt><dd><StatusBadge tone={statusTone(status)}>{status}</StatusBadge></dd></div><div><dt>适配器</dt><dd><StatusBadge tone={statusTone(adapter)}>{adapter}</StatusBadge></dd></div><div><dt>Vault</dt><dd><code>{maskLast4(item)}</code></dd></div></dl><div className="sa-provider__actions"><Button tone="quiet" icon={<PencilSimple />} onClick={() => edit(item)}>编辑</Button><Button tone="quiet" icon={<Power />} onClick={() => toggle(item)}>{["disabled", "offline"].includes(status) ? "启用" : "停用"}</Button><Button tone="secondary" icon={<Key />} disabled={vaultKnown && !vaultReady} disabledReason="CONFIG_REQUIRED: Vault 未配置" onClick={() => { setSecret(""); setSecretTarget(item); }}>写入新密钥</Button></div></div></Panel>;
    })}</div>}

    <FormDialog open={editorOpen} title={editing ? "编辑模型通道" : "新增模型通道"} description="此处不接收 API Key，凭据必须单独写入 Vault。" submitLabel={editing ? "保存通道" : "创建通道"} busy={busy} onClose={() => setEditorOpen(false)} onSubmit={save}><div className="sa-form-stack"><Field label="通道 ID" hint="稳定标识，创建后不建议更改。"><input value={draft.id} disabled={Boolean(editing)} onChange={(event) => setDraft({ ...draft, id: event.target.value })} required /></Field><Field label="显示名称"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></Field><Field label="基础 Endpoint"><input type="url" value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} placeholder="https://api.example.com" /></Field><Field label="默认模型"><input value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} /></Field><label className="sa-switch"><span><strong>启用通道目录</strong><small>不等于适配器已就绪。</small></span><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /><i aria-hidden="true"><b /></i></label></div></FormDialog>
    <FormDialog open={Boolean(secretTarget)} title="写入新的 Vault 凭据" description="旧值不可读。提交后输入框立即清空，界面只显示 last4。" submitLabel="安全写入" busy={busy} onClose={() => { setSecret(""); setSecretTarget(null); }} onSubmit={saveSecret}><div className="sa-form-stack"><div className="sa-secret-target"><ShieldCheck /><span><small>目标通道</small><strong>{secretTarget ? readString(secretTarget, ["name", "label"], itemId(secretTarget, "")) : "—"}</strong></span></div><Field label="新密钥" hint="密钥仅在本次请求中传输，不进入本地存储。"><input type="password" autoComplete="new-password" value={secret} onChange={(event) => setSecret(event.target.value)} required /></Field></div></FormDialog>
  </div>;
}
