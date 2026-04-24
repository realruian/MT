"use client";

import { VenueComponentsManager } from "@/components/admin/venue-components-manager";

/**
 * 独立入口保留，主要供历史外链使用；实际 UI 走 /admin 的「会场组件」tab。
 */
export default function VenueComponentsAdminPage() {
  return <VenueComponentsManager showHeader />;
}
