import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";
import type { WeeklyMenuResponse, MealSlotResponse } from "@/types/weekly-menu";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/weekly-menus/[id]
 * 週間献立の詳細取得（meal_slots + recipes含む）
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("weekly_menus")
      .select(`
        *,
        meal_slots (
          id, date, meal_type, servings, recipe_id, memo, is_skipped, cooked_at,
          recipes ( title )
        )
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
        { data: null, error: "Weekly menu not found" } satisfies ApiResponse<null>,
        { status: 404 }
      );
    }

    const response: WeeklyMenuResponse = {
      id: data.id,
      week_start_date: data.week_start_date,
      status: data.status,
      notes: data.notes,
      meal_slots: (data.meal_slots || []).map(
        (slot: { id: string; date: string; meal_type: string; servings: number; recipe_id: string | null; memo: string | null; is_skipped: boolean; cooked_at: string | null; recipes: { title: string } | null }): MealSlotResponse => ({
          id: slot.id,
          date: slot.date,
          meal_type: slot.meal_type as MealSlotResponse["meal_type"],
          servings: slot.servings,
          recipe_id: slot.recipe_id,
          recipe_title: slot.recipes?.title ?? null,
          memo: slot.memo,
          is_skipped: slot.is_skipped,
          cooked_at: slot.cooked_at,
        })
      ),
    };

    return NextResponse.json(
      { data: response, error: null } satisfies ApiResponse<WeeklyMenuResponse>,
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
 * PATCH /api/weekly-menus/[id]
 * 週間献立の更新（ステータス変更、メモ更新等）
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    if (body.status !== undefined) updates.status = body.status;
    if (body.notes !== undefined) updates.notes = body.notes;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { data: null, error: "No fields to update" } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("weekly_menus")
      .update(updates)
      .eq("id", id)
      .select("id, week_start_date, status, notes")
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
 * DELETE /api/weekly-menus/[id]
 * 週間献立を削除（CASCADE で meal_slots も削除）
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();

    const { error } = await supabase
      .from("weekly_menus")
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
