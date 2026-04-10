import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";
import type {
  WeeklyMenuResponse,
  MealSlotResponse,
  CreateWeeklyMenu,
} from "@/types/weekly-menu";

// 今週の月曜日を返す
function getCurrentMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day; // 日曜=0の場合は-6
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().split("T")[0];
}

/**
 * GET /api/weekly-menus?week_start_date=YYYY-MM-DD
 * 指定した週の献立を取得。存在しない場合は data: null を返す。
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();

    const { searchParams } = request.nextUrl;
    const weekStartDate = searchParams.get("week_start_date") || getCurrentMonday();

    const { data, error } = await supabase
      .from("weekly_menus")
      .select(`
        *,
        meal_slots (
          id, date, meal_type, servings, recipe_id, memo, is_skipped, cooked_at,
          recipes ( title )
        )
      `)
      .eq("week_start_date", weekStartDate)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { data: null, error: null } satisfies ApiResponse<null>,
        { status: 200 }
      );
    }

    // レスポンス整形
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
 * POST /api/weekly-menus
 * 新しい週間献立を作成。
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();

    const body: CreateWeeklyMenu = await request.json();

    if (!body.week_start_date) {
      return NextResponse.json(
        { data: null, error: "week_start_date is required" } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    // 日付フォーマットの簡易バリデーション
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.week_start_date)) {
      return NextResponse.json(
        { data: null, error: "week_start_date must be YYYY-MM-DD format" } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("weekly_menus")
      .insert({
        week_start_date: body.week_start_date,
        notes: body.notes ?? null,
      })
      .select("id, week_start_date, status")
      .single();

    if (error) {
      // UNIQUE制約違反の場合
      if (error.code === "23505") {
        return NextResponse.json(
          { data: null, error: "A menu for this week already exists" } satisfies ApiResponse<null>,
          { status: 400 }
        );
      }
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
