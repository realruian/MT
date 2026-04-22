"use client";

import type { ReactNode } from "react";

interface PropertyFieldProps {
  label: string;
  children: ReactNode;
  /** 辅助占满一整行（grid-cols-2 内占 2 列） */
  fullWidth?: boolean;
}

export function PropertyField({ label, children, fullWidth }: PropertyFieldProps) {
  return (
    <div className={fullWidth ? "col-span-2 flex flex-col gap-1.5" : "flex flex-col gap-1.5"}>
      <span className="text-[11px] text-[#999]">{label}</span>
      {children}
    </div>
  );
}
