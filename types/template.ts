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
  layerType: "background" | "text" | "image" | "group";
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
  /** 字间距（px）。DB 不持久化；仅在 editState 中作为 UI 临时覆盖使用 */
  letterSpacing?: number;
  locked: boolean;
  /** 父 Group 的 id；顶层图层为 null/undefined。仅支持一层嵌套。 */
  parentId?: string | null;
  /** 运行时字段：由前端按 parentId 聚合后附加，DB 不存储 */
  children?: PsdLayer[];
}
