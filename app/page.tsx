import { HomeShell } from "@/components/home/home-shell";
import { AppShell } from "@/components/layout/app-shell";
import { getAllTemplates } from "@/lib/templates-db";

export const revalidate = 60;

export default async function Home() {
  const templates = await getAllTemplates();

  return (
    <AppShell>
      <HomeShell templates={templates} />
    </AppShell>
  );
}
