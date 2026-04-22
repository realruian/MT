"use client";

import { useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ChevronDown } from "lucide-react";
import type { PsdLayer, Template } from "@/types/template";
import { FONT_FAMILIES } from "@/lib/fonts";

interface PropertyPanelProps {
  template: Template;
  layers: PsdLayer[];
  editState: Record<string, Partial<PsdLayer>>;
  selection: { moduleId?: string; layerId?: string } | null;
  onUpdate: (id: string, updates: Partial<PsdLayer>) => void;
  onReplaceModule: (moduleId: string) => void;
  onDeleteModule: (moduleId: string) => void;
}

type StrKey =
  | "fontFamily"
  | "fontWeight"
  | "textAlign"
  | "fontColor"
  | "textContent";
type NumKey =
  | "fontSize"
  | "lineHeight"
  | "letterSpacing"
  | "opacity"
  | "x"
  | "y";

/** DB 历史值兼容："normal"→400，"bold"→700；已是数字字符串则原样 */
function normalizeWeight(w: string | undefined): string {
  if (!w) return "400";
  if (w === "normal") return "400";
  if (w === "bold") return "700";
  return w;
}

/** 输入框通用样式 */
const inputCls =
  "h-8 rounded-md border border-[#e5e5e5] bg-[#f5f5f5] px-2 text-sm text-[#11192D] outline-none focus:border-[#bbb]";
