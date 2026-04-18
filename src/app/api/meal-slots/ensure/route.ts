import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";
import { getMonday } from "@/lib/utils/date";

/**
 * POST /api/meal-slots/ensure
 * 指定 (date, meal_type) の meal_slot が無ければ、該当週の weekly_menu ごと作成してから
 * 空スロットを1件作って返す。既にあれば既存を返す。
 *
 * 相談タブで「献立が無い週」にも一発で反映できるようにするため。
 *
 * Body: { date: "YYYY-MM-DD", meal_type: "lunch"|"dinner", servings?: number }
 * Response: 該当 meal_slot (新規 or 既存)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body: { date?: string; meal_type?: string; servings?: number } =
      await request.json();

    const { date, meal_type, servings } = body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { data: null, error: "date(YYYY-MM-DD) is required" } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }
    if (meal_type !== "lunch" && meal_type !== "dinner") {
      return NextResponse.json(
        {
          data: null,
          error: "meal_type must be lunch or dinner",
        } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    // 1. 既存 slot チェック
    const { data: existing } = await supabase
      .from("meal_slots")
      .select("id, date, meal_type, servings, recipe_id, memo, is_skipped, cooked_at")
      .eq("date", date)
      .eq("meal_type", meal_type)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { data: existing, error: null } satisfies ApiResponse<typeof existing>,
        { status: 200 }
      );
    }

    // 2. 該当週の weekly_menu を取得 (無ければ作る)
    const weekStart = getMonday(new Date(date));

    const { data: menu, error: menuErr } = await supabase
      .from("weekly_menus")
      .upsert(
        {
          week_start_date: weekStart,
          status: "draft",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "week_start_date" }
      )
      .select("id")
      .single();

    if (menuErr || !menu) {
      return NextResponse.json(
        { data: null, error: menuErr?.message || "weekly_menu 作成に失敗" } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    // 3. 空 slot を作成
    const { data: slot, error: slotErr } = await supabase
      .from("meal_slots")
      .insert({
        weekly_menu_id: menu.id,
        date,
        meal_type,
        servings: servings || 2,
        is_skipped: false,
      })
      .select("id, date, meal_type, servings, recipe_id, memo, is_skipped, cooked_at")
      .single();

    if (slotErr || !slot) {
      return NextResponse.json(
        {
          data: null,
          error: slotErr?.message || "meal_slot 作成に失敗",
        } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: slot, error: null } satisfies ApiResponse<typeof slot>,
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
