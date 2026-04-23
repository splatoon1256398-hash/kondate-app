import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";
import type { RecipeDetail, CreateRecipe } from "@/types/recipe";

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
    const parsed = servingsParam ? parseInt(servingsParam, 10) : NaN;
    const servings = Number.isFinite(parsed) && parsed > 0 ? parsed : data.servings_base;
    const ratio = data.servings_base > 0 ? servings / data.servings_base : 1;

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
      is_favorite: data.is_favorite ?? false,
      image_url: data.image_url ?? null,
      ingredients: (data.recipe_ingredients || [])
        .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
        .map((i: { id: string; name: string; amount: number; unit: string; sort_order: number }) => ({
          id: i.id,
          name: i.name,
          amount: i.amount * ratio,
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

/**
 * PUT /api/recipes/[id]
 * レシピ更新（材料・手順を含む全置換）
 */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();
    const body: Partial<CreateRecipe> = await request.json();

    // 1. Update recipe fields
    const updateFields: Record<string, unknown> = {};
    if (body.title !== undefined) updateFields.title = body.title;
    if (body.description !== undefined) updateFields.description = body.description;
    if (body.servings_base !== undefined) updateFields.servings_base = body.servings_base;
    if (body.cook_method !== undefined) updateFields.cook_method = body.cook_method;
    if (body.hotcook_menu_number !== undefined) updateFields.hotcook_menu_number = body.hotcook_menu_number;
    if (body.hotcook_unit !== undefined) updateFields.hotcook_unit = body.hotcook_unit;
    if (body.prep_time_min !== undefined) updateFields.prep_time_min = body.prep_time_min;
    if (body.cook_time_min !== undefined) updateFields.cook_time_min = body.cook_time_min;
    if (body.source !== undefined) updateFields.source = body.source;

    if (Object.keys(updateFields).length > 0) {
      const { error } = await supabase.from("recipes").update(updateFields).eq("id", id);
      if (error) {
        return NextResponse.json(
          { data: null, error: error.message } satisfies ApiResponse<null>,
          { status: 500 }
        );
      }
    }

    // 2. Replace ingredients (delete + insert)
    if (body.ingredients) {
      await supabase.from("recipe_ingredients").delete().eq("recipe_id", id);
      if (body.ingredients.length > 0) {
        const { error } = await supabase.from("recipe_ingredients").insert(
          body.ingredients.map((i) => ({ recipe_id: id, ...i }))
        );
        if (error) {
          return NextResponse.json(
            { data: null, error: error.message } satisfies ApiResponse<null>,
            { status: 500 }
          );
        }
      }
    }

    // 3. Replace steps (delete + insert)
    if (body.steps) {
      await supabase.from("recipe_steps").delete().eq("recipe_id", id);
      if (body.steps.length > 0) {
        const { error } = await supabase.from("recipe_steps").insert(
          body.steps.map((s) => ({ recipe_id: id, ...s }))
        );
        if (error) {
          return NextResponse.json(
            { data: null, error: error.message } satisfies ApiResponse<null>,
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json(
      { data: { id }, error: null } satisfies ApiResponse<{ id: string }>,
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
 * DELETE /api/recipes/[id]
 * レシピ削除（CASCADE で材料・手順も削除）
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();

    // Check if recipe is used in any meal_slot
    const { data: usedSlots } = await supabase
      .from("meal_slots")
      .select("id")
      .eq("recipe_id", id)
      .limit(1);

    if (usedSlots && usedSlots.length > 0) {
      return NextResponse.json(
        { data: null, error: "このレシピは献立で使用中のため削除できません" } satisfies ApiResponse<null>,
        { status: 409 }
      );
    }

    // Delete ingredients + steps first (in case no CASCADE on DB)
    await supabase.from("recipe_ingredients").delete().eq("recipe_id", id);
    await supabase.from("recipe_steps").delete().eq("recipe_id", id);

    const { error } = await supabase.from("recipes").delete().eq("id", id);
    if (error) {
      return NextResponse.json(
        { data: null, error: error.message } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: { id }, error: null } satisfies ApiResponse<{ id: string }>,
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
