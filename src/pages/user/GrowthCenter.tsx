import {
  ArrowRight,
  CheckCircle,
  Coins,
  Copy,
  CurrencyCircleDollar,
  PaperPlaneTilt,
  TreeStructure,
  UserPlus,
  UsersThree,
  Wallet,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMemo, useState, type FormEvent } from "react";
import { useAppStore } from "../../state/AppStore";
import type { User, WithdrawalMethod } from "../../types/domain";
import {
  ActionButton,
  EmptyState,
  Field,
  Metric,
  PageHeader,
  Panel,
  SignalBanner,
  StateChip,
  copyText,
  formatFullDate,
  type Notify,
} from "./ui";

type TeamMember = { user: User; level: 1 | 2; joinedAt: string };

export function GrowthCenter({ onNavigate, notify }: { onNavigate: (view: string) => void; notify: Notify }) {
  const { state, currentUser, createInviteCode, exchangeCommissionForCredits, requestWithdrawal } = useAppStore();
  const [maxUses, setMaxUses] = useState(20);
  const [giftCredits, setGiftCredits] = useState(3);
  const [generatedCode, setGeneratedCode] = useState("");
  const [exchangeAmount, setExchangeAmount] = useState(50);
  const [withdrawAmount, setWithdrawAmount] = useState(100);
  const [withdrawMethod, setWithdrawMethod] = useState<WithdrawalMethod>("alipay");
  const [withdrawAccount, setWithdrawAccount] = useState("");
  const [formError, setFormError] = useState("");

  const commission = state.commissionAccounts.find((item) => item.userId === currentUser?.id);
  const transactions = useMemo(
    () => state.commissionTransactions.filter((item) => item.userId === currentUser?.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [currentUser?.id, state.commissionTransactions],
  );
  const withdrawals = useMemo(
    () => state.withdrawalRequests.filter((item) => item.userId === currentUser?.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [currentUser?.id, state.withdrawalRequests],
  );
  const inviteCodes = useMemo(
    () => state.inviteCodes.filter((item) => item.createdBy === currentUser?.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [currentUser?.id, state.inviteCodes],
  );
  const team = useMemo<TeamMember[]>(() => {
    if (!currentUser) return [];
    const directRelations = state.inviteRelations.filter((item) => item.invitedBy === currentUser.id);
    const directIds = new Set(directRelations.map((item) => item.userId));
    const secondRelations = state.inviteRelations.filter((item) => directIds.has(item.invitedBy));
    const direct: TeamMember[] = directRelations.flatMap((relation) => {
      const user = state.users.find((item) => item.id === relation.userId);
      return user ? [{ user, level: 1 as const, joinedAt: relation.createdAt }] : [];
    });
    const second: TeamMember[] = secondRelations.flatMap((relation) => {
      const user = state.users.find((item) => item.id === relation.userId);
      return user ? [{ user, level: 2 as const, joinedAt: relation.createdAt }] : [];
    });
    return [...direct, ...second];
  }, [currentUser, state.inviteRelations, state.users]);

  const createCode = (event: FormEvent) => {
    event.preventDefault();
    const result = createInviteCode(maxUses, giftCredits);
    if (!result.ok || !result.data) {
      notify("error", result.message);
      return;
    }
    setGeneratedCode(result.data);
    notify("success", result.message);
  };

  const copyCode = async (value: string) => {
    const copied = await copyText(value);
    notify(copied ? "success" : "info", copied ? "邀请码已复制。" : `剪贴板不可用，邀请码为 ${value}。`);
  };

  const exchange = (event: FormEvent) => {
    event.preventDefault();
    const result = exchangeCommissionForCredits(exchangeAmount);
    notify(result.ok ? "success" : "error", result.message);
  };

  const withdraw = (event: FormEvent) => {
    event.preventDefault();
    setFormError("");
    const result = requestWithdrawal(withdrawAmount, withdrawMethod, withdrawAccount);
    if (!result.ok) {
      setFormError(result.message);
      notify("error", result.message);
      return;
    }
    setWithdrawAccount("");
    notify("success", result.message);
  };

  return (
    <div className="uw-page uw-growth">
      <PageHeader
        title={currentUser?.role === "agent" ? "代理增长中心" : "邀请与佣金"}
        description="用可追溯的一级、二级关系管理邀请、佣金兑换与人工转账提现。"
        aside={<StateChip label="本地演示账本" tone="accent" />}
      />

      <SignalBanner tone="info" title="佣金与提现均为演示数据">
        页面会真实更新当前浏览器中的佣金账本，但不会触发银行、微信或支付宝转账。提现申请需要管理员在演示管理台人工审核。
      </SignalBanner>

      <section className="uw-growth-metrics" aria-label="佣金摘要">
        <div className="uw-growth-balance"><span><CurrencyCircleDollar weight="duotone" /></span><small>可用佣金</small><strong>¥{(commission?.availableBalance ?? 0).toFixed(2)}</strong><p>待审提现 ¥{(commission?.pendingWithdrawal ?? 0).toFixed(2)}</p></div>
        <Metric label="累计佣金" value={`¥${(commission?.totalEarned ?? 0).toFixed(2)}`} note="来自演示充值关系" icon={<Coins weight="duotone" />} />
        <Metric label="佣金兑换" value={commission?.exchangedCredits ?? 0} note="累计兑换创作额度" icon={<Wallet weight="duotone" />} />
        <Metric label="团队成员" value={team.length} note={`${team.filter((item) => item.level === 1).length} 一级 · ${team.filter((item) => item.level === 2).length} 二级`} icon={<UsersThree weight="duotone" />} />
      </section>

      <div className="uw-growth-grid">
        <Panel title="生成专属邀请码" description="新用户注册后会记录邀请层级">
          <form className="uw-invite-builder" onSubmit={createCode}>
            <Field label="最大使用次数"><input type="number" min={1} max={500} value={maxUses} onChange={(event) => setMaxUses(Number(event.target.value))} /></Field>
            <Field label="新用户赠送额度" hint="0–20 次"><input type="number" min={0} max={20} value={giftCredits} onChange={(event) => setGiftCredits(Number(event.target.value))} /></Field>
            <ActionButton type="submit" tone="primary" icon={<UserPlus />}>生成邀请码</ActionButton>
          </form>
          {generatedCode ? <div className="uw-generated-code"><CheckCircle weight="duotone" /><span><small>刚刚生成</small><code>{generatedCode}</code></span><ActionButton tone="quiet" icon={<Copy />} onClick={() => copyCode(generatedCode)}>复制</ActionButton></div> : null}
          <div className="uw-invite-code-list">
            {inviteCodes.slice(0, 4).map((item) => <div key={item.id}><span><StateChip label={item.status === "active" ? "可用" : item.status === "used" ? "已用完" : "不可用"} tone={item.status === "active" ? "good" : "neutral"} /><code>{item.code}</code><small>{item.usedCount} / {item.maxUses} 已使用 · 赠送 {item.giftCredits} 次</small></span><ActionButton tone="quiet" icon={<Copy />} onClick={() => copyCode(item.code)}>复制</ActionButton></div>)}
          </div>
        </Panel>

        <Panel title="佣金兑换创作额度" description={`当前规则：每 1 元兑换 ${state.adminSettings.commissionCreditsPerYuan} 次`}>
          <form className="uw-exchange-form" onSubmit={exchange}>
            <Field label="兑换金额" hint={`当前可用 ¥${(commission?.availableBalance ?? 0).toFixed(2)}`}><span className="uw-money-input"><span>¥</span><input type="number" min={1} step="0.01" value={exchangeAmount} onChange={(event) => setExchangeAmount(Number(event.target.value))} /></span></Field>
            <div className="uw-exchange-preview"><Coins weight="duotone" /><span><small>预计到账</small><strong>{Math.max(0, Math.floor(exchangeAmount * state.adminSettings.commissionCreditsPerYuan))} 次</strong></span></div>
            <ActionButton type="submit" tone="secondary" icon={<ArrowRight />} disabled={!state.adminSettings.commissionExchangeEnabled || exchangeAmount <= 0 || exchangeAmount > (commission?.availableBalance ?? 0)} disabledReason={!state.adminSettings.commissionExchangeEnabled ? "管理员暂未开放佣金兑换" : "请输入不超过可用余额的有效金额"}>确认兑换</ActionButton>
          </form>
        </Panel>
      </div>

      <div className="uw-growth-grid">
        <Panel title="提现申请" description="审核通过后由管理员在平台外人工转账">
          <form className="uw-withdraw-form" onSubmit={withdraw} noValidate>
            <div className="uw-form-grid uw-form-grid--two"><Field label="提现金额" required><span className="uw-money-input"><span>¥</span><input type="number" min={1} step="0.01" value={withdrawAmount} onChange={(event) => { setWithdrawAmount(Number(event.target.value)); setFormError(""); }} /></span></Field><Field label="收款方式"><select value={withdrawMethod} onChange={(event) => setWithdrawMethod(event.target.value as WithdrawalMethod)}><option value="alipay">支付宝</option><option value="wechat">微信</option></select></Field></div>
            <Field label="收款账号" required hint="提交后只保存掩码形式"><input value={withdrawAccount} onChange={(event) => { setWithdrawAccount(event.target.value); setFormError(""); }} placeholder="手机号、邮箱或微信号" autoComplete="off" /></Field>
            {formError ? <SignalBanner tone="error" title="提现申请未提交">{formError}</SignalBanner> : null}
            <ActionButton type="submit" tone="primary" icon={<PaperPlaneTilt />} disabled={!state.adminSettings.withdrawalsEnabled || withdrawAmount <= 0 || withdrawAmount > (commission?.availableBalance ?? 0)} disabledReason={!state.adminSettings.withdrawalsEnabled ? "管理员暂未开放提现" : "提现金额不能超过可用佣金"}>提交人工审核</ActionButton>
          </form>
          {withdrawals.length ? <div className="uw-withdraw-list"><h3>最近申请</h3>{withdrawals.slice(0, 4).map((item) => <div key={item.id}><span><strong>¥{item.amount.toFixed(2)} · {item.method === "alipay" ? "支付宝" : "微信"}</strong><small>{item.accountMasked} · {formatFullDate(item.createdAt)}</small></span><StateChip label={item.status === "pending" ? "待人工审核" : item.status === "approved" ? "演示已转账" : "已退回"} tone={item.status === "pending" ? "warning" : item.status === "approved" ? "good" : "danger"} /></div>)}</div> : null}
        </Panel>

        <Panel title="佣金规则" description="管理端当前保存的演示比例">
          <div className="uw-commission-flow"><div><span>1</span><strong>一级成员</strong><b>{Math.round(state.adminSettings.firstLevelCommissionRate * 100)}%</b></div><i /><div><span>2</span><strong>二级成员</strong><b>{Math.round(state.adminSettings.secondLevelCommissionRate * 100)}%</b></div><i /><div><Wallet weight="duotone" /><strong>充值码兑换成功</strong><b>记入账本</b></div></div>
          <p className="uw-muted-note">只有下级账号成功兑换充值码时才会生成佣金；注册本身不产生佣金。</p>
        </Panel>
      </div>

      <Panel title="团队关系图" description="只展示通过你的邀请链建立的一级与二级关系">
        {team.length ? <div className="uw-team-list">{team.map((member) => <article key={`${member.level}-${member.user.id}`}><span className="uw-avatar-mini">{member.user.avatarInitials}</span><div><strong>{member.user.nickname}</strong><small>@{member.user.username} · {formatFullDate(member.joinedAt)}</small></div><StateChip label={`${member.level === 1 ? "一" : "二"}级成员`} tone={member.level === 1 ? "accent" : "neutral"} /><span className="uw-team-list__status">{member.user.status === "active" ? "账号正常" : "账号已冻结"}</span></article>)}</div> : <EmptyState icon={TreeStructure} title="尚未建立团队关系" description="将邀请码分享给新用户，完成注册后会记录一级关系。" action={inviteCodes[0] ? <ActionButton tone="secondary" icon={<Copy />} onClick={() => copyCode(inviteCodes[0].code)}>复制最新邀请码</ActionButton> : undefined} />}
      </Panel>

      <Panel title="佣金明细" description="每一条记录对应明确的充值、兑换或提现动作">
        {transactions.length ? <div className="uw-transaction-list">{transactions.map((item) => <div key={item.id}><span className={item.amount >= 0 ? "is-positive" : "is-negative"}>{item.amount >= 0 ? <Coins weight="duotone" /> : <Wallet weight="duotone" />}</span><span><strong>{item.description}</strong><small>{formatFullDate(item.createdAt)}{item.rate ? ` · 比例 ${Math.round(item.rate * 100)}%` : ""}</small></span><b>{item.amount >= 0 ? "+" : ""}¥{item.amount.toFixed(2)}</b></div>)}</div> : <EmptyState icon={CurrencyCircleDollar} title="暂无佣金明细" description="下级成员兑换充值码后，佣金记录会出现在这里。" />}
      </Panel>
    </div>
  );
}
