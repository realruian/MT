"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { VENUE_COMPONENT_GROUPS } from "@/lib/venue-component-groups";
import type { Slot, SlotId } from "./editor-shell";
import {
  fetchVenueComponents,
  type VenueComponent,
} from "./venue-components";

export type LeftPanelTab = "venue" | "slots";

interface SlotPanelProps {
  slots: Slot[];
  activeSlotId: SlotId;
  onSelect: (id: SlotId) => void;
  onDelete: (id: SlotId) => void;
  tab: LeftPanelTab;
  onTabChange: (tab: LeftPanelTab) => void;
  /** 当前被选中的会场组件卡片 id；null 表示未选 */
  selectedVenueComponentId: string | null;
  /** 点击会场组件卡片的回调（传完整对象，编辑器 shell 直接 insert） */
  onSelectVenueComponent: (component: VenueComponent) => void;
}

/** 名称超过 7 字按字符数硬截断为 "xxxxxxx…"，保证视觉长度稳定 */
function truncateName(name: string): string {
  if (name.length <= 7) return name;
  return name.slice(0, 7) + "…";
}

export function SlotPanel({
  slots,
  activeSlotId,
  onSelect,
  onDelete,
  tab,
  onTabChange,
  selectedVenueComponentId,
  onSelectVenueComponent,
}: SlotPanelProps) {
  // 会场组件库的 fetch 态：
  // - components === null && error === null → 骨架屏
  // - error 非空 → 错误 + 重试
  // - components === [] → 空态
  // 每次进入编辑器实时拉一次；错误态点"重试"会触发 load() 重拉
  const [components, setComponents] = useState<VenueComponent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchVenueComponents();
      setComponents(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const data = await fetchVenueComponents();
        if (!cancelled) setComponents(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载失败");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside className="flex w-[256px] shrink-0 flex-col border-r border-[#7C889C]/10">
      <TabHeader tab={tab} onTabChange={onTabChange} />
      {/* 隐藏滚动条但保留滚动：webkit / firefox / 旧 IE 三端都隐藏。mt-6 保证 tab
          下划线和首条卡片永远有 24px 视觉缓冲，content 滚动时这块空白稳定不动 */}
      <div className="mt-6 flex-1 overflow-y-auto pb-5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {tab === "venue" ? (
          <VenueComponentLibrary
            components={components}
            error={error}
            selectedId={selectedVenueComponentId}
            onRetry={load}
            onSelect={onSelectVenueComponent}
          />
        ) : (
          <SlotsTab
            slots={slots}
            activeSlotId={activeSlotId}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        )}
      </div>
    </aside>
  );
}

// --- Tab 头部 ---

function TabHeader({
  tab,
  onTabChange,
}: {
  tab: LeftPanelTab;
  onTabChange: (tab: LeftPanelTab) => void;
}) {
  return (
    <div className="flex items-center gap-5 px-5 pt-5 text-[14px]">
      <TabButton active={tab === "venue"} onClick={() => onTabChange("venue")}>
        会场组件
      </TabButton>
      <TabButton active={tab === "slots"} onClick={() => onTabChange("slots")}>
        资源位
      </TabButton>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  // 下划线长度固定 32px、跟首页 SceneTabBar 一致；通过绝对定位避免随文字宽度拉长
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "relative pb-2 transition-colors",
        active
          ? "text-grey-primary"
          : "text-grey-tertiary hover:text-grey-primary",
      ].join(" ")}
    >
      {children}
      {active && (
        <span className="absolute bottom-0 left-1/2 h-[2px] w-[32px] -translate-x-1/2 bg-[#11192D]" />
      )}
    </button>
  );
}

// --- 会场 tab：会场组件库（VenueComponentLibrary） ---
// 统一术语：这里的"卡片"一律称作"会场组件卡片 / venue component card"，
// 避免与通用 Card 或业务卡片（优惠券卡片、商品卡片等）混淆。

interface VenueComponentLibraryProps {
  /** 会场组件列表；未加载完前为 null，加载完成后至少是 [] */
  components: VenueComponent[] | null;
  /** fetch 失败时的错误消息；非空即展示错误态 */
  error: string | null;
  /** 当前被选中的会场组件卡片 id */
  selectedId: string | null;
  /** 错误态下「重试」按钮点击 */
  onRetry: () => void;
  /** 点击会场组件卡片的回调（传完整对象） */
  onSelect: (component: VenueComponent) => void;
}

