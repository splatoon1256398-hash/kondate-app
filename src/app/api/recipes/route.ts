import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";
import type { RecipeListItem, CreateRecipe } from "@/types/recipe";

/**
 * GET /api/recipes?q=&cook_method=&limit=&offset=
 * レシピ検索
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { searchParams } = request.nextUrl;

    const q = searchParams.get("q");
    const cookMethod = searchParams.get("cook_method");
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    let query = supabase
      .from("recipes")
      .select("id, title, cook_method, hotcook_menu_number, prep_time_min, cook_time_min, source, is_favorite");

    if (q) {
      query = query.ilike("title", `%${q}%`);
    }
    if (cookMethod) {
      query = query.eq("cook_method", cookMethod);
    }

    const isFavorite = searchParams.get("is_favorite");
    if (isFavorite === "true") {
      query = query.eq("is_favorite", true);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: data as RecipeListItem[], error: null } satisfies ApiResponse<RecipeListItem[]>,
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

/**
 * POST /api/recipes
 * 新規レシピ登録（材料・手順含む）
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body: CreateRecipe = await request.json();

    if (!body.title) {
      return NextResponse.json(
        { data: null, error: "title is required" } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    // 1. recipes INSERT
    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .insert({
        title: body.title,
        description: body.description ?? null,
        servings_base: body.servings_base,
        cook_method: body.cook_method,
        hotcook_menu_number: body.hotcook_menu_number ?? null,
        hotcook_unit: body.hotcook_unit ?? null,
        prep_time_min: body.prep_time_min ?? null,
        cook_time_min: body.cook_time_min ?? null,
        source: body.source,
      })
      .select("id")
      .single();

    if (recipeError) {
      return NextResponse.json(
        { data: null, error: recipeError.message } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    // 2. recipe_ingredients INSERT
    if (body.ingredients && body.ingredients.length > 0) {
      const { error: ingError } = await supabase
        .from("recipe_ingredients")
        .insert(
          body.ingredients.map((i) => ({
            recipe_id: recipe.id,
            name: i.name,
            amount: i.amount,
            unit: i.unit,
            sort_order: i.sort_order,
          }))
        );

      if (ingError) {
        return NextResponse.json(
          { data: null, error: ingError.message } satisfies ApiResponse<null>,
          { status: 500 }
        );
      }
    }

    // 3. recipe_steps INSERT
    if (body.steps && body.steps.length > 0) {
      const { error: stepsError } = await supabase
        .from("recipe_steps")
        .insert(
          body.steps.map((s) => ({
            recipe_id: recipe.id,
            step_number: s.step_number,
            instruction: s.instruction,
            tip: s.tip ?? null,
          }))
        );

      if (stepsError) {
        return NextResponse.json(
          { data: null, error: stepsError.message } satisfies ApiResponse<null>,
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { data: { id: recipe.id }, error: null } satisfies ApiResponse<{ id: string }>,
      { status: 201 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json(
      { data: null, error: message } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}
