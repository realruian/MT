"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface AccordionItem {
  id: string;
  title: string;
  children: React.ReactNode;
}

export function Accordion({ items }: { items: AccordionItem[] }) {
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(items.map((i) => i.id)),
  );

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col">
      {items.map((item) => {
        const open = openIds.has(item.id);
        return (
          <div key={item.id} className="border-b border-gray-100 last:border-b-0">
            <button
              type="button"
              onClick={() => toggle(item.id)}
              className="flex w-full items-center gap-2 px-5 py-3.5 text-left transition-colors hover:bg-white/40"
            >
              <span className="flex-1 text-[13px] font-semibold text-[#1a1a1a]">
                {item.title}
              </span>
              <ChevronDown
                className={[
                  "size-4 text-[#bbb] transition-transform duration-200",
                  open ? "rotate-0" : "-rotate-90",
                ].join(" ")}
              />
            </button>
            <div
              className={[
                "grid transition-all duration-200 ease-out",
                open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              ].join(" ")}
            >
              <div className="overflow-hidden">
                <div className="px-5 pb-4">{item.children}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