export function PropertyPanel({
  template,
  layers,
  editState,
  selection,
  onUpdate,
  onReplaceModule,
  onDeleteModule,
}: PropertyPanelProps) {
  const canvasW = template.canvasWidth ?? template.width;
  const canvasH = template.canvasHeight ?? template.height;

  const selectedLayer = selection?.layerId
    ? layers.find((l) => l.id === selection.layerId) ?? null
    : null;

  // 仅一级选中（选了模块但没二级选中到具体元素）
  const selectedGroup =
    selection?.moduleId && !selection?.layerId
      ? layers.find((l) => l.id === selection.moduleId) ?? null
      : null;

  const eff = <K extends keyof PsdLayer>(layer: PsdLayer, key: K): PsdLayer[K] => {
    const o = editState[layer.id];
    if (o && o[key] !== undefined) return o[key] as PsdLayer[K];
    return layer[key];
  };

  const setStr = (layer: PsdLayer, key: StrKey, val: string) => {
    onUpdate(layer.id, { [key]: val } as Partial<PsdLayer>);
  };

  const setNum = (layer: PsdLayer, key: NumKey, raw: string) => {
    const v = raw === "" ? undefined : Number(raw);
    onUpdate(layer.id, { [key]: v } as Partial<PsdLayer>);
  };

  /** 模块级 X/Y 修改：delta 批量应用到模块自身 + 所有子层（视觉上整体平移） */
  const setModulePos = (group: PsdLayer, key: "x" | "y", raw: string) => {
    if (raw === "") return;
    const newVal = Number(raw);
    if (Number.isNaN(newVal)) return;
    const currentVal = eff(group, key) as number;
    const delta = newVal - currentVal;
    if (delta === 0) return;
    onUpdate(group.id, { [key]: Math.round(newVal) } as Partial<PsdLayer>);
    for (const c of layers.filter((l) => l.parentId === group.id)) {
      onUpdate(c.id, {
        [key]: Math.round((eff(c, key) as number) + delta),
      } as Partial<PsdLayer>);
    }
  };

  const isText = selectedLayer?.layerType === "text";
  const isImage =
    selectedLayer?.layerType === "image" ||
    selectedLayer?.layerType === "background";

  return (
    <aside className="flex w-[240px] shrink-0 flex-col gap-6 overflow-y-auto border-l border-[#eee] px-3 py-5">
      {/* 状态 1：什么都没选中 → 仅显示画布尺寸 */}
      {!selectedLayer && !selectedGroup && (
        <section>
          <h3 className="mb-3 text-[14px] text-[#11192D]">画布尺寸</h3>
          <div className="grid grid-cols-2 gap-2">
            <FieldBox label="W">
              <FieldValue>{canvasW}</FieldValue>
            </FieldBox>
            <FieldBox label="H">
              <FieldValue>{canvasH}</FieldValue>
            </FieldBox>
          </div>
        </section>
      )}

      {/* 仅一级选中模块：选中模块 X/Y 可编辑，W/H readonly；delta 同步应用到子图层 */}
      {!selectedLayer && selectedGroup && (
        <section>
          <h3 className="mb-3 text-[14px] text-[#11192D]">选中模块</h3>
          <div className="grid grid-cols-2 gap-2">
            <FieldBox label="X">
              <input
                type="number"
                value={Math.round(eff(selectedGroup, "x") as number)}
                onChange={(e) => setModulePos(selectedGroup, "x", e.target.value)}
                className={fieldInputCls}
              />
            </FieldBox>
            <FieldBox label="Y">
              <input
                type="number"
                value={Math.round(eff(selectedGroup, "y") as number)}
                onChange={(e) => setModulePos(selectedGroup, "y", e.target.value)}
                className={fieldInputCls}
              />
            </FieldBox>
            <FieldBox label="W">
              <FieldValue>
                {Math.round(eff(selectedGroup, "width") as number)}
              </FieldValue>
            </FieldBox>
            <FieldBox label="H">
              <FieldValue>
                {Math.round(eff(selectedGroup, "height") as number)}
              </FieldValue>
            </FieldBox>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled
              title="即将支持"
              onClick={() => onReplaceModule(selectedGroup.id)}
              className="flex-1 cursor-not-allowed rounded-md border border-[#e5e5e5] bg-[#f5f5f5] px-3 py-2 text-sm text-[#bbb]"
            >
              替换
            </button>
            <button
              type="button"
              onClick={() => onDeleteModule(selectedGroup.id)}
              className="flex-1 rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-500 hover:bg-red-50"
            >
              删除
            </button>
          </div>
        </section>
      )}

      {/* 状态 2 / 3：选中元素 → 公共的 X/Y/W/H 网格 */}
      {selectedLayer && (
        <section>
          <h3 className="mb-3 text-[14px] text-[#11192D]">选中元素</h3>
          <div className="grid grid-cols-2 gap-2">
            <FieldBox label="X">
              <input
                type="number"
                value={Math.round(eff(selectedLayer, "x") as number)}
                onChange={(e) => setNum(selectedLayer, "x", e.target.value)}
                className={fieldInputCls}
              />
            </FieldBox>
            <FieldBox label="Y">
              <input
                type="number"
                value={Math.round(eff(selectedLayer, "y") as number)}
                onChange={(e) => setNum(selectedLayer, "y", e.target.value)}
                className={fieldInputCls}
              />
            </FieldBox>
            <FieldBox label="W">
              <FieldValue>
                {Math.round(eff(selectedLayer, "width") as number)}
              </FieldValue>
            </FieldBox>
            <FieldBox label="H">
              <FieldValue>
                {Math.round(eff(selectedLayer, "height") as number)}
              </FieldValue>
            </FieldBox>
          </div>
        </section>
      )}

      {/* 状态 2：文字元素专属 —— 文字 + 填充颜色 */}
      {selectedLayer && isText && (
        <>
          <section>
            <h3 className="mb-3 text-[14px] text-[#11192D]">文字</h3>
            <TextFields layer={selectedLayer} eff={eff} setStr={setStr} setNum={setNum} />
          </section>
          <section>
            <h3 className="mb-3 text-[14px] text-[#11192D]">填充颜色</h3>
            <ColorField layer={selectedLayer} eff={eff} setStr={setStr} />
          </section>
        </>
      )}

      {/* 状态 3：图片元素专属 —— 替换图片 */}
      {selectedLayer && isImage && (
        <section>
          <h3 className="mb-3 text-[14px] text-[#11192D]">图片</h3>
          <ImageField
            layer={selectedLayer}
            effWidth={eff(selectedLayer, "width") as number}
            onUpdate={onUpdate}
          />
        </section>
      )}

      {/* 状态 2 / 3 共用：不透明度 */}
      {selectedLayer && (isText || isImage) && (
        <section>
          <h3 className="mb-3 text-[14px] text-[#11192D]">不透明度</h3>
          <OpacityField layer={selectedLayer} eff={eff} setNum={setNum} />
        </section>
      )}
    </aside>
  );
}

