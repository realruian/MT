"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Upload,
  Loader2,
  Trash2,
  ChevronDown,
  Layers,
  Type,
  ImageIcon,
  LayoutTemplate,
  Pencil,
  X,
  Lock,
  Unlock,
} from "lucide-react";
import type { PsdLayer } from "@/types/template";

const CATEGORIES = [
  "会场头图",
  "会场组件",
  "站内资源位",
  "站外资源位",
  "C 端外素材",
];

const LAYER_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  background: { label: "底图", color: "bg-amber-100 text-amber-700" },
  text: { label: "文字", color: "bg-blue-100 text-blue-700" },
  image: { label: "图片", color: "bg-emerald-100 text-emerald-700" },
};

interface PsdTemplate {
  id: string;
  name: string;
  category: string;
  thumbnail: string;
  width: number;
  height: number;
  template_type: string;
  psd_file?: string;
  canvas_width?: number;
  canvas_height?: number;
}

interface ParsedResult {
  template: {
    id: string;
    name: string;
    width: number;
    height: number;
    psdFile: string;
    thumbnail: string;
    layerCount: number;
  };
  layers: Array<{
    id: string;
    name: string;
    layerType: string;
    x: number;
    y: number;
    width: number;
    height: number;
    visible: boolean;
    imageUrl: string | null;
    textContent: string | null;
    fontFamily: string | null;
    fontSize: number | null;
    fontColor: string | null;
  }>;
}

