import {
  ArrowRight,
  CheckCircle,
  Eye,
  EyeSlash,
  Key,
  LockKey,
  Phone,
  ShieldCheck,
  Ticket,
  User,
  WarningCircle,
} from "@phosphor-icons/react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import arcaneValley from "../assets/arcane-valley.avif";
import { ArcaneCorners, LeftHUD, RightHUD } from "../components/arcane/ArcaneHUD";
import { ArcaneFrame, AccessSigil } from "../components/arcane/ArcaneFrame";
import { ArcanePortal } from "../components/arcane/ArcanePortal";
import { ParticleField } from "../components/arcane/ParticleField";
import { motionConfig, motionEase } from "../config/motionConfig";
import "../styles/auth.css";

gsap.registerPlugin(useGSAP);

type AuthMode = "login" | "register" | "forgot";
type RequestState = "idle" | "loading" | "success" | "error";

type AuthResult = {
  ok: boolean;
  message?: string;
  role?: "user" | "agent" | "admin";
};

type RegisterResult = {
  ok: boolean;
  message: string;
};

export type AuthPageProps = {
  onAuthenticate(username: string, password: string): Promise<AuthResult>;
  adminPortalUrl?: string | null;
  runtimeLabel?: string;
  onRegister?(payload: {
    username: string;
    password: string;
    inviteCode: string;
  }): Promise<RegisterResult>;
  onResetPassword?(payload: {
    phone: string;
    code: string;
    password: string;
  }): Promise<RegisterResult>;
  onRequestResetCode?(phone: string): Promise<{
    ok: boolean;
    message: string;
    demoCode?: string;
  }>;
};

type HudFieldProps = {
  label: string;
  icon: ReactNode;
  trailing?: ReactNode;
  hint?: string;
} & ComponentPropsWithoutRef<"input">;

function HudField({ label, icon, trailing, hint, className = "", ...inputProps }: HudFieldProps) {
  return (
    <label className={`hud-field ${className}`}>
      <span className="hud-field__label">{label}</span>
      <span className="hud-field__control">
        <span className="hud-field__icon" aria-hidden="true">{icon}</span>
        <input {...inputProps} />
        {trailing}
        <span className="hud-field__scan" aria-hidden="true" />
        <span className="hud-field__nodes" aria-hidden="true" />
      </span>
      {hint ? <span className="hud-field__hint">{hint}</span> : null}
    </label>
  );
}

const modeCopy: Record<AuthMode, { title: string; subtitle: string; submit: string; loading: string }> = {
  login: {
    title: "唤醒创作中枢",
    subtitle: "验证身份后进入批量视频生产矩阵",
    submit: "进入星核影枢",
    loading: "正在校验访问权限",
  },
  register: {
    title: "创建访问身份",
    subtitle: "使用有效邀请码开启专属创作空间",
    submit: "验证邀请码并创建账户",
    loading: "正在写入身份矩阵",
  },
  forgot: {
    title: "重置访问密钥",
    subtitle: "通过绑定手机完成安全校验",
    submit: "更新访问密钥",
    loading: "正在验证安全信号",
  },
};

function validate(mode: AuthMode, values: {
  username: string;
  password: string;
  inviteCode: string;
  phone: string;
  code: string;
}) {
  if (mode === "login") {
    if (!values.username.trim()) return "请输入登录账号。";
    if (!values.password) return "请输入登录密码。";
    return null;
  }

  if (mode === "register") {
    if (values.username.trim().length < 3) return "账号至少需要 3 个字符。";
    if (values.password.length < 6) return "密码至少需要 6 位。";
    if (!values.inviteCode.trim()) return "请输入有效邀请码。";
    return null;
  }

  if (!/^1[3-9]\d{9}$/.test(values.phone.trim())) return "请输入有效的 11 位绑定手机号。";
  if (!/^\d{6}$/.test(values.code.trim())) return "短信验证码必须为 6 位数字。";
  if (values.password.length < 6) return "新密码至少需要 6 位。";
  return null;
}