// --- 子组件（提到顶层，避免父 re-render 时被当成新类型而 unmount，导致 textarea 焦点丢失） ---

/** 统一的字段胶囊：灰底圆角 + 12px 左右内边距。
 *  - label：左侧前缀，可为文字字符串（"X" / "W"）或 icon（ReactNode），省略则无前缀
 *  - trailing：右侧尾部（常用于 ChevronDown 箭头）
 *  - fullWidth：grid 中占满整行（col-span-2）*/
function FieldBox({
  label,
  children,
  trailing,
  fullWidth,
}: {
  label?: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={[
        "flex h-8 min-w-0 items-center gap-2 rounded-[8px] bg-[#eaecf0] px-3",
        fullWidth ? "col-span-2" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label != null && (
        <span className="flex shrink-0 items-center text-[14px] text-[#7c889c]">
          {label}
        </span>
      )}
      {children}
      {trailing != null && (
        <span className="flex shrink-0 items-center text-[#7c889c]">
          {trailing}
        </span>
      )}
    </div>
  );
}

/** 胶囊内 readonly 数值展示 */
function FieldValue({ children }: { children: ReactNode }) {
  return (
    <span className="min-w-0 flex-1 truncate text-[14px] text-[#11192D]">
      {children}
    </span>
  );
}

/** 胶囊内 number input（隐藏 spinner 箭头 + 透明底） */
const fieldInputCls =
  "min-w-0 flex-1 bg-transparent text-[14px] text-[#11192D] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/** 胶囊内 select（appearance-none 去掉浏览器原生箭头 + 透明底 + pointer-events-none：
 *  只允许点击右侧 chevron 按钮触发下拉，禁用在文字上直接点开，保留键盘 tab/space 访问） */
const fieldSelectCls =
  "min-w-0 flex-1 pointer-events-none appearance-none bg-transparent text-[14px] text-[#11192D] outline-none";

/** 胶囊内下拉选择字段：chevron 是唯一的鼠标触发点。
 *  用 showPicker() 打开原生下拉，Chrome 99+/Firefox 106+/Safari 17.4+ 支持。 */
function SelectFieldBox({
  value,
  onChange,
  options,
  fullWidth,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  fullWidth?: boolean;
  label?: ReactNode;
}) {
  const ref = useRef<HTMLSelectElement>(null);
  return (
    <FieldBox
      fullWidth={fullWidth}
      label={label}
      trailing={
        <button
          type="button"
          aria-label="打开选项"
          onClick={() => ref.current?.showPicker?.()}
          className="flex shrink-0 items-center text-[#7c889c] transition-colors hover:text-[#11192D]"
        >
          <ChevronDown className="size-4" />
        </button>
      }
    >
      <select
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={fieldSelectCls}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldBox>
  );
}

/** 行高 icon（引用 public/icons/行高.svg） */
function LineHeightIcon() {
  return (
    <Image
      src="/icons/行高.svg"
      alt=""
      width={16}
      height={16}
      className="size-4"
      aria-hidden
    />
  );
}

/** 字间距 icon（引用 public/icons/字间距.svg） */
function LetterSpacingIcon() {
  return (
    <Image
      src="/icons/字间距.svg"
      alt=""
      width={16}
      height={16}
      className="size-4"
      aria-hidden
    />
  );
}

/** 通用尾部下拉箭头 */
function FieldChevron() {
  return <ChevronDown className="size-4" />;
}

interface EffFn {
  <K extends keyof PsdLayer>(l: PsdLayer, k: K): PsdLayer[K];
}

function TextFields({
  layer,
  eff,
  setStr,
  setNum,
}: {
  layer: PsdLayer;
  eff: EffFn;
  setStr: (l: PsdLayer, k: StrKey, v: string) => void;
  setNum: (l: PsdLayer, k: NumKey, v: string) => void;
}) {
  const fontFamily = (eff(layer, "fontFamily") as string | undefined) ?? "";
  const fontWeight = normalizeWeight(eff(layer, "fontWeight") as string | undefined);
  const fontSize = eff(layer, "fontSize") as number | undefined;
  const lineHeight = eff(layer, "lineHeight") as number | undefined;
  const letterSpacing = eff(layer, "letterSpacing") as number | undefined;
  const textAlign = (eff(layer, "textAlign") as string | undefined) ?? "left";

  // 字体下拉：若当前字体不在 FONT_FAMILIES（脏数据），前置一条"（未安装）"保留项
  const familyInList = FONT_FAMILIES.some((f) => f.family === fontFamily);
  const familyOptions = familyInList
    ? FONT_FAMILIES
    : [
        {
          family: fontFamily,
          displayName: fontFamily
            ? `${fontFamily}（未安装）`
            : "（系统默认）",
          variants: [],
        },
        ...FONT_FAMILIES,
      ];

  // 字重下拉：根据当前字体的 variants 动态；若 DB 值不在 variants 内，前置"（不支持）"保留项
  const currentFamilyObj = FONT_FAMILIES.find((f) => f.family === fontFamily);
  const availableVariants = currentFamilyObj?.variants ?? [];
  const weightInVariants = availableVariants.some((v) => v.weight === fontWeight);
  const weightOptions = weightInVariants
    ? availableVariants
    : availableVariants.length > 0
      ? [
          { weight: fontWeight, label: `${fontWeight}（不支持）`, url: "" },
          ...availableVariants,
        ]
      : [{ weight: fontWeight, label: "常规", url: "" }];

  return (
    <div className="grid grid-cols-2 gap-2">
      {/* 字体：无前缀 label，仅值 + 下拉箭头，占满整行 */}
      <SelectFieldBox
        fullWidth
        value={fontFamily}
        onChange={(v) => setStr(layer, "fontFamily", v)}
        options={familyOptions.map((f) => ({
          value: f.family,
          label: f.displayName,
        }))}
      />

      {/* 字重：无 label，带下拉箭头 */}
      <SelectFieldBox
        value={fontWeight}
        onChange={(v) => setStr(layer, "fontWeight", v)}
        options={weightOptions.map((v) => ({
          value: v.weight,
          label: v.label,
        }))}
      />

      {/* 字号：无 label，带下拉箭头（装饰性） */}
      <FieldBox trailing={<FieldChevron />}>
        <input
          type="number"
          value={fontSize ?? 12}
          onChange={(e) => setNum(layer, "fontSize", e.target.value)}
          className={fieldInputCls}
        />
      </FieldBox>

      {/* 行高：前缀 icon，带下拉箭头 */}
      <FieldBox label={<LineHeightIcon />} trailing={<FieldChevron />}>
        <input
          type="number"
          value={lineHeight ?? ""}
          onChange={(e) => setNum(layer, "lineHeight", e.target.value)}
          className={fieldInputCls}
        />
      </FieldBox>

      {/* 字间距：前缀 icon，带下拉箭头 */}
      <FieldBox label={<LetterSpacingIcon />} trailing={<FieldChevron />}>
        <input
          type="number"
          value={letterSpacing ?? ""}
          onChange={(e) => setNum(layer, "letterSpacing", e.target.value)}
          className={fieldInputCls}
        />
      </FieldBox>

      {/* 对齐按钮组：无 label，直接满行（不是 FieldBox，保留原 AlignButtons 视觉） */}
      <div className="col-span-2">
        <AlignButtons
          value={textAlign}
          onChange={(v) => setStr(layer, "textAlign", v)}
        />
      </div>
    </div>
  );
}

function ColorField({
  layer,
  eff,
  setStr,
}: {
  layer: PsdLayer;
  eff: EffFn;
  setStr: (l: PsdLayer, k: StrKey, v: string) => void;
}) {
  const rawColor = (eff(layer, "fontColor") as string | undefined) ?? "#000000";
  // <input type="color"> 只接受 #rrggbb 小写 6 位
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(rawColor)
    ? rawColor.toLowerCase()
    : "#000000";
  const display = safeColor.toUpperCase();
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={safeColor}
        onChange={(e) => setStr(layer, "fontColor", e.target.value)}
        className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-[#e5e5e5] bg-[#f5f5f5] p-1"
      />
      <input
        type="text"
        value={display}
        onChange={(e) => setStr(layer, "fontColor", e.target.value)}
        className={`${inputCls} flex-1`}
      />
    </div>
  );
}

function ImageField({
  layer,
  effWidth,
  onUpdate,
}: {
  layer: PsdLayer;
  /** 当前生效的 layer 宽（保持不变，基于它按新图比例算新高） */
  effWidth: number;
  onUpdate: (id: string, updates: Partial<PsdLayer>) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "uploads");
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "上传失败");
      }
      const json = (await res.json()) as { url?: string };
      if (!json.url) throw new Error("上传返回缺少 url");
      const url = json.url;

      // 读新图原始尺寸，保持当前显示宽度不变，按比例算新高度
      // 这样 layer bbox 自动重塑，画布 objectFit=fill 不会拉伸变形
      const nat = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = reject;
        img.src = url;
      });

      const newH =
        nat.w > 0 && effWidth > 0
          ? Math.round(effWidth * (nat.h / nat.w))
          : undefined;

      onUpdate(
        layer.id,
        newH !== undefined ? { imageUrl: url, height: newH } : { imageUrl: url },
      );
    } catch (err) {
      console.error("[image upload] failed:", err);
      alert("图片上传失败");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="flex h-8 w-full items-center justify-center rounded-md border border-[#e5e5e5] bg-[#f5f5f5] px-2 text-sm text-[#11192D] outline-none transition-colors hover:border-[#bbb] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {uploading ? "上传中…" : "替换图片"}
      </button>
    </>
  );
}

