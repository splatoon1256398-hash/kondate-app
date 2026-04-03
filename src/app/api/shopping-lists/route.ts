import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";
import type { ShoppingListResponse } from "@/types/shopping-list";

/**
 * GET /api/shopping-lists?status=active
 * 買い物リスト一覧を取得
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status") || "active";

    const { data, error } = await supabase
      .from("shopping_lists")
      .select(`
        id, weekly_menu_id, status, created_at,
        weekly_menus ( week_start_date ),
        shopping_items ( id, name, amount, unit, category, is_checked, checked_by )
      `)
      .eq("status", status)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    const response: ShoppingListResponse[] = (data || []).map(
      (list) => {
        const weeklyMenus = list.weekly_menus as unknown as { week_start_date: string } | null;
        return {
          id: list.id,
          weekly_menu_id: list.weekly_menu_id,
          status: list.status as ShoppingListResponse["status"],
          week_start_date: weeklyMenus?.week_start_date ?? "",
          items: (list.shopping_items || []) as unknown as ShoppingListResponse["items"],
        };
      }
    );

    return NextResponse.json(
      { data: response, error: null } satisfies ApiResponse<ShoppingListResponse[]>,
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
