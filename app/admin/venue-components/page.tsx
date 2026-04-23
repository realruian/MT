"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Boxes,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { VENUE_COMPONENT_GROUPS } from "@/lib/venue-component-groups";
import type { VenueComponentRecord } from "@/types/venue-component";

/**
 * 后台会场组件管理页。
 * - 按 7 个固定分组展示，空分组也显示标题便于看缺口
 * - 上传 / 编辑 / 删除 / 重生缩略图 / 组内拖拽排序
 * - 所有 mutation 成功 / 失败用顶部 toast 提示（3s 自动消失）
 */
export default function VenueComponentsAdminPage() {
  const [components, setComponents] = useState<VenueComponentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [formModal, setFormModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; component: VenueComponentRecord }
    | null
  >(null);
  const [toast, setToast] = useState<{
    variant: "success" | "error";
    text: string;
  } | null>(null);
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(
    new Set(),
  );

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/venue-components");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      setComponents(data.components ?? []);
    } catch (err) {
      console.error(err);
      setToast({
        variant: "error",
        text: `加载组件失败：${err instanceof Error ? err.message : "网络错误"}`,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handleDelete(component: VenueComponentRecord) {
    if (
      !window.confirm(`确定删除组件「${component.name}」？此操作不可恢复`)
    )
      return;
    try {
      const res = await fetch(
        `/api/admin/venue-components/${component.id}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "删除失败");
      setToast({ variant: "success", text: `已删除「${component.name}」` });
      fetchList();
    } catch (err) {
      setToast({
        variant: "error",
        text: `删除失败：${err instanceof Error ? err.message : "网络错误"}`,
      });
    }
  }

  async function handleRegenerateThumbnail(component: VenueComponentRecord) {
    setRegeneratingIds((prev) => new Set(prev).add(component.id));
    try {
      const res = await fetch(
        `/api/admin/venue-components/${component.id}/regenerate-thumbnail`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "重新生成缩略图失败");
      setToast({
        variant: "success",
        text: `已重新生成「${component.name}」缩略图`,
      });
      fetchList();
    } catch (err) {
      setToast({
        variant: "error",
        text: `重新生成失败：${err instanceof Error ? err.message : "网络错误"}`,
      });
    } finally {
      setRegeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(component.id);
        return next;
      });
    }
  }

  /**
   * 组内拖拽排序：把 groupName 里的 ids 按新顺序提交；成功后 refetch 保证
   * 列表顺序与 DB 一致。失败回滚到上次 DB 顺序。乐观更新：先本地 swap，
   * 再发 POST。
   */
  async function handleReorder(groupName: string, orderedIds: string[]) {
    const snapshot = components;
    // 乐观：本地按新顺序重新组装该组
    const idOrder = new Map(orderedIds.map((id, i) => [id, i] as const));
    const next = [...components].sort((a, b) => {
      if (a.groupName !== groupName || b.groupName !== groupName) return 0;
      const ai = idOrder.get(a.id);
      const bi = idOrder.get(b.id);
      if (ai === undefined || bi === undefined) return 0;
      return ai - bi;
    });
    setComponents(next);
    try {
      const res = await fetch("/api/admin/venue-components/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupName, ids: orderedIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "排序保存失败");
      fetchList();
    } catch (err) {
      setComponents(snapshot);
      setToast({
        variant: "error",
        text: `排序保存失败：${err instanceof Error ? err.message : "网络错误"}`,
      });
    }
  }

  // 按 group 聚合 —— 保证 7 个分组顺序即使无数据也要出现
  const byGroup = new Map<string, VenueComponentRecord[]>();
  for (const g of VENUE_COMPONENT_GROUPS) byGroup.set(g, []);
  for (const c of components) {
    if (byGroup.has(c.groupName)) byGroup.get(c.groupName)!.push(c);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-gray-700"
          >
            <ArrowLeft className="size-4" />
            管理后台
          </Link>
          <span className="h-4 w-px bg-gray-200" />
          <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Boxes className="size-5" />
            会场组件
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setFormModal({ mode: "create" })}
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800"
        >
          <Plus className="size-3.5" />
          上传组件
        </button>
      </header>

      {toast && (
        <div
          role="status"
          className={[
            "mx-auto mt-4 w-fit max-w-[min(640px,90vw)] rounded-lg px-4 py-2 text-sm shadow-sm",
            toast.variant === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700",
          ].join(" ")}
        >
          {toast.text}
        </div>
      )}

      <main className="mx-auto max-w-6xl p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-400">
            <Loader2 className="mr-2 size-4 animate-spin" />
            加载中...
          </div>
        ) : (
          <div className="space-y-8">
            {VENUE_COMPONENT_GROUPS.map((group) => {
              const items = byGroup.get(group) ?? [];
              return (
                <VenueComponentGroupSection
                  key={group}
                  group={group}
                  items={items}
                  regeneratingIds={regeneratingIds}
                  onEdit={(c) => setFormModal({ mode: "edit", component: c })}
                  onDelete={handleDelete}
                  onRegenerateThumbnail={handleRegenerateThumbnail}
                  onReorder={(ids) => handleReorder(group, ids)}
                />
              );
            })}
          </div>
        )}
      </main>

      {formModal && (
        <ComponentFormModal
          key={formModal.mode === "edit" ? formModal.component.id : "create"}
          mode={formModal.mode}
          initial={formModal.mode === "edit" ? formModal.component : undefined}
          onClose={() => setFormModal(null)}
          onSuccess={(message) => {
            setFormModal(null);
            fetchList();
            setToast({ variant: "success", text: message });
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Group section + 组内拖拽排序
// ============================================================================

interface GroupSectionProps {
  group: string;
  items: VenueComponentRecord[];
  regeneratingIds: Set<string>;
  onEdit: (c: VenueComponentRecord) => void;
  onDelete: (c: VenueComponentRecord) => void;
  onRegenerateThumbnail: (c: VenueComponentRecord) => void;
  onReorder: (orderedIds: string[]) => void;
}

function VenueComponentGroupSection({
  group,
  items,
  regeneratingIds,
  onEdit,
  onDelete,
  onRegenerateThumbnail,
  onReorder,
}: GroupSectionProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    side: "before" | "after";
  } | null>(null);

  function handleDragStart(id: string, e: React.DragEvent) {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }

  function handleDragOver(
    targetId: string,
    e: React.DragEvent<HTMLDivElement>,
  ) {
    if (!draggingId || draggingId === targetId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const side: "before" | "after" =
      e.clientX < rect.left + rect.width / 2 ? "before" : "after";
    setDropTarget((prev) => {
      if (prev?.id === targetId && prev.side === side) return prev;
      return { id: targetId, side };
    });
  }

  function handleDrop(targetId: string, e: React.DragEvent) {
    e.preventDefault();
    const source = draggingId;
    const target = dropTarget;
    setDraggingId(null);
    setDropTarget(null);
    if (!source || source === targetId || !target) return;

    const ids = items.map((c) => c.id);
    const from = ids.indexOf(source);
    if (from === -1) return;
    ids.splice(from, 1);
    let to = ids.indexOf(target.id);
    if (to === -1) return;
    if (target.side === "after") to += 1;
    ids.splice(to, 0, source);

    // 没有顺序变化就不提交
    const original = items.map((c) => c.id);
    const changed = ids.some((id, i) => id !== original[i]);
    if (changed) onReorder(ids);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDropTarget(null);
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-gray-900">
        {group}
        <span className="ml-2 text-xs font-normal text-gray-400">
          {items.length} 个
        </span>
      </h2>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-xs text-gray-400">
          暂无组件
        </p>
      ) : (
        <div
          className="grid grid-cols-4 gap-3"
          onDragEnd={handleDragEnd}
        >
          {items.map((c) => (
            <VenueComponentCard
              key={c.id}
              component={c}
              isDragging={draggingId === c.id}
              dropIndicator={
                dropTarget?.id === c.id ? dropTarget.side : null
              }
              regenerating={regeneratingIds.has(c.id)}
              onEdit={() => onEdit(c)}
              onDelete={() => onDelete(c)}
              onRegenerateThumbnail={() => onRegenerateThumbnail(c)}
              onDragStart={(e) => handleDragStart(c.id, e)}
              onDragOver={(e) => handleDragOver(c.id, e)}
              onDrop={(e) => handleDrop(c.id, e)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// 卡片
// ============================================================================

interface CardProps {
  component: VenueComponentRecord;
  isDragging: boolean;
  dropIndicator: "before" | "after" | null;
  regenerating: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRegenerateThumbnail: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent) => void;
}

function VenueComponentCard({
  component,
  isDragging,
  dropIndicator,
  regenerating,
  onEdit,
  onDelete,
  onRegenerateThumbnail,
  onDragStart,
  onDragOver,
  onDrop,
}: CardProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={[
        "group relative cursor-grab rounded-xl border bg-white p-3 transition-shadow hover:shadow-sm",
        isDragging ? "opacity-40" : "",
        dropIndicator
          ? "border-gray-200"
          : "border-gray-200",
      ].join(" ")}
    >
      {dropIndicator && (
        <span
          className={[
            "absolute inset-y-1 w-0.5 rounded bg-gray-900",
            dropIndicator === "before" ? "-left-1.5" : "-right-1.5",
          ].join(" ")}
          aria-hidden
        />
      )}
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-gray-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={component.thumbnailUrl}
          alt={component.name}
          className="max-h-full max-w-full object-contain"
          draggable={false}
        />
        {regenerating && (
          <div className="absolute inset-3 flex items-center justify-center rounded-lg bg-white/80 text-xs text-gray-500">
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            生成中…
          </div>
        )}
      </div>
      <p
        className="mt-2 truncate text-center text-xs text-gray-700"
        title={component.name}
      >
        {component.name}
      </p>
      <p className="mt-0.5 text-center text-[10px] text-gray-400">
        {component.width}×{component.height}
      </p>

      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <IconButton
          label="编辑"
          icon={<Pencil className="size-3.5" />}
          onClick={onEdit}
          tone="neutral"
        />
        <IconButton
          label="重新生成缩略图"
          icon={<ImageIcon className="size-3.5" />}
          onClick={onRegenerateThumbnail}
          tone="neutral"
          disabled={regenerating}
        />
        <IconButton
          label={`删除 ${component.name}`}
          icon={<Trash2 className="size-3.5" />}
          onClick={onDelete}
          tone="danger"
        />
      </div>
    </div>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  tone,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone: "neutral" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={[
        "flex size-6 items-center justify-center rounded-md bg-white/90 shadow-sm transition-colors disabled:opacity-50",
        tone === "danger"
          ? "text-red-400 hover:bg-red-50 hover:text-red-500"
          : "text-gray-500 hover:bg-gray-100 hover:text-gray-800",
      ].join(" ")}
    >
      {icon}
    </button>
  );
}

// ============================================================================
// Create / Edit Modal
// ============================================================================

interface FormModalProps {
  mode: "create" | "edit";
  initial?: VenueComponentRecord;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

function ComponentFormModal({
  mode,
  initial,
  onClose,
  onSuccess,
}: FormModalProps) {
  const isEdit = mode === "edit";
  const [psdFile, setPsdFile] = useState<File | null>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [group, setGroup] = useState<string>(
    initial?.groupName ?? VENUE_COMPONENT_GROUPS[0],
  );
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const psdInputRef = useRef<HTMLInputElement | null>(null);
  const thumbInputRef = useRef<HTMLInputElement | null>(null);

  const nameLen = Array.from(name).length;
  const nameOverLimit = nameLen > 6;

  // create: psdFile + name 必填；edit: 至少有 1 个改动
  const nameChanged = isEdit ? name.trim() !== (initial?.name ?? "") : true;
  const groupChanged = isEdit ? group !== (initial?.groupName ?? "") : true;
  const hasAnyEdit =
    !!psdFile ||
    !!thumbFile ||
    (isEdit && (nameChanged || groupChanged));

  const canSubmit = isEdit
    ? hasAnyEdit && !!name.trim() && !nameOverLimit && !submitting
    : !!psdFile && !!name.trim() && !nameOverLimit && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      if (psdFile) form.append("psd", psdFile);
      if (thumbFile) form.append("thumbnail", thumbFile);
      if (isEdit) {
        if (nameChanged) form.append("name", name.trim());
        if (groupChanged) form.append("group", group);
      } else {
        form.append("name", name.trim());
        form.append("group", group);
      }

      const url = isEdit
        ? `/api/admin/venue-components/${initial!.id}`
        : "/api/admin/venue-components/upload";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, { method, body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || (isEdit ? "更新失败" : "上传失败"));

      const finalName = data.component?.name ?? name.trim();
      onSuccess(isEdit ? `已更新「${finalName}」` : `已上传「${finalName}」`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="w-[min(520px,92vw)] rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? "编辑会场组件" : "上传会场组件"}
          </h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            aria-label="关闭"
            className="flex size-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
            disabled={submitting}
          >
            <X className="size-4" />
          </button>
        </div>

        {error && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* PSD 文件 */}
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-xs font-medium text-gray-700">
              <span>
                PSD 文件
                {!isEdit && <span className="text-red-500"> *</span>}
              </span>
              {isEdit && psdFile && (
                <button
                  type="button"
                  className="text-[11px] text-gray-400 hover:text-gray-600"
                  onClick={() => {
                    setPsdFile(null);
                    if (psdInputRef.current) psdInputRef.current.value = "";
                  }}
                  disabled={submitting}
                >
                  取消替换
                </button>
              )}
            </span>
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2.5">
              <Upload className="size-4 shrink-0 text-gray-400" />
              <input
                ref={psdInputRef}
                type="file"
                accept=".psd"
                onChange={(e) => setPsdFile(e.target.files?.[0] ?? null)}
                className="min-w-0 flex-1 text-xs text-gray-700 file:mr-2 file:rounded file:border-0 file:bg-white file:px-3 file:py-1 file:text-xs file:text-gray-700 file:shadow-sm"
                disabled={submitting}
              />
            </div>
            {psdFile ? (
              <p className="mt-1 truncate text-xs text-gray-400">
                {psdFile.name} · {(psdFile.size / 1024).toFixed(0)} KB
              </p>
            ) : isEdit ? (
              <p className="mt-1 text-[11px] text-gray-400">
                留空将保留原 PSD；重传会覆盖所有图层并自动重新生成缩略图
              </p>
            ) : null}
          </label>

          {/* 名称 */}
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-xs font-medium text-gray-700">
              <span>
                组件名称 <span className="text-red-500">*</span>
              </span>
              <span
                className={[
                  "text-[11px]",
                  nameOverLimit ? "text-red-500" : "text-gray-400",
                ].join(" ")}
              >
                {nameLen}/6
              </span>
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              placeholder="如：头图 A"
              disabled={submitting}
            />
          </label>

          {/* 分组 */}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-700">
              分组 <span className="text-red-500">*</span>
            </span>
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              disabled={submitting}
            >
              {VENUE_COMPONENT_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>

          {/* 缩略图 */}
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-xs font-medium text-gray-700">
              <span>缩略图（可选）</span>
              {isEdit && thumbFile && (
                <button
                  type="button"
                  className="text-[11px] text-gray-400 hover:text-gray-600"
                  onClick={() => {
                    setThumbFile(null);
                    if (thumbInputRef.current)
                      thumbInputRef.current.value = "";
                  }}
                  disabled={submitting}
                >
                  取消替换
                </button>
              )}
            </span>
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2.5">
              <Upload className="size-4 shrink-0 text-gray-400" />
              <input
                ref={thumbInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => setThumbFile(e.target.files?.[0] ?? null)}
                className="min-w-0 flex-1 text-xs text-gray-700 file:mr-2 file:rounded file:border-0 file:bg-white file:px-3 file:py-1 file:text-xs file:text-gray-700 file:shadow-sm"
                disabled={submitting}
              />
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              {isEdit
                ? "留空将保留原缩略图；如果同时重传了 PSD，会基于新 PSD 自动生成"
                : "留空将根据 PSD 内容自动生成"}
            </p>
          </label>

          <div className="flex items-center justify-between pt-2">
            {isEdit && !hasAnyEdit && (
              <span className="text-[11px] text-gray-400">尚未修改任何字段</span>
            )}
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => !submitting && onClose()}
                disabled={submitting}
                className="rounded-lg border border-gray-200 px-4 py-2 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {submitting && <Loader2 className="size-3.5 animate-spin" />}
                {submitting
                  ? isEdit
                    ? "保存中…"
                    : "上传中…"
                  : isEdit
                    ? "保存"
                    : "上传"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
