import { BookOpenText, Megaphone, PencilSimple, Plus, RocketLaunch, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { controlApi, displayError } from "../api";
import { extractItems, formatDate, itemId, itemStatus, readString, statusTone } from "../helpers";
import { useResource } from "../hooks";
import type { UnknownRecord } from "../types";
import { Button, EmptyState, ErrorState, Field, FormDialog, LoadingState, PageHeader, StatusBadge, cx } from "../ui";
import type { ViewProps } from "../viewTypes";

type ContentKind = "tutorial" | "announcement";
type ContentDraft = { title: string; summary: string; content: string; category: string };
const emptyDraft: ContentDraft = { title: "", summary: "", content: "", category: "general" };

export function ContentView({ refreshKey, notify, requestConfirmation }: ViewProps) {
  const [tab, setTab] = useState<ContentKind>("tutorial");
  const resource = useResource(async () => {
    const [tutorials, announcements] = await Promise.all([controlApi.listTutorials(), controlApi.listAnnouncements()]);
    return { tutorials: extractItems(tutorials, ["tutorials", "items", "rows"]), announcements: extractItems(announcements, ["announcements", "items", "rows"]) };
  }, { tutorials: [] as UnknownRecord[], announcements: [] as UnknownRecord[] }, [refreshKey]);
  const items = tab === "tutorial" ? resource.data.tutorials : resource.data.announcements;
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<UnknownRecord | null>(null);
  const [draft, setDraft] = useState<ContentDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);

  const openEditor = (item?: UnknownRecord) => {
    setEditing(item ?? null);
    setDraft(item ? { title: readString(item, ["title", "name"]), summary: readString(item, ["summary", "description"]), content: readString(item, ["content", "body"]), category: readString(item, ["category", "type"], "general") } : emptyDraft);
    setEditorOpen(true);
  };

  const save = async () => {
    if (!draft.title.trim() || !draft.content.trim()) { notify("error", "请填写标题和正文"); return; }
    setBusy(true);
    try {
      const payload = { title: draft.title.trim(), summary: draft.summary.trim(), content: draft.content.trim(), category: draft.category.trim() };
      if (tab === "tutorial") {
        if (editing) await controlApi.updateTutorial(itemId(editing, ""), payload); else await controlApi.createTutorial(payload);
      } else if (editing) await controlApi.updateAnnouncement(itemId(editing, ""), payload); else await controlApi.createAnnouncement(payload);
      notify("success", editing ? "内容已更新" : "草稿已创建", "发布状态需在列表中单独确认。");
      setEditorOpen(false);
      resource.reload();
    } catch (error) { notify("error", "内容写入失败", displayError(error).message); }
    finally { setBusy(false); }
  };

  const publish = (item: UnknownRecord) => {
    const status = itemStatus(item);
    const published = status === "published" || readString(item, ["publishedAt"]) !== "";
    requestConfirmation({ title: `${published ? "撤回" : "发布"}${tab === "tutorial" ? "教程" : "公告"}？`, description: published ? "撤回后新访问应立即停止展示，已生成的审计记录不会删除。" : "发布会让真实用户端获得该内容，请确认文案和影响范围。", confirmLabel: published ? "确认撤回" : "确认发布", tone: published ? "danger" : "primary", action: async () => {
      try {
        if (tab === "tutorial") await controlApi.publishTutorial(itemId(item, ""), !published); else await controlApi.publishAnnouncement(itemId(item, ""), !published);
        notify("success", published ? "内容已撤回" : "内容已发布"); resource.reload();
      } catch (error) { const detail = displayError(error); notify("error", "发布状态更新失败", detail.message); throw new Error(detail.message); }
    } });
  };

  const remove = (item: UnknownRecord) => requestConfirmation({ title: `删除${tab === "tutorial" ? "教程" : "公告"}“${readString(item, ["title", "name"], itemId(item, ""))}”？`, description: "该操作会请求真实控制面删除记录，不会仅从当前列表隐藏。", confirmLabel: "确认删除", tone: "danger", action: async () => {
    try { if (tab === "tutorial") await controlApi.deleteTutorial(itemId(item, "")); else await controlApi.deleteAnnouncement(itemId(item, "")); notify("success", "内容已删除"); resource.reload(); }
    catch (error) { const detail = displayError(error); notify("error", "删除失败", detail.message); throw new Error(detail.message); }
  } });

  return <div className="sa-view">
    <PageHeader eyebrow="CONTENT RELAY" title="内容发布" description="教程与公告均先保存草稿，再独立发布；用户端暴露属于高影响操作。" actions={<Button tone="primary" icon={<Plus />} onClick={() => openEditor()}>新建{tab === "tutorial" ? "教程" : "公告"}</Button>} />
    <div className="sa-segmented" role="tablist" aria-label="内容类型"><button type="button" role="tab" aria-selected={tab === "tutorial"} className={cx(tab === "tutorial" && "is-active")} onClick={() => setTab("tutorial")}><BookOpenText />教程 <span>{resource.data.tutorials.length}</span></button><button type="button" role="tab" aria-selected={tab === "announcement"} className={cx(tab === "announcement" && "is-active")} onClick={() => setTab("announcement")}><Megaphone />公告 <span>{resource.data.announcements.length}</span></button></div>
    {resource.status === "loading" || resource.status === "idle" ? <LoadingState label="正在读取发布目录" /> : resource.status === "error" ? <ErrorState message={resource.error} code={resource.errorCode} onRetry={resource.reload} /> : !items.length ? <EmptyState icon={tab === "tutorial" ? BookOpenText : Megaphone} title={`尚无${tab === "tutorial" ? "教程" : "公告"}`} description="新建后先检查草稿，再执行发布。" action={<Button tone="primary" onClick={() => openEditor()}>新建草稿</Button>} /> : <section className="sa-content-list">{items.map((item, index) => {
      const status = itemStatus(item);
      const published = status === "published" || Boolean(item.publishedAt);
      return <article key={itemId(item, `content-${index}`)}><header><div><StatusBadge tone={statusTone(status)}>{status}</StatusBadge><span>{readString(item, ["category", "type"], "general")}</span></div><time>{formatDate(item.updatedAt ?? item.createdAt)}</time></header><h2>{readString(item, ["title", "name"], "未命名内容")}</h2><p>{readString(item, ["summary", "description", "content"], "未提供内容摘要。")}</p><footer><small>{readString(item, ["authorName", "createdBy"], "未知编辑")}</small><div><Button tone="quiet" icon={<PencilSimple />} onClick={() => openEditor(item)}>编辑</Button><Button tone="secondary" icon={<RocketLaunch />} onClick={() => publish(item)}>{published ? "撤回" : "发布"}</Button><Button tone="danger" icon={<Trash />} onClick={() => remove(item)}>删除</Button></div></footer></article>;
    })}</section>}
    <FormDialog open={editorOpen} title={`${editing ? "编辑" : "新建"}${tab === "tutorial" ? "教程" : "公告"}`} description="编辑仅保存内容，不会暗中改变发布状态。" submitLabel="保存草稿" busy={busy} onClose={() => setEditorOpen(false)} onSubmit={save}><div className="sa-form-stack"><Field label="标题"><input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required /></Field><Field label="分类/类型"><input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></Field><Field label="摘要"><textarea rows={3} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></Field><Field label="正文"><textarea rows={10} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} required /></Field></div></FormDialog>
  </div>;
}
