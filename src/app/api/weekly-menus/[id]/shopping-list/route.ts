import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { executeGenerateShoppingList } from "@/lib/gemini/handlers";
import type { ApiResponse } from "@/types/common";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/weekly-menus/[id]/shopping-list
 * 指定した週間献立の買い物リストを (再) 生成する。
 * 既存の shopping_list があれば削除して作り直すため冪等。
 * pantry 差し引き・常備品除外も行う。
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();

    const { data: menu } = await supabase
      .from("weekly_menus")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();

    if (!menu) {
      return NextResponse.json(
        { data: null, error: "Weekly menu not found" } satisfies ApiResponse<null>,
        { status: 404 }
      );
    }

    const result = await executeGenerateShoppingList(supabase, { weekly_menu_id: id });

    return NextResponse.json(
      { data: result, error: null } satisfies ApiResponse<typeof result>,
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
