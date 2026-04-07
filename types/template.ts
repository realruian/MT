export interface EditableFields {
  texts: { key: string; label: string; defaultValue: string; defaultColor?: string }[];
  colors: { name: string; values: Record<string, string> }[];
  images: { key: string; label: string; defaultSrc: string }[];
}

export interface Template {
  id: string;
  name: string;
  category: string;
  thumbnail: string;
  width: number;
  height: number;
  /** 若存在，则使用真实 HTML 文件渲染（URL 参数注入），否则使用代码生成 HTML */
  htmlFile?: string;
  editableFields: EditableFields;
  templateType?: "html" | "psd";
  psdFile?: string;
  canvasWidth?: number;
  canvasHeight?: number;
}

export interface PsdLayer {
  id: string;
  templateId: string;
  name: string;
  layerType: "background" | "text" | "image";
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  opacity: number;
  rotation: number;
  imageUrl?: string;
  textContent?: string;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: string;
  lineHeight?: number;
  locked: boolean;
}
