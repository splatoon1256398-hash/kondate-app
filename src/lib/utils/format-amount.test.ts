import { describe, expect, it } from "vitest";
import { formatShoppingAmount } from "./format-amount";

describe("formatShoppingAmount", () => {
  describe("定性単位・ゼロ処理", () => {
    it("適量は数量を無視して単位のみ", () => {
      expect(formatShoppingAmount(0, "適量")).toEqual({ primary: "適量" });
      expect(formatShoppingAmount(1, "少々")).toEqual({ primary: "少々" });
    });

    it("amount=0 かつ '大さじ1' のような unit 内包数値は unit をそのまま表示", () => {
      expect(formatShoppingAmount(0, "大さじ1")).toEqual({ primary: "大さじ1" });
      expect(formatShoppingAmount(0, "小さじ1/4")).toEqual({ primary: "小さじ1/4" });
    });

    it("null/undefined amount は unit のみ", () => {
      expect(formatShoppingAmount(null, "個")).toEqual({ primary: "個" });
      expect(formatShoppingAmount(undefined, "")).toEqual({ primary: "" });
    });
  });

  describe("分数グリフ変換", () => {
    it("0.5 → ½", () => {
      expect(formatShoppingAmount(0.5, "個")).toEqual({ primary: "½ 個" });
    });

    it("1.5 → 1½", () => {
      expect(formatShoppingAmount(1.5, "個")).toEqual({ primary: "1½ 個" });
    });

    it("1.25 → 1¼", () => {
      expect(formatShoppingAmount(1.25, "個")).toEqual({ primary: "1¼ 個" });
    });

    it("0.333 → ⅓", () => {
      expect(formatShoppingAmount(1 / 3, "本")).toEqual({ primary: "⅓ 本" });
    });
  });

  describe("端数の最寄り分数寄せ（2.7玉問題）", () => {
    it("2.7 は 2⅔ または 2¾ に寄せる（最寄り分数）", () => {
      const result = formatShoppingAmount(2.7, "玉");
      expect(result.primary).toMatch(/^2[⅔¾]\s玉$/);
    });

    it("0.7 は ¾ 付近に寄せる", () => {
      const result = formatShoppingAmount(0.7, "パック");
      expect(result.primary).toMatch(/^[¾⅔]\sパック$/);
    });

    it("2.98 は 3 に丸める（1未満の端数カットオフ）", () => {
      expect(formatShoppingAmount(2.98, "玉")).toEqual({ primary: "3 玉" });
    });

    it("2.01 は 2 に丸める", () => {
      expect(formatShoppingAmount(2.01, "玉")).toEqual({ primary: "2 玉" });
    });
  });

  describe("前置単位（大さじ・小さじ）", () => {
    it("大さじ 2", () => {
      expect(formatShoppingAmount(2, "大さじ")).toEqual({ primary: "大さじ 2" });
    });

    it("小さじ ½", () => {
      expect(formatShoppingAmount(0.5, "小さじ")).toEqual({ primary: "小さじ ½" });
    });
  });

  describe("grams 補足付き unit", () => {
    it("1.5 個(450g) → primary: 1½ 個, secondary: 約675g", () => {
      expect(formatShoppingAmount(1.5, "個(450g)")).toEqual({
        primary: "1½ 個",
        secondary: "約675g",
      });
    });

    it("1 個(450g) → primary: 1 個, secondary: 約450g", () => {
      expect(formatShoppingAmount(1, "個(450g)")).toEqual({
        primary: "1 個",
        secondary: "約450g",
      });
    });
  });

  describe("壊れた unit の救済", () => {
    it("/2本(75g) → grams ベースで復元", () => {
      expect(formatShoppingAmount(0.5, "/2本(75g)")).toEqual({ primary: "約38g" });
    });
  });

  describe("整数", () => {
    it("2 個 → 2 個", () => {
      expect(formatShoppingAmount(2, "個")).toEqual({ primary: "2 個" });
    });

    it("amount だけ (unit なし)", () => {
      expect(formatShoppingAmount(3, "")).toEqual({ primary: "3" });
      expect(formatShoppingAmount(3, null)).toEqual({ primary: "3" });
    });
  });
});
