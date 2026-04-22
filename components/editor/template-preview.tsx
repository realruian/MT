"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";

interface TemplatePreviewProps {
  /** 直接传入 HTML 字符串（代码生成模式） */
  html?: string;
  /** 传入 URL（真实 HTML 文件模式，含 query 参数） */
  src?: string;
  /** 模板文件的 base URL（不含编辑参数），用于判断 iframe 是否需重新加载 */
  templateBaseUrl?: string;
  width: number;
  height: number;
}

const PADDING = 200; // 容器内边距（上下 / 左右各 100px）

export const TemplatePreview = forwardRef<HTMLIFrameElement, TemplatePreviewProps>(
  ({ html, src, templateBaseUrl, width, height }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const internalRef = useRef<HTMLIFrameElement>(null);
    const prevBaseUrlRef = useRef<string | undefined>(undefined);
    const isReadyRef = useRef(false);

    const [scale, setScale] = useState(1);
    const [, setFitScale] = useState(1);
    const hasManualZoom = useRef(false);

    const STEP = 0.1;
    const MIN_SCALE = 0.1;
    const MAX_SCALE = 2;

    // 合并外部 ref 和内部 ref
    const setRef = (el: HTMLIFrameElement | null) => {
      (internalRef as React.MutableRefObject<HTMLIFrameElement | null>).current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLIFrameElement | null>).current = el;
    };

    const handleZoomIn = useCallback(() => {
      hasManualZoom.current = true;
      setScale((s) => Math.min(MAX_SCALE, Math.round((s + STEP) * 10) / 10));
    }, []);

    const handleZoomOut = useCallback(() => {
      hasManualZoom.current = true;
      setScale((s) => Math.max(MIN_SCALE, Math.round((s - STEP) * 10) / 10));
    }, []);

    const handleFit = useCallback(() => {
      const container = containerRef.current;
      if (!container) return;
      const { width: cw, height: ch } = container.getBoundingClientRect();
      const scaleX = (cw - PADDING) / width;
      const scaleY = (ch - PADDING) / height;
      hasManualZoom.current = true;
      setScale(Math.min(scaleX, scaleY));
    }, [width, height]);

    // 用 ResizeObserver 监听容器尺寸，自动计算最优缩放比例
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const observer = new ResizeObserver(([entry]) => {
        const { width: cw, height: ch } = entry.contentRect;
        const scaleX = (cw - PADDING) / width;
        const scaleY = (ch - PADDING) / height;
        const s = Math.min(0.6, scaleX, scaleY);
        setFitScale(s);
        if (!hasManualZoom.current) setScale(s);
      });

      observer.observe(container);
      return () => observer.disconnect();
    }, [width, height]);

    // HTML 字符串模式（生成模板）
    useEffect(() => {
      if (!html || src) return;
      const iframe = internalRef.current;
      if (!iframe) return;
      const doc = iframe.contentDocument;
      if (!doc) return;
      doc.open();
      doc.write(html);
      doc.close();
    }, [html, src]);

    /**
     * 从完整 src 中拆出模板 base URL 和编辑器参数。
     * 对 Blob 代理 URL（如 /api/blob/media?pathname=xxx&mainTitle=yyy），
     * templateBaseUrl 包含 ?pathname=xxx 部分，编辑器参数是后面的 &key=val。
     */
    function splitSrc(fullSrc: string): { base: string; editorSearch: string } {
      if (templateBaseUrl && fullSrc.startsWith(templateBaseUrl)) {
        const rest = fullSrc.slice(templateBaseUrl.length).replace(/^[?&]/, "");
        return { base: templateBaseUrl, editorSearch: rest };
      }
      const qIdx = fullSrc.indexOf("?");
      if (qIdx < 0) return { base: fullSrc, editorSearch: "" };
      return { base: fullSrc.slice(0, qIdx), editorSearch: fullSrc.slice(qIdx + 1) };
    }

    // URL 模式（真实 HTML 文件模板）
    // 相同 base URL 时用 postMessage 实时更新，避免 iframe 重新加载
    useEffect(() => {
      if (!src) return;
      const iframe = internalRef.current;
      if (!iframe) return;

      const { base, editorSearch } = splitSrc(src);
      const prevBase = prevBaseUrlRef.current;

      if (prevBase !== base || !isReadyRef.current) {
        isReadyRef.current = false;
        prevBaseUrlRef.current = base;
        iframe.src = src;
      } else {
        iframe.contentWindow?.postMessage({ type: "mtds:update", search: editorSearch }, "*");
      }
    }, [src, templateBaseUrl]);

    // iframe 加载完成后标记 ready，并补推最新参数
    const handleLoad = () => {
      isReadyRef.current = true;
      if (!src) return;
      const { editorSearch } = splitSrc(src);
      internalRef.current?.contentWindow?.postMessage({ type: "mtds:update", search: editorSearch }, "*");
    };

    return (
      <div
        ref={containerRef}
        className="relative flex h-full w-full items-center justify-center bg-[#111]"
      >
        {/* 工具栏 */}
        <div className="absolute top-4 left-1/2 z-10 -translate-x-1/2 flex items-center gap-2.5 rounded-full bg-[#1f1f1f] border border-[#2a2a2a] px-4 py-2">
          <span className="text-xs text-[#555]">{width} × {height}</span>
          <span className="h-3 w-px bg-[#2a2a2a]" />
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={scale <= MIN_SCALE}
            aria-label="缩小"
            aria-disabled={scale <= MIN_SCALE}
            className="flex items-center text-[#555] transition-colors hover:text-white disabled:opacity-30"
          >
            <Minus className="size-3.5" aria-hidden />
          </button>
          <span className="w-8 text-center text-xs tabular-nums text-[#777]" aria-live="polite" aria-label={`当前缩放 ${Math.round(scale * 100)}%`}>
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={scale >= MAX_SCALE}
            aria-label="放大"
            aria-disabled={scale >= MAX_SCALE}
            className="flex items-center text-[#555] transition-colors hover:text-white disabled:opacity-30"
          >
            <Plus className="size-3.5" aria-hidden />
          </button>
          <span className="h-3 w-px bg-[#2a2a2a]" aria-hidden />
          <button
            type="button"
            onClick={handleFit}
            aria-label="适应画布"
            className="flex items-center text-[#555] transition-colors hover:text-white"
          >
            <Maximize2 className="size-3.5" aria-hidden />
          </button>
        </div>
        <div
          className="overflow-hidden"
          style={{ width: width * scale, height: height * scale }}
        >
          <iframe
            ref={setRef}
            title="模板预览"
            className="block border-0"
            style={{
              width,
              height,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
            onLoad={handleLoad}
            sandbox="allow-same-origin allow-scripts"
          />
        </div>
      </div>
    );
  },
);

TemplatePreview.displayName = "TemplatePreview";
