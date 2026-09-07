import { Copy, Key, Lightning, Power, Ticket } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import { controlApi, displayError } from "../api";
import { asRecord, extractItems, formatDate, itemId, itemStatus, readNumber, readString, statusTone } from "../helpers";
import type { UnknownRecord } from "../types";
import { Button, EmptyState, Field, PageHeader, Panel, StatusBadge } from "../ui";
import type { ViewProps } from "../viewTypes";

function generatedItems(value: unknown): UnknownRecord[] {
  const items = extractItems(value, ["codes", "items", "inviteCodes", "rechargeCodes"]);
  if (items.length) return items;
  const single = asRecord(value);
  return readString(single, ["code", "id"]) ? [single] : [];
}

export function CodesView({ notify, requestConfirmation }: ViewProps) {
  const [inviteDraft, setInviteDraft] = useState({ count: "1", maxUses: "1", giftCredits: "0", expiresAt: "" });
  const [rechargeDraft, setRechargeDraft] = useState({ count: "1", credits: "100", value: "0", expiresAt: "" });
  const [inviteCodes, setInviteCodes] = useState<UnknownRecord[]>([]);
  const [rechargeCodes, setRechargeCodes] = useState<UnknownRecord[]>([]);
  const [busy, setBusy] = useState<"invite" | "recharge" | "">("");

  const generateInvite = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("invite");
    try {
      const response = await controlApi.generateInviteCodes({ count: Number(inviteDraft.count), maxUses: Number(inviteDraft.maxUses), giftCredits: Number(inviteDraft.giftCredits), expiresAt: inviteDraft.expiresAt || undefined });
      const items = generatedItems(response);
      setInviteCodes(items);
      notify("success", "邀请码已生成", `控制面返回 ${items.length} 个邀请码。`);
    } catch (error) {
      notify("error", "邀请码生成失败", displayError(error).message);
    } finally { setBusy(""); }
  };

  const generateRecharge = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("recharge");
    try {
      const response = await controlApi.generateRechargeCodes({ count: Number(rechargeDraft.count), credits: Number(rechargeDraft.credits), value: Number(rechargeDraft.value), expiresAt: rechargeDraft.expiresAt || undefined });
      const items = generatedItems(response);
      setRechargeCodes(items);
      notify("success", "充值码已生成", `控制面返回 ${items.length} 个充值码。`);
    } catch (error) {
      notify("error", "充值码生成失败", displayError(error).message);
    } finally { setBusy(""); }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      notify("success", "凭证已复制");
    } catch {
      notify("error", "复制失败", "浏览器未授予剪贴板权限。");
    }
  };

  const toggle = (kind: "invite" | "recharge", item: UnknownRecord) => {
    const id = itemId(item, "");
    const currentEnabled = !["disabled", "revoked"].includes(itemStatus(item));
    requestConfirmation({
      title: `${currentEnabled ? "停用" : "启用"}${kind === "invite" ? "邀请码" : "充值码"}？`,
      description: `${readString(item, ["code"], id)} 的状态将通过真实控制面写入。`,
      confirmLabel: currentEnabled ? "确认停用" : "确认启用",
      tone: currentEnabled ? "danger" : "primary",
      action: async () => {
        try {
          if (kind === "invite") await controlApi.setInviteCodeEnabled(id, !currentEnabled);
          else await controlApi.setRechargeCodeEnabled(id, !currentEnabled);
          const update = (entry: UnknownRecord) => itemId(entry, "") === id ? { ...entry, enabled: !currentEnabled, status: !currentEnabled ? "enabled" : "disabled" } : entry;
          if (kind === "invite") setInviteCodes((items) => items.map(update)); else setRechargeCodes((items) => items.map(update));
          notify("success", "卡码状态已更新");
        } catch (error) {
          const detail = displayError(error);
          notify("error", "卡码状态更新失败", detail.message);
          throw new Error(detail.message);
        }
      },
    });
  };

  const batch = (title: string, icon: typeof Key, items: UnknownRecord[], kind: "invite" | "recharge") => {
    const Glyph = icon;
    return <Panel title={<><Glyph />{title}</>} description="仅展示本次请求由控制面返回的卡码。">
      {items.length ? <div className="sa-code-list">{items.map((item, index) => {
        const code = readString(item, ["code"], "");
        const status = itemStatus(item);
        return <article key={itemId(item, `${kind}-${index}`)}><span><StatusBadge tone={statusTone(status)}>{status}</StatusBadge><code>{code || "控制面未返回码值"}</code><small>{kind === "invite" ? `使用 ${readNumber(item, ["usedCount"], 0)} / ${readNumber(item, ["maxUses"], 0)} · 赠送 ${readNumber(item, ["giftCredits"], 0)} 次` : `额度 ${readNumber(item, ["credits"], 0)} 次 · 面值 ${readNumber(item, ["value"], 0)}`}</small><small>失效 {formatDate(item.expiresAt, false)}</small></span><div><Button tone="quiet" icon={<Copy />} disabled={!code} disabledReason="控制面未返回可复制卡码" onClick={() => copy(code)}>复制</Button><Button tone="quiet" icon={<Power />} onClick={() => toggle(kind, item)}>{["disabled", "revoked"].includes(status) ? "启用" : "停用"}</Button></div></article>;
      })}</div> : <EmptyState icon={Ticket} title="本次会话尚未生成卡码" description="提交左侧参数后，返回结果会显示在这里。" />}
    </Panel>;
  };

  return <div className="sa-view">
    <PageHeader eyebrow="CREDENTIAL MINT" title="额度卡码" description="独立生成邀请码和充值码；所有启停变更都需二次确认。" />
    <div className="sa-code-grid">
      <Panel title={<><Key />铸造邀请码</>} description="设置使用次数、新成员赠送额度和失效时间。"><form className="sa-form-stack" onSubmit={generateInvite}><div className="sa-form-grid"><Field label="生成数量"><input type="number" min="1" max="100" value={inviteDraft.count} onChange={(event) => setInviteDraft({ ...inviteDraft, count: event.target.value })} /></Field><Field label="最多使用"><input type="number" min="1" max="500" value={inviteDraft.maxUses} onChange={(event) => setInviteDraft({ ...inviteDraft, maxUses: event.target.value })} /></Field><Field label="赠送额度"><input type="number" min="0" value={inviteDraft.giftCredits} onChange={(event) => setInviteDraft({ ...inviteDraft, giftCredits: event.target.value })} /></Field><Field label="失效日期"><input type="date" value={inviteDraft.expiresAt} onChange={(event) => setInviteDraft({ ...inviteDraft, expiresAt: event.target.value })} /></Field></div><Button tone="primary" type="submit" busy={busy === "invite"} icon={<Lightning />}>生成邀请码</Button></form></Panel>
      <Panel title={<><Ticket />铸造充值码</>} description="额度与面值分开传递，真实规则由服务端校验。"><form className="sa-form-stack" onSubmit={generateRecharge}><div className="sa-form-grid"><Field label="生成数量"><input type="number" min="1" max="100" value={rechargeDraft.count} onChange={(event) => setRechargeDraft({ ...rechargeDraft, count: event.target.value })} /></Field><Field label="充值额度"><input type="number" min="1" value={rechargeDraft.credits} onChange={(event) => setRechargeDraft({ ...rechargeDraft, credits: event.target.value })} /></Field><Field label="参考面值"><input type="number" min="0" step="0.01" value={rechargeDraft.value} onChange={(event) => setRechargeDraft({ ...rechargeDraft, value: event.target.value })} /></Field><Field label="失效日期"><input type="date" value={rechargeDraft.expiresAt} onChange={(event) => setRechargeDraft({ ...rechargeDraft, expiresAt: event.target.value })} /></Field></div><Button tone="primary" type="submit" busy={busy === "recharge"} icon={<Lightning />}>生成充值码</Button></form></Panel>
    </div>
    <div className="sa-code-grid">{batch("最新邀请码批次", Key, inviteCodes, "invite")}{batch("最新充值码批次", Ticket, rechargeCodes, "recharge")}</div>
  </div>;
}
