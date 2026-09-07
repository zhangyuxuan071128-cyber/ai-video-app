import {
  ArrowUUpLeft,
  FileText,
  FolderOpen,
  ImageSquare,
  MagnifyingGlass,
  Microphone,
  MusicNotes,
  Stack,
  Trash,
  UploadSimple,
  VideoCamera,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useAppStore } from "../../state/AppStore";
import type { Material, MaterialType } from "../../types/domain";
import {
  ActionButton,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Panel,
  SignalBanner,
  StateChip,
  TabBar,
  cx,
  formatBytes,
  formatFullDate,
  type Notify,
} from "./ui";

type VaultTab = "library" | "recycle";
type MaterialFilter = "all" | MaterialType;

const materialMeta: Record<MaterialType, { label: string; icon: typeof FileText }> = {
  photo: { label: "人像图片", icon: ImageSquare },
  product: { label: "产品素材", icon: Stack },
  audio: { label: "音频", icon: MusicNotes },
  voice: { label: "音色", icon: Microphone },
  project: { label: "项目包", icon: FolderOpen },
  video: { label: "视频", icon: VideoCamera },
  subtitle: { label: "字幕", icon: FileText },
};

function inferMaterialType(file: File): MaterialType {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "photo";
  if (name.endsWith(".srt") || name.endsWith(".vtt") || name.endsWith(".ass")) return "subtitle";
  return "project";
}

function MaterialCard({
  material,
  recycled,
  onRecycle,
  onRestore,
  onPurge,
  onUse,
}: {
  material: Material;
  recycled: boolean;
  onRecycle: () => void;
  onRestore: () => void;
  onPurge: () => void;
  onUse: () => void;
}) {
  const meta = materialMeta[material.type];
  const Glyph = meta.icon;
  return (
    <article className="uw-material-card">
      <div className="uw-material-card__visual" data-type={material.type}>
        <span className="uw-material-card__rings" aria-hidden="true" />
        <Glyph weight="duotone" aria-hidden="true" />
        <StateChip label={meta.label} tone="neutral" />
      </div>
      <div className="uw-material-card__body">
        <h3>{material.title}</h3>
        <p>{material.description || "未填写素材备注。"}</p>
        <div className="uw-material-card__meta"><span>{formatBytes(material.sizeBytes)}</span><span>{formatFullDate(material.updatedAt)}</span></div>
        {recycled && material.recycleExpiresAt ? <span className="uw-material-card__expiry"><WarningCircle weight="duotone" aria-hidden="true" />{formatFullDate(material.recycleExpiresAt)} 后自动清理</span> : null}
      </div>
      <div className="uw-material-card__actions">
        {recycled ? (
          <><ActionButton tone="secondary" icon={<ArrowUUpLeft />} onClick={onRestore}>恢复</ActionButton><ActionButton tone="danger" icon={<Trash />} onClick={onPurge}>永久删除</ActionButton></>
        ) : (
          <><ActionButton tone="quiet" icon={<Stack />} onClick={onUse}>用于创作</ActionButton><ActionButton tone="danger" icon={<Trash />} onClick={onRecycle}>移入回收站</ActionButton></>
        )}
      </div>
    </article>
  );
}

