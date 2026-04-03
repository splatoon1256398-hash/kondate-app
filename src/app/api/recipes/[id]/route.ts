import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";
import type { RecipeDetail } from "@/types/recipe";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/recipes/[id]?servings=N
 * レシピ詳細（材料 + 手順を含む）。servingsで分量を自動計算。
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();

    const { searchParams } = request.nextUrl;
    const servingsParam = searchParams.get("servings");

    const { data, error } = await supabase
      .from("recipes")
      .select(`
        *,
        recipe_ingredients ( id, name, amount, unit, sort_order ),
        recipe_steps ( id, step_number, instruction, tip )
      `)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { data: null, error: "Recipe not found" } satisfies ApiResponse<null>,
        { status: 404 }
      );
    }

    // servings指定がある場合は分量を計算
    const servings = servingsParam ? parseInt(servingsParam, 10) : data.servings_base;
    const ratio = servings / data.servings_base;

    const response: RecipeDetail = {
      id: data.id,
      title: data.title,
      description: data.description,
      servings_base: data.servings_base,
      cook_method: data.cook_method,
      hotcook_menu_number: data.hotcook_menu_number,
      hotcook_unit: data.hotcook_unit,
      prep_time_min: data.prep_time_min,
      cook_time_min: data.cook_time_min,
      source: data.source,
      ingredients: (data.recipe_ingredients || [])
        .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
        .map((i: { id: string; name: string; amount: number; unit: string; sort_order: number }) => ({
          id: i.id,
          name: i.name,
          amount: Math.round(i.amount * ratio * 10) / 10,
          unit: i.unit,
          sort_order: i.sort_order,
        })),
      steps: (data.recipe_steps || [])
        .sort((a: { step_number: number }, b: { step_number: number }) => a.step_number - b.step_number)
        .map((s: { id: string; step_number: number; instruction: string; tip: string | null }) => ({
          id: s.id,
          step_number: s.step_number,
          instruction: s.instruction,
          tip: s.tip,
        })),
    };

    return NextResponse.json(
      { data: response, error: null } satisfies ApiResponse<RecipeDetail>,
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
