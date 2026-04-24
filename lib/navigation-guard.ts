/**
 * 全局导航守卫：编辑器这类"有未保存状态"的页面注册 check + confirm，
 * 导航触发方（sidebar / topbar X）跳转前先问一下。
 *
 * 同时只支持一个注册者（一次编辑器只有一个实例）。
 */
type DirtyCheck = () => boolean;
type ConfirmLeave = (target: string) => Promise<boolean>;

let currentCheck: DirtyCheck | null = null;
let currentConfirm: ConfirmLeave | null = null;

export function registerNavigationGuard(
  check: DirtyCheck,
  confirm: ConfirmLeave,
): () => void {
  currentCheck = check;
  currentConfirm = confirm;
  return () => {
    if (currentCheck === check) currentCheck = null;
    if (currentConfirm === confirm) currentConfirm = null;
  };
}

export async function canNavigate(target: string): Promise<boolean> {
  if (!currentCheck || !currentCheck()) return true;
  if (!currentConfirm) return true;
  return currentConfirm(target);
}
