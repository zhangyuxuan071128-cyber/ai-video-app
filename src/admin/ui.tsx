import {
  ArrowClockwise,
  CheckCircle,
  CircleNotch,
  Info,
  MagnifyingGlass,
  Warning,
  X,
  XCircle,
  type Icon,
} from "@phosphor-icons/react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FormEvent,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import type { Notice, Tone } from "./types";

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary" | "quiet" | "danger";
  icon?: ReactNode;
  busy?: boolean;
  disabledReason?: string;
};

export function Button({
  tone = "secondary",
  icon,
  busy = false,
  disabled,
  disabledReason,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const inactive = disabled || busy;
  return (
    <button
      {...props}
      type={type}
      disabled={inactive}
      aria-busy={busy || undefined}
      title={inactive && disabledReason ? disabledReason : props.title}
      className={cx("sa-button", `sa-button--${tone}`, className)}
    >
      {busy ? <CircleNotch className="sa-spin" weight="bold" aria-hidden="true" /> : icon ? <span aria-hidden="true">{icon}</span> : null}
      <span>{busy ? "处理中…" : children}</span>
    </button>
  );
}

export function IconButton({
  label,
  icon,
  disabledReason,
  disabled,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: ReactNode; disabledReason?: string }) {
  return (
    <button
      {...props}
      type="button"
      aria-label={label}
      title={disabled && disabledReason ? disabledReason : label}
      disabled={disabled}
      className={cx("sa-icon-button", className)}
    >
      {icon}
    </button>
  );
}

export function StatusBadge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("sa-status", `sa-status--${tone}`)}><i aria-hidden="true" />{children}</span>;
}

export function Panel({
  title,
  description,
  actions,
  className,
  children,
  as: Tag = "section",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
  as?: "section" | "article" | "aside" | "div";
}) {
  return (
    <Tag className={cx("sa-panel", className)}>
      {title || description || actions ? (
        <header className="sa-panel__header">
          <div>{title ? <h2>{title}</h2> : null}{description ? <p>{description}</p> : null}</div>
          {actions ? <div className="sa-panel__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="sa-panel__body">{children}</div>
    </Tag>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sa-page-header">
      <div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
      {actions ? <div className="sa-page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function LoadingState({ label = "正在读取真实控制面数据" }: { label?: string }) {
  return <div className="sa-state" role="status" aria-live="polite"><CircleNotch className="sa-spin" weight="bold" /><strong>{label}</strong><p>请稍候，不会使用虚构数据填充。</p></div>;
}

export function EmptyState({ icon: Glyph, title, description, action }: { icon: Icon; title: string; description: string; action?: ReactNode }) {
  return <div className="sa-state sa-state--empty"><span className="sa-state__sigil" aria-hidden="true"><Glyph weight="duotone" /></span><strong>{title}</strong><p>{description}</p>{action}</div>;
}

export function ErrorState({ message, code, onRetry }: { message: string; code?: string; onRetry?: () => void }) {
  return (
    <div className="sa-state sa-state--error" role="alert">
      <Warning weight="duotone" />
      <strong>{code === "CONFIG_REQUIRED" ? "运行配置未完成" : "控制面请求失败"}</strong>
      <p>{message}</p>
      {onRetry ? <Button tone="secondary" icon={<ArrowClockwise />} onClick={onRetry}>重试</Button> : null}
    </div>
  );
}

export function SearchField({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <label className="sa-search"><MagnifyingGlass aria-hidden="true" /><span className="sa-sr-only">{label}</span><input {...props} /></label>;
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return <label className={cx("sa-field", className)}><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

export interface Confirmation {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "primary" | "danger";
  action: () => Promise<void>;
}

export function ConfirmDialog({ pending, onClose }: { pending: Confirmation | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (pending && !dialog.open) dialog.showModal();
    if (!pending && dialog.open) dialog.close();
    if (!pending) { setBusy(false); setError(""); }
  }, [pending]);

  const confirm = async () => {
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    try {
      await pending.action();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作未完成");
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={ref}
      className="sa-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
    >
      {pending ? <div className="sa-dialog__surface">
        <header><span className={cx("sa-dialog__sigil", pending.tone === "danger" && "is-danger")} aria-hidden="true">{pending.tone === "danger" ? <Warning /> : <Info />}</span><div><small>CONTROL CONFIRMATION</small><h2 id={titleId}>{pending.title}</h2><p id={descriptionId}>{pending.description}</p></div></header>
        {error ? <div className="sa-inline-error" role="alert"><XCircle />{error}</div> : null}
        <footer><Button tone="quiet" disabled={busy} onClick={onClose}>返回检查</Button><Button tone={pending.tone === "danger" ? "danger" : "primary"} busy={busy} onClick={confirm}>{pending.confirmLabel}</Button></footer>
      </div> : null}
    </dialog>
  );
}

export function FormDialog({
  open,
  title,
  description,
  submitLabel,
  busy,
  children,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description: string;
  submitLabel: string;
  busy?: boolean;
  children: ReactNode;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const submit = (event: FormEvent) => { event.preventDefault(); void onSubmit(); };

  return <dialog ref={ref} className="sa-dialog sa-dialog--form" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form className="sa-dialog__surface" onSubmit={submit}>
      <header><span className="sa-dialog__sigil" aria-hidden="true"><Info /></span><div><small>CONTROL EDITOR</small><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p></div><IconButton label="关闭编辑器" icon={<X />} disabled={busy} onClick={onClose} /></header>
      <div className="sa-dialog__content">{children}</div>
      <footer><Button tone="quiet" disabled={busy} onClick={onClose}>取消</Button><Button tone="primary" type="submit" busy={busy}>{submitLabel}</Button></footer>
    </form>
  </dialog>;
}

export function ToastRegion({ notices, dismiss }: { notices: Notice[]; dismiss: (id: number) => void }) {
  return <div className="sa-toasts" aria-live="polite" aria-relevant="additions removals">
    {notices.map((notice) => {
      const Glyph = notice.tone === "success" ? CheckCircle : notice.tone === "error" ? XCircle : Info;
      return <article className={cx("sa-toast", `sa-toast--${notice.tone}`)} key={notice.id} role={notice.tone === "error" ? "alert" : "status"}><Glyph weight="fill" /><div><strong>{notice.title}</strong>{notice.message ? <p>{notice.message}</p> : null}</div><IconButton label="关闭提示" icon={<X />} onClick={() => dismiss(notice.id)} /></article>;
    })}
  </div>;
}

export function DataTable({ children, label }: HTMLAttributes<HTMLDivElement> & { label: string }) {
  return <div className="sa-table-wrap" role="region" aria-label={label} tabIndex={0}>{children}</div>;
}
