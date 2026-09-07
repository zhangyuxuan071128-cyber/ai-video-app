import type {
  AuditLog,
  CommissionTransaction,
  GenerationTask,
  UsageLog,
  User,
} from "../types/domain";

export interface CsvColumn<T> {
  header: string;
  key?: keyof T;
  value?: (row: T) => unknown;
}
function requireBrowser(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("文件下载只能在浏览器中执行");
  }
}

function safeFilename(filename: string, extension: string): string {
  const cleaned = filename
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 100) || "export";
  return cleaned.toLowerCase().endsWith(`.${extension}`) ? cleaned : `${cleaned}.${extension}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  requireBrowser();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function printableValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

function escapeCsvCell(value: unknown): string {
  let text = printableValue(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Stop spreadsheet applications from interpreting untrusted cells as formulas.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCsv<T extends object>(
  rows: readonly T[],
  columns?: readonly CsvColumn<T>[],
): string {
  let resolvedColumns = columns;
  if (!resolvedColumns) {
    const keys = Array.from(
      new Set(rows.flatMap((row) => Object.keys(row) as Array<keyof T>)),
    );
    resolvedColumns = keys.map((key) => ({ header: String(key), key }));
  }
  if (resolvedColumns.length === 0) return "";
  const header = resolvedColumns.map((column) => escapeCsvCell(column.header)).join(",");
  const lines = rows.map((row) =>
    resolvedColumns
      .map((column) =>
        escapeCsvCell(column.value ? column.value(row) : column.key ? row[column.key] : ""),
      )
      .join(","),
  );
  return [header, ...lines].join("\r\n");
}

export function downloadCsv<T extends object>(
  filename: string,
  rows: readonly T[],
  columns?: readonly CsvColumn<T>[],
): void {
  const csv = `\uFEFF${buildCsv(rows, columns)}`;
  triggerDownload(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
    safeFilename(filename, "csv"),
  );
}

export function downloadJson(filename: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  triggerDownload(
    new Blob([json], { type: "application/json;charset=utf-8" }),
    safeFilename(filename, "json"),
  );
}

export function exportTaskReport(filename: string, tasks: readonly GenerationTask[]): void {
  downloadCsv(filename, tasks, [
    { header: "任务 ID", key: "id" },
    { header: "任务名称", key: "title" },
    { header: "模式", value: (task) => task.input.mode },
    { header: "平台 ID", key: "platformId" },
    { header: "状态", key: "status" },
    { header: "阶段", key: "stage" },
    { header: "进度", value: (task) => `${task.progress}%` },
    { header: "集数", value: (task) => task.input.batchCount },
    { header: "分辨率", value: (task) => task.input.resolution },
    { header: "额度来源", key: "creditSource" },
    { header: "预计额度", key: "creditsEstimated" },
    { header: "实际扣除", key: "creditsCharged" },
    { header: "重试次数", key: "retryCount" },
    { header: "失败原因", key: "errorMessage" },
    { header: "创建时间", key: "createdAt" },
    { header: "完成时间", key: "completedAt" },
  ]);
}

export function exportUsageReport(filename: string, logs: readonly UsageLog[]): void {
  downloadCsv(filename, logs, [
    { header: "流水 ID", key: "id" },
    { header: "用户 ID", key: "userId" },
    { header: "平台 ID", key: "platformId" },
    { header: "功能", key: "featureKey" },
    { header: "额度类型", key: "creditType" },
    { header: "消耗额度", key: "creditsUsed" },
    { header: "剩余额度", key: "remainingCredits" },
    { header: "任务 ID", key: "taskId" },
    { header: "说明", key: "description" },
    { header: "发生时间", key: "createdAt" },
  ]);
}

export function exportCommissionReport(
  filename: string,
  transactions: readonly CommissionTransaction[],
  users: readonly User[] = [],
): void {
  const userNames = new Map(users.map((user) => [user.id, user.nickname]));
  downloadCsv(filename, transactions, [
    { header: "流水 ID", key: "id" },
    { header: "收益用户", value: (item) => userNames.get(item.userId) ?? item.userId },
    { header: "来源用户", value: (item) => item.fromUserId ? userNames.get(item.fromUserId) ?? item.fromUserId : "" },
    { header: "类型", key: "type" },
    { header: "分佣层级", key: "level" },
    { header: "充值金额", key: "rechargeAmount" },
    { header: "分佣比例", value: (item) => item.rate === undefined ? "" : `${item.rate * 100}%` },
    { header: "变动金额", key: "amount" },
    { header: "兑换额度", key: "credits" },
    { header: "说明", key: "description" },
    { header: "发生时间", key: "createdAt" },
  ]);
}

export function exportAuditReport(filename: string, logs: readonly AuditLog[]): void {
  downloadCsv(filename, logs, [
    { header: "日志 ID", key: "id" },
    { header: "操作者 ID", key: "actorUserId" },
    { header: "操作者角色", key: "actorRole" },
    { header: "模块", key: "module" },
    { header: "操作", key: "action" },
    { header: "目标类型", key: "targetType" },
    { header: "目标 ID", key: "targetId" },
    { header: "变更前", key: "before" },
    { header: "变更后", key: "after" },
    { header: "IP", key: "ipAddress" },
    { header: "发生时间", key: "createdAt" },
  ]);
}