function VenueComponentLibrary({
  components,
  error,
  selectedId,
  onRetry,
  onSelect,
}: VenueComponentLibraryProps) {
  // 错误态优先：error 非空说明最近一次 fetch 失败，即使有旧 components 也要
  // 先把问题显式告知，避免用户以为"组件库就这些"——重试后才恢复正常展示
  if (error) {
    return (
      <div className="mt-20 flex flex-col items-center gap-3 px-5 text-center">
        <p className="text-[14px] leading-5 text-[#C74856]">
          加载失败：{error}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-grey-border px-3 py-1 text-[14px] text-grey-secondary transition-colors hover:bg-grey-50"
        >
          重试
        </button>
      </div>
    );
  }

  if (components === null) {
    return <VenueComponentLibrarySkeleton />;
  }

  if (components.length === 0) {
    return (
      <p className="mt-20 text-center text-[14px] text-grey-tertiary">
        暂无组件，请到后台上传
      </p>
    );
  }

  // 按 VENUE_COMPONENT_GROUPS 常量顺序聚合；数据库中未识别的 group 静默丢弃
  const byGroup = new Map<string, VenueComponent[]>();
  for (const g of VENUE_COMPONENT_GROUPS) byGroup.set(g, []);
  for (const c of components) {
    if (byGroup.has(c.group)) byGroup.get(c.group)!.push(c);
  }

  return (
    <div className="[&>section]:mx-5 [&>section]:py-5 [&>section]:border-t [&>section]:border-[#7C889C]/10 [&>section:first-child]:border-t-0 [&>section:first-child]:pt-0">
      {VENUE_COMPONENT_GROUPS.map((g) => (
        <VenueComponentGroup
          key={g}
          title={g}
          components={byGroup.get(g) ?? []}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

/** 骨架屏：按 VENUE_COMPONENT_GROUPS 顺序渲染 7 组占位，每组 2 张灰卡，
 *  占位尺寸用 aspect-video（16:9），跟真实卡片的视觉权重接近 */
function VenueComponentLibrarySkeleton() {
  return (
    <div className="[&>section]:mx-5 [&>section]:py-5 [&>section]:border-t [&>section]:border-[#7C889C]/10 [&>section:first-child]:border-t-0 [&>section:first-child]:pt-0">
      {VENUE_COMPONENT_GROUPS.map((g) => (
        <section key={g}>
          <h3 className="mb-3 text-[14px] text-grey-primary">{g}</h3>
          <ul className="grid grid-cols-2 items-start gap-2">
            {[0, 1].map((i) => (
              <li key={i}>
                <div className="w-full rounded-[8px] bg-grey-100 p-2">
                  <div className="aspect-video w-full animate-pulse rounded bg-grey-200" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

interface VenueComponentGroupProps {
  title: string;
  components: VenueComponent[];
  selectedId: string | null;
  onSelect: (component: VenueComponent) => void;
}

function VenueComponentGroup({
  title,
  components,
  selectedId,
  onSelect,
}: VenueComponentGroupProps) {
  return (
    <section>
      <h3 className="mb-3 text-[14px] text-grey-primary">{title}</h3>
      {components.length === 0 ? (
        <p className="rounded-[8px] border border-dashed border-grey-border py-3 text-center text-[11px] text-grey-disabled">
          暂无组件
        </p>
      ) : (
        <ul className="grid grid-cols-2 items-start gap-2">
          {components.map((c) => (
            <VenueComponentCard
              key={c.id}
              component={c}
              onSelect={() => onSelect(c)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface VenueComponentCardProps {
  component: VenueComponent;
  onSelect: () => void;
}

function VenueComponentCard({
  component,
  onSelect,
}: VenueComponentCardProps) {
  // 会场组件卡片：宽度由 grid 单元格撑满（w-full），高度由缩略图 intrinsic
  // aspect ratio 决定（img 用 w-full h-auto）。外壳 p-2 提供 8px hover 灰底，
  // 任意比例的缩略图都能直接显示，不裁切不拉伸。
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full flex-col items-center"
      >
        <div className="w-full cursor-pointer overflow-hidden rounded-[4px] transition-shadow hover:shadow-[0_4px_10px_rgba(17,25,45,0.1)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={component.thumbnail}
            alt={component.name}
            className="block h-auto w-full object-contain"
            draggable={false}
          />
        </div>
      </button>
    </li>
  );
}

// --- 资源位 tab：延展 slot 列表（过滤掉 venue） ---

function SlotsTab({
  slots,
  activeSlotId,
  onSelect,
  onDelete,
}: {
  slots: Slot[];
  activeSlotId: SlotId;
  onSelect: (id: SlotId) => void;
  onDelete: (id: SlotId) => void;
}) {
  const extendedSlots = slots.filter((s) => s.id !== "venue");

  if (extendedSlots.length === 0) {
    return (
      <p className="mt-20 text-center text-[14px] leading-6 text-grey-tertiary">
        尚未延展资源位
        <br />
        点击右上角「一键拓展」添加
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2 px-5 pt-3">
      {extendedSlots.map((slot) => (
        <SlotItem
          key={slot.id}
          slot={slot}
          active={slot.id === activeSlotId}
          onSelect={() => onSelect(slot.id)}
          onDelete={() => onDelete(slot.id)}
        />
      ))}
    </ul>
  );
}

function SlotItem({
  slot,
  active,
  onSelect,
  onDelete,
}: {
  slot: Slot;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const displayName = truncateName(slot.name);

  return (
    <li
      className={[
        "group flex h-[44px] w-[216px] items-center rounded-[10px] pl-[2px] pr-2 transition-colors",
        active
          ? "bg-grey-100"
          : "hover:bg-grey-50",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <div className="size-[40px] shrink-0 overflow-hidden rounded-[8px] bg-grey-200">
          {slot.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slot.thumbnail}
              alt={slot.name}
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-center px-0.5 text-center leading-tight text-[#aab0bb]">
              <span className="text-[8px]">{slot.width}</span>
              <span className="text-[8px]">×</span>
              <span className="text-[8px]">{slot.height}</span>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
          <p className="truncate text-[14px] text-grey-secondary">{displayName}</p>
          <p className="truncate text-[10px] text-[#999]">
            {slot.width} × {slot.height}
          </p>
        </div>
      </button>

      <button
        type="button"
        aria-label={`删除 ${slot.name}`}
        title="删除"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="flex size-6 shrink-0 items-center justify-center rounded text-grey-secondary opacity-0 transition-opacity hover:bg-black/5 group-hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </li>
  );
}
