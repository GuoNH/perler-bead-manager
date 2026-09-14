/**
 * OCR 结果清洗与“编号/数量”解析。
 *
 * 不同图纸在色块上/旁边印刷的文字格式差异很大，常见写法：
 * - `A11(202)`、`A11 （202）`：编号带括号数量（拼豆图纸最常见的图例格式）；
 * - `A11 202`：空格分隔；
 * - `A11`：只有编号；
 * - `(202)` / `202`：只有数量；
 * - OCR 偶尔丢字母/丢右括号（`29(173`）、读错数字（`2O2`）。
 *
 * 本模块与 OCR 引擎无关，是纯函数，便于单测与替换引擎。
 */

export interface LegendParse {
  /** 编号（含字母；可能因 OCR 丢字母退化为纯数字），找不到时为 null */
  id: string | null;
  /** 数量，找不到时为 null */
  count: number | null;
}

/* ------------------------------ 混淆字符修正 ------------------------------ */

const DIGIT_CONFUSABLES: Record<string, string> = {
  O: "0",
  Q: "0",
  D: "0",
  I: "1",
  L: "1",
  Z: "2",
  S: "5",
  G: "6",
  B: "8",
};

/**
 * 把 OCR 原始输出清洗成统一格式：
 * - 去空白/非法字符并大写；
 * - 修正数字与字母混淆（0/O、1/I/L、8/B、5/S、2/Z、6/G 等）。
 * 例如 "a1o" -> "A10"，"2O2" -> "202"。
 */
export function normalizeToken(raw: string): string {
  let s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s) return "";
  const letterDigit = /^([A-Z]+)(\d+)$/.exec(s);
  if (letterDigit) return letterDigit[1] + correctDigits(letterDigit[2]);
  if (/^\d+$/.test(s)) return correctDigits(s);
  if (/^[A-Z]+$/.test(s)) return s;
  // 字母数字交错（如 A1O 被读成 A1O）：按上下文修正。
  return fixContext(s);
}

/** 判断一个归一化后的 token 更像“编号”（含字母）还是“数量”（纯数字）。 */
export function tokenKind(token: string): "id" | "count" | "none" {
  if (!token) return "none";
  if (/^\d+$/.test(token)) return "count";
  if (/^[A-Z]+[0-9]*$/.test(token) || /^[A-Z]+$/.test(token)) return "id";
  return "none";
}

function correctDigits(digits: string): string {
  return digits
    .split("")
    .map((ch) => DIGIT_CONFUSABLES[ch] ?? ch)
    .join("");
}

/**
 * 上下文修正：夹在数字中的字母按数字读（A1O -> A10、2O2 -> 202），
 * 但“开头字母前缀”保留原样（B03、S05、HI2 的 B/S/H 不转成数字）。
 */
function fixContext(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const prevDigit = i > 0 && /[0-9]/.test(s[i - 1]);
    const nextDigit = i < s.length - 1 && /[0-9]/.test(s[i + 1]);
    const prevIsLetter = i > 0 && /[A-Z]/.test(s[i - 1]);
    const isPrefixLetter = i === 0 || (prevIsLetter && !prevDigit);
    if (/[A-Z]/.test(ch) && !isPrefixLetter && (prevDigit || nextDigit)) {
      out += DIGIT_CONFUSABLES[ch] ?? ch;
    } else {
      out += ch;
    }
  }
  return out;
}

/* ------------------------------ 图例文字解析 ------------------------------ */

/**
 * 解析一整段图例 OCR 文本，识别其中的「编号」和「数量」。
 *
 * 与 `normalizeToken`（按“一个词要么是编号要么是数量”假设）不同，
 * 这里处理“编号+括号数量”合并印刷在一段文字里的情况，例如：
 * `A11(202)`、`A11 (202)`、`A11 202`、`A11`、`(202)`、`M(64)`。
 */
export function parseLegendText(raw: string): LegendParse | null {
  const s = cleanLegendText(raw);
  if (!s) return null;

  // 1. 编号 + 括号数量：A11(202)、A11（202）、A11(202、A11 (202)、29(173)
  //    （29(173) 表示 OCR 丢了字母前缀，编号退化为纯数字，仍按“有括号数量”处理）
  let m = /^([A-Z]{0,3}\d{0,3})\s*[（(]\s*(\d{1,6})\s*[)）]{0,2}$/.exec(s);
  if (m && m[1]) {
    return { id: keepId(m[1]), count: Number(m[2]) };
  }

  // 2. 编号 + 空格数量：A11 202 / A11  202 / 29 173
  m = /^([A-Z]{0,3}\d{0,3})\s+(\d{1,6})$/.exec(s);
  if (m && m[1]) {
    return { id: keepId(m[1]), count: Number(m[2]) };
  }

  // 3. 只有括号数量：(202)、202）
  m = /^[（(]\s*(\d{1,6})\s*[)）]{0,2}$/.exec(s);
  if (m) {
    return { id: null, count: Number(m[1]) };
  }

  // 4. 只有编号：A11 / A / M（必须含字母；纯数字交给 tokenKind 判为数量）
  m = /^[A-Z]{1,3}\d{0,3}$/.exec(s);
  if (m && /[A-Z]/.test(s)) {
    return { id: keepId(m[0]), count: null };
  }

  // 5. 只有数量：202
  m = /^\d{1,6}$/.exec(s);
  if (m) {
    return { id: null, count: Number(m[0]) };
  }

  return null;
}

/** 编号段内部再修正一次字母数字混淆（括号前的数字一般就是编号数字）。 */
function keepId(part: string): string {
  const upper = part.toUpperCase();
  const letterDigit = /^([A-Z]+)(\d*)$/.exec(upper);
  if (letterDigit) return letterDigit[1] + correctDigits(letterDigit[2]);
  return fixContext(upper);
}

/** 只保留字母数字与括号、空格，并做大写/上下文混淆修正。 */
function cleanLegendText(raw: string): string {
  let s = raw
    .toUpperCase()
    .replace(/[^A-Z0-9()\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  // 对每个字符按上下文做混淆修正（括号内数字与编号数字都适用）。
  return fixContext(s);
}
