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
    if (!slot.recipes || !slot.recipes.servings_base) continue;

    const ratio = slot.servings / slot.recipes.servings_base;
    if (!isFinite(ratio) || ratio <= 0) continue;

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
  const meatFish = ["肉", "豚", "鶏", "牛", "ひき肉", "ベーコン", "ウインナー", "ソーセージ", "ハム", "鮭", "魚", "えび", "いか", "たこ", "しらす", "ツナ", "さば", "あじ", "ぶり", "まぐろ", "かつお"];
  const dairyEgg = ["卵", "たまご", "牛乳", "チーズ", "ヨーグルト", "生クリーム"];
  const tofuNatto = ["豆腐", "納豆", "油揚げ", "厚揚げ", "こんにゃく", "はんぺん", "ちくわ", "かまぼこ", "練り物"];
  const vegetable = ["大根", "玉ねぎ", "にんじん", "キャベツ", "もやし", "ほうれん草", "白菜", "じゃがいも", "ネギ", "ねぎ", "長ねぎ", "きのこ", "しめじ", "えのき", "エリンギ", "まいたけ", "トマト", "ピーマン", "なす", "かぼちゃ", "ブロッコリー", "小松菜", "レタス", "きゅうり", "ごぼう", "れんこん", "さつまいも", "里芋", "にら", "水菜", "春菊", "セロリ", "アスパラ", "オクラ", "ズッキーニ", "パプリカ", "しょうが", "にんにく"];
  const seasoning = ["醤油", "しょうゆ", "みりん", "酒", "砂糖", "塩", "胡椒", "こしょう", "味噌", "みそ", "酢", "油", "バター", "だし", "コンソメ", "ケチャップ", "マヨネーズ", "ソース", "ルー", "めんつゆ", "ポン酢", "オイスターソース", "ナンプラー", "豆板醤", "甜麺醤", "カレー粉", "ごま油", "オリーブオイル", "料理酒"];
  const dryGoods = ["パスタ", "うどん", "そば", "そうめん", "米", "パン粉", "小麦粉", "片栗粉", "ツナ缶", "トマト缶", "春雨", "乾燥わかめ", "海苔", "ごま", "鰹節", "昆布", "切り干し大根", "高野豆腐", "マカロニ"];
  const frozen = ["冷凍"];

  if (meatFish.some(m => name.includes(m))) return "meat_fish";
  if (dairyEgg.some(m => name.includes(m))) return "dairy_egg";
  if (tofuNatto.some(m => name.includes(m))) return "tofu_natto";
  if (vegetable.some(v => name.includes(v))) return "vegetable";
  if (seasoning.some(s => name.includes(s))) return "seasoning";
  if (dryGoods.some(d => name.includes(d))) return "dry_goods";
  if (frozen.some(f => name.includes(f))) return "frozen";
  return "other";
}
