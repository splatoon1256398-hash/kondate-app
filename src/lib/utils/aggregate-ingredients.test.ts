import { describe, expect, it } from "vitest";
import { aggregateIngredients } from "./aggregate-ingredients";

describe("aggregateIngredients", () => {
  it("aggregates matching ingredients and subtracts pantry stock", () => {
    const items = aggregateIngredients(
      [
        {
          servings: 4,
          recipes: {
            servings_base: 2,
            recipe_ingredients: [
              { name: "玉ねぎ", amount: 1, unit: "個" },
              { name: "鶏もも肉", amount: 200, unit: "g" },
            ],
          },
        },
        {
          servings: 2,
          recipes: {
            servings_base: 2,
            recipe_ingredients: [
              { name: "玉ねぎ", amount: 1, unit: "個" },
              { name: "鶏もも肉", amount: 100, unit: "g" },
            ],
          },
        },
      ],
      [
        { name: "玉ねぎ", amount: 1, unit: "個", is_staple: false },
        { name: "塩", amount: null, unit: null, is_staple: true },
      ]
    );

    expect(items).toEqual([
      { name: "玉ねぎ", totalAmount: 2, unit: "個", category: "vegetable" },
      { name: "鶏もも肉", totalAmount: 500, unit: "g", category: "meat_fish" },
    ]);
  });
});
