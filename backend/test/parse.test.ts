import { describe, expect, it } from "vitest";
import {
  normalizeToken,
  parseLegendText,
  tokenKind,
} from "../src/recognizer/parse.js";

describe("normalizeToken", () => {
  it("uppercases and strips illegal chars", () => {
    expect(normalizeToken("a10 ")).toBe("A10");
    expect(normalizeToken("A11(202)")).toBe("A11202");
  });

  it("corrects digit confusions", () => {
    expect(normalizeToken("a1o")).toBe("A10");
    expect(normalizeToken("2O2")).toBe("202");
    expect(normalizeToken("1I")).toBe("11");
  });

  it("keeps letter prefixes as letters", () => {
    expect(normalizeToken("B03")).toBe("B03");
    expect(normalizeToken("b0b")).toBe("B08");
  });
});

describe("tokenKind", () => {
  it("classifies ids vs counts", () => {
    expect(tokenKind("A11")).toBe("id");
    expect(tokenKind("A")).toBe("id");
    expect(tokenKind("202")).toBe("count");
    expect(tokenKind("")).toBe("none");
    expect(tokenKind("12A")).toBe("none");
  });
});

describe("parseLegendText", () => {
  it("parses id(count) forms", () => {
    expect(parseLegendText("A11(202)")).toEqual({ id: "A11", count: 202 });
    expect(parseLegendText("A11 （202）")).toEqual({ id: "A11", count: 202 });
    expect(parseLegendText("a11(202")).toEqual({ id: "A11", count: 202 });
  });

  it("parses space separated id count", () => {
    expect(parseLegendText("A11 202")).toEqual({ id: "A11", count: 202 });
    expect(parseLegendText("B03 56")).toEqual({ id: "B03", count: 56 });
  });

  it("parses digitless ids like M(64)", () => {
    expect(parseLegendText("M(64)")).toEqual({ id: "M", count: 64 });
  });

  it("parses OCR that dropped the letter prefix", () => {
    expect(parseLegendText("29(173)")).toEqual({ id: "29", count: 173 });
  });

  it("parses bare id and bare count", () => {
    expect(parseLegendText("A11")).toEqual({ id: "A11", count: null });
    expect(parseLegendText("(202)")).toEqual({ id: null, count: 202 });
    expect(parseLegendText("202")).toEqual({ id: null, count: 202 });
  });

  it("fixes confusions inside tokens", () => {
    expect(parseLegendText("A1O(2O2)")).toEqual({ id: "A10", count: 202 });
  });

  it("rejects empty / garbage", () => {
    expect(parseLegendText("")).toBeNull();
    expect(parseLegendText("---")).toBeNull();
    expect(parseLegendText("abc xyz")).toBeNull();
  });
});
