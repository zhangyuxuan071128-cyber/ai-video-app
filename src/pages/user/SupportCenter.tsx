import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  ChatCircleText,
  CheckCircle,
  Clock,
  FileText,
  ImageSquare,
  Lifebuoy,
  LockSimple,
  MagnifyingGlass,
  PaperPlaneTilt,
  Play,
  X,
} from "@phosphor-icons/react";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useAppStore } from "../../state/AppStore";
import type { FeedbackType, TutorialCategory } from "../../types/domain";
import {
  ActionButton,
  EmptyState,
  Field,
  IconButton,
  PageHeader,
  Panel,
  SignalBanner,
  StateChip,
  TabBar,
  formatFullDate,
  type Notify,
} from "./ui";

type SupportTab = "tutorials" | "feedback";
type TutorialFilter = "all" | TutorialCategory;

const categoryLabel: Record<TutorialCategory, string> = {
  getting_started: "快速入门",
  api_binding: "API 绑定",
  video_creation: "视频创作",
  affiliate: "邀请与佣金",
  faq: "常见问题",
};

const feedbackTypeLabel: Record<FeedbackType, string> = {
  recommendation: "功能推荐",
  suggestion: "优化建议",
  bug: "问题报告",
  question: "使用疑问",
};

export function SupportCenter({ onNavigate, notify }: { onNavigate: (view: string) => void; notify: Notify }) {
  const { state, currentUser, submitFeedback } = useAppStore();
  const [tab, setTab] = useState<SupportTab>("tutorials");
  const [category, setCategory] = useState<TutorialFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedTutorialId, setSelectedTutorialId] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("suggestion");
  const [feedbackPlatformId, setFeedbackPlatformId] = useState("");
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [feedbackContent, setFeedbackContent] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [feedbackError, setFeedbackError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const tutorials = useMemo(() => state.tutorials
    .filter((item) => item.isPublished)
    .filter((item) => category === "all" || item.category === category)
    .filter((item) => {
      const normalized = query.trim().toLowerCase();
      return !normalized || `${item.title} ${item.summary} ${item.content}`.toLowerCase().includes(normalized);
    })
    .sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || a.sortOrder - b.sortOrder), [category, query, state.tutorials]);
  const selectedTutorial = state.tutorials.find((item) => item.id === selectedTutorialId) ?? null;
  const userFeedback = useMemo(() => state.feedbacks.filter((item) => item.userId === currentUser?.id).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [currentUser?.id, state.feedbacks]);
  const isManaged = currentUser?.authKind === "server";

  const attachFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const names = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/")).slice(0, 6).map((file) => file.name);
    setAttachments(names);
    event.currentTarget.value = "";
  };

  const sendFeedback = async (event: FormEvent) => {
    event.preventDefault();
    setFeedbackError("");
    if (!feedbackTitle.trim() || feedbackContent.trim().length < 5) {
      setFeedbackError("请填写标题和至少 5 个字的详细说明。");
      return;
    }
    setSubmitting(true);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 220));
    const result = await submitFeedback({
      type: feedbackType,
      platformId: feedbackPlatformId || undefined,
      title: feedbackTitle,
      content: feedbackContent,
      images: attachments.map((name) => `local-metadata://${encodeURIComponent(name)}`),
    });
    setSubmitting(false);
    if (!result.ok) {
      setFeedbackError(result.message);
      notify("error", result.message);
      return;
    }
    setFeedbackTitle("");
    setFeedbackContent("");
    setAttachments([]);
    notify("success", result.message);
  };

  return (
    <div className="uw-page uw-support">
      <PageHeader
        title={isManaged ? "教程与服务支持" : "导航与本地支持"}
        description={isManaged ? "阅读超级管理端发布的教程，或把问题提交到统一待处理队列。" : "从使用教程理解产品流程，或将问题保存为当前浏览器内的管理记录。"}
        aside={<StateChip label={isManaged ? "教程 + 管理端反馈" : "教程 + 本地反馈"} tone="accent" />}
      />

      <TabBar value={tab} onChange={setTab} label="支持中心区域" options={[{ value: "tutorials", label: "教程导航", count: state.tutorials.filter((item) => item.isPublished).length }, { value: "feedback", label: isManaged ? "服务反馈" : "本地反馈", count: userFeedback.length }]} />

      {tab === "tutorials" ? (
        <>
          {selectedTutorial ? (
            <article className="uw-tutorial-reader">
              <button type="button" className="uw-back-link" onClick={() => setSelectedTutorialId(null)}><ArrowLeft aria-hidden="true" />返回教程列表</button>
              <header><div><StateChip label={categoryLabel[selectedTutorial.category]} tone="accent" />{selectedTutorial.isPinned ? <StateChip label="必读" tone="good" /> : null}</div><h1>{selectedTutorial.title}</h1><p>{selectedTutorial.summary}</p><span><Clock weight="duotone" aria-hidden="true" />约 {selectedTutorial.durationMinutes} 分钟 · {selectedTutorial.viewCount} 次本地演示阅读</span></header>
              <div className="uw-tutorial-reader__content">{selectedTutorial.content.split(/\n{2,}/).map((paragraph, index) => <p key={`${selectedTutorial.id}-${index}`}>{paragraph}</p>)}</div>
              <div className="uw-tutorial-reader__actions">
                <ActionButton
                  tone="primary"
                  icon={<Play />}
                  disabled
                  disabledReason="当前版本仅提供文字教程，尚未接入真实视频播放器"
                >
                  播放视频教程
                </ActionButton>
                <ActionButton tone="secondary" icon={<ArrowRight />} onClick={() => onNavigate(selectedTutorial.category === "api_binding" ? "platforms" : selectedTutorial.category === "affiliate" ? "growth" : "create")}>前往相关功能</ActionButton>
              </div>
            </article>
          ) : (
            <>
              <div className="uw-tutorial-toolbar">
                <div className="uw-material-filter" role="group" aria-label="教程分类"><button type="button" className={category === "all" ? "is-active" : ""} onClick={() => setCategory("all")}>全部</button>{(Object.keys(categoryLabel) as TutorialCategory[]).map((item) => <button type="button" className={category === item ? "is-active" : ""} onClick={() => setCategory(item)} key={item}>{categoryLabel[item]}</button>)}</div>
                <label className="uw-search-field"><MagnifyingGlass aria-hidden="true" /><span className="uw-sr-only">搜索教程</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索教程标题或内容" /></label>
              </div>
              {tutorials.length ? <section className="uw-tutorial-grid" aria-label="教程列表">{tutorials.map((tutorial) => <button type="button" className="uw-tutorial-card" onClick={() => setSelectedTutorialId(tutorial.id)} key={tutorial.id}><span className="uw-tutorial-card__sigil" aria-hidden="true"><BookOpenText weight="duotone" /></span><div><span><StateChip label={categoryLabel[tutorial.category]} tone="neutral" />{tutorial.isPinned ? <StateChip label="必读" tone="good" /> : null}</span><h2>{tutorial.title}</h2><p>{tutorial.summary}</p><small><Clock weight="duotone" />{tutorial.durationMinutes} 分钟</small></div><ArrowRight aria-hidden="true" /></button>)}</section> : <EmptyState icon={BookOpenText} title="当前筛选没有教程" description="请调整分类或搜索词。" action={<ActionButton tone="secondary" onClick={() => { setCategory("all"); setQuery(""); }}>清除筛选</ActionButton>} />}
            </>
          )}
        </>
      ) : (
        <>
          <SignalBanner tone="info" title={isManaged ? "共享反馈队列" : "本地反馈边界"}>
            {isManaged ? "文字反馈会写入共享控制面，并进入超级管理端待介入队列。附件对象存储尚未接入，因此当前不会上传图片。" : "反馈只保存在当前浏览器，本地管理员视图可查看；不会发送到其他设备或真实客服后台。图片附件仅保存文件名。"}
          </SignalBanner>
          <div className="uw-support-grid">
            <Panel title="提交新反馈" description="请写清复现步骤、预期结果和实际结果">
              <form className="uw-feedback-form" onSubmit={sendFeedback} noValidate>
                <div className="uw-form-grid uw-form-grid--two"><Field label="反馈类型"><select value={feedbackType} onChange={(event) => setFeedbackType(event.target.value as FeedbackType)}>{(Object.keys(feedbackTypeLabel) as FeedbackType[]).map((type) => <option value={type} key={type}>{feedbackTypeLabel[type]}</option>)}</select></Field><Field label="相关平台"><select value={feedbackPlatformId} onChange={(event) => setFeedbackPlatformId(event.target.value)}><option value="">与平台无关</option>{state.platforms.map((platform) => <option value={platform.id} key={platform.id}>{platform.name}</option>)}</select></Field></div>
                <Field label="标题" required><input value={feedbackTitle} onChange={(event) => { setFeedbackTitle(event.target.value); setFeedbackError(""); }} maxLength={100} placeholder="用一句话说明问题" /></Field>
                <Field label="详细说明" required hint="至少 5 个字"><textarea value={feedbackContent} onChange={(event) => { setFeedbackContent(event.target.value); setFeedbackError(""); }} rows={7} maxLength={2000} placeholder="发生了什么？你希望系统如何处理？" /></Field>
                <Field label="图片附件（可选）" hint={isManaged ? "对象存储未接入，在线模式暂不上传附件" : "最多 6 张；演示版仅记录文件名"}><span className="uw-feedback-upload"><input type="file" accept="image/*" multiple onChange={attachFiles} aria-label="选择反馈图片" disabled={isManaged} /><ImageSquare weight="duotone" /><span>{isManaged ? "附件上传尚未配置" : attachments.length ? `已选择 ${attachments.length} 个文件` : "选择截图文件"}</span></span></Field>
                {attachments.length ? <div className="uw-attachment-list">{attachments.map((name) => <span key={name}><FileText />{name}<IconButton label={`移除附件 ${name}`} icon={<X />} onClick={() => setAttachments((items) => items.filter((item) => item !== name))} /></span>)}</div> : null}
                {feedbackError ? <SignalBanner tone="error" title="反馈未提交">{feedbackError}</SignalBanner> : null}
                <ActionButton tone="primary" type="submit" busy={submitting} icon={<PaperPlaneTilt />}>{isManaged ? "提交到管理端" : "保存本地反馈"}</ActionButton>
              </form>
            </Panel>

            <Panel title="我的反馈" description="状态更新和管理员回复会保留在这里">
              {userFeedback.length ? <div className="uw-feedback-history">{userFeedback.map((item) => <article key={item.id}><header><StateChip label={feedbackTypeLabel[item.type]} tone="neutral" /><StateChip label={item.status === "pending" ? "待处理" : item.status === "processing" ? "处理中" : item.status === "adopted" ? "已采纳" : "已关闭"} tone={item.status === "adopted" ? "good" : item.status === "processing" ? "accent" : "neutral"} /></header><h3>{item.title}</h3><p>{item.content}</p><small>{formatFullDate(item.createdAt)}</small>{item.adminReply ? <div className="uw-admin-reply"><LockSimple weight="duotone" /><span><strong>{isManaged ? "管理员回复" : "本地管理员回复"}</strong><p>{item.adminReply}</p><small>{formatFullDate(item.adminReplyAt)}</small></span></div> : null}</article>)}</div> : <EmptyState icon={ChatCircleText} title="尚未提交反馈" description={isManaged ? "成功提交后，反馈会出现在这里并进入超级管理端队列。" : "你在当前浏览器保存的反馈与本地管理员回复会出现在这里。"} />}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
