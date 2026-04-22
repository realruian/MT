"use client";

import { X } from "lucide-react";
import type { Slot, SlotId } from "./editor-shell";

interface SlotPanelProps {
  slots: Slot[];
  activeSlotId: SlotId;
  onSelect: (id: SlotId) => void;
  onDelete: (id: SlotId) => void;
}

/** 名称超过 7 字按字符数硬截断为 "xxxxxxx…"，保证视觉长度稳定 */
function truncateName(name: string): string {
  if (name.length <= 7) return name;
  return name.slice(0, 7) + "…";
}

export function SlotPanel({ slots, activeSlotId, onSelect, onDelete }: SlotPanelProps) {
  return (
    <aside className="flex w-[256px] shrink-0 flex-col border-r border-[#7C889C]/10">
      <div className="px-5 pt-5 pb-3 text-[14px] text-[#11192D]">资源位</div>
      <ul className="flex flex-1 flex-col gap-2 overflow-y-auto px-5 pb-5">
        {slots.map((slot) => (
          <SlotItem
            key={slot.id}
            slot={slot}
            active={slot.id === activeSlotId}
            onSelect={() => onSelect(slot.id)}
            onDelete={() => onDelete(slot.id)}
          />
        ))}
      </ul>
    </aside>
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
  const canDelete = slot.id !== "venue";
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

      {canDelete && (
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
      )}
    </li>
  );
}
