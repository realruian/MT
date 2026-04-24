/**
 * 采样图片底边中心区域的主色（RGB 中位数），返回 hex。
 * 适合为"画布向下延伸"场景取和原内容底边衔接的色。
 *
 * 采样策略：
 * - 垂直：底部 90%-95%（避开最底一行抗锯齿虚化，也避开主体）
 * - 水平：中心 20%-80%（避开边角装饰）
 * - 透明像素（alpha < 128）跳过
 * - RGB 中位数比平均数抗描边 / 小装饰噪点
 *
 * 失败（CORS / 解码失败 / 全透明）返回 null，不抛错。
 */
export async function sampleBottomEdgeColor(
  url: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) return resolve(null);

        const sx = Math.floor(w * 0.2);
        const sw = Math.floor(w * 0.6);
        const sy = Math.floor(h * 0.9);
        const sh = Math.max(1, Math.floor(h * 0.05));

        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 4;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 32, 4);

        const { data } = ctx.getImageData(0, 0, 32, 4);
        const rs: number[] = [];
        const gs: number[] = [];
        const bs: number[] = [];
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          rs.push(data[i]);
          gs.push(data[i + 1]);
          bs.push(data[i + 2]);
        }
        if (rs.length === 0) return resolve(null);
        const median = (arr: number[]) => {
          arr.sort((a, b) => a - b);
          return arr[Math.floor(arr.length / 2)];
        };
        const hex = [median(rs), median(gs), median(bs)]
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("");
        resolve(`#${hex}`);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
