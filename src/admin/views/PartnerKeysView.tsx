import { Key, PencilSimple, Plus, ShieldCheck, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { controlApi, displayError } from "../api";
import { asRecord, extractItems, formatDate, itemId, itemStatus, maskLast4, readBoolean, readString, statusTone } from "../helpers";
import { useResource } from "../hooks";
import type { UnknownRecord } from "../types";
import { Button, EmptyState, ErrorState, Field, FormDialog, LoadingState, PageHeader, StatusBadge } from "../ui";
import type { ViewProps } from "../viewTypes";

type KeyDraft = { label: string; providerId: string; secret: string; enabled: boolean };
const emptyDraft: KeyDraft = { label: "", providerId: "", secret: "", enabled: true };

export function PartnerKeysView({ refreshKey, notify, requestConfirmation }: ViewProps) {
  const resource = useResource(() => controlApi.listPartnerKeys(), [] as UnknownRecord[], [refreshKey]);
  const responseRecord = asRecord(resource.data);
  const keys = extractItems(resource.data, ["keys", "partnerKeys", "items", "rows"]);
  const vaultRecord = asRecord(responseRecord.vault);
  const vaultKnown = "vaultConfigured" in responseRecord || "configured" in vaultRecord || "available" in vaultRecord;
  const vaultReady = readBoolean(responseRecord, ["vaultConfigured"], readBoolean(vaultRecord, ["configured", "available"], false));
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<UnknownRecord | null>(null);
  const [draft, setDraft] = useState<KeyDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);

  const edit = (item?: UnknownRecord) => {
    setEditing(item ?? null);
    setDraft(item ? { label: readString(item, ["label", "name"]), providerId: readString(item, ["providerId", "provider"]), secret: "", enabled: !["disabled", "revoked"].includes(itemStatus(item)) } : emptyDraft);
    setEditorOpen(true);
  };

  const save = async () => {
    if (!draft.label.trim() || !draft.providerId.trim() || (!editing && !draft.secret.trim())) { notify("error", "请完整填写密钥标签、通道和新密钥"); return; }
    setBusy(true);
    try {
      if (editing) await controlApi.updatePartnerKey(itemId(editing, ""), { label: draft.label.trim(), providerId: draft.providerId.trim(), enabled: draft.enabled, ...(draft.secret.trim() ? { secret: draft.secret } : {}) });
      else await controlApi.addPartnerKey({ label: draft.label.trim(), providerId: draft.providerId.trim(), secret: draft.secret, enabled: draft.enabled });
      setDraft(emptyDraft);
      setEditorOpen(false);
      notify("success", editing ? "合伙人密钥记录已更新" : "合伙人密钥已加入 Vault", "界面只会读取 last4。");
      resource.reload();
    } catch (error) { notify("error", "密钥写入失败", displayError(error).message); }
    finally { setBusy(false); }
  };

  const remove = (item: UnknownRecord) => requestConfirmation({ title: `删除密钥记录“${readString(item, ["label", "name"], itemId(item, ""))}”？`, description: "删除后对应合伙人通道可能立即失去调用资格，且无法从前端恢复密钥原文。", confirmLabel: "确认删除密钥", tone: "danger", action: async () => {
    try { await controlApi.deletePartnerKey(itemId(item, "")); notify("success", "密钥记录已删除"); resource.reload(); }
    catch (error) { const detail = displayError(error); notify("error", "密钥删除失败", detail.message); throw new Error(detail.message); }
  } });

  return <div className="sa-view">
    <PageHeader eyebrow="PARTNER VAULT" title="合伙人密钥池" description="只管理密钥的归属、状态和轮换；已写入的密钥从不回显。" actions={<Button tone="primary" icon={<Plus />} disabled={vaultKnown && !vaultReady} disabledReason="CONFIG_REQUIRED: Vault 未配置" onClick={() => edit()}>添加密钥</Button>} />
    {vaultKnown && !vaultReady ? <div className="sa-config-required" role="status"><Key /><div><strong>CONFIG_REQUIRED</strong><p>Vault 未配置，新增和轮换操作已按原因禁用。</p></div></div> : null}
    {resource.status === "loading" || resource.status === "idle" ? <LoadingState label="正在读取密钥池元数据" /> : resource.status === "error" ? <ErrorState message={resource.error} code={resource.errorCode} onRetry={resource.reload} /> : !keys.length ? <EmptyState icon={Key} title="密钥池为空" description="当 Vault 就绪后，可以安全添加第一个合伙人密钥。" /> : <section className="sa-key-grid">{keys.map((item, index) => {
      const status = itemStatus(item);
      return <article className="sa-key-card" key={itemId(item, `key-${index}`)}><header><span className="sa-key-card__glyph"><Key /></span><StatusBadge tone={statusTone(status)}>{status}</StatusBadge></header><div><small>PARTNER CHANNEL</small><h2>{readString(item, ["label", "name"], "未命名密钥")}</h2><p>{readString(item, ["providerName", "providerId", "provider"], "未关联通道")}</p></div><code>{maskLast4(item)}</code><dl><div><dt>最后轮换</dt><dd>{formatDate(item.rotatedAt ?? item.updatedAt)}</dd></div><div><dt>创建人</dt><dd>{readString(item, ["createdBy", "ownerName"], "—")}</dd></div></dl><footer><Button tone="quiet" icon={<PencilSimple />} disabled={vaultKnown && !vaultReady} disabledReason="CONFIG_REQUIRED: Vault 未配置" onClick={() => edit(item)}>编辑/轮换</Button><Button tone="danger" icon={<Trash />} onClick={() => remove(item)}>删除</Button></footer></article>;
    })}</section>}
    <FormDialog open={editorOpen} title={editing ? "编辑或轮换合伙人密钥" : "添加合伙人密钥"} description="密钥原文只参与一次写入请求，关闭编辑器后立即清空。" submitLabel={editing ? "保存或轮换" : "安全加入 Vault"} busy={busy} onClose={() => { setDraft(emptyDraft); setEditorOpen(false); }} onSubmit={save}><div className="sa-form-stack"><div className="sa-secret-target"><ShieldCheck /><span><small>VAULT WRITE</small><strong>永不回显原文</strong></span></div><Field label="记录标签"><input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} required /></Field><Field label="通道 ID"><input value={draft.providerId} onChange={(event) => setDraft({ ...draft, providerId: event.target.value })} required /></Field><Field label={editing ? "新密钥（留空则不轮换）" : "新密钥"}><input type="password" autoComplete="new-password" value={draft.secret} onChange={(event) => setDraft({ ...draft, secret: event.target.value })} required={!editing} /></Field><label className="sa-switch"><span><strong>启用记录</strong><small>禁用后应停止分配新请求。</small></span><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /><i aria-hidden="true"><b /></i></label></div></FormDialog>
  </div>;
}
