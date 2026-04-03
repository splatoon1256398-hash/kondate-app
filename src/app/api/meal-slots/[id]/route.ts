import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";
import type { UpdateMealSlot } from "@/types/meal-slot";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/meal-slots/[id]
 * 個別の食事枠を更新（外食に変更、レシピ差し替え、人数変更など）
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();
    const body: UpdateMealSlot = await request.json();

    const updates: Record<string, unknown> = {};
    if (body.servings !== undefined) updates.servings = body.servings;
    if (body.recipe_id !== undefined) updates.recipe_id = body.recipe_id;
    if (body.memo !== undefined) updates.memo = body.memo;
    if (body.is_skipped !== undefined) updates.is_skipped = body.is_skipped;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { data: null, error: "No fields to update" } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("meal_slots")
      .update(updates)
      .eq("id", id)
      .select("id, date, meal_type, servings, recipe_id, memo, is_skipped")
      .single();

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message } satisfies ApiResponse<null>,
        { status: error.code === "PGRST116" ? 404 : 500 }
      );
    }

    return NextResponse.json(
      { data, error: null } satisfies ApiResponse<typeof data>,
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
 * DELETE /api/meal-slots/[id]
 * 食事枠を削除
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();

    const { error } = await supabase
      .from("meal_slots")
      .delete()
      .eq("id", id);

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
