/**
 * AIプロンプトに注入するレシピを選別するフィルタ。
 *
 * 目的:
 *  - 「ヘルシオデリ」等の宅配キット前提レシピ (材料が "専用ソース" だけで中身不明)
 *    をAI候補から除外する
 *  - トークン浪費と品質低下の原因になる 300 件一括注入を、
 *    「殿堂入り / 高評価 / 直近使用」を優先した 60 件程度に絞る
 *
 * 注意: recipes テーブルに `is_kit` カラム (boolean) が追加されていれば
 *       DB 側で立っているフラグを優先。未マイグレーションの環境では
 *       「material_count < 3 かつ source='imported'」をフォールバック判定に使う。
 */

export type RecipeLite = {
  id: string;
  title?: string;
  cook_method?: string;
  cook_time_min?: number | null;
  source?: string | null;
  is_favorite?: boolean | null;
  is_kit?: boolean | null;
};

export type RatingLite = { avg: number | null; count: number };

/**
 * 宅配キット系レシピか判定する。
 * - DB上 `is_kit=true` なら即 true
 * - インポート元で材料 3 件未満のものは「中身がカットキット」の可能性が高いので true
 */
export function isKitRecipe(
  recipe: { source?: string | null; is_kit?: boolean | null },
  ingredientCount: number
): boolean {
  if (recipe.is_kit === true) return true;
  const src = recipe.source ?? "";
  if (src === "imported" && ingredientCount < 3) return true;
  return false;
}

/**
 * プロンプト注入用にレシピを優先順位付きで絞り込む。
 *
 * 優先度:
 *   1. 殿堂入り (is_favorite)
 *   2. 高評価 (avg >= minRating)
 *   3. 直近使用 (recentlyUsedIds)
 *   4. その他 (少数のみ)
 *
 * いずれもキット系は除外。最大 maxCount 件に打ち切り。
 */
export function filterPromptRecipes<T extends RecipeLite>(
  recipes: T[],
  ingredientCounts: Map<string, number>,
  ratingMap: Map<string, RatingLite>,
  recentlyUsedIds: Set<string>,
  opts: { minRating?: number; maxCount?: number; maxOthers?: number } = {}
): T[] {
  const minRating = opts.minRating ?? 3.5;
  const maxCount = opts.maxCount ?? 60;
  const maxOthers = opts.maxOthers ?? 10;

  const nonKit = recipes.filter(
    (r) => !isKitRecipe(r, ingredientCounts.get(r.id) ?? 99)
  );

  const favorites: T[] = [];
  const highRated: T[] = [];
  const recent: T[] = [];
  const others: T[] = [];

  for (const r of nonKit) {
    if (r.is_favorite) {
      favorites.push(r);
      continue;
    }
    const rating = ratingMap.get(r.id);
    if (rating?.avg != null && rating.avg >= minRating) {
      highRated.push(r);
      continue;
    }
    if (recentlyUsedIds.has(r.id)) {
      recent.push(r);
      continue;
    }
    others.push(r);
  }

  return [
    ...favorites,
    ...highRated,
    ...recent,
    ...others.slice(0, maxOthers),
  ].slice(0, maxCount);
}
