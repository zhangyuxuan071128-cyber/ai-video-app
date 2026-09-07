import {
  ArrowRight,
  CheckCircle,
  CircleNotch,
  FolderOpen,
  Info,
  Sparkle,
  WarningCircle,
  X,
  XCircle,
} from "@phosphor-icons/react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  fullWidth?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  leadingIcon,
  trailingIcon,
  loading = false,
  loadingLabel = "处理中",
  fullWidth = false,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const startIcon = leadingIcon ?? icon;

  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes(
        "sx-button",
        `sx-button--${variant}`,
        `sx-button--${size}`,
        fullWidth && "sx-button--full",
        className,
      )}
    >
      {loading ? (
        <CircleNotch className="sx-button__spinner" size={18} weight="bold" aria-hidden="true" />
      ) : startIcon ? (
        <span className="sx-button__icon" aria-hidden="true">{startIcon}</span>
      ) : null}
      {size === "icon" ? (
        loading ? null : children
      ) : (
        <span className="sx-button__label">{loading ? loadingLabel : children}</span>
      )}
      {!loading && trailingIcon ? (
        <span className="sx-button__icon sx-button__icon--trailing" aria-hidden="true">
          {trailingIcon}
        </span>
      ) : null}
    </button>
  );
}

export interface HudPanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  padding?: "none" | "compact" | "normal";
  tone?: "default" | "elevated" | "brand";
  as?: "section" | "article" | "div";
}

export function HudPanel({
  title,
  eyebrow,
  description,
  actions,
  padding = "normal",
  tone = "default",
  as: Tag = "section",
  className,
  children,
  ...props
}: HudPanelProps) {
  return (
    <Tag
      {...props}
      className={classes(
        "sx-panel",
        `sx-panel--${tone}`,
        `sx-panel--padding-${padding}`,
        className,
      )}
    >
      {(title || eyebrow || description || actions) && (
        <div className="sx-panel__header">
          <div className="sx-panel__heading">
            {eyebrow ? <div className="sx-panel__eyebrow">{eyebrow}</div> : null}
            {title ? <h2 className="sx-panel__title">{title}</h2> : null}
            {description ? <p className="sx-panel__description">{description}</p> : null}
          </div>
          {actions ? <div className="sx-panel__actions">{actions}</div> : null}
        </div>
      )}
      <div className="sx-panel__content">{children}</div>
      <span className="sx-panel__node sx-panel__node--start" aria-hidden="true" />
      <span className="sx-panel__node sx-panel__node--end" aria-hidden="true" />
    </Tag>
  );
}

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "error" | "info" | "processing";

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  dot?: boolean;
  pulse?: boolean;
}

export function StatusBadge({
  tone = "neutral",
  dot = true,
  pulse = false,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      {...props}
      className={classes(
        "sx-status",
        `sx-status--${tone}`,
        pulse && "sx-status--pulse",
        className,
      )}
    >
      {dot ? <span className="sx-status__dot" aria-hidden="true" /> : null}
      <span>{children}</span>
    </span>
  );
}

export interface SectionHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  ...props
}: SectionHeaderProps) {
  return (
    <div {...props} className={classes("sx-section-header", className)}>
      <div className="sx-section-header__copy">
        {eyebrow ? <div className="sx-section-header__eyebrow">{eyebrow}</div> : null}
        <h1 className="sx-section-header__title">{title}</h1>
        {description ? <p className="sx-section-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="sx-section-header__actions">{actions}</div> : null}
    </div>
  );
}

export interface ProgressRingProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  showValue?: boolean;
  tone?: "brand" | "success" | "warning" | "danger";
}