export default function AuthPage({
  onAuthenticate,
  adminPortalUrl,
  runtimeLabel = "认证状态将在登录时校验",
  onRegister,
  onResetPassword,
  onRequestResetCode,
}: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [notice, setNotice] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [codeRequestState, setCodeRequestState] = useState<RequestState>("idle");
  const [codeNotice, setCodeNotice] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [values, setValues] = useState({
    username: "",
    password: "",
    inviteCode: "",
    phone: "",
    code: "",
  });

  const rootRef = useRef<HTMLElement>(null);
  const backgroundRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const leftHudRef = useRef<HTMLDivElement>(null);
  const rightHudRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mouseGlowRef = useRef<HTMLDivElement>(null);
  const formBodyRef = useRef<HTMLDivElement>(null);
  const rippleRef = useRef<HTMLSpanElement>(null);
  const transitionTimerRef = useRef<number | undefined>(undefined);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    };
  }, []);

  useGSAP(
    (_context, contextSafe) => {
      const root = rootRef.current;
      const background = backgroundRef.current;
      const portal = portalRef.current;
      const leftHud = leftHudRef.current;
      const rightHud = rightHudRef.current;
      const panel = panelRef.current;
      const mouseGlow = mouseGlowRef.current;
      if (!root || !background || !portal || !leftHud || !rightHud || !panel || !mouseGlow || !contextSafe) return undefined;

      const media = gsap.matchMedia();

      media.add(
        {
          isDesktop: "(min-width: 860px) and (pointer: fine)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (mediaContext) => {
          const { isDesktop, reduceMotion } = mediaContext.conditions as {
            isDesktop: boolean;
            reduceMotion: boolean;
          };

          gsap.set(panel, { transformPerspective: 1200, transformOrigin: "50% 50%" });
          gsap.set(mouseGlow, {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            xPercent: -82,
            yPercent: -50,
            transformOrigin: "82% 50%",
          });

          if (reduceMotion) {
            gsap.from(root, { autoAlpha: 0, duration: 0.18, ease: "power1.out" });
          } else {
            gsap
              .timeline({ defaults: { ease: motionEase.enter } })
              .from(background, { autoAlpha: 0, duration: motionConfig.entrance.background })
              .from(
                portal,
                {
                  autoAlpha: 0,
                  scaleX: 0.9,
                  scaleY: 0.9,
                  duration: motionConfig.entrance.portal,
                },
                0.22,
              )
              .from(
                [leftHud, rightHud],
                {
                  autoAlpha: 0,
                  y: 10,
                  duration: motionConfig.entrance.hud,
                  stagger: motionConfig.entrance.stagger,
                },
                0.52,
              )
              .from(
                panel,
                {
                  autoAlpha: 0,
                  y: 20,
                  scaleX: 0.96,
                  scaleY: 0.96,
                  duration: motionConfig.entrance.panel,
                },
                0.72,
              )
              .from(".star-particles", { autoAlpha: 0, duration: 0.52 }, 0.92);
          }

          if (!isDesktop || reduceMotion) return undefined;

          const makeQuickTo = (target: gsap.TweenTarget, property: string, duration = 0.62) =>
            gsap.quickTo(target, property, {
              duration,
              ease: motionEase.settle,
              overwrite: "auto",
            });

          const backgroundX = makeQuickTo(background, "x");
          const backgroundY = makeQuickTo(background, "y");
          const portalX = makeQuickTo(portal, "x");
          const portalY = makeQuickTo(portal, "y");
          const leftX = makeQuickTo(leftHud, "x");
          const leftY = makeQuickTo(leftHud, "y");
          const rightX = makeQuickTo(rightHud, "x");
          const rightY = makeQuickTo(rightHud, "y");
          const panelX = makeQuickTo(panel, "x", motionConfig.pointer.settleDuration);
          const panelY = makeQuickTo(panel, "y", motionConfig.pointer.settleDuration);
          const panelRotateX = makeQuickTo(panel, "rotationX", motionConfig.pointer.settleDuration);
          const panelRotateY = makeQuickTo(panel, "rotationY", motionConfig.pointer.settleDuration);
          const glowX = makeQuickTo(mouseGlow, "x", 0.12);
          const glowY = makeQuickTo(mouseGlow, "y", 0.12);
          const glowScaleX = makeQuickTo(mouseGlow, "scaleX", 0.22);
          const glowScaleY = makeQuickTo(mouseGlow, "scaleY", 0.22);
          const glowOpacity = makeQuickTo(mouseGlow, "opacity", 0.22);
          const glowRotation = makeQuickTo(mouseGlow, "rotation", 0.12);
          let previousGlowPointer = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            time: performance.now(),
          };

          const onPointerMove = contextSafe((event: PointerEvent) => {
            const bounds = root.getBoundingClientRect();
            const normalizedX = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2));
            const normalizedY = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2));

            backgroundX(normalizedX * motionConfig.pointer.backgroundTravel);
            backgroundY(normalizedY * motionConfig.pointer.backgroundTravel * 0.7);
            portalX(-normalizedX * motionConfig.pointer.portalTravel);
            portalY(-normalizedY * motionConfig.pointer.portalTravel * 0.72);
            leftX(normalizedX * motionConfig.pointer.hudTravel);
            leftY(normalizedY * motionConfig.pointer.hudTravel * 0.68);
            rightX(normalizedX * motionConfig.pointer.hudTravel * 0.86);
            rightY(normalizedY * motionConfig.pointer.hudTravel * 0.58);
            panelX(normalizedX * motionConfig.pointer.panelTravel);
            panelY(normalizedY * motionConfig.pointer.panelTravel * 0.6);
            panelRotateX(-normalizedY * motionConfig.pointer.panelTiltX);
            panelRotateY(normalizedX * motionConfig.pointer.panelTiltY);
            glowX(event.clientX);
            glowY(event.clientY);

            const target = event.target instanceof Element ? event.target : null;
            const isInteractive = Boolean(target?.closest("button, input, summary, a"));
            const now = performance.now();
            const deltaX = event.clientX - previousGlowPointer.x;
            const deltaY = event.clientY - previousGlowPointer.y;
            const elapsed = Math.max(8, now - previousGlowPointer.time);
            const speed = Math.max(0, Math.min(1, Math.hypot(deltaX, deltaY) / elapsed / 1.5));
            if (Math.abs(deltaX) + Math.abs(deltaY) > 0.5) {
              glowRotation(Math.atan2(deltaY, deltaX) * (180 / Math.PI));
            }
            glowScaleX(isInteractive ? 0.48 : 0.58 + speed * 0.48);
            glowScaleY(isInteractive ? 0.68 : 0.78 + speed * 0.18);
            glowOpacity(isInteractive ? 0.34 : 0.56 + speed * 0.22);
            previousGlowPointer = { x: event.clientX, y: event.clientY, time: now };
          });

          const onPointerLeave = contextSafe(() => {
            backgroundX(0);
            backgroundY(0);
            portalX(0);
            portalY(0);
            leftX(0);
            leftY(0);
            rightX(0);
            rightY(0);
            panelX(0);
            panelY(0);
            panelRotateX(0);
            panelRotateY(0);
            glowScaleX(0.5);
            glowScaleY(0.72);
            glowOpacity(0);
            previousGlowPointer = {
              x: window.innerWidth / 2,
              y: window.innerHeight / 2,
              time: performance.now(),
            };
          });

          const onWheel = contextSafe((event: WheelEvent) => {
            const direction = event.deltaY >= 0 ? 1 : -1;
            gsap.killTweensOf(portal, "rotation");
            gsap
              .timeline({ defaults: { overwrite: "auto" } })
              .to(portal, {
                rotation: direction * motionConfig.wheel.portalRotation,
                duration: 0.18,
                ease: "power2.out",
              })
              .to(portal, {
                rotation: 0,
                duration: motionConfig.wheel.impulseDuration,
                ease: "elastic.out(1, 0.55)",
              });
          });

          root.addEventListener("pointermove", onPointerMove, { passive: true });
          root.addEventListener("pointerleave", onPointerLeave);
          window.addEventListener("wheel", onWheel, { passive: true });

          return () => {
            root.removeEventListener("pointermove", onPointerMove);
            root.removeEventListener("pointerleave", onPointerLeave);
            window.removeEventListener("wheel", onWheel);
          };
        },
        root,
      );

      return () => media.revert();
    },
    { scope: rootRef },
  );

  useGSAP(
    () => {
      const body = formBodyRef.current;
      if (!body || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.fromTo(
        body,
        { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.3, ease: motionEase.enter, clearProps: "transform,opacity,visibility" },
      );
    },
    { dependencies: [mode], scope: formBodyRef, revertOnUpdate: true },
  );

  const changeMode = (nextMode: AuthMode) => {
    if (requestState === "loading") return;
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    setMode(nextMode);
    setRequestState("idle");
    setNotice("");
    setShowPassword(false);
    setCodeRequestState("idle");
    setCodeNotice("");
    setDemoCode("");
    setValues((current) => ({
      ...current,
      password: "",
      inviteCode: nextMode === "register" ? current.inviteCode : "",
      phone: nextMode === "forgot" ? current.phone : "",
      code: nextMode === "forgot" ? current.code : "",
    }));
  };

  const updateValue = (field: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (field === "phone" && codeRequestState !== "loading") {
      setCodeRequestState("idle");
      setCodeNotice("");
      setDemoCode("");
    }
    if (requestState === "error") {
      setRequestState("idle");
      setNotice("");
    }
  };

  const fillDemo = () => {
    setValues((current) => ({ ...current, username: "creator", password: "123456" }));
    setNotice("创作端引导凭据已载入。");
    setRequestState("idle");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (requestState === "loading") return;

    const validationMessage = validate(mode, values);
    if (validationMessage) {
      setRequestState("error");
      setNotice(validationMessage);
      return;
    }

    setRequestState("loading");
    setNotice("");

    try {
      let result: AuthResult | RegisterResult;

      if (mode === "login") {
        result = await onAuthenticate(values.username.trim(), values.password);
      } else if (mode === "register") {
        if (!onRegister) throw new Error("注册服务尚未接入，请联系系统管理员。 ");
        result = await onRegister({
          username: values.username.trim(),
          password: values.password,
          inviteCode: values.inviteCode.trim(),
        });
      } else {
        if (!onResetPassword) throw new Error("密码找回服务尚未接入，请联系系统管理员。");
        result = await onResetPassword({
          phone: values.phone.trim(),
          code: values.code.trim(),
          password: values.password,
        });
      }

      if (!mountedRef.current) return;

      if (!result.ok) {
        setRequestState("error");
        setNotice(result.message || "验证未通过，请核对信息后重试。");
        return;
      }

      setRequestState("success");
      setNotice(
        result.message ||
          (mode === "login" ? "身份验证通过，正在开启创作中枢。" : mode === "register" ? "身份创建成功，请登录。" : "访问密钥已更新，请重新登录。"),
      );

      if (mode !== "login") {
        const completedMode = mode;
        transitionTimerRef.current = window.setTimeout(() => {
          if (!mountedRef.current) return;
          setMode("login");
          setRequestState("idle");
          setNotice("");
          setShowPassword(false);
          setValues((current) => ({
            ...current,
            username: completedMode === "register" ? current.username : "",
            password: "",
            inviteCode: "",
            phone: "",
            code: "",
          }));
        }, 1050);
      }
    } catch (error) {
      if (!mountedRef.current) return;
      setRequestState("error");
      setNotice(error instanceof Error ? error.message.trim() : "连接认证服务失败，请稍后重试。");
    }
  };

  const handleRequestResetCode = async () => {
    if (codeRequestState === "loading" || requestState === "loading") return;

    const phone = values.phone.trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setCodeRequestState("error");
      setCodeNotice("请先输入有效的 11 位绑定手机号。");
      setDemoCode("");
      return;
    }

    if (!onRequestResetCode) {
      setCodeRequestState("error");
      setCodeNotice("当前认证服务尚未接入短信验证码。");
      setDemoCode("");
      return;
    }

    setCodeRequestState("loading");
    setCodeNotice("正在请求验证码服务…");
    setDemoCode("");

    try {
      const result = await onRequestResetCode(phone);
      if (!mountedRef.current) return;

      if (!result.ok) {
        setCodeRequestState("error");
        setCodeNotice(result.message);
        return;
      }

      setCodeRequestState("success");
      setCodeNotice(result.demoCode ? `${result.message} · 本地演示，未发送真实短信` : result.message);
      setDemoCode(result.demoCode || "");
    } catch (error) {
      if (!mountedRef.current) return;
      setCodeRequestState("error");
      setCodeNotice(error instanceof Error ? error.message : "验证码请求失败");
    }
  };

  const createRipple = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const ripple = rippleRef.current;
    if (!ripple || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    ripple.style.left = `${event.clientX - rect.left}px`;
    ripple.style.top = `${event.clientY - rect.top}px`;
    ripple.getAnimations().forEach((animation) => animation.cancel());
    ripple.animate(
      [
        { transform: "translate(-50%, -50%) scale(0.18)", opacity: 0.68 },
        { transform: "translate(-50%, -50%) scale(2.6)", opacity: 0 },
      ],
      { duration: 520, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
  };

  const passwordToggle = (
    <button
      className="hud-field__action"
      type="button"
      onClick={() => setShowPassword((visible) => !visible)}
      aria-label={showPassword ? "隐藏密码" : "显示密码"}
      aria-pressed={showPassword}
    >
      {showPassword ? <EyeSlash size={19} weight="duotone" /> : <Eye size={19} weight="duotone" />}
    </button>
  );

  const visualState: RequestState = requestState;
  const isLoading = requestState === "loading";
  const copy = modeCopy[mode];

  return (
    <main
      ref={rootRef}
      className="auth-stage"
      data-state={visualState}
      style={{ "--arcane-environment": `url(${arcaneValley})` } as CSSProperties}
    >
      <div ref={backgroundRef} className="auth-stage__environment" aria-hidden="true">
        <div className="auth-stage__landscape" />
        <div className="auth-stage__fog auth-stage__fog--far" />
        <div className="auth-stage__fog auth-stage__fog--near" />
      </div>

      <div ref={portalRef} className="auth-stage__portal" aria-hidden="true">
        <ArcanePortal />
      </div>

      <div ref={leftHudRef} className="auth-stage__hud auth-stage__hud--left" aria-hidden="true">
        <LeftHUD />
      </div>
      <div ref={rightHudRef} className="auth-stage__hud auth-stage__hud--right" aria-hidden="true">
        <RightHUD />
      </div>

      <ParticleField />
      <ArcaneCorners />

      <div className="auth-stage__identity" aria-hidden="true">
        <span>STELLAR VIDEO ORCHESTRATOR</span>
        <i />
        <span>SECURE MEMBER ACCESS</span>
      </div>

      <div className="auth-stage__panel-wrap">
        <ArcaneFrame ref={panelRef} state={visualState}>
          <section className="auth-panel" aria-labelledby="auth-title">
            <header className="auth-panel__header">
              <AccessSigil />
              <div className="auth-panel__brand">
                <span className="auth-panel__brand-cn">星核影枢</span>
                <span className="auth-panel__brand-en">STELLAR VIDEO ORCHESTRATOR</span>
              </div>
              <h1 id="auth-title">{copy.title}</h1>
              <p>{copy.subtitle}</p>
            </header>

            <div ref={formBodyRef} className="auth-panel__form-body">
              <form className="auth-form" onSubmit={handleSubmit} noValidate aria-busy={isLoading}>
                {mode !== "forgot" ? (
                  <HudField
                    label="访问账号"
                    icon={<User size={19} weight="duotone" />}
                    name="username"
                    value={values.username}
                    onChange={(event) => updateValue("username", event.target.value)}
                    autoComplete="username"
                    placeholder="请输入登录账号"
                    spellCheck={false}
                    disabled={isLoading}
                    aria-describedby={notice ? "auth-feedback" : undefined}
                    autoFocus
                    maxLength={50}
                  />
                ) : (
                  <HudField
                    label="绑定手机"
                    icon={<Phone size={19} weight="duotone" />}
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    value={values.phone}
                    onChange={(event) => updateValue("phone", event.target.value.replace(/\D/g, "").slice(0, 11))}
                    autoComplete="tel"
                    placeholder="请输入注册绑定手机号"
                    disabled={isLoading}
                    aria-describedby={notice ? "auth-feedback" : undefined}
                    hint="验证码能力由当前认证服务提供"
                    autoFocus
                  />
                )}

                {mode === "forgot" ? (
                  <>
                    <HudField
                      className="hud-field--with-code"
                      label="短信验证码"
                      icon={<Key size={19} weight="duotone" />}
                      trailing={(
                        <button
                          className="hud-field__code-action"
                          type="button"
                          onClick={handleRequestResetCode}
                          disabled={isLoading || codeRequestState === "loading"}
                          aria-busy={codeRequestState === "loading"}
                        >
                          {codeRequestState === "loading" ? "生成中" : "获取验证码"}
                        </button>
                      )}
                      name="code"
                      inputMode="numeric"
                      value={values.code}
                      onChange={(event) => updateValue("code", event.target.value.replace(/\D/g, "").slice(0, 6))}
                      autoComplete="one-time-code"
                      placeholder="6 位验证码"
                      disabled={isLoading}
                      aria-describedby={codeNotice ? "reset-code-feedback" : notice ? "auth-feedback" : undefined}
                      maxLength={6}
                    />
                    {codeNotice ? (
                      <div
                        id="reset-code-feedback"
                        className="reset-code-feedback"
                        data-variant={codeRequestState === "error" ? "error" : codeRequestState === "success" ? "success" : "info"}
                        role={codeRequestState === "error" ? "alert" : "status"}
                        aria-live="polite"
                      >
                        <ShieldCheck size={16} weight="duotone" aria-hidden="true" />
                        <span>{codeNotice}</span>
                        {demoCode ? <code>演示验证码：{demoCode}</code> : null}
                      </div>
                    ) : null}
                  </>
                ) : null}

                <HudField
                  label={mode === "forgot" ? "新访问密钥" : "访问密钥"}
                  icon={<LockKey size={19} weight="duotone" />}
                  trailing={passwordToggle}
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={values.password}
                  onChange={(event) => updateValue("password", event.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder={mode === "forgot" ? "设置至少 6 位新密码" : "请输入登录密码"}
                  disabled={isLoading}
                  aria-describedby={notice ? "auth-feedback" : undefined}
                  maxLength={72}
                />

                {mode === "register" ? (
                  <HudField
                    label="邀请凭证"
                    icon={<Ticket size={19} weight="duotone" />}
                    name="inviteCode"
                    value={values.inviteCode}
                    onChange={(event) => updateValue("inviteCode", event.target.value.toUpperCase())}
                    autoComplete="off"
                    placeholder="请输入有效邀请码"
                    spellCheck={false}
                    disabled={isLoading}
                    aria-describedby={notice ? "auth-feedback" : undefined}
                    hint="平台仅开放邀请制注册"
                    maxLength={20}
                  />
                ) : null}

                {notice ? (
                  <div
                    id="auth-feedback"
                    className="auth-notice"
                    data-variant={requestState === "error" ? "error" : requestState === "success" ? "success" : "info"}
                    role={requestState === "error" ? "alert" : "status"}
                    aria-live="polite"
                  >
                    {requestState === "error" ? (
                      <WarningCircle size={18} weight="fill" aria-hidden="true" />
                    ) : requestState === "success" ? (
                      <CheckCircle size={18} weight="fill" aria-hidden="true" />
                    ) : (
                      <ShieldCheck size={18} weight="duotone" aria-hidden="true" />
                    )}
                    <span>{notice}</span>
                  </div>
                ) : null}

                <button
                  className="energy-submit"
                  type="submit"
                  disabled={isLoading}
                  aria-busy={isLoading}
                  onPointerDown={createRipple}
                >
                  <span ref={rippleRef} className="energy-submit__ripple" aria-hidden="true" />
                  <span className="energy-submit__edge energy-submit__edge--left" aria-hidden="true" />
                  <span className="energy-submit__edge energy-submit__edge--right" aria-hidden="true" />
                  {isLoading ? (
                    <span className="energy-submit__loading" aria-hidden="true">
                      <i /><i /><i />
                    </span>
                  ) : requestState === "success" ? (
                    <CheckCircle size={20} weight="fill" aria-hidden="true" />
                  ) : (
                    <span className="energy-submit__sigil" aria-hidden="true" />
                  )}
                  <span>{isLoading ? copy.loading : requestState === "success" ? "权限已确认" : copy.submit}</span>
                  {!isLoading && requestState !== "success" ? <ArrowRight size={17} weight="bold" aria-hidden="true" /> : null}
                </button>

                <div className="auth-form__utilities">
                  {mode === "login" ? (
                    <>
                      <button type="button" onClick={() => changeMode("register")}>邀请码注册</button>
                      <span aria-hidden="true" />
                      <button type="button" onClick={() => changeMode("forgot")}>忘记密码</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => changeMode("login")}>返回账号登录</button>
                  )}
                </div>

                {mode === "login" ? (
                  <details className="demo-credentials">
                    <summary>
                      <ShieldCheck size={16} weight="duotone" aria-hidden="true" />
                      <span>演示通行凭据</span>
                    </summary>
                    <div className="demo-credentials__list">
                      <button type="button" onClick={fillDemo}>
                        <span>创作端</span>
                        <code>creator / 123456</code>
                      </button>
                    </div>
                  </details>
                ) : null}

                {mode === "login" && adminPortalUrl ? (
                  <a className="auth-admin-portal" href={adminPortalUrl}>
                    <ShieldCheck size={16} weight="duotone" aria-hidden="true" />
                    <span>前往独立超级管理端</span>
                    <ArrowRight size={15} weight="bold" aria-hidden="true" />
                  </a>
                ) : null}
              </form>
            </div>

            <footer className="auth-panel__footer">
              <span className="auth-panel__status-dot" aria-hidden="true" />
              <span>AI 短视频生产中枢</span>
              <span aria-hidden="true">·</span>
              <span>{runtimeLabel}</span>
            </footer>
          </section>
        </ArcaneFrame>
      </div>

      <div ref={mouseGlowRef} className="auth-stage__mouse-glow" aria-hidden="true">
        <span className="auth-stage__mouse-fracture" />
        <span className="auth-stage__mouse-blade" />
        <span className="auth-stage__mouse-core" />
      </div>
      <div className="auth-stage__scanlines" aria-hidden="true" />
      <div className="auth-stage__vignette" aria-hidden="true" />
    </main>
  );
}
