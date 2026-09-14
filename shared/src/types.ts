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
  legend: LegendItem[];
  warnings: Warning[];
  failedCells: FailedCell[];
}

export interface SubmitPayload {
  image: ImageMeta;
  legend: LegendItem[];
  confirmedAt: string;
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
