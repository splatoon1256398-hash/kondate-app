import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";
import type { RecipeListItem } from "@/types/recipe";

/**
 * GET /api/recipes/by-ingredient?name=ほうれん草&limit=20
 * 指定した食材を使っているレシピを返す（在庫→レシピ逆引き用）。
 * 部分一致で recipe_ingredients.name を検索し、関連する recipes を返す。
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { searchParams } = request.nextUrl;
    const name = searchParams.get("name")?.trim();
    const limit = Math.min(parseInt(searchParams.get("limit") || "30", 10), 100);

    if (!name) {
      return NextResponse.json(
        { data: null, error: "name is required" } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    // 部分一致で recipe_id を拾う
    const { data: ingRows, error: ingError } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id")
      .ilike("name", `%${name}%`);

    if (ingError) {
      return NextResponse.json(
        { data: null, error: ingError.message } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    const recipeIds = Array.from(
      new Set((ingRows || []).map((r: { recipe_id: string }) => r.recipe_id))
    );

    if (recipeIds.length === 0) {
      return NextResponse.json(
        { data: [], error: null } satisfies ApiResponse<RecipeListItem[]>,
        { status: 200 }
      );
    }

    const { data: recipes, error: recipeError } = await supabase
      .from("recipes")
      .select(
        "id, title, cook_method, hotcook_menu_number, prep_time_min, cook_time_min, source, is_favorite, image_url"
      )
      .in("id", recipeIds)
      .order("is_favorite", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (recipeError) {
      return NextResponse.json(
        { data: null, error: recipeError.message } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        data: (recipes || []) as RecipeListItem[],
        error: null,
      } satisfies ApiResponse<RecipeListItem[]>,
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
