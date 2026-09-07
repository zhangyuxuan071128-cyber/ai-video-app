import { FloppyDisk, ShieldWarning, UserFocus, UsersThree } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { controlApi, displayError } from "../api";
import { extractItems, formatDate, itemId, itemStatus, readNumber, readString, statusTone } from "../helpers";
import { useResource } from "../hooks";
import type { UnknownRecord } from "../types";
import { Button, DataTable, EmptyState, ErrorState, Field, LoadingState, PageHeader, Panel, SearchField, StatusBadge } from "../ui";
import type { ViewProps } from "../viewTypes";

export function MembersView({ refreshKey, notify, requestConfirmation }: ViewProps) {
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [roleDraft, setRoleDraft] = useState("user");
  const [statusDraft, setStatusDraft] = useState("active");
  const [creditDelta, setCreditDelta] = useState("0");
  const [quota, setQuota] = useState("");

  const resource = useResource(
    () => controlApi.listMembers({ query, role: role === "all" ? undefined : role, status: status === "all" ? undefined : status }),
    [] as UnknownRecord[],
    [refreshKey, query, role, status],
  );
  const members = extractItems(resource.data, ["members", "items", "rows"]);
  const selected = members.find((item, index) => itemId(item, String(index)) === selectedId) ?? members[0];
  const selectedRole = readString(selected, ["role"], "user");
  const selectedStatus = itemStatus(selected);
  const selectedQuota = readNumber(selected, ["quota", "dailyQuota", "selfApiDailyLimit"], 0);
  const selectedVersion = readNumber(selected, ["version"], 0);
  const protectedSelected = selectedRole === "super_admin";

  useEffect(() => {
    if (!selected) return;
    setSelectedId(itemId(selected, ""));
    setRoleDraft(readString(selected, ["role"], "user"));
    setStatusDraft(selectedStatus);
    setCreditDelta("0");
    setQuota(String(selectedQuota));
  }, [selectedId, selectedQuota, selectedRole, selectedStatus, selectedVersion]);

  const save = () => {
    if (!selected || protectedSelected) return;
    const id = itemId(selected, "");
    const currentStatus = selectedStatus;
    const currentQuota = selectedQuota;
    const delta = Number(creditDelta);
    const nextQuota = Number(quota);
    const patch: UnknownRecord = {};
    if (roleDraft !== selectedRole) patch.role = roleDraft;
    if (statusDraft !== currentStatus) patch.status = statusDraft;
    if (delta !== 0) patch.creditDelta = delta;
    if (nextQuota !== currentQuota) patch.quota = nextQuota;
    if (!Object.keys(patch).length) {
      notify("info", "没有待写入变更", "请先调整角色、状态、额度或日调用配额。");
      return;
    }
    const isDangerous = statusDraft === "frozen" || roleDraft !== selectedRole || delta < 0;
    requestConfirmation({
      title: `写入 ${readString(selected, ["displayName", "nickname", "username"], id)} 的身份变更？`,
      description: "角色、冻结状态、额度和配额都属于高影响操作，成功后应出现在审计日志。",
      confirmLabel: "确认写入变更",
      tone: isDangerous ? "danger" : "primary",
      action: async () => {
        try {
          await controlApi.updateMember(id, patch);
          notify("success", "成员记录已更新", `${id} 的变更已由控制面受理。`);
          resource.reload();
        } catch (error) {
          const detail = displayError(error);
          notify("error", "成员变更失败", detail.message);
          throw new Error(detail.message);
        }
      },
    });
  };

  return <div className="sa-view">
    <PageHeader eyebrow="IDENTITY GOVERNANCE" title="用户治理" description="检索真实成员、复核权限边界，并通过二次确认写入高影响变更。" />
    <form className="sa-toolbar" onSubmit={(event) => { event.preventDefault(); setQuery(queryDraft.trim()); }}>
      <SearchField label="搜索成员" value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder="账号、昵称、手机或成员 ID" />
      <Field label="角色"><select value={role} onChange={(event) => setRole(event.target.value)}><option value="all">全部</option><option value="user">创作者</option><option value="agent">代理</option><option value="admin">管理员</option></select></Field>
      <Field label="状态"><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部</option><option value="active">正常</option><option value="frozen">已冻结</option><option value="disabled">已停用</option></select></Field>
      <Button tone="secondary" type="submit">执行检索</Button>
    </form>

    {resource.status === "loading" || resource.status === "idle" ? <LoadingState label="正在读取成员矩阵" /> : resource.status === "error" ? <ErrorState message={resource.error} code={resource.errorCode} onRetry={resource.reload} /> : !members.length ? <EmptyState icon={UsersThree} title="没有匹配成员" description="调整搜索或筛选条件后重试。" /> : <div className="sa-master-detail">
      <Panel className="sa-panel--flush">
        <DataTable label="成员列表"><table className="sa-table"><thead><tr><th>成员</th><th>角色</th><th>状态</th><th>可用额度</th><th>日配额</th><th>最后活动</th></tr></thead><tbody>{members.map((member, index) => {
          const id = itemId(member, String(index));
          const active = selected && itemId(selected, "") === id;
          const state = itemStatus(member);
          return <tr key={id} className={active ? "is-selected" : undefined}><td><button className="sa-primary-cell" type="button" onClick={() => setSelectedId(id)}><span>{readString(member, ["displayName", "nickname", "name", "username"], "未命名成员")}</span><small>{readString(member, ["username", "account"], id)}</small></button></td><td>{readString(member, ["role"], "—")}</td><td><StatusBadge tone={statusTone(state)}>{state}</StatusBadge></td><td className="sa-number">{readNumber(member, ["credits", "paidCredits", "availableCredits"], 0).toLocaleString("zh-CN")}</td><td className="sa-number">{readNumber(member, ["quota", "dailyQuota", "selfApiDailyLimit"], 0).toLocaleString("zh-CN")}</td><td>{formatDate(member.lastActiveAt ?? member.updatedAt)}</td></tr>;
        })}</tbody></table></DataTable>
      </Panel>
      <aside className="sa-inspector">
        <header><span className="sa-inspector__sigil"><UserFocus /></span><div><small>MEMBER CONTROL</small><h2>{readString(selected, ["displayName", "nickname", "username"], "未选择成员")}</h2><p>{itemId(selected, "—")}</p></div></header>
        <div className="sa-inspector__grid"><Field label="账号角色"><select value={roleDraft} disabled={protectedSelected} onChange={(event) => setRoleDraft(event.target.value)}>{protectedSelected ? <option value="super_admin">超级管理员（受保护）</option> : null}<option value="user">创作者</option><option value="agent">代理</option><option value="admin">管理员</option></select></Field><Field label="账号状态"><select value={statusDraft} disabled={protectedSelected} onChange={(event) => setStatusDraft(event.target.value)}><option value="active">正常</option><option value="frozen">冻结</option><option value="disabled">停用</option></select></Field><Field label="额度增减" hint="负数会扣减额度。"><input type="number" step="1" disabled={protectedSelected} value={creditDelta} onChange={(event) => setCreditDelta(event.target.value)} /></Field><Field label="日调用配额"><input type="number" min="0" step="1" disabled={protectedSelected} value={quota} onChange={(event) => setQuota(event.target.value)} /></Field></div>
        <div className="sa-caution"><ShieldWarning /><p>{protectedSelected ? "启动超级管理员受服务端保护，不能从成员编辑器修改自身权限、状态或额度。" : "角色变更、冻结和负额度调整需要明确复核，不会在选择项时立即写入。"}</p></div>
        <Button tone="primary" icon={<FloppyDisk />} onClick={save} disabled={protectedSelected} disabledReason="超级管理员受服务端保护，不能在此编辑">复核并保存</Button>
      </aside>
    </div>}
  </div>;
}
