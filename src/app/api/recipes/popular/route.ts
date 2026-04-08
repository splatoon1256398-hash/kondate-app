import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";
import type { RecipeListItem } from "@/types/recipe";

/**
 * GET /api/recipes/popular
 * 人気レシピ（献立で多く使われた順）
 */
export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    // Count how many times each recipe has been used in meal_slots
    const { data: slots } = await supabase
      .from("meal_slots")
      .select("recipe_id")
      .not("recipe_id", "is", null)
      .eq("is_skipped", false);

    const countMap = new Map<string, number>();
    for (const s of slots || []) {
      countMap.set(s.recipe_id, (countMap.get(s.recipe_id) || 0) + 1);
    }

    // Sort by usage count
    const topIds = Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([id]) => id);

    let popular: RecipeListItem[] = [];
    if (topIds.length > 0) {
      const { data } = await supabase
        .from("recipes")
        .select("id, title, cook_method, hotcook_menu_number, prep_time_min, cook_time_min, source, is_favorite, image_url")
        .in("id", topIds);

      // Sort by usage count
      const dataMap = new Map((data || []).map((r) => [r.id, r]));
      popular = topIds
        .map((id) => dataMap.get(id))
        .filter((r): r is NonNullable<typeof r> => !!r) as RecipeListItem[];
    }

    // If not enough usage data, fill with hotcook recipes
    if (popular.length < 10) {
      const { data: hotcookRecipes } = await supabase
        .from("recipes")
        .select("id, title, cook_method, hotcook_menu_number, prep_time_min, cook_time_min, source, is_favorite, image_url")
        .eq("cook_method", "hotcook")
        .not("image_url", "is", null)
        .order("title")
        .limit(20);

      const existingIds = new Set(popular.map((r) => r.id));
      for (const r of (hotcookRecipes || []) as RecipeListItem[]) {
        if (!existingIds.has(r.id)) {
          popular.push(r);
          if (popular.length >= 20) break;
        }
      }
    }

    return NextResponse.json(
      { data: popular, error: null } satisfies ApiResponse<RecipeListItem[]>,
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
