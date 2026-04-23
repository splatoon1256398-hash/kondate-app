import { describe, expect, it } from "vitest";
import {
  isKitRecipe,
  filterPromptRecipes,
  type RecipeLite,
} from "./recipe-filter";

describe("isKitRecipe", () => {
  it("is_kit=true は即 true", () => {
    expect(isKitRecipe({ is_kit: true, source: "manual" }, 10)).toBe(true);
  });

  it("source=imported かつ 材料 < 3 件 → true", () => {
    expect(isKitRecipe({ source: "imported" }, 2)).toBe(true);
  });

  it("source=imported でも 材料 3 件以上 → false", () => {
    expect(isKitRecipe({ source: "imported" }, 5)).toBe(false);
  });

  it("source=manual は材料数に関係なく false (手動登録は信頼)", () => {
    expect(isKitRecipe({ source: "manual" }, 1)).toBe(false);
  });

  it("source null/undefined + 材料少ない → false", () => {
    expect(isKitRecipe({}, 1)).toBe(false);
  });
});

describe("filterPromptRecipes", () => {
  const mkRecipe = (
    id: string,
    overrides: Partial<RecipeLite> = {}
  ): RecipeLite => ({ id, title: `recipe-${id}`, ...overrides });

  it("キット系は除外される", () => {
    const recipes = [
      mkRecipe("r1", { source: "imported" }),
      mkRecipe("r2", { source: "manual" }),
    ];
    const ingCounts = new Map([["r1", 2], ["r2", 5]]);
    const result = filterPromptRecipes(recipes, ingCounts, new Map(), new Set());
    expect(result.map((r) => r.id)).toEqual(["r2"]);
  });

  it("殿堂入りが最優先される", () => {
    const recipes = [
      mkRecipe("r1"),
      mkRecipe("r2", { is_favorite: true }),
      mkRecipe("r3"),
    ];
    const result = filterPromptRecipes(recipes, new Map(), new Map(), new Set());
    expect(result[0].id).toBe("r2");
  });

  it("高評価レシピ (avg>=3.5) は優先される", () => {
    const recipes = [mkRecipe("r1"), mkRecipe("r2"), mkRecipe("r3")];
    const ratings = new Map([
      ["r2", { avg: 4.2, count: 3 }],
      ["r1", { avg: 2.8, count: 2 }],
    ]);
    const result = filterPromptRecipes(recipes, new Map(), ratings, new Set());
    // r2 (high rated) > r1/r3 (others)
    expect(result[0].id).toBe("r2");
  });

  it("直近使用は others より優先", () => {
    const recipes = [
      mkRecipe("r1"),
      mkRecipe("r2"),
      mkRecipe("r3"),
    ];
    const result = filterPromptRecipes(
      recipes,
      new Map(),
      new Map(),
      new Set(["r2"])
    );
    expect(result[0].id).toBe("r2");
  });

  it("maxOthers で others レシピを制限", () => {
    const recipes = Array.from({ length: 30 }, (_, i) => mkRecipe(`r${i}`));
    const result = filterPromptRecipes(recipes, new Map(), new Map(), new Set(), {
      maxOthers: 3,
    });
    expect(result).toHaveLength(3);
  });

  it("maxCount で全体を打ち切る", () => {
    const recipes = Array.from({ length: 100 }, (_, i) =>
      mkRecipe(`r${i}`, { is_favorite: true })
    );
    const result = filterPromptRecipes(recipes, new Map(), new Map(), new Set(), {
      maxCount: 20,
    });
    expect(result).toHaveLength(20);
  });
});
