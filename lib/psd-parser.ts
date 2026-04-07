import { readPsd, initializeCanvas, type Layer } from "ag-psd";
import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";

initializeCanvas(
  (width: number, height: number) =>
    createCanvas(width, height) as unknown as HTMLCanvasElement,
  (width: number, height: number) => {
    const canvas = createCanvas(width, height);
    return canvas.getContext("2d")!.getImageData(0, 0, width, height) as unknown as ImageData;
  },
);

export interface ParsedTextInfo {
  content: string;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: string;
  lineHeight?: number;
}

export interface ParsedLayer {
  name: string;
  type: "text" | "image";
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  opacity: number;
  rotation: number;
  imageBuffer?: Buffer;
  text?: ParsedTextInfo;
}

export interface PsdParseResult {
  width: number;
  height: number;
  layers: ParsedLayer[];
  compositeImage?: Buffer;
}

function colorToHex(c: { r: number; g: number; b: number; a?: number }): string {
  const clamp = (n: number) => Math.round(Math.max(0, Math.min(255, n)));
  return `#${clamp(c.r).toString(16).padStart(2, "0")}${clamp(c.g).toString(16).padStart(2, "0")}${clamp(c.b).toString(16).padStart(2, "0")}`;
}

function isRgbLike(c: unknown): c is { r: number; g: number; b: number } {
  return (
    typeof c === "object" &&
    c !== null &&
    "r" in c &&
    typeof (c as { r: unknown }).r === "number"
  );
}

async function pixelDataToPng(
  data: Uint8ClampedArray | Uint8Array | Uint16Array | Float32Array,
  width: number,
  height: number,
): Promise<Buffer> {
  let rgba: Buffer;
  if (data instanceof Uint8ClampedArray || data instanceof Uint8Array) {
    rgba = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  } else if (data instanceof Uint16Array) {
    const u8 = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) u8[i] = data[i] >> 8;
    rgba = Buffer.from(u8.buffer);
  } else {
    const u8 = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) u8[i] = Math.round(Math.max(0, Math.min(1, data[i])) * 255);
    rgba = Buffer.from(u8.buffer);
  }

  return sharp(rgba, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();
}

function extractTextInfo(layer: Layer): ParsedTextInfo | undefined {
  const td = layer.text;
  if (!td) return undefined;

  const baseStyle = td.style ?? {};
  const runStyle = td.styleRuns?.[0]?.style ?? {};
  const style = { ...baseStyle, ...Object.fromEntries(
    Object.entries(runStyle).filter(([, v]) => v !== undefined && v !== null),
  ) } as typeof baseStyle;
  const paragraphStyle = td.paragraphStyleRuns?.[0]?.style ?? td.paragraphStyle;

  let color: string | undefined;
  if (style?.fillColor && isRgbLike(style.fillColor)) {
    color = colorToHex(style.fillColor);
  }

  let fontWeight: string | undefined;
  if (style?.fauxBold) {
    fontWeight = "bold";
  }

  const fontStyle = style?.fauxItalic ? "italic" : "normal";

  let textAlign: string | undefined;
  if (paragraphStyle?.justification) {
    const j = paragraphStyle.justification;
    if (j === "left" || j === "center" || j === "right") {
      textAlign = j;
    } else if (j.startsWith("justify")) {
      textAlign = "justify";
    }
  }

  let fontSize = style?.fontSize ?? 12;
  let leading = style?.leading;

  // ag-psd returns fontSize in pt. The text layer's transform matrix
  // (td.transform) scales from pt to actual pixels: [xx, xy, yx, yy, tx, ty]
  // Actual pixel size = fontSize * abs(yy)
  if (td.transform && td.transform.length >= 4) {
    const scaleY = Math.abs(td.transform[3]);
    if (scaleY > 0) {
      fontSize = Math.round(fontSize * scaleY * 100) / 100;
      if (leading) {
        leading = Math.round(leading * scaleY * 100) / 100;
      }
    }
  }

  return {
    content: td.text,
    fontFamily: style?.font?.name,
    fontSize,
    color,
    fontWeight,
    fontStyle,
    textAlign,
    lineHeight: leading,
  };
}

/**
 * Extract rotation angle (degrees) from a 6-element affine transform matrix [xx, xy, yx, yy, tx, ty].
 * Returns 0 if no meaningful rotation is detected.
 */
function extractRotationFromMatrix(transform?: number[]): number {
  if (!transform || transform.length < 4) return 0;
  const [xx, xy] = transform;
  const radians = Math.atan2(xy, xx);
  const degrees = (radians * 180) / Math.PI;
  return Math.abs(degrees) < 0.5 ? 0 : Math.round(degrees * 100) / 100;
}

export async function parsePsdBuffer(buffer: ArrayBuffer): Promise<PsdParseResult> {
  const psd = readPsd(buffer, { useImageData: true });

  const layers: ParsedLayer[] = [];
  const topLayers = psd.children ?? [];

  for (let i = 0; i < topLayers.length; i++) {
    const layer = topLayers[i];
    const name = layer.name ?? `Layer ${i}`;
    const x = layer.left ?? 0;
    const y = layer.top ?? 0;
    const w = (layer.right ?? 0) - x;
    const h = (layer.bottom ?? 0) - y;
    const visible = !layer.hidden;
    const rawOpacity = layer.opacity ?? 1;
    const opacity = rawOpacity > 1 ? rawOpacity / 255 : rawOpacity;

    if (layer.text) {
      const text = extractTextInfo(layer);
      const rotation = extractRotationFromMatrix(layer.text.transform);
      let imageBuffer: Buffer | undefined;
      if (layer.imageData && w > 0 && h > 0) {
        try {
          imageBuffer = await pixelDataToPng(layer.imageData.data, layer.imageData.width, layer.imageData.height);
        } catch { /* text layers may not have valid pixel data */ }
      }
      layers.push({
        name,
        type: "text",
        zIndex: i,
        x, y, width: w, height: h,
        visible, opacity, rotation,
        imageBuffer,
        text,
      });
    } else if (layer.imageData && w > 0 && h > 0) {
      const placedTransform = (layer as unknown as { placedLayer?: { transform?: number[] } }).placedLayer?.transform;
      const rotation = extractRotationFromMatrix(placedTransform);
      const imageBuffer = await pixelDataToPng(
        layer.imageData.data,
        layer.imageData.width,
        layer.imageData.height,
      );
      layers.push({
        name,
        type: "image",
        zIndex: i,
        x, y, width: w, height: h,
        visible, opacity, rotation,
        imageBuffer,
      });
    }
  }

  let compositeImage: Buffer | undefined;
  if (psd.imageData && psd.width > 0 && psd.height > 0) {
    try {
      compositeImage = await pixelDataToPng(psd.imageData.data, psd.imageData.width, psd.imageData.height);
    } catch { /* composite may not be available */ }
  }

  return {
    width: psd.width,
    height: psd.height,
    layers,
    compositeImage,
  };
}