export function MaterialVault({ onNavigate, notify }: { onNavigate: (view: string) => void; notify: Notify }) {
  const { userMaterials, state, addMaterial, recycleMaterial, restoreMaterial, purgeMaterial, purgeExpiredMaterials } = useAppStore();
  const [tab, setTab] = useState<VaultTab>("library");
  const [filter, setFilter] = useState<MaterialFilter>("all");
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<Material | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeCount = userMaterials.filter((material) => !material.isDeleted).length;
  const recycleCount = userMaterials.filter((material) => material.isDeleted).length;
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return userMaterials.filter((material) => {
      if (tab === "library" ? material.isDeleted : !material.isDeleted) return false;
      if (filter !== "all" && material.type !== filter) return false;
      if (!normalized) return true;
      return `${material.title} ${material.description ?? ""} ${material.mimeType ?? ""}`.toLowerCase().includes(normalized);
    });
  }, [filter, query, tab, userMaterials]);

  const importFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const validFiles = files.filter((file) => file.size <= 250 * 1024 * 1024).slice(0, 12);
    if (!validFiles.length) {
      notify("error", "文件超过 250 MB，未导入任何记录。");
      event.currentTarget.value = "";
      return;
    }
    setImporting(true);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 220));
    let imported = 0;
    validFiles.forEach((file) => {
      const result = addMaterial({
        type: inferMaterialType(file),
        title: file.name,
        description: "由本地文件选择器导入的元数据记录，未上传文件字节。",
        mimeType: file.type || undefined,
        sizeBytes: file.size,
      });
      if (result.ok) imported += 1;
    });
    setImporting(false);
    event.currentTarget.value = "";
    const skipped = files.length - imported;
    notify(imported ? "success" : "error", imported ? `已导入 ${imported} 条本地素材记录${skipped ? `，${skipped} 个文件未导入` : ""}。` : "没有可导入的文件。");
  };

  const recycle = (material: Material) => {
    const result = recycleMaterial(material.id);
    notify(result.ok ? "success" : "error", result.message);
  };

  const restore = (material: Material) => {
    const result = restoreMaterial(material.id);
    notify(result.ok ? "success" : "error", result.message);
  };

  const purge = () => {
    if (!purgeTarget) return;
    const result = purgeMaterial(purgeTarget.id);
    setPurgeTarget(null);
    notify(result.ok ? "success" : "error", result.message);
  };

  const cleanExpired = () => {
    const result = purgeExpiredMaterials();
    notify(result.ok ? "success" : "error", result.message);
  };

  return (
    <div className="uw-page uw-materials">
      <input ref={fileInputRef} className="uw-hidden-input" type="file" multiple accept="image/*,video/*,audio/*,.zip,.srt,.vtt,.ass" onChange={importFiles} tabIndex={-1} aria-hidden="true" />
      <PageHeader
        title="素材星仓"
        description="管理人像、产品、音频、视频、字幕和项目包记录。"
        actions={<ActionButton tone="primary" icon={<UploadSimple />} busy={importing} onClick={() => fileInputRef.current?.click()}>导入本地素材</ActionButton>}
      />

      <SignalBanner tone="info" title="演示版的文件边界">
        导入操作仅将文件名、类型和大小保存到当前浏览器，不会把原文件上传到服务器。
      </SignalBanner>

      <div className="uw-vault-toolbar">
        <TabBar value={tab} onChange={setTab} label="素材区域" options={[{ value: "library", label: "素材库", count: activeCount }, { value: "recycle", label: "回收站", count: recycleCount }]} />
        <label className="uw-search-field"><MagnifyingGlass aria-hidden="true" /><span className="uw-sr-only">搜索素材</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索素材名称或备注" /></label>
      </div>

      <div className="uw-material-filter" role="group" aria-label="素材类型筛选">
        <button type="button" className={cx(filter === "all" && "is-active")} onClick={() => setFilter("all")}>全部</button>
        {(Object.keys(materialMeta) as MaterialType[]).map((type) => <button type="button" className={cx(filter === type && "is-active")} onClick={() => setFilter(type)} key={type}>{materialMeta[type].label}</button>)}
      </div>

      {tab === "recycle" ? (
        <Panel className="uw-recycle-banner">
          <div className="uw-recycle-banner__content"><Trash weight="duotone" aria-hidden="true" /><div><strong>{state.adminSettings.recycleRetentionDays} 天可恢复窗口</strong><span>超过保留期的记录可由系统清理；永久删除后无法恢复。</span></div></div>
          <ActionButton tone="secondary" icon={<Trash />} onClick={cleanExpired}>清理已过期记录</ActionButton>
        </Panel>
      ) : null}

      {filtered.length ? (
        <section className="uw-material-grid" aria-label={tab === "library" ? "素材库列表" : "回收站列表"}>
          {filtered.map((material) => <MaterialCard key={material.id} material={material} recycled={tab === "recycle"} onRecycle={() => recycle(material)} onRestore={() => restore(material)} onPurge={() => setPurgeTarget(material)} onUse={() => onNavigate("create")} />)}
        </section>
      ) : (
        <EmptyState
          icon={tab === "recycle" ? Trash : FolderOpen}
          title={tab === "recycle" ? "回收站是空的" : "当前筛选没有素材"}
          description={query || filter !== "all" ? "请调整搜索或类型筛选。" : tab === "recycle" ? "删除的素材会在保留期内出现在这里。" : "选择本地文件后，素材元数据会记录在这里。"}
          action={query || filter !== "all" ? <ActionButton tone="secondary" onClick={() => { setQuery(""); setFilter("all"); }}>清除筛选</ActionButton> : tab === "library" ? <ActionButton tone="primary" icon={<UploadSimple />} onClick={() => fileInputRef.current?.click()}>导入素材</ActionButton> : undefined}
        />
      )}

      <ConfirmDialog open={Boolean(purgeTarget)} title="永久删除这条素材记录？" description={`《${purgeTarget?.title ?? ""}》将从当前浏览器的本地数据中移除，此操作无法撤销。`} confirmLabel="永久删除" onConfirm={purge} onCancel={() => setPurgeTarget(null)} />
    </div>
  );
}
