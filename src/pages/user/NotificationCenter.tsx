import {
  Bell,
  Check,
  CheckCircle,
  Coins,
  GearSix,
  Info,
  Stack,
  WarningCircle,
  Wallet,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useAppStore } from "../../state/AppStore";
import type { AppNotification, NotificationType } from "../../types/domain";
import {
  ActionButton,
  EmptyState,
  PageHeader,
  StateChip,
  TabBar,
  formatFullDate,
  type Notify,
} from "./ui";

type NoticeFilter = "all" | "unread" | "task" | "account" | "system";

const typeMeta: Record<NotificationType, { label: string; icon: typeof Bell; tone: "neutral" | "good" | "warning" | "danger" | "accent" }> = {
  task_complete: { label: "任务完成", icon: CheckCircle, tone: "good" },
  task_failed: { label: "任务异常", icon: WarningCircle, tone: "danger" },
  commission: { label: "佣金", icon: Coins, tone: "accent" },
  withdraw: { label: "提现", icon: Wallet, tone: "warning" },
  system: { label: "系统", icon: Info, tone: "neutral" },
  recharge: { label: "额度", icon: Coins, tone: "good" },
};

function destinationFor(notification: AppNotification): string | null {
  if (notification.relatedTaskId || notification.type.startsWith("task_")) return "tasks";
  if (notification.type === "commission" || notification.type === "withdraw") return "growth";
  if (notification.type === "recharge") return "wallet";
  if (notification.actionHref?.includes("tutorial")) return "support";
  return null;
}

export function NotificationCenter({ onNavigate, notify }: { onNavigate: (view: string) => void; notify: Notify }) {
  const { userNotifications, unreadCount, markNotificationRead, markAllNotificationsRead, currentUser } = useAppStore();
  const [filter, setFilter] = useState<NoticeFilter>("all");

  const filtered = useMemo(() => userNotifications.filter((item) => {
    if (filter === "unread") return !item.isRead;
    if (filter === "task") return item.type === "task_complete" || item.type === "task_failed";
    if (filter === "account") return ["commission", "withdraw", "recharge"].includes(item.type);
    if (filter === "system") return item.type === "system";
    return true;
  }), [filter, userNotifications]);

  const markAll = () => {
    const result = markAllNotificationsRead();
    notify(result.ok ? "success" : "error", result.message);
  };

  const toggleRead = (item: AppNotification) => {
    const result = markNotificationRead(item.id, !item.isRead);
    notify(result.ok ? "success" : "error", item.isRead ? "已标记为未读。" : "已标记为已读。");
  };

  const openNotice = (item: AppNotification) => {
    if (!item.isRead) markNotificationRead(item.id, true);
    const destination = destinationFor(item);
    if (destination) onNavigate(destination);
    else notify("info", "该消息没有附加跳转目标。");
  };

  const counts = {
    all: userNotifications.length,
    unread: unreadCount,
    task: userNotifications.filter((item) => item.type.startsWith("task_")).length,
    account: userNotifications.filter((item) => ["commission", "withdraw", "recharge"].includes(item.type)).length,
    system: userNotifications.filter((item) => item.type === "system").length,
  };

  return (
    <div className="uw-page uw-notifications">
      <PageHeader
        title="信号通知中心"
        description="集中查看任务、额度、佣金和系统通知，并管理已读状态。"
        actions={<><ActionButton tone="secondary" icon={<GearSix />} onClick={() => onNavigate("settings")}>提醒设置</ActionButton><ActionButton tone="primary" icon={<Check />} onClick={markAll} disabled={unreadCount === 0} disabledReason="当前没有未读消息">全部已读</ActionButton></>}
      />

      <div className="uw-notice-toolbar">
        <TabBar value={filter} onChange={setFilter} label="通知筛选" options={[
          { value: "all", label: "全部", count: counts.all },
          { value: "unread", label: "未读", count: counts.unread },
          { value: "task", label: "任务", count: counts.task },
          { value: "account", label: "账户", count: counts.account },
          { value: "system", label: "系统", count: counts.system },
        ]} />
        <span className="uw-notice-preference"><Bell weight="duotone" aria-hidden="true" />弹窗偏好：{currentUser?.preferences.popupNotifications ? "开启" : "关闭"}</span>
      </div>

      {filtered.length ? <section className="uw-notice-stream" aria-label="通知列表">
        {filtered.map((item) => {
          const meta = typeMeta[item.type];
          const Glyph = meta.icon;
          const destination = destinationFor(item);
          return <article className={`uw-notice${item.isRead ? " is-read" : " is-unread"}`} key={item.id}>
            <span className="uw-notice__icon" aria-hidden="true"><Glyph weight="duotone" /></span>
            <div className="uw-notice__copy"><div><StateChip label={meta.label} tone={meta.tone} /><span>{formatFullDate(item.createdAt)}</span>{item.priority === "high" ? <StateChip label="高优先级" tone="danger" /> : null}</div><h2>{item.title}</h2><p>{item.content}</p></div>
            <div className="uw-notice__actions"><ActionButton tone="quiet" onClick={() => toggleRead(item)}>{item.isRead ? "标为未读" : "标为已读"}</ActionButton><ActionButton tone="secondary" onClick={() => openNotice(item)} disabled={!destination} disabledReason="该消息没有附加跳转目标">{destination ? "查看相关内容" : "无附加操作"}</ActionButton></div>
          </article>;
        })}
      </section> : <EmptyState icon={filter === "unread" ? CheckCircle : Stack} title={filter === "unread" ? "没有未读通知" : "当前筛选没有通知"} description={filter === "unread" ? "所有信号都已处理。" : "切换筛选可以查看其他类型的通知。"} action={filter !== "all" ? <ActionButton tone="secondary" onClick={() => setFilter("all")}>查看全部通知</ActionButton> : undefined} />}
    </div>
  );
}
