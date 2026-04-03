export interface EditableFields {
  texts: { key: string; label: string; defaultValue: string }[];
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
}
