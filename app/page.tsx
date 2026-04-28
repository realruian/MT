import { HomeShell } from "@/components/home/home-shell";
import { AppShell } from "@/components/layout/app-shell";
import { getAllTemplates } from "@/lib/templates-db";
import { DEMO_TEMPLATES } from "@/lib/demo-templates";

export const revalidate = 60;

export default async function Home() {
  const realTemplates = await getAllTemplates();
  // 真模板（首页原有 3 个）放最前，伪模板跟在后面正常瀑布流；
  // 切回 main 分支后这一行连同 import 自动消失
  const templates = [...realTemplates, ...DEMO_TEMPLATES];

  return (
    <AppShell>
      <HomeShell templates={templates} />
    </AppShell>
  );
}
