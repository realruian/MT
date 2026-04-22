"use client";

import { Trash2 } from "lucide-react";
import type { Slot, SlotId } from "./editor-shell";

interface SlotPanelProps {
  slots: Slot[];
  activeSlotId: SlotId;
  onSelect: (id: SlotId) => void;
  onDelete: (id: SlotId) => void;
}

export function SlotPanel({ slots, activeSlotId, onSelect, onDelete }: SlotPanelProps) {
  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-[#eee]">
      <div className="px-6 py-5 text-xs text-[#999]">资源位</div>
      <ul className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3">
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

  return (
    <li
      className={[
        "group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors",
        active
          ? "border border-[#e5e5e5] bg-[#f5f5f5]"
          : "border border-transparent hover:bg-[#fafafa]",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex flex-1 items-center gap-3 text-left"
      >
        <div className="size-10 shrink-0 overflow-hidden rounded border border-[#eee] bg-[#f5f5f5]">
          {slot.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slot.thumbnail}
              alt={slot.name}
              className="size-full object-cover"
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-[#111]">{slot.name}</p>
          <p className="truncate text-[11px] text-[#999]">
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
          className="flex size-7 items-center justify-center rounded text-[#c94848] opacity-0 transition-opacity hover:bg-red-50 group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </li>
  );
}
