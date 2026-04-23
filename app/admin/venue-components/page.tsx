"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Boxes,
  Loader2,
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
 * - 上传弹窗走 POST /api/admin/venue-components/upload
 * - 删除走 DELETE /api/admin/venue-components/:id（原生 confirm 二次确认）
 * - PR1 不支持编辑 / 排序 / 重新生成缩略图
 */
export default function VenueComponentsAdminPage() {
  const [components, setComponents] = useState<VenueComponentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toast, setToast] = useState<{
    variant: "success" | "error";
    text: string;
  } | null>(null);

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

  // toast 自动 3s 消失
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handleDelete(component: VenueComponentRecord) {
    if (
      !window.confirm(
        `确定删除组件「${component.name}」？此操作不可恢复`,
      )
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

  // 按 group 聚合 —— 保证 7 个分组顺序即使无数据也要出现
  const byGroup = new Map<string, VenueComponentRecord[]>();
  for (const g of VENUE_COMPONENT_GROUPS) byGroup.set(g, []);
  for (const c of components) {
    if (byGroup.has(c.groupName)) byGroup.get(c.groupName)!.push(c);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶栏 */}
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
          onClick={() => setUploadOpen(true)}
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

      {/* 主体 */}
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
                <section key={group}>
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
                    <div className="grid grid-cols-4 gap-3">
                      {items.map((c) => (
                        <VenueComponentCard
                          key={c.id}
                          component={c}
                          onDelete={() => handleDelete(c)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>

      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onSuccess={(name) => {
            setUploadOpen(false);
            fetchList();
            setToast({ variant: "success", text: `已上传「${name}」` });
          }}
        />
      )}
    </div>
  );
}

function VenueComponentCard({
  component,
  onDelete,
}: {
  component: VenueComponentRecord;
  onDelete: () => void;
}) {
  return (
    <div className="group relative rounded-xl border border-gray-200 bg-white p-3 transition-shadow hover:shadow-sm">
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-gray-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={component.thumbnailUrl}
          alt={component.name}
          className="max-h-full max-w-full object-contain"
          draggable={false}
        />
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
      <button
        type="button"
        onClick={onDelete}
        aria-label={`删除 ${component.name}`}
        title="删除"
        className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-md bg-white/90 text-red-400 opacity-0 shadow-sm transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function UploadModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (name: string) => void;
}) {
  const [psdFile, setPsdFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [group, setGroup] = useState<string>(VENUE_COMPONENT_GROUPS[0]);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameLen = Array.from(name).length;
  const nameOverLimit = nameLen > 6;
  const canSubmit = !!psdFile && !!name.trim() && !nameOverLimit && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !psdFile) return;
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("psd", psdFile);
      form.append("name", name.trim());
      form.append("group", group);
      if (thumbFile) form.append("thumbnail", thumbFile);
      const res = await fetch("/api/admin/venue-components/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "上传失败");
      onSuccess(data.component?.name ?? name.trim());
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
          <h2 className="text-base font-semibold text-gray-900">上传会场组件</h2>
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
            <span className="mb-1 block text-xs font-medium text-gray-700">
              PSD 文件 <span className="text-red-500">*</span>
            </span>
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2.5">
              <Upload className="size-4 shrink-0 text-gray-400" />
              <input
                type="file"
                accept=".psd"
                onChange={(e) => setPsdFile(e.target.files?.[0] ?? null)}
                className="min-w-0 flex-1 text-xs text-gray-700 file:mr-2 file:rounded file:border-0 file:bg-white file:px-3 file:py-1 file:text-xs file:text-gray-700 file:shadow-sm"
                disabled={submitting}
              />
            </div>
            {psdFile && (
              <p className="mt-1 truncate text-xs text-gray-400">
                {psdFile.name} · {(psdFile.size / 1024).toFixed(0)} KB
              </p>
            )}
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
            <span className="mb-1 block text-xs font-medium text-gray-700">
              缩略图（可选）
            </span>
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2.5">
              <Upload className="size-4 shrink-0 text-gray-400" />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setThumbFile(e.target.files?.[0] ?? null)}
                className="min-w-0 flex-1 text-xs text-gray-700 file:mr-2 file:rounded file:border-0 file:bg-white file:px-3 file:py-1 file:text-xs file:text-gray-700 file:shadow-sm"
                disabled={submitting}
              />
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              留空将根据 PSD 内容自动生成
            </p>
          </label>

          {/* 操作 */}
          <div className="flex justify-end gap-2 pt-2">
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
              {submitting ? "上传中…" : "上传"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
