import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";
import type { RecipeListItem } from "@/types/recipe";

// COCORO+ ホットクック人気ランキング（公式サイトの閲覧数ベース）
// 定番の人気メニューをタイトルで検索
const POPULAR_TITLES = [
  "肉じゃが",
  "カレー",
  "豚バラ大根",
  "鶏と大根",
  "ポトフ",
  "ビーフシチュー",
  "クリームシチュー",
  "豚の角煮",
  "筑前煮",
  "無水カレー",
  "さばの味噌煮",
  "手羽元",
  "回鍋肉",
  "麻婆豆腐",
  "ハンバーグ",
  "ミネストローネ",
  "豚汁",
  "鶏ハム",
  "炊き込みご飯",
  "おでん",
];

/**
 * GET /api/recipes/popular
 * 人気レシピ（COCORO+ ランキング準拠 + アプリ内使用頻度）
 */
export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    // 1. Get all hotcook recipes
    const { data: allRecipes } = await supabase
      .from("recipes")
      .select("id, title, cook_method, hotcook_menu_number, prep_time_min, cook_time_min, source, is_favorite, image_url")
      .eq("cook_method", "hotcook")
      .order("title");

    if (!allRecipes || allRecipes.length === 0) {
      return NextResponse.json(
        { data: [], error: null } satisfies ApiResponse<RecipeListItem[]>,
        { status: 200 }
      );
    }

    // 2. Match popular titles (fuzzy match)
    const matched: (RecipeListItem & { rank: number })[] = [];
    for (let i = 0; i < POPULAR_TITLES.length; i++) {
      const keyword = POPULAR_TITLES[i];
      const found = allRecipes.find((r) =>
        r.title.includes(keyword) && !matched.some((m) => m.id === r.id)
      );
      if (found) {
        matched.push({ ...(found as RecipeListItem), rank: i });
      }
    }

    // 3. Also add frequently used recipes from meal_slots
    const { data: slots } = await supabase
      .from("meal_slots")
      .select("recipe_id")
      .not("recipe_id", "is", null)
      .eq("is_skipped", false);

    const countMap = new Map<string, number>();
    for (const s of slots || []) {
      countMap.set(s.recipe_id, (countMap.get(s.recipe_id) || 0) + 1);
    }

    // Add top used recipes that aren't already in the list
    const usedIds = Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);

    for (const id of usedIds) {
      if (matched.some((m) => m.id === id)) continue;
      const recipe = allRecipes.find((r) => r.id === id);
      if (recipe) {
        matched.push({ ...(recipe as RecipeListItem), rank: matched.length });
      }
    }

    // Sort by rank
    matched.sort((a, b) => a.rank - b.rank);

    const result = matched.slice(0, 20).map(({ rank: _rank, ...r }) => r);

    return NextResponse.json(
      { data: result, error: null } satisfies ApiResponse<RecipeListItem[]>,
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
