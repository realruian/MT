import Image from "next/image";

export function TopBar() {
  return (
    <div className="fixed left-0 right-0 top-0 z-50 flex h-[60px] items-center justify-end bg-black/[0.06] px-6">
      <div className="flex items-center gap-2">
        <div className="size-[30px] overflow-hidden rounded-full">
          <Image
            src="/avatar-default.png"
            alt="业务默认头像"
            width={30}
            height={30}
            className="size-full object-cover"
          />
        </div>
        <span className="text-[14px] text-[#11192d]">业务</span>
      </div>
    </div>
  );
}
