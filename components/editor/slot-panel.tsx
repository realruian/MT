"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { RefreshCw, X } from "lucide-react";
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
  // 会场组件库的 fetch 态（升到 SlotPanel 以便 TabHeader 右侧能放 refresh）。
  // - components === null && error === null → 骨架屏
  // - error 非空 → 错误 + 重试
  // - components === [] → 空态
  // 每次进入编辑器实时拉一次；点 refresh 会触发 load() 重拉
  const [components, setComponents] = useState<VenueComponent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setRefreshing(true);
    try {
      const data = await fetchVenueComponents();
      setComponents(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRefreshing(true);
      setError(null);
      try {
        const data = await fetchVenueComponents();
        if (!cancelled) setComponents(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载失败");
        }
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside className="flex w-[256px] shrink-0 flex-col border-r border-[#7C889C]/10">
      <TabHeader
        tab={tab}
        onTabChange={onTabChange}
        showRefresh={tab === "venue"}
        refreshing={refreshing}
        onRefresh={load}
      />
      {/* 隐藏滚动条但保留滚动：webkit / firefox / 旧 IE 三端都隐藏 */}
      <div className="flex-1 overflow-y-auto pb-5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
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
  showRefresh,
  refreshing,
  onRefresh,
}: {
  tab: LeftPanelTab;
  onTabChange: (tab: LeftPanelTab) => void;
  showRefresh: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center gap-5 px-5 pt-5 text-[14px]">
      <TabButton active={tab === "venue"} onClick={() => onTabChange("venue")}>
        会场
      </TabButton>
      <TabButton active={tab === "slots"} onClick={() => onTabChange("slots")}>
        资源位
      </TabButton>
      {showRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="刷新会场组件库"
          title="刷新会场组件库"
          className="ml-auto mb-2 flex size-5 items-center justify-center text-grey-tertiary transition-colors hover:text-grey-primary disabled:opacity-60"
        >
          <RefreshCw
            className={[
              "size-3.5",
              refreshing ? "animate-spin" : "",
            ].join(" ")}
          />
        </button>
      )}
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "border-b-2 pb-2 transition-colors",
        active
          ? "border-[#11192D] text-grey-primary"
          : "border-transparent text-grey-tertiary hover:text-grey-primary",
      ].join(" ")}
    >
      {children}
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
        <p className="text-[12px] leading-5 text-[#C74856]">
          加载失败：{error}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-grey-border px-3 py-1 text-[12px] text-grey-secondary transition-colors hover:bg-grey-50"
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
      <p className="mt-20 text-center text-[12px] text-grey-tertiary">
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
    <div>
      {VENUE_COMPONENT_GROUPS.map((g, idx) => (
        <VenueComponentGroup
          key={g}
          title={g}
          isFirst={idx === 0}
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
    <div>
      {VENUE_COMPONENT_GROUPS.map((g, idx) => (
        <section key={g}>
          <h4
            className={[
              "px-5 mb-2 text-[12px] text-grey-tertiary",
              idx === 0 ? "mt-3" : "mt-5",
            ].join(" ")}
          >
            {g}
          </h4>
          <ul className="grid grid-cols-2 items-start gap-2 px-5">
            {[0, 1].map((i) => (
              <li key={i}>
                <div className="w-full rounded-[8px] bg-grey-50 p-2">
                  <div className="aspect-video w-full animate-pulse rounded bg-grey-200" />
                </div>
                <div className="mx-auto mt-1.5 h-3 w-12 animate-pulse rounded bg-grey-200" />
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
  /** 是否是第一组（影响顶部 margin：首组 mt-3、后续组 mt-5） */
  isFirst: boolean;
  components: VenueComponent[];
  selectedId: string | null;
  onSelect: (component: VenueComponent) => void;
}

function VenueComponentGroup({
  title,
  isFirst,
  components,
  selectedId,
  onSelect,
}: VenueComponentGroupProps) {
  return (
    <section>
      <h4
        className={[
          "px-5 mb-2 text-[12px] text-grey-tertiary",
          isFirst ? "mt-3" : "mt-5",
        ].join(" ")}
      >
        {title}
      </h4>
      {components.length === 0 ? (
        <p className="mx-5 rounded-[8px] border border-dashed border-grey-border py-3 text-center text-[11px] text-grey-disabled">
          暂无组件
        </p>
      ) : (
        <ul className="grid grid-cols-2 items-start gap-2 px-5">
          {components.map((c) => (
            <VenueComponentCard
              key={c.id}
              component={c}
              selected={c.id === selectedId}
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
  selected: boolean;
  onSelect: () => void;
}

function VenueComponentCard({
  component,
  selected,
  onSelect,
}: VenueComponentCardProps) {
  // 会场组件卡片：宽度由 grid 单元格撑满（w-full），高度由缩略图 intrinsic
  // aspect ratio 决定（img 用 w-full h-auto）。外壳 p-2 提供 8px 统一灰边，
  // 任意比例的缩略图都能直接显示，不裁切不拉伸。
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full flex-col items-center"
      >
        <div
          className={[
            "w-full cursor-pointer rounded-[8px] p-2 transition-colors",
            selected ? "bg-grey-200" : "bg-grey-50 hover:bg-grey-100",
          ].join(" ")}
        >
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
      <p className="mt-20 text-center text-[12px] leading-6 text-grey-tertiary">
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
