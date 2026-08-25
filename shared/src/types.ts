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
