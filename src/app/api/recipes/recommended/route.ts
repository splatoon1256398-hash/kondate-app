import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";
import type { RecipeListItem } from "@/types/recipe";

/**
 * GET /api/recipes/recommended
 * おすすめレシピを返す
 * - 殿堂入り（is_favorite）
 * - 高評価（recipe_ratingsの平均が高い順）
 * - 最近使っていない（マンネリ防止）
 * - ホットクックレシピ優先
 */
export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];

    // Get recently used recipe IDs to exclude
    const { data: recentSlots } = await supabase
      .from("meal_slots")
      .select("recipe_id")
      .gte("date", twoWeeksAgo)
      .not("recipe_id", "is", null);

    const recentIds = new Set((recentSlots || []).map((s) => s.recipe_id));

    // Get favorites first
    const { data: favorites } = await supabase
      .from("recipes")
      .select("id, title, cook_method, hotcook_menu_number, prep_time_min, cook_time_min, source, is_favorite, image_url")
      .eq("is_favorite", true)
      .order("title")
      .limit(10);

    // Get top-rated recipes (via ratings)
    const { data: ratings } = await supabase
      .from("recipe_ratings")
      .select("recipe_id, rating");

    const ratingMap = new Map<string, { sum: number; count: number }>();
    for (const r of ratings || []) {
      const existing = ratingMap.get(r.recipe_id) || { sum: 0, count: 0 };
      existing.sum += r.rating;
      existing.count += 1;
      ratingMap.set(r.recipe_id, existing);
    }

    const topRatedIds = Array.from(ratingMap.entries())
      .map(([id, { sum, count }]) => ({ id, avg: sum / count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 20)
      .map((r) => r.id);

    let topRated: RecipeListItem[] = [];
    if (topRatedIds.length > 0) {
      const { data } = await supabase
        .from("recipes")
        .select("id, title, cook_method, hotcook_menu_number, prep_time_min, cook_time_min, source, is_favorite, image_url")
        .in("id", topRatedIds);
      topRated = (data || []) as RecipeListItem[];
    }

    // Get popular hotcook recipes (recently imported, diverse)
    const { data: popular } = await supabase
      .from("recipes")
      .select("id, title, cook_method, hotcook_menu_number, prep_time_min, cook_time_min, source, is_favorite, image_url")
      .eq("cook_method", "hotcook")
      .not("hotcook_menu_number", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);

    // Build recommendation list with scoring
    const allRecipes = new Map<string, RecipeListItem & { score: number }>();

    // Score favorites highest
    for (const r of (favorites || []) as RecipeListItem[]) {
      allRecipes.set(r.id, { ...r, score: 100 });
    }

    // Score top-rated
    for (const r of topRated) {
      const existing = allRecipes.get(r.id);
      if (existing) {
        existing.score += 50;
      } else {
        allRecipes.set(r.id, { ...r, score: 50 });
      }
    }

    // Score popular hotcook recipes
    for (const r of (popular || []) as RecipeListItem[]) {
      if (allRecipes.has(r.id)) continue;
      // Bonus if not recently used
      const notRecent = !recentIds.has(r.id);
      allRecipes.set(r.id, { ...r, score: notRecent ? 30 : 10 });
    }

    // Sort by score desc, take top 20
    const recommended = Array.from(allRecipes.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(({ score: _score, ...r }) => r);

    return NextResponse.json(
      { data: recommended, error: null } satisfies ApiResponse<RecipeListItem[]>,
      { status: 200 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json(
      { data: null, error: message } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}
