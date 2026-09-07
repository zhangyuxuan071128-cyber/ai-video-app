import {
  CheckCircle,
  Info,
  SpinnerGap,
  WarningCircle,
  XCircle,
  type Icon,
} from "@phosphor-icons/react";
import {
  forwardRef,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";

export type NoticeTone = "success" | "error" | "info";
export type Notify = (tone: NoticeTone, message: string) => void;

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function formatDateTime(value?: string): string {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatFullDate(value?: string): string {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes < 1) return "未记录";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export async function copyText(value: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary" | "quiet" | "danger";
  icon?: ReactNode;
  busy?: boolean;
  disabledReason?: string;
};

export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton({
  tone = "secondary",
  icon,
  busy = false,
  disabled,
  disabledReason,
  className,
  children,
  type = "button",
  ...props
}, ref) {
  const isDisabled = disabled || busy;
  return (
    <button
      type={type}
      ref={ref}
      className={cx("uw-button", `uw-button--${tone}`, className)}
      disabled={isDisabled}
      aria-busy={busy || undefined}
      title={isDisabled && disabledReason ? disabledReason : props.title}
      {...props}
    >
      <span className="uw-button__icon" aria-hidden="true">
        {busy ? <SpinnerGap className="uw-spin" weight="bold" /> : icon}
      </span>
      <span>{children}</span>
    </button>
  );
});

export function IconButton({
  label,
  icon,
  disabled,
  disabledReason,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: ReactNode;
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      className={cx("uw-icon-button", className)}
      aria-label={label}
      title={disabled && disabledReason ? disabledReason : label}
      disabled={disabled}
      {...props}
    >
      {icon}
    </button>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  aside,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="uw-page-header">
      <div className="uw-page-header__copy">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {aside ? <div className="uw-page-header__aside">{aside}</div> : null}
      {actions ? <div className="uw-page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  as: Tag = "section",
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: "section" | "article" | "div";
}) {
  return (
    <Tag className={cx("uw-panel", className)}>
      {title || description || actions ? (
        <header className="uw-panel__header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="uw-panel__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="uw-panel__body">{children}</div>
    </Tag>
  );
}

export function StateChip({
  label,
  tone = "neutral",
  pulse = false,
}: {
  label: string;
  tone?: "neutral" | "good" | "warning" | "danger" | "accent";
  pulse?: boolean;
}) {
  return (
    <span className={cx("uw-state-chip", `uw-state-chip--${tone}`, pulse && "is-pulsing")}>
      <span className="uw-state-chip__dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export function SignalBanner({
  tone = "info",
  title,
  children,
  actions,
}: {
  tone?: NoticeTone;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const Glyph = tone === "success" ? CheckCircle : tone === "error" ? WarningCircle : Info;
  return (
    <div className={cx("uw-signal", `uw-signal--${tone}`)} role={tone === "error" ? "alert" : "status"}>
      <Glyph className="uw-signal__icon" weight="duotone" aria-hidden="true" />
      <div className="uw-signal__copy">
        <strong>{title}</strong>
        {children ? <div>{children}</div> : null}
      </div>
      {actions ? <div className="uw-signal__actions">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon: Glyph,
  title,
  description,
  action,
}: {
  icon: Icon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="uw-empty">
      <div className="uw-empty__sigil" aria-hidden="true">
        <Glyph weight="duotone" />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="uw-empty__action">{action}</div> : null}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="uw-progress">
      <div className="uw-progress__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={safeValue} aria-label={label ?? "处理进度"}>
        <span style={{ width: `${safeValue}%` }} />
      </div>
      <span className="uw-progress__value">{safeValue}%</span>
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("uw-field", error && "has-error", className)}>
      <span className="uw-field__label">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      {children}
      {error ? <span className="uw-field__error">{error}</span> : hint ? <span className="uw-field__hint">{hint}</span> : null}
    </label>
  );
}

export function TabBar<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string; count?: number }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="uw-tabs" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={cx("uw-tabs__item", value === option.value && "is-active")}
          onClick={() => onChange(option.value)}
          key={option.value}
        >
          {option.label}
          {typeof option.count === "number" ? <span>{option.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function LoadingState({ label = "正在读取数据" }: { label?: string }) {
  return (
    <div className="uw-loading" role="status">
      <SpinnerGap className="uw-spin" weight="bold" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function Toast({ tone, message, onDismiss }: { tone: NoticeTone; message: string; onDismiss: () => void }) {
  const Glyph = tone === "success" ? CheckCircle : tone === "error" ? XCircle : Info;
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, tone === "error" ? 5200 : 3600);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss, tone]);
  return (
    <div className={cx("uw-toast", `uw-toast--${tone}`)} role={tone === "error" ? "alert" : "status"}>
      <Glyph weight="fill" aria-hidden="true" />
      <span>{message}</span>
      <button type="button" onClick={onDismiss} aria-label="关闭提示">
        ×
      </button>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, open]);
  if (!open) return null;
  return (
    <div className="uw-dialog-layer" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onCancel();
    }}>
      <div className="uw-dialog" role="alertdialog" aria-modal="true" aria-labelledby="uw-confirm-title" aria-describedby="uw-confirm-description">
        <div className="uw-dialog__sigil" aria-hidden="true"><WarningCircle weight="duotone" /></div>
        <h2 id="uw-confirm-title">{title}</h2>
        <p id="uw-confirm-description">{description}</p>
        <div className="uw-dialog__actions">
          <ActionButton ref={cancelRef} onClick={onCancel} tone="quiet">取消</ActionButton>
          <ActionButton onClick={onConfirm} tone={tone}>{confirmLabel}</ActionButton>
        </div>
      </div>
    </div>
  );
}

export function Metric({ label, value, note, icon, className }: { label: string; value: ReactNode; note?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cx("uw-metric", className)}>
      <div className="uw-metric__top">
        <span>{label}</span>
        {icon ? <span aria-hidden="true">{icon}</span> : null}
      </div>
      <strong>{value}</strong>
      {note ? <div className="uw-metric__note">{note}</div> : null}
    </div>
  );
}

export function DefinitionList({ items, className }: { items: Array<{ term: string; value: ReactNode }>; className?: string }) {
  return (
    <dl className={cx("uw-definition-list", className)}>
      {items.map((item) => (
        <div key={item.term}>
          <dt>{item.term}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function VisuallyHidden({ children, ...props }: HTMLAttributes<HTMLSpanElement> & { children: ReactNode }) {
  return <span className="uw-sr-only" {...props}>{children}</span>;
}
