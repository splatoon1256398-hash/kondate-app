export type SlotWithRecipe = {
  servings: number;
  recipes: {
    servings_base: number;
    recipe_ingredients: {
      name: string;
      amount: number;
      unit: string;
    }[];
  } | null;
};

export type AggregatedItem = {
  name: string;
  totalAmount: number;
  unit: string;
  category: string;
};

/**
 * 食材集約ロジック
 * - 同一食材名 + 同一単位 → 合算
 * - 同一食材名 + 異なる単位 → 別行
 * - servings比で分量調整
 *
 * confirm API と generate_shopping_list FC の両方から呼ぶ
 */
export function aggregateIngredients(slots: SlotWithRecipe[]): AggregatedItem[] {
  const map = new Map<string, AggregatedItem>();

  for (const slot of slots) {
    if (!slot.recipes) continue;

    const ratio = slot.servings / slot.recipes.servings_base;

    for (const ing of slot.recipes.recipe_ingredients) {
      const key = `${ing.name}::${ing.unit}`;
      const adjusted = ing.amount * ratio;

      if (map.has(key)) {
        map.get(key)!.totalAmount += adjusted;
      } else {
        map.set(key, {
          name: ing.name,
          totalAmount: adjusted,
          unit: ing.unit,
          category: guessCategory(ing.name),
        });
      }
    }
  }

  return Array.from(map.values());
}

function guessCategory(name: string): string {
  const meat = ["肉", "豚", "鶏", "牛", "ひき肉", "ベーコン", "ウインナー", "鮭", "魚", "えび", "ツナ"];
  const vegetable = ["大根", "玉ねぎ", "にんじん", "キャベツ", "もやし", "ほうれん草", "白菜", "じゃがいも", "ネギ", "きのこ", "しめじ", "トマト"];
  const seasoning = ["醤油", "みりん", "酒", "砂糖", "塩", "胡椒", "味噌", "酢", "油", "バター", "だし", "コンソメ", "ケチャップ", "マヨネーズ"];

  if (meat.some(m => name.includes(m))) return "meat";
  if (vegetable.some(v => name.includes(v))) return "vegetable";
  if (seasoning.some(s => name.includes(s))) return "seasoning";
  return "other";
}
