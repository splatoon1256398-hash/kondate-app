import { describe, expect, it } from "vitest";
import { buildInitialSlots, buildMealPlanRequestMessage } from "./request";
import type { PantryItem } from "@/types/pantry";

describe("buildInitialSlots", () => {
  it("creates lunch and dinner slots for the target week", () => {
    const slots = buildInitialSlots("2026-04-06");

    expect(Object.keys(slots)).toHaveLength(7);
    expect(slots["2026-04-06"]).toEqual({
      lunch: { enabled: true, servings: 1 },
      dinner: { enabled: true, servings: 2 },
    });
    expect(slots["2026-04-12"]).toEqual({
      lunch: { enabled: true, servings: 1 },
      dinner: { enabled: true, servings: 2 },
    });
  });
});

describe("buildMealPlanRequestMessage", () => {
  it("includes pantry priorities, skipped slots, requested recipes, and notes", () => {
    const pantryItems: PantryItem[] = [
      {
        id: "pantry-1",
        name: "鶏もも肉",
        amount: 300,
        unit: "g",
        category: "meat_fish",
        expiry_date: null,
        source: "manual",
        is_staple: false,
        created_at: "2026-04-08T00:00:00.000Z",
        updated_at: "2026-04-08T00:00:00.000Z",
      },
    ];

    const message = buildMealPlanRequestMessage({
      cookMode: "mixed",
      pantryItems,
      prioritizedIds: ["pantry-1"],
      extraIngredients: ["豆腐"],
      days: ["2026-04-06", "2026-04-07"],
      slots: {
        "2026-04-06": {
          lunch: { enabled: true, servings: 1 },
          dinner: { enabled: false, servings: 2 },
        },
        "2026-04-07": {
          lunch: { enabled: false, servings: 1 },
          dinner: { enabled: true, servings: 2 },
        },
      },
      notes: "火曜は軽めにしたい",
      wantRecipes: [{ id: "recipe-1", title: "無水カレー" }],
    });

    expect(message).toContain("調理方法: ホットクック＋コンロ混合");
    expect(message).toContain("優先して使い切る在庫: 鶏もも肉 300g");
    expect(message).toContain("追加の残り食材: 豆腐");
    expect(message).toContain("不要な枠（外食など）");
    expect(message).toContain("月夜");
    expect(message).toContain("火昼");
    expect(message).toContain("食べたいレシピ（必ず組み込んで）");
    expect(message).toContain("- 無水カレー");
    expect(message).toContain("メモ: 火曜は軽めにしたい");
  });
});