export function PsdManager() {
  const [psdTemplates, setPsdTemplates] = useState<PsdTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [layers, setLayers] = useState<PsdLayer[]>([]);

  const [saveName, setSaveName] = useState("");
  const [saveCategory, setSaveCategory] = useState("站内资源位");
  const [saveThumbnail, setSaveThumbnail] = useState("");
  const [saving, setSaving] = useState(false);
  const [thumbUploading, setThumbUploading] = useState(false);

  const [expandedLayer, setExpandedLayer] = useState<string | null>(null);

  const [editingTpl, setEditingTpl] = useState<PsdTemplate | null>(null);
  const [editLayers, setEditLayers] = useState<PsdLayer[]>([]);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editThumbnail, setEditThumbnail] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editThumbUploading, setEditThumbUploading] = useState(false);

  const fetchPsdTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/templates");
      if (!res.ok) throw new Error(await res.text());
      const all = (await res.json()) as PsdTemplate[];
      setPsdTemplates(all.filter((t) => t.template_type === "psd"));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/admin/init-db", { method: "POST" }).catch(() => {});
    fetchPsdTemplates();
  }, [fetchPsdTemplates]);

  async function handleUploadPsd(file: File) {
    if (!file.name.toLowerCase().endsWith(".psd")) {
      setMessage("只支持 .psd 文件");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setMessage(`文件过大（${Math.round(file.size / 1024 / 1024)}MB），最大 20MB`);
      return;
    }

    setUploading(true);
    setMessage("正在上传并解析 PSD 文件，请耐心等待...");
    setParsed(null);
    setLayers([]);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/psd/upload", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        setMessage(`上传失败：${data.error}`);
        return;
      }

      setParsed(data as ParsedResult);
      setSaveName(data.template.name);
      if (data.template.thumbnail) {
        setSaveThumbnail(data.template.thumbnail);
      }

      const layersRes = await fetch(
        `/api/admin/psd/layers?template_id=${data.template.id}`,
      );
      if (layersRes.ok) {
        setLayers(await layersRes.json());
      }

      setMessage(`解析成功：${data.template.width}×${data.template.height}，${data.template.layerCount} 个图层`);
    } catch (err) {
      setMessage(`上传失败：${err instanceof Error ? err.message : "网络错误"}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleLayerTypeChange(layerId: string, newType: string) {
    try {
      const res = await fetch("/api/admin/psd/layers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: layerId, layerType: newType }),
      });
      if (!res.ok) throw new Error("更新失败");
      setLayers((prev) =>
        prev.map((l) =>
          l.id === layerId ? { ...l, layerType: newType as PsdLayer["layerType"] } : l,
        ),
      );
    } catch {
      setMessage("图层类型更新失败");
    }
  }

  async function handleLayerLockToggle(layerId: string, currentLocked: boolean) {
    const newLocked = !currentLocked;
    try {
      const res = await fetch("/api/admin/psd/layers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: layerId, locked: newLocked }),
      });
      if (!res.ok) throw new Error("更新失败");
      setLayers((prev) =>
        prev.map((l) => l.id === layerId ? { ...l, locked: newLocked } : l),
      );
    } catch {
      setMessage("锁定状态更新失败");
    }
  }

  async function handleEditLayerLockToggle(layerId: string, currentLocked: boolean) {
    const newLocked = !currentLocked;
    try {
      const res = await fetch("/api/admin/psd/layers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: layerId, locked: newLocked }),
      });
      if (!res.ok) throw new Error("更新失败");
      setEditLayers((prev) =>
        prev.map((l) => l.id === layerId ? { ...l, locked: newLocked } : l),
      );
    } catch {
      setMessage("锁定状态更新失败");
    }
  }

  async function handleUploadThumbnail(file: File) {
    setThumbUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", "thumbnails");
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      const data = await res.json();
      if (res.ok) {
        setSaveThumbnail(data.url);
      } else {
        setMessage(`缩略图上传失败：${data.error}`);
      }
    } catch {
      setMessage("缩略图上传失败：网络错误");
    } finally {
      setThumbUploading(false);
    }
  }

  async function handleSaveTemplate() {
    if (!parsed) return;
    if (!saveName.trim()) {
      setMessage("请填写模板名称");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: parsed.template.id,
          name: saveName,
          category: saveCategory,
          thumbnail: saveThumbnail || "",
          width: parsed.template.width,
          height: parsed.template.height,
          html_file: "",
          editable_fields: { texts: [], colors: [], images: [] },
          template_type: "psd",
          psd_file: parsed.template.psdFile,
          canvas_width: parsed.template.width,
          canvas_height: parsed.template.height,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessage("模板保存成功");
      setParsed(null);
      setLayers([]);
      fetchPsdTemplates();
    } catch (err) {
      setMessage(`保存失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`确定要删除 PSD 模板 "${name}" 吗？`)) return;
    await fetch(`/api/admin/templates/${id}`, { method: "DELETE" });
    if (editingTpl?.id === id) setEditingTpl(null);
    fetchPsdTemplates();
  }

  async function handleStartEdit(tpl: PsdTemplate) {
    setEditingTpl(tpl);
    setEditName(tpl.name);
    setEditCategory(tpl.category);
    setEditThumbnail(tpl.thumbnail);
    setEditLoading(true);
    setEditLayers([]);
    setExpandedLayer(null);
    try {
      const res = await fetch(`/api/admin/psd/layers?template_id=${tpl.id}`);
      if (res.ok) setEditLayers(await res.json());
    } catch { /* ignore */ } finally {
      setEditLoading(false);
    }
  }

  async function handleEditLayerTypeChange(layerId: string, newType: string) {
    try {
      const res = await fetch("/api/admin/psd/layers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: layerId, layerType: newType }),
      });
      if (!res.ok) throw new Error("更新失败");
      setEditLayers((prev) =>
        prev.map((l) => l.id === layerId ? { ...l, layerType: newType as PsdLayer["layerType"] } : l),
      );
    } catch {
      setMessage("图层类型更新失败");
    }
  }

  async function handleEditUploadThumbnail(file: File) {
    setEditThumbUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", "thumbnails");
      const res = await fetch("/api/admin/upload", { method: "POST", body: form });
      const data = await res.json();
      if (res.ok) setEditThumbnail(data.url);
      else setMessage(`缩略图上传失败：${data.error}`);
    } catch { setMessage("缩略图上传失败"); } finally {
      setEditThumbUploading(false);
    }
  }

  async function handleSaveEdit() {
    if (!editingTpl || !editName.trim()) {
      setMessage("请填写模板名称");
      return;
    }
    setEditSaving(true);
    try {
      const res = await fetch("/api/admin/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingTpl.id,
          name: editName,
          category: editCategory,
          thumbnail: editThumbnail || "",
          width: editingTpl.canvas_width ?? editingTpl.width,
          height: editingTpl.canvas_height ?? editingTpl.height,
          html_file: "",
          editable_fields: { texts: [], colors: [], images: [] },
          template_type: "psd",
          psd_file: editingTpl.psd_file,
          canvas_width: editingTpl.canvas_width,
          canvas_height: editingTpl.canvas_height,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessage("模板更新成功");
      setEditingTpl(null);
      fetchPsdTemplates();
    } catch (err) {
      setMessage(`更新失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 消息提示 */}
      {message && (
        <p className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-600">
          {message}
        </p>
      )}

      {/* 上传区域 */}
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-8 animate-spin text-gray-400" />
            <p className="text-sm text-gray-500">正在上传并解析 PSD 文件，请耐心等待...</p>
            <p className="text-xs text-gray-400">大文件可能需要 10-30 秒</p>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center gap-3">
            <Upload className="size-8 text-gray-400" />
            <p className="text-sm text-gray-600">点击选择 PSD 文件上传</p>
            <p className="text-xs text-gray-400">支持 .psd 格式，最大 20MB</p>
            <input
              type="file"
              accept=".psd"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUploadPsd(file);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>

      {/* 解析结果 */}
      {parsed && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="mb-1 text-sm font-semibold text-gray-900">
            解析结果
          </h3>
          <p className="mb-4 text-xs text-gray-400">
            画布 {parsed.template.width} × {parsed.template.height}px ·{" "}
            {layers.length} 个图层
          </p>

          {/* 图层列表 */}
          <div className="mb-6 space-y-2">
            {layers.map((layer) => {
              const meta = LAYER_TYPE_LABELS[layer.layerType] ?? {
                label: layer.layerType,
                color: "bg-gray-100 text-gray-600",
              };
              const expanded = expandedLayer === layer.id;
              return (
                <div
                  key={layer.id}
                  className="rounded-lg border border-gray-100 bg-gray-50"
                >
                  <div
                    className="flex cursor-pointer items-center gap-3 px-4 py-3"
                    onClick={() => setExpandedLayer(expanded ? null : layer.id)}
                  >
                    {/* 缩略图 */}
                    <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-white">
                      {layer.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={layer.imageUrl}
                          alt={layer.name}
                          className="size-full object-contain"
                        />
                      ) : layer.layerType === "text" ? (
                        <Type className="size-5 text-blue-400" />
                      ) : (
                        <ImageIcon className="size-5 text-gray-300" />
                      )}
                    </div>

                    {/* 名称 + 标签 */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-800">
                        {layer.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {layer.x},{layer.y} · {layer.width}×{layer.height}
                      </p>
                    </div>

                    {/* 锁定按钮 */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleLayerLockToggle(layer.id, layer.locked); }}
                      className={`shrink-0 rounded p-1 transition-colors ${layer.locked ? "text-amber-500 hover:bg-amber-50" : "text-gray-300 hover:bg-gray-100 hover:text-gray-500"}`}
                      title={layer.locked ? "已锁定，点击解锁" : "未锁定，点击锁定"}
                    >
                      {layer.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                    </button>

                    {/* 类型选择 */}
                    <select
                      value={layer.layerType}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleLayerTypeChange(layer.id, e.target.value);
                      }}
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${meta.color} border-0 outline-none`}
                    >
                      <option value="background">底图</option>
                      <option value="text">文字</option>
                      <option value="image">图片</option>
                    </select>

                    <ChevronDown
                      className={`size-4 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                  </div>

                  {/* 展开详情 */}
                  {expanded && (
                    <div className="border-t border-gray-100 px-4 py-3">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-gray-400">坐标</span>
                          <p className="text-gray-700">
                            x: {layer.x}, y: {layer.y}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-400">尺寸</span>
                          <p className="text-gray-700">
                            {layer.width} × {layer.height}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-400">可见</span>
                          <p className="text-gray-700">
                            {layer.visible ? "是" : "否"}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-400">不透明度</span>
                          <p className="text-gray-700">
                            {Math.round(layer.opacity * 100)}%
                          </p>
                        </div>
                      </div>

                      {layer.layerType === "text" && layer.textContent && (
                        <div className="mt-3 space-y-2 text-xs">
                          <div>
                            <span className="text-gray-400">文字内容</span>
                            <p className="mt-0.5 rounded bg-white px-2 py-1 text-gray-800">
                              {layer.textContent}
                            </p>
                          </div>
                          <div className="flex gap-4">
                            {layer.fontFamily && (
                              <div>
                                <span className="text-gray-400">字体</span>
                                <p className="text-gray-700">{layer.fontFamily}</p>
                              </div>
                            )}
                            {layer.fontSize && (
                              <div>
                                <span className="text-gray-400">字号</span>
                                <p className="text-gray-700">{layer.fontSize}px</p>
                              </div>
                            )}
                            {layer.fontColor && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-400">颜色</span>
                                <span
                                  className="inline-block size-4 rounded border border-gray-200"
                                  style={{ backgroundColor: layer.fontColor }}
                                />
                                <span className="text-gray-700">
                                  {layer.fontColor}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {layer.imageUrl && (
                        <div className="mt-3">
                          <span className="text-xs text-gray-400">图层预览</span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={layer.imageUrl}
                            alt={layer.name}
                            className="mt-1 max-h-40 rounded-lg border border-gray-100 object-contain"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 保存表单 */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h4 className="mb-3 text-xs font-semibold text-gray-700">
              保存为模板
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">模板名称</span>
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                  placeholder="如：外卖 Banner"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">分类</span>
                <select
                  value={saveCategory}
                  onChange={(e) => setSaveCategory(e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </label>
              <div className="col-span-2 flex flex-col gap-1">
                <span className="text-xs text-gray-500">缩略图</span>
                <div className="flex items-center gap-2">
                  <input
                    value={saveThumbnail}
                    onChange={(e) => setSaveThumbnail(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                    placeholder="URL 或上传文件"
                    spellCheck={false}
                  />
                  <label
                    className={[
                      "flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs",
                      thumbUploading
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer text-gray-500 hover:bg-gray-50",
                    ].join(" ")}
                  >
                    {thumbUploading ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Upload className="size-3.5" />
                    )}
                    {thumbUploading ? "上传中…" : "上传"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadThumbnail(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => { setParsed(null); setLayers([]); setMessage(""); }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-xs text-gray-500 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={saving}
                className="rounded-lg bg-gray-900 px-6 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存模板"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 已有 PSD 模板列表 */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Layers className="size-4" />
          已有 PSD 模板
        </h3>
        {loading ? (
          <p className="py-10 text-center text-sm text-gray-400">加载中...</p>
        ) : psdTemplates.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-300">
            暂无 PSD 模板，上传 PSD 文件开始创建
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {psdTemplates.map((tpl) => (
              <div
                key={tpl.id}
                className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-4"
              >
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                  {tpl.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tpl.thumbnail}
                      alt={tpl.name}
                      className="size-full object-cover"
                    />
                  ) : (
                    <LayoutTemplate className="size-6 text-gray-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {tpl.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {tpl.category} · {tpl.canvas_width ?? tpl.width}×
                    {tpl.canvas_height ?? tpl.height} · PSD
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => handleStartEdit(tpl)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(tpl.id, tpl.name)}
                    className="flex items-center rounded-lg border border-red-100 px-2 py-1.5 text-xs text-red-400 hover:bg-red-50"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 编辑面板 */}
      {editingTpl && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              编辑模板：{editingTpl.name}
            </h3>
            <button
              onClick={() => setEditingTpl(null)}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* 基本信息 */}
          <div className="mb-6 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">模板名称</span>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">分类</span>
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </label>
            <div className="col-span-2 flex flex-col gap-1">
              <span className="text-xs text-gray-500">缩略图</span>
              <div className="flex items-center gap-2">
                <input
                  value={editThumbnail}
                  onChange={(e) => setEditThumbnail(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                  placeholder="URL 或上传"
                  spellCheck={false}
                />
                <label className={[
                  "flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs",
                  editThumbUploading ? "pointer-events-none opacity-50" : "cursor-pointer text-gray-500 hover:bg-gray-50",
                ].join(" ")}>
                  {editThumbUploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                  {editThumbUploading ? "上传中…" : "上传"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleEditUploadThumbnail(f);
                    e.target.value = "";
                  }} />
                </label>
              </div>
              {editThumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={editThumbnail} alt="缩略图" className="mt-1 h-20 rounded-lg border border-gray-100 object-contain" />
              )}
            </div>
          </div>

          {/* 图层列表 */}
          <h4 className="mb-2 text-xs font-semibold text-gray-700">
            图层管理 · {editingTpl.canvas_width ?? editingTpl.width}×{editingTpl.canvas_height ?? editingTpl.height}
          </h4>
          {editLoading ? (
            <p className="py-4 text-center text-xs text-gray-400">加载图层中...</p>
          ) : editLayers.length === 0 ? (
            <p className="py-4 text-center text-xs text-gray-300">无图层数据</p>
          ) : (
            <div className="mb-4 space-y-2">
              {editLayers.map((layer) => {
                const meta = LAYER_TYPE_LABELS[layer.layerType] ?? {
                  label: layer.layerType,
                  color: "bg-gray-100 text-gray-600",
                };
                const expanded = expandedLayer === layer.id;
                return (
                  <div key={layer.id} className="rounded-lg border border-gray-100 bg-gray-50">
                    <div
                      className="flex cursor-pointer items-center gap-3 px-4 py-3"
                      onClick={() => setExpandedLayer(expanded ? null : layer.id)}
                    >
                      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border border-gray-200 bg-white">
                        {layer.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={layer.imageUrl} alt={layer.name} className="size-full object-contain" />
                        ) : layer.layerType === "text" ? (
                          <Type className="size-4 text-blue-400" />
                        ) : (
                          <ImageIcon className="size-4 text-gray-300" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-gray-800">{layer.name}</p>
                        <p className="text-[12px] text-gray-400">{layer.x},{layer.y} · {layer.width}×{layer.height}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditLayerLockToggle(layer.id, layer.locked); }}
                        className={`shrink-0 rounded p-1 transition-colors ${layer.locked ? "text-amber-500 hover:bg-amber-50" : "text-gray-300 hover:bg-gray-100 hover:text-gray-500"}`}
                        title={layer.locked ? "已锁定，点击解锁" : "未锁定，点击锁定"}
                      >
                        {layer.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                      </button>
                      <select
                        value={layer.layerType}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => { e.stopPropagation(); handleEditLayerTypeChange(layer.id, e.target.value); }}
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${meta.color} border-0 outline-none`}
                      >
                        <option value="background">底图</option>
                        <option value="text">文字</option>
                        <option value="image">图片</option>
                      </select>
                      <ChevronDown className={`size-3.5 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </div>
                    {expanded && (
                      <div className="border-t border-gray-100 px-4 py-3 text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          <div><span className="text-gray-400">可见</span><p className="text-gray-700">{layer.visible ? "是" : "否"}</p></div>
                          <div><span className="text-gray-400">不透明度</span><p className="text-gray-700">{Math.round(layer.opacity * 100)}%</p></div>
                        </div>
                        {layer.layerType === "text" && layer.textContent && (
                          <div className="mt-2">
                            <span className="text-gray-400">文字</span>
                            <p className="mt-0.5 rounded bg-white px-2 py-1 text-gray-800">{layer.textContent}</p>
                            <div className="mt-1.5 flex gap-3 text-[12px]">
                              {layer.fontFamily && <span className="text-gray-500">字体: {layer.fontFamily}</span>}
                              {layer.fontSize && <span className="text-gray-500">字号: {layer.fontSize}px</span>}
                              {layer.fontColor && (
                                <span className="flex items-center gap-1 text-gray-500">
                                  颜色: <span className="inline-block size-3 rounded border border-gray-200" style={{ backgroundColor: layer.fontColor }} /> {layer.fontColor}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        {layer.imageUrl && (
                          <div className="mt-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={layer.imageUrl} alt={layer.name} className="max-h-32 rounded border border-gray-100 object-contain" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 保存/取消 */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setEditingTpl(null)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-xs text-gray-500 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={editSaving}
              className="rounded-lg bg-gray-900 px-6 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {editSaving ? "保存中..." : "保存修改"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
