import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";
import type { CreateMealSlots } from "@/types/meal-slot";

/**
 * POST /api/meal-slots
 * AI提案結果を一括で登録する際に使用。
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body: CreateMealSlots = await request.json();

    if (!body.weekly_menu_id || !body.slots || body.slots.length === 0) {
      return NextResponse.json(
        { data: null, error: "weekly_menu_id and slots are required" } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    const rows = body.slots.map((slot) => ({
      weekly_menu_id: body.weekly_menu_id,
      date: slot.date,
      meal_type: slot.meal_type,
      servings: slot.servings,
      recipe_id: slot.recipe_id ?? null,
      memo: slot.memo ?? null,
      is_skipped: slot.is_skipped ?? false,
    }));

    const { data, error } = await supabase
      .from("meal_slots")
      .insert(rows)
      .select("id, date, meal_type");

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data, error: null } satisfies ApiResponse<typeof data>,
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
