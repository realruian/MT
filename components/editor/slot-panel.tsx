"use client";

import { X } from "lucide-react";
import type { Slot, SlotId } from "./editor-shell";
import type { VenueComponent } from "./venue-components";

export type LeftPanelTab = "venue" | "slots";

interface SlotPanelProps {
  slots: Slot[];
  activeSlotId: SlotId;
  onSelect: (id: SlotId) => void;
  onDelete: (id: SlotId) => void;
  tab: LeftPanelTab;
  onTabChange: (tab: LeftPanelTab) => void;
  components: VenueComponent[];
  selectedComponentId: string | null;
  onSelectComponent: (id: string) => void;
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
  components,
  selectedComponentId,
  onSelectComponent,
}: SlotPanelProps) {
  return (
    <aside className="flex w-[256px] shrink-0 flex-col border-r border-[#7C889C]/10">
      <TabHeader tab={tab} onTabChange={onTabChange} />
      {/* 隐藏滚动条但保留滚动：webkit / firefox / 旧 IE 三端都隐藏 */}
      <div className="flex-1 overflow-y-auto pb-5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {tab === "venue" ? (
          <VenueTab
            components={components}
            selectedComponentId={selectedComponentId}
            onSelectComponent={onSelectComponent}
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
    <div className="flex gap-5 px-5 pt-5 text-[14px]">
      <TabButton active={tab === "venue"} onClick={() => onTabChange("venue")}>
        会场
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
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "border-b-2 pb-2 transition-colors",
        active
          ? "border-[#11192D] text-[#11192D]"
          : "border-transparent text-[#7C889C] hover:text-[#11192D]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// --- 会场 tab：组件库 ---

function VenueTab({
  components,
  selectedComponentId,
  onSelectComponent,
}: {
  components: VenueComponent[];
  selectedComponentId: string | null;
  onSelectComponent: (id: string) => void;
}) {
  if (components.length === 0) {
    return (
      <p className="mt-20 text-center text-[12px] text-[#7C889C]">
        暂无组件，请到后台上传
      </p>
    );
  }

  // 按 group 聚合，保持首次出现顺序
  const groupOrder: string[] = [];
  const byGroup = new Map<string, VenueComponent[]>();
  for (const c of components) {
    if (!byGroup.has(c.group)) {
      byGroup.set(c.group, []);
      groupOrder.push(c.group);
    }
    byGroup.get(c.group)!.push(c);
  }
  const showGroupTitle = groupOrder.length > 1;

  return (
    <div>
      {groupOrder.map((g, idx) => (
        <section key={g}>
          {showGroupTitle && (
            <h4
              className={[
                "px-5 mb-2 text-[12px] text-[#7C889C]",
                idx === 0 ? "mt-3" : "mt-5",
              ].join(" ")}
            >
              {g}
            </h4>
          )}
          <ul className="grid grid-cols-2 gap-2 px-5">
            {byGroup.get(g)!.map((c) => (
              <ComponentCard
                key={c.id}
                component={c}
                selected={c.id === selectedComponentId}
                onSelect={() => onSelectComponent(c.id)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ComponentCard({
  component,
  selected,
  onSelect,
}: {
  component: VenueComponent;
  selected: boolean;
  onSelect: () => void;
}) {
  // 显式 100×100 外壳 + 固定 76×76 内层缩略图（统一"12px 灰边"，与 mock SVG 的
  // 内部结构解耦）。不再依赖 img 的 padding，避免 p-3 + object-contain 在某些
  // viewBox/渲染路径下失效导致色块铺满整张卡片。
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full flex-col items-center"
      >
        <div
          className={[
            "flex size-[100px] cursor-pointer items-center justify-center rounded-[8px] transition-colors",
            selected ? "bg-[#E4E7EC]" : "bg-[#F5F6F8] hover:bg-[#EEF0F3]",
          ].join(" ")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={component.thumbnail}
            alt={component.name}
            className="size-[76px] object-cover"
            draggable={false}
          />
        </div>
        <p className="mt-1.5 text-center text-[12px] leading-none text-[#4F607A]">
          {component.name}
        </p>
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
      <p className="mt-20 text-center text-[12px] leading-6 text-[#7C889C]">
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
          ? "bg-[#eef0f3]"
          : "hover:bg-[#f5f6f8]",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <div className="size-[40px] shrink-0 overflow-hidden rounded-[8px] bg-[#e3e6e9]">
          {slot.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slot.thumbnail}
              alt={slot.name}
              className="size-full object-cover"
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
          <p className="truncate text-[14px] text-[#4F607A]">{displayName}</p>
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
        className="flex size-6 shrink-0 items-center justify-center rounded text-[#4f607a] opacity-0 transition-opacity hover:bg-black/5 group-hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </li>
  );
}
