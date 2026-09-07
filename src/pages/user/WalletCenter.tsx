import {
  ArrowRight,
  CheckCircle,
  Coins,
  Copy,
  CreditCard,
  Key,
  LockSimple,
  Receipt,
  Sparkle,
  Wallet,
} from "@phosphor-icons/react";
import { useMemo, useState, type FormEvent } from "react";
import { useAppStore } from "../../state/AppStore";
import {
  ActionButton,
  EmptyState,
  Metric,
  PageHeader,
  Panel,
  SignalBanner,
  StateChip,
  copyText,
  formatFullDate,
  type Notify,
} from "./ui";

export function WalletCenter({ onNavigate, notify }: { onNavigate: (view: string) => void; notify: Notify }) {
  const { state, currentUser, availablePaidCredits, reservedPaidCredits, redeemRechargeCode } = useAppStore();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const userRechargeLogs = useMemo(
    () => state.rechargeLogs.filter((log) => log.userId === currentUser?.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [currentUser?.id, state.rechargeLogs],
  );
  const usageLogs = useMemo(
    () => state.usageLogs.filter((log) => log.userId === currentUser?.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [currentUser?.id, state.usageLogs],
  );
  const isManaged = currentUser?.authKind === "server";
  const activeDemoCode = isManaged ? undefined : state.rechargeCodes.find((item) => item.status === "active" && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now()));
  const freeCredits = Object.values(currentUser?.freeCredits ?? {}).reduce((sum, value) => sum + value, 0);

  const redeem = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim()) {
      setError("请输入充值码。");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    await new Promise<void>((resolve) => window.setTimeout(resolve, 240));
    const result = await redeemRechargeCode(code);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      notify("error", result.message);
      return;
    }
    setSuccess(`${result.message}，当前余额 ${result.data?.balance ?? currentUser?.paidCredits ?? 0} 次。`);
    setCode("");
    notify("success", result.message);
  };

  const copyDemoCode = async () => {
    if (!activeDemoCode) return;
    const copied = await copyText(activeDemoCode.code);
    if (copied) notify("success", "演示充值码已复制。");
    else {
      setCode(activeDemoCode.code);
      notify("info", "无法访问剪贴板，已为你填入演示充值码。");
    }
  };

  return (
    <div className="uw-page uw-wallet">
      <PageHeader
        title="额度钱包"
        description="查看共享额度、任务预留、充值码记录与使用流水。"
        aside={<StateChip label="充值码模式" tone="accent" />}
      />

      <SignalBanner tone="info" title={isManaged ? "充值码由超级管理端签发" : "当前未接入真实支付"}>
        {isManaged ? "兑换会在共享控制面原子核销并写入额度账本；当前未接入在线支付，购买入口不会扣款或生成订单。" : "套餐价格与充值码均为本地产品演示数据。「购买」入口已禁用，不会发起支付、扣款或生成真实订单。"}
      </SignalBanner>

      <section className="uw-wallet-ledger" aria-label="额度摘要">
        <div className="uw-wallet-ledger__core"><span><Wallet weight="duotone" /></span><small>共享创作额度</small><strong>{currentUser?.paidCredits ?? 0}</strong><p>{availablePaidCredits} 可用 · {reservedPaidCredits} 任务预留</p></div>
        <Metric label="平台赠送额度" value={freeCredits} note="测试连接时优先使用" icon={<Sparkle weight="duotone" />} />
        <Metric label="累计充值次数" value={userRechargeLogs.length} note={`${userRechargeLogs.reduce((sum, item) => sum + item.credits, 0)} 次额度已到账`} icon={<CreditCard weight="duotone" />} />
        <Metric label="记录内已消耗" value={usageLogs.reduce((sum, item) => sum + item.creditsUsed, 0)} note={`${usageLogs.length} 条使用流水`} icon={<Receipt weight="duotone" />} />
      </section>

      <div className="uw-wallet-grid">
        <Panel title="充值码兑换" description="一个充值码仅能成功使用一次">
          <form className="uw-redeem-form" onSubmit={redeem} noValidate>
            <label><span className="uw-sr-only">充值码</span><Key aria-hidden="true" /><input value={code} onChange={(event) => { setCode(event.target.value.toUpperCase()); setError(""); setSuccess(""); }} placeholder="输入充值码" autoCapitalize="characters" autoComplete="off" /></label>
            <ActionButton tone="primary" type="submit" busy={busy} icon={<CheckCircle />}>验证并兑换</ActionButton>
          </form>
          {error ? <SignalBanner tone="error" title="兑换未完成">{error}</SignalBanner> : null}
          {success ? <SignalBanner tone="success" title="额度已到账">{success}</SignalBanner> : null}
          {activeDemoCode ? <div className="uw-demo-code"><LockSimple weight="duotone" aria-hidden="true" /><div><strong>可用演示码</strong><code>{activeDemoCode.code}</code><small>仅供当前本地演示，不对应真实付款。</small></div><ActionButton tone="quiet" icon={<Copy />} onClick={copyDemoCode}>复制</ActionButton><ActionButton tone="secondary" onClick={() => setCode(activeDemoCode.code)}>填入</ActionButton></div> : <p className="uw-muted-note">{isManaged ? "请输入超级管理端签发的有效充值码；系统不会在会员页展示或泄露其他卡码。" : "当前没有未使用的演示充值码。"}</p>}
        </Panel>

        <Panel title="计费原则" description="扣额时点与失败保护">
          <div className="uw-billing-rules"><div><span>01</span><strong>服务端核销</strong><p>{isManaged ? "卡码由共享控制面原子核销，浏览器不能直接修改余额。" : "进行中任务只预留额度，不立即扣除。"}</p></div><div><span>02</span><strong>{isManaged ? "执行器闸门" : "完成后扣除"}</strong><p>{isManaged ? "真实任务执行器未接入时，不创建任务也不扣额度。" : "本地演示任务进入完成状态时写入消耗流水。"}</p></div><div><span>03</span><strong>失败不扣额</strong><p>失败、取消或终止的任务释放预留额度。</p></div></div>
          <ActionButton tone="secondary" icon={<ArrowRight />} onClick={() => onNavigate("tasks")}>查看任务明细</ActionButton>
        </Panel>
      </div>

      <section className="uw-package-section" aria-labelledby="package-title">
        <div className="uw-section-heading"><div><h2 id="package-title">{isManaged ? "管理端套餐模板" : "演示套餐模板"}</h2><p>{isManaged ? "来自共享控制面；在线支付未配置，因此仅作额度规则展示。" : "由管理端维护的展示价格，不会发起真实交易。"}</p></div></div>
        <div className="uw-package-grid">
          {state.packageTemplates.filter((item) => item.isActive).map((item) => <article className="uw-package" key={item.id}>
            {item.badge ? <StateChip label={item.badge} tone="accent" /> : <span />}
            <h3>{item.name}</h3><p>{item.subtitle}</p><div className="uw-package__value"><strong>{item.credits}</strong><span>次创作额度</span></div><small>展示价 ¥{item.value}</small>
            <ActionButton tone={item.badge ? "primary" : "secondary"} icon={<CreditCard />} disabled disabledReason="当前未接入真实支付，请使用演示充值码">购买充值码</ActionButton>
          </article>)}
        </div>
      </section>

      <div className="uw-wallet-grid uw-wallet-grid--history">
        <Panel title="充值记录" description={isManaged ? "显示当前会话成功写入共享控制面的兑换回执" : "只显示当前账号的本地充值码流水"}>
          {userRechargeLogs.length ? <div className="uw-ledger-table" role="table" aria-label="充值记录"><div className="uw-ledger-table__head" role="row"><span>时间</span><span>充值码</span><span>展示金额</span><span>到账</span></div>{userRechargeLogs.map((log) => <div role="row" key={log.id}><span>{formatFullDate(log.createdAt)}</span><code>{log.rechargeCode.replace(/^(.{4}).*(.{4})$/, "$1•••$2")}</code><span>¥{log.amount}</span><strong>+{log.credits}</strong></div>)}</div> : <EmptyState icon={CreditCard} title="暂无充值记录" description="成功兑换充值码后，记录会出现在这里。" />}
        </Panel>
        <Panel title="额度使用流水" description="测试连接和完成任务都会写入记录">
          {usageLogs.length ? <div className="uw-usage-list">{usageLogs.slice(0, 8).map((log) => <div key={log.id}><Coins weight="duotone" aria-hidden="true" /><span><strong>{log.description}</strong><small>{formatFullDate(log.createdAt)} · {log.creditType === "self_api" ? "自有 API" : log.creditType === "free" ? "平台赠送" : "共享额度"}</small></span><b>-{log.creditsUsed}</b></div>)}</div> : <EmptyState icon={Receipt} title="暂无使用流水" description="完成任务或消耗一次连接检查后，明细会出现在这里。" />}
        </Panel>
      </div>
    </div>
  );
}