function OpacityField({
  layer,
  eff,
  setNum,
}: {
  layer: PsdLayer;
  eff: EffFn;
  setNum: (l: PsdLayer, k: NumKey, v: string) => void;
}) {
  const opacity = eff(layer, "opacity") as number | undefined;
  const percent =
    typeof opacity === "number" ? Math.round(opacity * 100) : 100;
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={0}
        max={100}
        value={percent}
        onChange={(e) =>
          setNum(layer, "opacity", String(Number(e.target.value) / 100))
        }
        className="flex-1 accent-[#3b82f6]"
      />
      <input
        type="number"
        min={0}
        max={100}
        value={percent}
        onChange={(e) =>
          setNum(layer, "opacity", String(Number(e.target.value) / 100))
        }
        className={`${inputCls} w-16 text-right`}
      />
    </div>
  );
}

function AlignButtons({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const options: { id: string; icon: React.ElementType; label: string }[] = [
    { id: "left", icon: AlignLeft, label: "左对齐" },
    { id: "center", icon: AlignCenter, label: "居中" },
    { id: "right", icon: AlignRight, label: "右对齐" },
    { id: "justify", icon: AlignJustify, label: "两端对齐" },
  ];
  return (
    <div className="flex rounded-md border border-[#e5e5e5] bg-[#f5f5f5] p-0.5">
      {options.map(({ id, icon: Icon, label }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-label={label}
            aria-pressed={active}
            onClick={() => onChange(id)}
            className={[
              "flex h-7 flex-1 items-center justify-center rounded transition-colors",
              active ? "bg-white text-[#11192D]" : "text-[#999] hover:text-[#11192D]",
            ].join(" ")}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
