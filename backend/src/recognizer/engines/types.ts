/**
 * OCR 引擎抽象。
 *
 * 所有引擎只负责「识别一张已预处理好的图片文件，返回带包围盒的词级结果」，
 * 与图例定位、颜色取样、编号/数量解析解耦。新增引擎（RapidOCR / PaddleOCR /
 * 云端 API）只需实现 `OcrEngine` 并在 `index.ts` 里注册。
 */

export interface OcrOptions {
  /** 字符白名单；缺省由引擎自行决定 */
  whitelist?: string;
  /** tesseract PSM（对其它引擎可忽略） */
  psm?: number;
  /** 墨迹极性；缺省根据图像内容自动判断 */
  polarity?: "dark" | "light";
}

/** 引擎返回的一个“词”：文本、置信度、在输入图片坐标系中的包围盒。 */
export interface EngineWord {
  text: string;
  confidence: number;
  /** 输入图片坐标系（像素），w/h 为 0 表示整图（如纯文本回退） */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OcrEngine {
  readonly name: string;
  recognize(imagePath: string, opts?: OcrOptions): Promise<EngineWord[]>;
}

/** 图例常见字符：字母 + 数字 + 括号（编号 A11(202) 里的括号不能丢）。 */
export const LEGEND_WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789()";
export const ALNUM_WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const DIGIT_WHITELIST = "0123456789";
