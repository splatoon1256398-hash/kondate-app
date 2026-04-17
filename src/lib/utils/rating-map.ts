import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * レシピ評価集約ヘルパ。
 *
 * recipe_ratings は per (recipe_id, user_name) で upsert されるスキーマ。
 * AI プロンプトとUIで共通に使うため、id→集約結果 Map を返す。
 */

export type RatingSummary = {
  avg: number | null;
  count: number;
  by_user: Record<string, number>;
};

export type RatedRecipeInfo = {
  /** 平均★ (1-5), 未評価は null */
  avg: number | null;
  /** 評価者数 */
  count: number;
  /** 殿堂入り (auto: avg>=4.5 & count>=2 もしくは manual toggle) */
  is_favorite: boolean;
};

/**
 * 指定レシピ群の rating サマリを返す。recipeIds 未指定なら全件。
 */
export async function getRecipeRatingsMap(
  supabase: SupabaseClient,
  recipeIds?: string[]
): Promise<Map<string, RatingSummary>> {
  let query = supabase
    .from("recipe_ratings")
    .select("recipe_id, user_name, rating");
  if (recipeIds && recipeIds.length > 0) {
    query = query.in("recipe_id", recipeIds);
  }
  const { data } = await query;

  const map = new Map<string, RatingSummary>();
  for (const r of (data || []) as {
    recipe_id: string;
    user_name: string;
    rating: number;
  }[]) {
    const existing = map.get(r.recipe_id) || {
      avg: null,
      count: 0,
      by_user: {},
    };
    existing.by_user[r.user_name] = r.rating;
    const vals = Object.values(existing.by_user);
    existing.count = vals.length;
    existing.avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    map.set(r.recipe_id, existing);
  }
  return map;
}

/**
 * AIプロンプト用: レシピ行末に「★4.5 ♥」「★2.0 ⚠️」等の tag をつける。
 */
export function formatRatingTag(
  rating: RatingSummary | undefined,
  isFavorite: boolean
): string {
  if (isFavorite) {
    const star = rating?.avg != null ? ` ★${rating.avg.toFixed(1)}` : "";
    return ` ♥殿堂入り${star}`;
  }
  if (!rating || rating.count === 0) return "";
  const avg = rating.avg ?? 0;
  if (avg <= 2.5) return ` ★${avg.toFixed(1)}⚠️`;
  if (avg >= 4.0) return ` ★${avg.toFixed(1)}👍`;
  return ` ★${avg.toFixed(1)}`;
}

/**
 * プロンプトに差し込む「評価優先ルール」セクション本文。
 * 評価データが全く無ければ null (section 省略)。
 */
export function buildRatingPreferenceSection(
  ratingMap: Map<string, RatingSummary>,
  hasAnyFavorite: boolean
): string | null {
  if (ratingMap.size === 0 && !hasAnyFavorite) return null;
  return `## ⭐ 評価ベースの優先順位（在庫/鮮度の次の軸）
- **♥殿堂入り** (avg★4.5以上 / 手動指定): 味が保証されている。積極的に使う
- **★4.0以上 👍**: 好評、候補に入れてOK
- **★2.5以下 ⚠️**: 避ける（同じ在庫が使えるなら他のレシピを優先）
- **評価なし**: 新規開拓として普通に候補になる
`;
}

export function isLowRated(rating: RatingSummary | undefined): boolean {
  if (!rating || rating.count === 0) return false;
  return (rating.avg ?? 0) <= 2.5;
}