export function ProgressRing({
  value,
  size = 64,
  strokeWidth = 5,
  label,
  showValue = true,
  tone = "brand",
  className,
  style,
  ...props
}: ProgressRingProps) {
  const safeValue = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  const radius = Math.max(1, (size - strokeWidth) / 2);
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - safeValue / 100);
  const accessibleLabel = label ?? `完成 ${Math.round(safeValue)}%`;

  return (
    <div
      {...props}
      className={classes("sx-progress-ring", `sx-progress-ring--${tone}`, className)}
      style={{ ...style, width: size, height: size } as CSSProperties}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safeValue)}
      aria-label={accessibleLabel}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="sx-progress-ring__track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} />
        <circle
          className="sx-progress-ring__value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      {showValue ? <span className="sx-progress-ring__label">{Math.round(safeValue)}<small>%</small></span> : null}
    </div>
  );
}

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({
  icon = <FolderOpen size={28} weight="duotone" />,
  title,
  description,
  action,
  compact = false,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div {...props} className={classes("sx-empty", compact && "sx-empty--compact", className)}>
      <div className="sx-empty__sigil" aria-hidden="true">
        <span className="sx-empty__orbit" />
        {icon}
      </div>
      <h3 className="sx-empty__title">{title}</h3>
      {description ? <p className="sx-empty__description">{description}</p> : null}
      {action ? <div className="sx-empty__action">{action}</div> : null}
    </div>
  );
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  closeLabel?: string;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  closeLabel = "关闭弹窗",
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!dialog.open) {
        if (typeof dialog.showModal === "function") {
          dialog.showModal();
        } else {
          dialog.setAttribute("open", "");
        }
      }
      return;
    }

    if (dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    returnFocusRef.current?.focus({ preventScroll: true });
    returnFocusRef.current = null;
  }, [open]);

  useEffect(
    () => () => {
      const dialog = dialogRef.current;
      if (dialog?.open && typeof dialog.close === "function") dialog.close();
    },
    [],
  );

  return (
    <dialog
      ref={dialogRef}
      className={classes("sx-modal", `sx-modal--${size}`, className)}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sx-modal__surface">
        <div className="sx-modal__header">
          <div className="sx-modal__heading">
            <span className="sx-modal__kicker"><Sparkle size={13} weight="fill" /> 星核指令</span>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <Button variant="ghost" size="icon" aria-label={closeLabel} onClick={onClose}>
            <X size={19} weight="bold" />
          </Button>
        </div>
        {children ? <div className="sx-modal__content">{children}</div> : null}
        {footer ? <div className="sx-modal__footer">{footer}</div> : null}
        <span className="sx-modal__corner sx-modal__corner--tl" aria-hidden="true" />
        <span className="sx-modal__corner sx-modal__corner--br" aria-hidden="true" />
      </div>
    </dialog>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: "primary" | "danger";
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel = "确认",
  cancelLabel = "取消",
  confirmTone = "primary",
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setError("");
    }
  }, [open]);

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作未完成，请稍后重试。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
          <Button
            variant={confirmTone}
            onClick={handleConfirm}
            loading={busy}
            loadingLabel="正在确认"
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {error ? (
        <div className="sx-confirm__error" role="alert">
          <WarningCircle size={17} weight="fill" aria-hidden="true" />
          {error}
        </div>
      ) : null}
    </Modal>
  );
}

export type ToastTone = "success" | "danger" | "error" | "warning" | "info";

export interface ToastMessage {
  id: string;
  title: ReactNode;
  message?: ReactNode;
  tone?: ToastTone;
  duration?: number;
  action?: ReactNode;
}

export interface ToastRegionProps {
  toasts: ToastMessage[];
  onDismiss?: (id: string) => void;
  label?: string;
}

const toastIcons = {
  success: CheckCircle,
  danger: XCircle,
  error: XCircle,
  warning: WarningCircle,
  info: Info,
};

function ToastCard({ toast, onDismiss }: { toast: ToastMessage; onDismiss?: (id: string) => void }) {
  const tone = toast.tone ?? "info";
  const Icon = toastIcons[tone];

  useEffect(() => {
    if (!onDismiss || toast.duration === 0) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.duration ?? 4800);
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast.duration, toast.id]);

  return (
    <article className={classes("sx-toast", `sx-toast--${tone}`)}>
      <div className="sx-toast__icon" aria-hidden="true"><Icon size={20} weight="fill" /></div>
      <div className="sx-toast__copy">
        <h3>{toast.title}</h3>
        {toast.message ? <p>{toast.message}</p> : null}
        {toast.action ? <div className="sx-toast__action">{toast.action}</div> : null}
      </div>
      {onDismiss ? (
        <button className="sx-toast__close" type="button" aria-label="关闭通知" onClick={() => onDismiss(toast.id)}>
          <X size={16} weight="bold" />
        </button>
      ) : null}
    </article>
  );
}

export function ToastRegion({ toasts, onDismiss, label = "系统通知" }: ToastRegionProps) {
  return (
    <div className="sx-toast-region" aria-label={label} aria-live="polite" aria-relevant="additions removals">
      {toasts.map((toast) => <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />)}
    </div>
  );
}

export function ActionLink({ children = "查看详情", ...props }: ButtonProps) {
  return (
    <Button variant="ghost" size="sm" trailingIcon={<ArrowRight size={14} weight="bold" />} {...props}>
      {children}
    </Button>
  );
}
