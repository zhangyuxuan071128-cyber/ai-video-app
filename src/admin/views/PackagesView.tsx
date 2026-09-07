import { PencilSimple, Plus, Power, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { controlApi, displayError } from "../api";
import { extractItems, formatMoney, itemId, itemStatus, readNumber, readString, statusTone } from "../helpers";
import { useResource } from "../hooks";
import type { UnknownRecord } from "../types";
import { Button, EmptyState, ErrorState, Field, FormDialog, LoadingState, PageHeader, Panel, StatusBadge } from "../ui";
import type { ViewProps } from "../viewTypes";

type PackageDraft = { name: string; description: string; credits: string; price: string; enabled: boolean };
const emptyDraft: PackageDraft = { name: "", description: "", credits: "100", price: "0", enabled: true };

export function PackagesView({ refreshKey, notify, requestConfirmation }: ViewProps) {
  const resource = useResource(() => controlApi.listPackages(), [] as UnknownRecord[], [refreshKey]);
  const packages = extractItems(resource.data, ["packages", "items", "rows"]);
  const [editing, setEditing] = useState<UnknownRecord | null>(null);
  const [draft, setDraft] = useState<PackageDraft>(emptyDraft);
  const [editorOpen, setEditorOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const openEditor = (item?: UnknownRecord) => {
    setEditing(item ?? null);
    setDraft(item ? {
      name: readString(item, ["name", "title"]),
      description: readString(item, ["description", "summary"]),
      credits: String(readNumber(item, ["credits", "quota"], 0)),
      price: String(readNumber(item, ["price", "amount"], 0)),
      enabled: !["disabled", "inactive"].includes(itemStatus(item)),
    } : emptyDraft);
    setEditorOpen(true);
  };

  const save = async () => {
    if (!draft.name.trim()) { notify("error", "请填写套餐名称"); return; }
    setBusy(true);
    try {
      const payload = { name: draft.name.trim(), description: draft.description.trim(), credits: Number(draft.credits), price: Number(draft.price), enabled: draft.enabled };
      if (editing) await controlApi.updatePackage(itemId(editing, ""), payload);
      else await controlApi.createPackage(payload);
      notify("success", editing ? "套餐已更新" : "套餐已创建", "真实控制面已接受配置。");
      setEditorOpen(false);
      resource.reload();
    } catch (error) {
      notify("error", "套餐写入失败", displayError(error).message);
    } finally { setBusy(false); }
  };

  const toggle = (item: UnknownRecord) => {
    const enabled = !["disabled", "inactive"].includes(itemStatus(item));
    requestConfirmation({
      title: `${enabled ? "停用" : "启用"}套餐“${readString(item, ["name", "title"], itemId(item, ""))}”？`,
      description: enabled ? "停用后新用户不应再能选择该套餐，已有账本不受影响。" : "启用后套餐会恢复可用状态。",
      confirmLabel: enabled ? "确认停用" : "确认启用",
      tone: enabled ? "danger" : "primary",
      action: async () => {
        try {
          await controlApi.updatePackage(itemId(item, ""), { enabled: !enabled });
          notify("success", "套餐状态已更新");
          resource.reload();
        } catch (error) {
          const detail = displayError(error);
          notify("error", "套餐状态更新失败", detail.message);
          throw new Error(detail.message);
        }
      },
    });
  };

  const remove = (item: UnknownRecord) => requestConfirmation({
    title: `删除套餐“${readString(item, ["name", "title"], itemId(item, ""))}”？`,
    description: "删除是高影响操作。服务端如检测到已有账本引用，应拒绝永久删除。",
    confirmLabel: "确认删除套餐",
    tone: "danger",
    action: async () => {
      try {
        await controlApi.deletePackage(itemId(item, ""));
        notify("success", "套餐已删除");
        resource.reload();
      } catch (error) {
        const detail = displayError(error);
        notify("error", "套餐删除失败", detail.message);
        throw new Error(detail.message);
      }
    },
  });

  return <div className="sa-view">
    <PageHeader eyebrow="PACKAGE LEDGER" title="套餐" description="维护可售额度、真实价格与启用状态；不在前端推导支付结果。" actions={<Button tone="primary" icon={<Plus />} onClick={() => openEditor()}>新建套餐</Button>} />
    {resource.status === "loading" || resource.status === "idle" ? <LoadingState label="正在读取套餐台账" /> : resource.status === "error" ? <ErrorState message={resource.error} code={resource.errorCode} onRetry={resource.reload} /> : !packages.length ? <EmptyState icon={Plus} title="尚未配置套餐" description="创建第一个真实套餐，再在充值码模块中进行发行。" action={<Button tone="primary" onClick={() => openEditor()}>创建套餐</Button>} /> : <section className="sa-package-grid">{packages.map((item, index) => {
      const status = itemStatus(item);
      return <article className="sa-package-card" key={itemId(item, `package-${index}`)}><header><span>{String(index + 1).padStart(2, "0")}</span><StatusBadge tone={statusTone(status)}>{status}</StatusBadge></header><div><small>PACKAGE</small><h2>{readString(item, ["name", "title"], "未命名套餐")}</h2><p>{readString(item, ["description", "summary"], "未提供套餐说明。")}</p></div><dl><div><dt>可用额度</dt><dd>{readNumber(item, ["credits", "quota"], 0).toLocaleString("zh-CN")}</dd></div><div><dt>售价</dt><dd>{formatMoney(readNumber(item, ["price", "amount"], 0))}</dd></div></dl><footer><Button tone="quiet" icon={<PencilSimple />} onClick={() => openEditor(item)}>编辑</Button><Button tone="quiet" icon={<Power />} onClick={() => toggle(item)}>{["disabled", "inactive"].includes(status) ? "启用" : "停用"}</Button><Button tone="danger" icon={<Trash />} onClick={() => remove(item)}>删除</Button></footer></article>;
    })}</section>}
    <FormDialog open={editorOpen} title={editing ? "编辑套餐" : "新建套餐"} description="价格、额度和状态将直接写入真实控制面。" submitLabel={editing ? "保存变更" : "创建套餐"} busy={busy} onClose={() => setEditorOpen(false)} onSubmit={save}><div className="sa-form-stack"><Field label="套餐名称"><input autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={80} required /></Field><Field label="套餐说明"><textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} maxLength={240} /></Field><div className="sa-form-grid"><Field label="额度次数"><input type="number" min="0" step="1" value={draft.credits} onChange={(event) => setDraft({ ...draft, credits: event.target.value })} /></Field><Field label="售价（元）"><input type="number" min="0" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} /></Field></div><label className="sa-switch"><span><strong>立即启用</strong><small>只影响新的选择入口。</small></span><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /><i aria-hidden="true"><b /></i></label></div></FormDialog>
  </div>;
}
