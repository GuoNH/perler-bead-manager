export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface LegendItem {
  id: string;
  rgb: RGB;
  count: number;
}

/** 一个未解析出合法编号、需要人工补录的图例色块（行/列为 1 起始）。 */
export interface FailedCell {
  row: number;
  col: number;
  rgb: RGB;
  /** OCR 原文或失败原因；可能为空串。 */
  text: string;
  /** 失败色块的裁剪图（PNG base64 data URL），供前端对照补录。 */
  imageDataUrl?: string;
}

export interface Warning {
  level: "info" | "warn" | "error";
  message: string;
}

export interface ImageMeta {
  name: string;
  width: number;
  height: number;
}

export interface RecognizeResult {
  image: ImageMeta;
  /** 识别时临时保存的图片文件名（不含路径），提交时用于归档到图纸库。 */
  tempImageName?: string;
  legend: LegendItem[];
  warnings: Warning[];
  failedCells: FailedCell[];
}

export interface SubmitPayload {
  image: ImageMeta;
  /** 识别阶段临时保存的图片文件名，提交时用于归档。 */
  tempImageName?: string;
  /** 是否归档到图纸库，默认为 true。 */
  shouldArchive?: boolean;
  /** 归档到图纸库时使用的显示名称，为空则使用原文件名。 */
  archiveName?: string;
  legend: LegendItem[];
  confirmedAt: string;
}

/** 图纸分类。 */
export interface DrawingCategory {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DrawingCategoryInput {
  name: string;
  parentId?: string | null;
  sortOrder?: number;
}

/** 图纸库条目。 */
export interface Drawing {
  id: string;
  submissionId: string | null;
  imageName: string;
  imageExt: string;
  categoryId: string | null;
  width: number;
  height: number;
  totalBeads: number;
  colorCount: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface DrawingInput {
  categoryId?: string | null;
  note?: string;
}

export interface RecognitionRecord extends SubmitPayload {
  id: string;
  createdAt: string;
}

export interface RecognitionSummary {
  id: string;
  imageName: string;
  createdAt: string;
  total: number;
  colorCount: number;
}

export interface ResultStore {
  save(record: RecognitionRecord): Promise<{
    id: string;
    jsonPath: string;
    csvPath: string;
  }>;
  list(): Promise<RecognitionSummary[]>;
  get(id: string): Promise<RecognitionRecord>;
}
