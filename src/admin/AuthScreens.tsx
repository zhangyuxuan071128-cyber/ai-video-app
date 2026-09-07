import { Eye, EyeSlash, Key, LockKey, ShieldCheck, SignIn, Warning } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import type { AdminIdentity } from "./types";
import { Button, Field, IconButton } from "./ui";

function AuthAtmosphere() {
  return <div className="sa-auth__atmosphere" aria-hidden="true"><div className="sa-auth__stars" /><div className="sa-auth__portal"><span /><span /><span /><i /></div><div className="sa-auth__axis" /><div className="sa-auth__runes">CONTROL · VERIFY · AUDIT · GOVERN · CONTROL · VERIFY · AUDIT</div></div>;
}

function AuthBrand({ mode }: { mode: "login" | "rotate" }) {
  return <header className="sa-auth__brand"><span className="sa-auth__sigil" aria-hidden="true"><ShieldCheck weight="duotone" /></span><div><span>星核影枢</span><small>STELLAR CONTROL PLANE</small></div><p>{mode === "login" ? "超级管理员独立入口" : "首次访问安全校准"}</p></header>;
}

function getTransportStatus() {
  if (typeof window === "undefined") return { label: "传输状态等待校验", state: "unknown" };
  if (window.isSecureContext && window.location.protocol === "https:") {
    return { label: "HTTPS 安全上下文已验证", state: "secure" };
  }
  if (["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
    return { label: "本地预览 · HTTP", state: "local" };
  }
  return { label: "传输安全未验证", state: "warning" };
}

export function AdminLogin({
  initialMessage,
  onLogin,
}: {
  initialMessage?: string;
  onLogin: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialMessage ?? "");
  const transportStatus = getTransportStatus();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) { setError("请输入管理员账号和密码。"); return; }
    setBusy(true);
    setError("");
    try { await onLogin(username.trim(), password); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "身份验证失败。"); }
    finally { setBusy(false); }
  };

  return <main className="sa-auth">
    <AuthAtmosphere />
    <section className="sa-auth__frame" aria-labelledby="sa-login-title">
      <AuthBrand mode="login" />
      <div className="sa-auth__heading"><h1 id="sa-login-title">验证治理身份</h1><p>此入口仅接受超级管理员账号，普通会员不会被降级导入。</p></div>
      <form className="sa-auth__form" onSubmit={submit} noValidate>
        <Field label="管理员账号"><div className="sa-auth__control"><SignIn /><input autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="输入超级管理员账号" /></div></Field>
        <Field label="访问密码"><div className="sa-auth__control"><LockKey /><input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="输入密码" /><IconButton label={showPassword ? "隐藏密码" : "显示密码"} icon={showPassword ? <EyeSlash /> : <Eye />} onClick={() => setShowPassword((value) => !value)} /></div></Field>
        {error ? <div className="sa-auth__error" role="alert"><Warning weight="fill" /><span>{error}</span></div> : null}
        <Button className="sa-auth__submit" tone="primary" type="submit" icon={<ShieldCheck />} busy={busy}>进入治理中枢</Button>
      </form>
      <footer className="sa-auth__footer"><span data-state={transportStatus.state}><i />{transportStatus.label}</span><span>接口前缀 /api/control/v1</span></footer>
    </section>
  </main>;
}

export function RotatePassword({
  identity,
  onRotate,
}: {
  identity: AdminIdentity;
  onRotate: (currentPassword: string, newPassword: string) => Promise<void>;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) { setError("请完整填写三个密码字段。"); return; }
    if (newPassword.length < 12 || !/[a-z]/i.test(newPassword) || !/\d/.test(newPassword)) { setError("新密码至少 12 位，并包含字母和数字。"); return; }
    if (newPassword !== confirmPassword) { setError("两次输入的新密码不一致。"); return; }
    if (newPassword === currentPassword) { setError("新密码不能与当前密码相同。"); return; }
    setBusy(true); setError("");
    try { await onRotate(currentPassword, newPassword); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "密码轮换失败。"); }
    finally { setBusy(false); }
  };

  return <main className="sa-auth">
    <AuthAtmosphere />
    <section className="sa-auth__frame sa-auth__frame--rotate" aria-labelledby="sa-rotate-title">
      <AuthBrand mode="rotate" />
      <div className="sa-auth__heading"><h1 id="sa-rotate-title">必须轮换初始密码</h1><p>{identity.displayName}，完成轮换前不会加载任何治理数据。</p></div>
      <form className="sa-auth__form" onSubmit={submit}>
        <Field label="当前密码"><div className="sa-auth__control"><LockKey /><input autoFocus type={showPassword ? "text" : "password"} autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></div></Field>
        <Field label="新密码" hint="至少 12 位，包含字母和数字。"><div className="sa-auth__control"><Key /><input type={showPassword ? "text" : "password"} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><IconButton label={showPassword ? "隐藏密码" : "显示密码"} icon={showPassword ? <EyeSlash /> : <Eye />} onClick={() => setShowPassword((value) => !value)} /></div></Field>
        <Field label="确认新密码"><div className="sa-auth__control"><Key /><input type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div></Field>
        {error ? <div className="sa-auth__error" role="alert"><Warning weight="fill" /><span>{error}</span></div> : null}
        <Button className="sa-auth__submit" tone="primary" type="submit" icon={<ShieldCheck />} busy={busy}>轮换并继续</Button>
      </form>
      <footer className="sa-auth__footer"><span><i />ACCESS BLOCKED UNTIL ROTATION</span><span>轮换成功将写入审计</span></footer>
    </section>
  </main>;
}
