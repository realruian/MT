"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Upload, RefreshCw, Database, Sparkles, Copy, Check, ImagePlus, ArrowLeft, Loader2 } from "lucide-react";
import { PsdManager } from "@/components/admin/psd-manager";

const CATEGORIES = [
  "会场头图",
  "会场组件",
  "站内资源位",
  "站外资源位",
  "C 端外素材",
];

interface TemplateField {
  key: string;
  label: string;
  defaultValue?: string;
  defaultColor?: string;
  defaultSrc?: string;
}

interface EditableFields {
  texts: TemplateField[];
  colors: { name: string; values: Record<string, string> }[];
  images: TemplateField[];
}

interface TemplateRow {
  id: string;
  name: string;
  category: string;
  thumbnail: string;
  width: number;
  height: number;
  html_file: string;
  editable_fields: EditableFields;
  sort_order: number;
}

const EMPTY_FIELDS: EditableFields = { texts: [], colors: [], images: [] };

function camelToLabel(key: string): string {
  const LABEL_MAP: Record<string, string> = {
    mainTitle: "主标题",
    subTitle: "副标题",
    title: "标题",
    desc: "描述",
    description: "描述",
    price: "价格",
    btnText: "按钮文案",
    bgTemplate: "背景图",
    bgImage: "商品图",
    bgColor: "背景色",
    fontColor: "字体颜色",
    btnColor: "按钮颜色",
    logo: "Logo",
    avatar: "头像",
    productImage: "商品图",
    bannerImage: "横幅图",
  };
  if (LABEL_MAP[key]) return LABEL_MAP[key];
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function parseFieldsFromHtml(html: string): {
  texts: TemplateField[];
  images: TemplateField[];
} {
  const texts: TemplateField[] = [];
  const images: TemplateField[] = [];
  const seen = new Set<string>();

  const paramRe = /params\.get\(\s*['"](\w+)['"]\s*\)/g;
  const allKeys: string[] = [];
  let pm: RegExpExecArray | null;
  while ((pm = paramRe.exec(html)) !== null) {
    if (!seen.has(pm[1])) {
      seen.add(pm[1]);
      allKeys.push(pm[1]);
    }
  }

  const colorOverrides = new Set(
    allKeys.filter((k) => k.endsWith("Color")),
  );

  for (const key of allKeys) {
    if (colorOverrides.has(key)) continue;

    let isImage = false;

    const lineRe = new RegExp(
      "[^\\n]*params\\.get\\(\\s*['\"]" + key + "['\"]\\s*\\)[^\\n]*",
      "g",
    );
    let lm: RegExpExecArray | null;
    while ((lm = lineRe.exec(html)) !== null) {
      if (/backgroundImage|\.src\s*=|url\s*\(/i.test(lm[0])) {
        isImage = true;
        break;
      }
    }

    if (!isImage) {
      const assignRe = new RegExp(
        "(?:var|let|const)\\s+(\\w+)\\s*=\\s*params\\.get\\(\\s*['\"]" + key + "['\"]\\s*\\)",
      );
      const assignMatch = assignRe.exec(html);
      if (assignMatch) {
        const varName = assignMatch[1];
        const varUsageRe = new RegExp(
          "[^\\n]*\\b" + varName + "\\b[^\\n]*",
          "g",
        );
        let vm: RegExpExecArray | null;
        while ((vm = varUsageRe.exec(html)) !== null) {
          if (/backgroundImage|\.src\s*=|url\s*\(/i.test(vm[0])) {
            isImage = true;
            break;
          }
        }
      }
    }

    const label = camelToLabel(key);

    if (isImage) {
      let defaultSrc = "";
      const fbVarRe = new RegExp(
        "params\\.get\\(\\s*['\"]" + key + "['\"]\\s*\\)\\s*\\|\\|\\s*(\\w+)",
      );
      const fbVar = fbVarRe.exec(html);
      if (fbVar) {
        const varValRe = new RegExp(
          "(?:var|let|const)\\s+" + fbVar[1] + "\\s*=\\s*['\"]([^'\"]+)['\"]",
        );
        const vm = varValRe.exec(html);
        if (vm) defaultSrc = vm[1];
      }
      const directFbRe = new RegExp(
        "params\\.get\\(\\s*['\"]" + key + "['\"]\\s*\\)\\s*\\|\\|\\s*['\"]([^'\"]+)['\"]",
      );
      const dm = directFbRe.exec(html);
      if (dm) defaultSrc = dm[1];

      images.push({ key, label, defaultSrc });
    } else {
      let defaultValue = "";
      let defaultColor = "#000000";

      const elRe = new RegExp(
        "id\\s*=\\s*[\"']" + key + "[\"'][^>]*>([^<]+)<",
        "i",
      );
      const em = elRe.exec(html);
      if (em) defaultValue = em[1].trim();

      const classIdRe = new RegExp(
        "(?:id\\s*=\\s*[\"']" + key + "[\"']\\s+class\\s*=\\s*[\"']([^\"']+)[\"']" +
        "|class\\s*=\\s*[\"']([^\"']+)[\"']\\s+id\\s*=\\s*[\"']" + key + "[\"'])",
        "i",
      );
      const cm = classIdRe.exec(html);
      if (cm) {
        const cls = (cm[1] || cm[2]).split(/\s+/)[0];
        const cssRe = new RegExp(
          "\\." + cls + "\\s*\\{[^}]*?color:\\s*(#[0-9a-fA-F]{3,8})",
        );
        const csm = cssRe.exec(html);
        if (csm) defaultColor = csm[1];
      }

      const inlineRe = new RegExp(
        "id\\s*=\\s*[\"']" + key + "[\"'][^>]*style\\s*=\\s*[\"'][^\"']*color:\\s*(#[0-9a-fA-F]{3,8})",
        "i",
      );
      const im = inlineRe.exec(html);
      if (im) defaultColor = im[1];

      texts.push({ key, label, defaultValue, defaultColor });
    }
  }

  return { texts, images };
}

function generateId() {
  const now = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `tpl_${now}_${rand}`;
}

function emptyTemplate(): Partial<TemplateRow> {
  return {
    id: generateId(),
    name: "",
    category: "会场头图",
    thumbnail: "",
    width: 750,
    height: 810,
    html_file: "",
    editable_fields: { ...EMPTY_FIELDS },
    sort_order: 0,
  };
}

export default function AdminPage() {
  const [adminTab, setAdminTab] = useState<"html" | "psd">("psd");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [editing, setEditing] = useState<Partial<TemplateRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dbReady, setDbReady] = useState(true);
  const [message, setMessage] = useState("");
  const [fileNotice, setFileNotice] = useState<{
    variant: "success" | "error";
    text: string;
  } | null>(null);
  const [lastHtmlContent, setLastHtmlContent] = useState("");
  const [thumbUploading, setThumbUploading] = useState(false);
  const [htmlUploading, setHtmlUploading] = useState(false);
  const [uploadedAssets, setUploadedAssets] = useState<{ name: string; url: string }[]>([]);
  const [assetUploading, setAssetUploading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [uploadedFonts, setUploadedFonts] = useState<{ name: string; url: string; folder: string }[]>([]);
  const [fontFolder, setFontFolder] = useState("");
  const [fontUploading, setFontUploading] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/templates");
      if (!res.ok) throw new Error(await res.text());
      const all = await res.json();
      setTemplates(all.filter((t: { template_type?: string }) => !t.template_type || t.template_type === "html"));
    } catch (err) {
      console.error(err);
      setDbReady(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    setFileNotice(null);
    setLastHtmlContent("");
    setUploadedAssets([]);
    setCopiedUrl(null);
  }, [editing?.id]);

  async function handleInitDb() {
    setMessage("正在初始化数据库...");
    const res = await fetch("/api/admin/init-db", { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      setMessage("数据库初始化成功");
      setDbReady(true);
      fetchTemplates();
    } else {
      setMessage(`初始化失败: ${data.error}`);
    }
  }

  type UploadResult =
    | { ok: true; url: string }
    | { ok: false; error: string };

  async function handleUpload(file: File, folder: string): Promise<UploadResult> {
    const form = new FormData();
    form.append("file", file);
    form.append("folder", folder);
    const res = await fetch("/api/admin/upload", { method: "POST", body: form });
    const data: unknown = await res.json().catch(() => ({}));
    const err =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : null;
    if (!res.ok) {
      return {
        ok: false,
        error: err ?? `上传失败（HTTP ${res.status}）`,
      };
    }
    const url =
      typeof data === "object" &&
      data !== null &&
      "url" in data &&
      typeof (data as { url: unknown }).url === "string"
        ? (data as { url: string }).url
        : null;
    if (!url) {
      return { ok: false, error: "服务端未返回文件地址" };
    }
    return { ok: true, url };
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    setMessage("");
    setFileNotice(null);
    try {
      const res = await fetch("/api/admin/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessage("保存成功");
      setEditing(null);
      fetchTemplates();
    } catch (err) {
      setMessage(`保存失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(`确定要删除模板 "${id}" 吗？`)) return;
    await fetch(`/api/admin/templates/${id}`, { method: "DELETE" });
    fetchTemplates();
  }

  function updateField<K extends keyof TemplateRow>(key: K, value: TemplateRow[K]) {
    setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateEditableFields(fields: EditableFields) {
    setEditing((prev) => (prev ? { ...prev, editable_fields: fields } : prev));
  }

  // 文案字段管理
  function addTextField() {
    const fields = editing?.editable_fields ?? EMPTY_FIELDS;
    updateEditableFields({
      ...fields,
      texts: [...fields.texts, { key: "", label: "", defaultValue: "", defaultColor: "#000000" }],
    });
  }

  function removeTextField(idx: number) {
    const fields = editing?.editable_fields ?? EMPTY_FIELDS;
    updateEditableFields({
      ...fields,
      texts: fields.texts.filter((_, i) => i !== idx),
    });
  }

  function updateTextField(idx: number, patch: Partial<TemplateField>) {
    const fields = editing?.editable_fields ?? EMPTY_FIELDS;
    updateEditableFields({
      ...fields,
      texts: fields.texts.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    });
  }

  // 图片字段管理
  function addImageField() {
    const fields = editing?.editable_fields ?? EMPTY_FIELDS;
    updateEditableFields({
      ...fields,
      images: [...fields.images, { key: "", label: "", defaultSrc: "" }],
    });
  }

  function removeImageField(idx: number) {
    const fields = editing?.editable_fields ?? EMPTY_FIELDS;
    updateEditableFields({
      ...fields,
      images: fields.images.filter((_, i) => i !== idx),
    });
  }

  function updateImageField(idx: number, patch: Partial<TemplateField>) {
    const fields = editing?.editable_fields ?? EMPTY_FIELDS;
    updateEditableFields({
      ...fields,
      images: fields.images.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    });
  }

  function addColorScheme() {
    const fields = editing?.editable_fields ?? EMPTY_FIELDS;
    updateEditableFields({
      ...fields,
      colors: [...fields.colors, { name: "", values: { primary: "#666666" } }],
    });
  }

  function removeColorScheme(idx: number) {
    const fields = editing?.editable_fields ?? EMPTY_FIELDS;
    updateEditableFields({
      ...fields,
      colors: fields.colors.filter((_, i) => i !== idx),
    });
  }

  function updateColorScheme(idx: number, patch: Partial<EditableFields["colors"][number]>) {
    const fields = editing?.editable_fields ?? EMPTY_FIELDS;
    updateEditableFields({
      ...fields,
      colors: fields.colors.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    });
  }

  function setColorSchemeValue(idx: number, key: string, value: string) {
    const fields = editing?.editable_fields ?? EMPTY_FIELDS;
    const scheme = fields.colors[idx];
    if (!scheme) return;
    updateColorScheme(idx, { values: { ...scheme.values, [key]: value } });
  }

  function removeColorSchemeValue(idx: number, key: string) {
    const fields = editing?.editable_fields ?? EMPTY_FIELDS;
    const scheme = fields.colors[idx];
    if (!scheme) return;
    const next = { ...scheme.values };
    delete next[key];
    updateColorScheme(idx, { values: next });
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedUrl(text);
      setTimeout(() => setCopiedUrl(null), 1500);
    });
  }

  if (!dbReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4 rounded-xl bg-white p-8 shadow-sm">
          <Database className="size-10 text-gray-400" />
          <p className="text-sm text-gray-500">数据库未初始化</p>
          <button onClick={handleInitDb} className="rounded-lg bg-gray-900 px-6 py-2 text-sm font-medium text-white hover:bg-gray-800">
            初始化数据库
          </button>
          {message && <p className="text-xs text-gray-400">{message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶栏 */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-gray-700">
            <ArrowLeft className="size-4" />
            首页
          </Link>
          <span className="h-4 w-px bg-gray-200" />
          <h1 className="text-lg font-semibold text-gray-900">管理后台</h1>
        </div>
        <div className="flex min-w-0 shrink items-center gap-3">
          {message && (
            <span className="max-w-[min(320px,45vw)] shrink-0 truncate text-xs text-gray-600" title={message}>
              {message}
            </span>
          )}
          
        </div>
      </header>

      {/* Tab 切换栏 */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl gap-6 px-6">
          {(["psd", "html"] as const).map((tab) => {
            const active = adminTab === tab;
            const label = tab === "html" ? "HTML 模板" : "PSD 模板";
            return (
              <button
                key={tab}
                onClick={() => setAdminTab(tab)}
                className={[
                  "border-b-2 py-3 text-sm font-medium transition-colors",
                  active
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-400 hover:text-gray-600",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* PSD Tab */}
      {adminTab === "psd" && (
        <div className="mx-auto max-w-5xl p-6">
          <PsdManager />
        </div>
      )}

      {/* HTML Tab */}
      <div className={adminTab === "html" ? "" : "hidden"}>
      <div className="mx-auto max-w-5xl p-6">
        {/* HTML 上传区 */}
        {!editing && (
          <div className="mb-6 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
            {htmlUploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="size-8 animate-spin text-gray-400" />
                <p className="text-sm text-gray-500">正在上传并解析 HTML 模板...</p>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-3">
                <Upload className="size-8 text-gray-400" />
                <p className="text-sm text-gray-600">点击选择 HTML 模板文件上传</p>
                <p className="text-xs text-gray-400">支持 .html 格式，上传后自动识别宽高和可编辑字段</p>
                <input
                  type="file"
                  accept=".html"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setHtmlUploading(true);
                    try {
                      const buf = await file.arrayBuffer();
                      const text = new TextDecoder().decode(buf);
                      setLastHtmlContent(text);
                      const wMatch = text.match(/width:\s*(\d+)px/);
                      const hMatch = text.match(/height:\s*(\d+)px/);
                      const parsed = parseFieldsFromHtml(text);
                      const uploadFile = new File([buf], file.name, { type: file.type || "text/html" });
                      const result = await handleUpload(uploadFile, "templates");
                      const newTpl = emptyTemplate();
                      newTpl.name = file.name.replace(/\.html?$/i, "");
                      if (wMatch) newTpl.width = Number(wMatch[1]);
                      if (hMatch) newTpl.height = Number(hMatch[1]);
                      if (result.ok) newTpl.html_file = result.url;
                      if (parsed.texts.length || parsed.images.length) {
                        newTpl.editable_fields = {
                          ...(newTpl.editable_fields ?? { ...EMPTY_FIELDS }),
                          texts: parsed.texts,
                          images: parsed.images,
                        };
                      }
                      setEditing(newTpl);
                      const parts = ["HTML 已上传"];
                      if (wMatch || hMatch) parts.push("宽高已解析");
                      const fc = parsed.texts.length + parsed.images.length;
                      if (fc > 0) parts.push(`识别到 ${parsed.texts.length} 个文案字段、${parsed.images.length} 个图片字段`);
                      const line = parts.join("；") + "。";
                      setMessage(line);
                      setFileNotice({ variant: "success", text: line });
                    } catch (err) {
                      setMessage(`HTML 上传失败：${err instanceof Error ? err.message : "网络错误"}`);
                    } finally {
                      setHtmlUploading(false);
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        )}

        {/* 模板列表 */}
        <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Upload className="size-4" />
          已有 HTML 模板
        </h3>
        {loading ? (
          <p className="py-10 text-center text-sm text-gray-400">加载中...</p>
        ) : templates.length === 0 && !editing ? (
          <p className="py-10 text-center text-sm text-gray-300">
            暂无 HTML 模板，上传 HTML 文件开始创建
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {templates.map((tpl) => (
              <div key={tpl.id} className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-4">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                  {tpl.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tpl.thumbnail} alt={tpl.name} className="size-full object-cover" />
                  ) : (
                    <Upload className="size-6 text-gray-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{tpl.name}</p>
                  <p className="text-xs text-gray-400">
                    {tpl.category} · {tpl.width}×{tpl.height}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => setEditing({ ...tpl })}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(tpl.id)}
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

        {/* 字体管理 */}
        <details className="mt-6 rounded-xl border border-gray-200 bg-white">
          <summary className="cursor-pointer px-6 py-4 text-sm font-semibold text-gray-900 select-none">
            字体管理
          </summary>
          <div className="border-t border-gray-100 px-6 py-4">
            <div className="mb-3 flex items-center gap-3">
              <input
                value={fontFolder}
                onChange={(e) => setFontFolder(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
                className="w-36 rounded-lg border border-gray-200 px-3 py-1.5 text-xs outline-none focus:border-gray-400"
                placeholder="子文件夹（如 molly）"
              />
              <label className={[
                "flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs transition-colors",
                fontUploading ? "pointer-events-none opacity-50" : "text-gray-500 hover:bg-gray-50",
              ].join(" ")}>
                <Upload className="size-3.5" />
                {fontUploading ? "上传中…" : "选择字体文件"}
                <input
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const files = e.target.files;
                    if (!files || files.length === 0) return;
                    setFontUploading(true);
                    const folder = fontFolder ? `fonts/${fontFolder}` : "fonts";
                    for (const file of Array.from(files)) {
                      try {
                        const form = new FormData();
                        form.append("file", file);
                        form.append("folder", folder);
                        const res = await fetch("/api/admin/upload", { method: "POST", body: form });
                        const data = await res.json();
                        if (res.ok) {
                          const cleanPath = fontFolder ? `${fontFolder}/${file.name}` : file.name;
                          setUploadedFonts((prev) => [
                            ...prev,
                            { name: file.name, url: `/api/fonts/${cleanPath}`, folder: fontFolder || "(根)" },
                          ]);
                        } else {
                          setMessage(`字体上传失败：${data.error}`);
                        }
                      } catch (err) {
                        setMessage(`字体上传失败：${err instanceof Error ? err.message : "网络错误"}`);
                      }
                    }
                    setFontUploading(false);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <p className="mb-3 text-xs text-gray-400">
              上传后在 HTML 模板中用 <code className="rounded bg-gray-100 px-1">url(&apos;/api/fonts/子文件夹/字体名.ttf&apos;)</code> 引用
            </p>
            {uploadedFonts.length === 0 ? (
              <p className="py-3 text-center text-xs text-gray-300">暂无已上传字体</p>
            ) : (
              <div className="space-y-1.5">
                {uploadedFonts.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1.5">
                    <span className="shrink-0 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500">
                      {f.folder}
                    </span>
                    <span className="shrink-0 text-xs text-gray-600 w-40 truncate" title={f.name}>
                      {f.name}
                    </span>
                    <input
                      readOnly
                      value={f.url}
                      className="min-w-0 flex-1 bg-transparent text-xs text-gray-500 outline-none"
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(f.url)}
                      className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
                      title="复制 URL"
                    >
                      {copiedUrl === f.url ? (
                        <Check className="size-3 text-emerald-500" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>

        {/* 编辑表单 */}
        {editing && (
          <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">
              {editing.id && templates.some((t) => t.id === editing.id) ? "编辑模板" : "新增模板"}
            </h2>

            {fileNotice && (
              <p
                role="status"
                className={
                  fileNotice.variant === "success"
                    ? "mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
                    : "mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
                }
              >
                {fileNotice.text}
              </p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">模板 ID（自动生成）</span>
                <span className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-400">
                  {editing.id}
                </span>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">模板名称</span>
                <input
                  value={editing.name ?? ""}
                  onChange={(e) => updateField("name", e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                  placeholder="如：会场头图 Banner"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">分类</span>
                <select
                  value={editing.category ?? ""}
                  onChange={(e) => updateField("category", e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">排序（数字越小越靠前）</span>
                <input
                  type="number"
                  value={editing.sort_order ?? 0}
                  onChange={(e) => updateField("sort_order", Number(e.target.value))}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">宽度 (px)</span>
                <input
                  type="number"
                  value={editing.width ?? 750}
                  onChange={(e) => updateField("width", Number(e.target.value))}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">高度 (px)</span>
                <input
                  type="number"
                  value={editing.height ?? 810}
                  onChange={(e) => updateField("height", Number(e.target.value))}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                />
              </label>
            </div>

            {/* 文件上传区域 */}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0 flex flex-col gap-1">
                <span className="text-xs text-gray-500">缩略图</span>
                <div className="flex min-w-0 items-center gap-2">
                  <input
                    value={editing.thumbnail ?? ""}
                    onChange={(e) => updateField("thumbnail", e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                    placeholder="URL 或上传文件"
                    spellCheck={false}
                  />
                  <label className={[
                    "flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs",
                    thumbUploading ? "pointer-events-none opacity-50" : "cursor-pointer text-gray-500 hover:bg-gray-50",
                  ].join(" ")}>
                    {thumbUploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                    {thumbUploading ? "上传中…" : "上传"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setThumbUploading(true);
                        try {
                          const result = await handleUpload(file, "thumbnails");
                          if (result.ok) {
                            updateField("thumbnail", result.url);
                            const line = "缩略图已上传，链接已填入上方输入框。";
                            setMessage(line);
                            setFileNotice({ variant: "success", text: line });
                          } else {
                            const line = `缩略图上传失败：${result.error}`;
                            setMessage(line);
                            setFileNotice({ variant: "error", text: line });
                          }
                        } catch (err) {
                          const line = `缩略图上传失败：${err instanceof Error ? err.message : "网络错误"}`;
                          setMessage(line);
                          setFileNotice({ variant: "error", text: line });
                        } finally {
                          setThumbUploading(false);
                        }
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {editing.thumbnail ? (
                  <>
                    <p className="mt-1 text-xs text-gray-500">预览</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={editing.thumbnail}
                      src={editing.thumbnail}
                      alt="缩略图预览"
                      className="mt-0.5 h-24 max-w-full rounded-lg border border-gray-100 object-contain"
                    />
                  </>
                ) : null}
              </div>
              <div className="min-w-0 flex flex-col gap-1">
                <span className="text-xs text-gray-500">模板 HTML 文件</span>
                <div className="flex min-w-0 items-center gap-2">
                  <input
                    value={editing.html_file ?? ""}
                    onChange={(e) => updateField("html_file", e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                    placeholder="URL 或上传 .html 文件"
                    spellCheck={false}
                  />
                  <label className={[
                    "flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-xs",
                    htmlUploading ? "pointer-events-none opacity-50" : "cursor-pointer text-gray-500 hover:bg-gray-50",
                  ].join(" ")}>
                    {htmlUploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                    {htmlUploading ? "上传中…" : "上传"}
                    <input
                      type="file"
                      accept=".html"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setHtmlUploading(true);
                        try {
                          const buf = await file.arrayBuffer();
                          const text = new TextDecoder().decode(buf);
                          setLastHtmlContent(text);
                          const wMatch = text.match(/width:\s*(\d+)px/);
                          const hMatch = text.match(/height:\s*(\d+)px/);
                          const parsed = parseFieldsFromHtml(text);
                          const uploadFile = new File([buf], file.name, {
                            type: file.type || "text/html",
                          });
                          const result = await handleUpload(uploadFile, "templates");
                          setEditing((prev) => {
                            if (!prev) return prev;
                            const next = { ...prev };
                            if (wMatch) next.width = Number(wMatch[1]);
                            if (hMatch) next.height = Number(hMatch[1]);
                            if (result.ok) next.html_file = result.url;
                            if (parsed.texts.length || parsed.images.length) {
                              const existing = next.editable_fields ?? { ...EMPTY_FIELDS };
                              const hasContent =
                                existing.texts.length > 0 || existing.images.length > 0;
                              if (!hasContent) {
                                next.editable_fields = {
                                  ...existing,
                                  texts: parsed.texts,
                                  images: parsed.images,
                                };
                              }
                            }
                            return next;
                          });
                          const fieldCount = parsed.texts.length + parsed.images.length;
                          if (result.ok) {
                            const parts = [
                              "HTML 已上传",
                              "宽高已解析",
                            ];
                            if (fieldCount > 0) {
                              parts.push(
                                `识别到 ${parsed.texts.length} 个文案字段、${parsed.images.length} 个图片字段`,
                              );
                            }
                            const line = parts.join("；") + "。";
                            setMessage(line);
                            setFileNotice({ variant: "success", text: line });
                          } else {
                            const line = `HTML 上传失败：${result.error}`;
                            setMessage(line);
                            setFileNotice({ variant: "error", text: line });
                          }
                        } catch (err) {
                          const line = `HTML 上传失败：${err instanceof Error ? err.message : "网络错误"}`;
                          setMessage(line);
                          setFileNotice({ variant: "error", text: line });
                        } finally {
                          setHtmlUploading(false);
                        }
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {editing.html_file ? (
                  <a
                    href={editing.html_file}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 truncate text-xs text-blue-600 underline hover:text-blue-800"
                    title={editing.html_file}
                  >
                    在新标签页打开已上传 HTML
                  </a>
                ) : null}
              </div>
            </div>

            {/* 自动识别按钮 */}
            {lastHtmlContent && (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => {
                    const parsed = parseFieldsFromHtml(lastHtmlContent);
                    if (!parsed.texts.length && !parsed.images.length) {
                      setFileNotice({
                        variant: "error",
                        text: "未能从 HTML 中识别到任何 params.get() 字段。",
                      });
                      return;
                    }
                    setEditing((prev) => {
                      if (!prev) return prev;
                      return {
                        ...prev,
                        editable_fields: {
                          ...(prev.editable_fields ?? { ...EMPTY_FIELDS }),
                          texts: parsed.texts,
                          images: parsed.images,
                        },
                      };
                    });
                    setFileNotice({
                      variant: "success",
                      text: `已从 HTML 重新识别：${parsed.texts.length} 个文案字段、${parsed.images.length} 个图片字段（已覆盖原有字段）。`,
                    });
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
                >
                  <Sparkles className="size-3.5" />
                  从 HTML 重新识别字段
                </button>
              </div>
            )}

            {/* 可编辑字段 - 文案 */}
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">文案字段</span>
                <button onClick={addTextField} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600">
                  <Plus className="size-3" /> 添加
                </button>
              </div>
              {(editing.editable_fields?.texts ?? []).length === 0 && (
                <p className="py-2 text-center text-xs text-gray-300">
                  暂无文案字段{lastHtmlContent ? "" : "，上传 HTML 后可自动识别"}
                </p>
              )}
              {(editing.editable_fields?.texts ?? []).map((t, i) => (
                <div key={i} className="mb-2 flex items-center gap-2">
                  <input
                    value={t.key}
                    onChange={(e) => updateTextField(i, { key: e.target.value })}
                    className="w-28 rounded border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-gray-400"
                    placeholder="key"
                  />
                  <input
                    value={t.label}
                    onChange={(e) => updateTextField(i, { label: e.target.value })}
                    className="w-24 rounded border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-gray-400"
                    placeholder="标签"
                  />
                  <input
                    value={t.defaultValue ?? ""}
                    onChange={(e) => updateTextField(i, { defaultValue: e.target.value })}
                    className="flex-1 rounded border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-gray-400"
                    placeholder="默认值"
                  />
                  <input
                    value={t.defaultColor ?? "#000000"}
                    onChange={(e) => updateTextField(i, { defaultColor: e.target.value })}
                    className="w-20 rounded border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-gray-400"
                    placeholder="默认颜色"
                  />
                  <button onClick={() => removeTextField(i)} className="text-red-300 hover:text-red-500">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* 可编辑字段 - 图片 */}
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">图片字段</span>
                <button onClick={addImageField} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600">
                  <Plus className="size-3" /> 添加
                </button>
              </div>
              {(editing.editable_fields?.images ?? []).length === 0 && (
                <p className="py-2 text-center text-xs text-gray-300">
                  暂无图片字段{lastHtmlContent ? "" : "，上传 HTML 后可自动识别"}
                </p>
              )}
              {(editing.editable_fields?.images ?? []).map((t, i) => (
                <div key={i} className="mb-2 flex items-center gap-2">
                  <input
                    value={t.key}
                    onChange={(e) => updateImageField(i, { key: e.target.value })}
                    className="w-28 rounded border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-gray-400"
                    placeholder="key"
                  />
                  <input
                    value={t.label}
                    onChange={(e) => updateImageField(i, { label: e.target.value })}
                    className="w-24 rounded border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-gray-400"
                    placeholder="标签"
                  />
                  <input
                    value={t.defaultSrc ?? ""}
                    onChange={(e) => updateImageField(i, { defaultSrc: e.target.value })}
                    className="flex-1 rounded border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-gray-400"
                    placeholder="默认图片 URL"
                  />
                  <button onClick={() => removeImageField(i)} className="text-red-300 hover:text-red-500">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* 素材上传区 */}
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">素材上传</span>
                <label className={[
                  "flex items-center gap-1 text-xs",
                  assetUploading ? "pointer-events-none opacity-50" : "cursor-pointer text-blue-500 hover:text-blue-600",
                ].join(" ")}>
                  {assetUploading ? <Loader2 className="size-3 animate-spin" /> : <ImagePlus className="size-3" />}
                  {assetUploading ? "上传中…" : "上传图片"}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = e.target.files;
                      if (!files || files.length === 0) return;
                      setAssetUploading(true);
                      let count = 0;
                      for (const file of Array.from(files)) {
                        try {
                          const result = await handleUpload(file, "uploads");
                          if (result.ok) {
                            setUploadedAssets((prev) => [
                              ...prev,
                              { name: file.name, url: result.url },
                            ]);
                            count++;
                          } else {
                            setFileNotice({ variant: "error", text: `${file.name} 上传失败：${result.error}` });
                          }
                        } catch (err) {
                          setFileNotice({ variant: "error", text: `${file.name} 上传失败：${err instanceof Error ? err.message : "网络错误"}` });
                        }
                      }
                      setAssetUploading(false);
                      e.target.value = "";
                      if (count > 0) {
                        setFileNotice({ variant: "success", text: `已上传 ${count} 个素材文件。点击 URL 旁的复制按钮可复制链接。` });
                      }
                    }}
                  />
                </label>
              </div>
              {uploadedAssets.length === 0 ? (
                <p className="py-2 text-center text-xs text-gray-300">
                  上传背景图等素材，获取 URL 用于配色方案
                </p>
              ) : (
                <div className="space-y-1.5">
                  {uploadedAssets.map((asset, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1.5">
                      <span className="shrink-0 text-xs text-gray-500 w-24 truncate" title={asset.name}>
                        {asset.name}
                      </span>
                      <input
                        readOnly
                        value={asset.url}
                        className="min-w-0 flex-1 bg-transparent text-xs text-gray-600 outline-none"
                        onFocus={(e) => e.target.select()}
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(asset.url)}
                        className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
                        title="复制 URL"
                      >
                        {copiedUrl === asset.url ? (
                          <Check className="size-3 text-emerald-500" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 配色方案 */}
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">配色方案</span>
                <button onClick={addColorScheme} className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600">
                  <Plus className="size-3" /> 添加方案
                </button>
              </div>
              {(editing.editable_fields?.colors ?? []).length === 0 && (
                <p className="py-2 text-center text-xs text-gray-300">
                  暂无配色方案。添加后用户可在编辑器中切换不同风格。
                </p>
              )}
              {(editing.editable_fields?.colors ?? []).map((scheme, schemeIdx) => {
                const valueKeys = Object.keys(scheme.values);
                return (
                  <div key={schemeIdx} className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <input
                        type="color"
                        value={scheme.values.primary || "#666666"}
                        onChange={(e) => setColorSchemeValue(schemeIdx, "primary", e.target.value)}
                        className="size-7 shrink-0 cursor-pointer rounded border border-gray-200"
                        title="展示色（编辑器色块）"
                      />
                      <input
                        value={scheme.name}
                        onChange={(e) => updateColorScheme(schemeIdx, { name: e.target.value })}
                        className="flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs outline-none focus:border-gray-400"
                        placeholder="方案名称（如：热辣红）"
                      />
                      <button
                        onClick={() => removeColorScheme(schemeIdx)}
                        className="text-red-300 hover:text-red-500"
                        title="删除此方案"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>

                    {valueKeys
                      .filter((k) => k !== "primary")
                      .map((k) => (
                        <div key={k} className="mb-1.5 flex items-center gap-2">
                          <span className="w-28 shrink-0 truncate text-xs text-gray-500" title={k}>
                            {camelToLabel(k)}（{k}）
                          </span>
                          <input
                            value={scheme.values[k] ?? ""}
                            onChange={(e) => setColorSchemeValue(schemeIdx, k, e.target.value)}
                            className="min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs outline-none focus:border-gray-400"
                            placeholder="值"
                          />
                          <label className="flex shrink-0 cursor-pointer items-center rounded border border-gray-200 bg-white p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="上传图片作为值">
                            <Upload className="size-3" />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const result = await handleUpload(file, "uploads");
                                if (result.ok) {
                                  setColorSchemeValue(schemeIdx, k, result.url);
                                } else {
                                  setFileNotice({ variant: "error", text: `上传失败：${result.error}` });
                                }
                                e.target.value = "";
                              }}
                            />
                          </label>
                          <button
                            onClick={() => removeColorSchemeValue(schemeIdx, k)}
                            className="text-red-300 hover:text-red-500"
                            title="删除此参数"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      ))}

                    <div className="mt-2 flex items-center gap-2">
                      <select
                        className="flex-1 rounded border border-dashed border-gray-300 bg-white px-2 py-1 text-xs text-gray-500 outline-none"
                        value=""
                        onChange={(e) => {
                          const key = e.target.value;
                          if (key && !scheme.values[key]) {
                            setColorSchemeValue(schemeIdx, key, "");
                          }
                        }}
                      >
                        <option value="">+ 添加参数…</option>
                        {(editing.editable_fields?.images ?? [])
                          .map((f) => ({ key: f.key, label: f.label || camelToLabel(f.key) }))
                          .filter(({ key }) => !scheme.values[key])
                          .map(({ key, label }) => (
                            <option key={key} value={key}>{label}（{key}）</option>
                          ))}
                        {(editing.editable_fields?.texts ?? [])
                          .map((f) => ({ key: f.key, label: f.label || camelToLabel(f.key) }))
                          .filter(({ key }) => !scheme.values[key])
                          .map(({ key, label }) => (
                            <option key={key} value={key}>{label}（{key}）</option>
                          ))}
                        {[
                          { key: "fontColor", label: "字体颜色" },
                          { key: "bgColor", label: "背景色" },
                          { key: "btnColor", label: "按钮颜色" },
                        ].filter(({ key }) => !scheme.values[key]).map(({ key, label }) => (
                          <option key={key} value={key}>{label}（{key}）</option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 操作按钮 */}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setEditing(null);
                  setMessage("");
                  setFileNotice(null);
                }}
                className="rounded-lg border border-gray-200 px-4 py-2 text-xs text-gray-500 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-gray-900 px-6 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
