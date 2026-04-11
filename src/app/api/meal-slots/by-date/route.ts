import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";

/**
 * GET /api/meal-slots/by-date?date=YYYY-MM-DD&meal_type=dinner
 * 指定日・食事種別の meal_slot を返す。相談画面から「今日の夜に反映」用。
 * 該当スロットが無い場合は data: null を返す（呼び出し側でエラーメッセージ）。
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { searchParams } = request.nextUrl;
    const date = searchParams.get("date");
    const mealType = searchParams.get("meal_type");

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { data: null, error: "date(YYYY-MM-DD) is required" } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }
    if (mealType !== "lunch" && mealType !== "dinner") {
      return NextResponse.json(
        { data: null, error: "meal_type must be lunch or dinner" } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("meal_slots")
      .select("id, date, meal_type, servings, recipe_id, memo, is_skipped, cooked_at")
      .eq("date", date)
      .eq("meal_type", mealType)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: data ?? null, error: null } satisfies ApiResponse<typeof data>,
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
