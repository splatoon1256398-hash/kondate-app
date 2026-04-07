import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";
import type { ShoppingListResponse } from "@/types/shopping-list";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/shopping-lists/[id]
 * 買い物リストの詳細取得
 */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("shopping_lists")
      .select(`
        id, weekly_menu_id, status, actual_total, transaction_id,
        weekly_menus ( week_start_date ),
        shopping_items ( id, name, amount, unit, category, is_checked, checked_by )
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
        { data: null, error: "Shopping list not found" } satisfies ApiResponse<null>,
        { status: 404 }
      );
    }

    const response: ShoppingListResponse = {
      id: data.id,
      weekly_menu_id: data.weekly_menu_id,
      status: data.status as ShoppingListResponse["status"],
      week_start_date: (data.weekly_menus as unknown as { week_start_date: string } | null)?.week_start_date ?? "",
      actual_total: data.actual_total ?? null,
      transaction_id: data.transaction_id ?? null,
      items: (data.shopping_items as unknown as ShoppingListResponse["items"]) || [],
    };

    return NextResponse.json(
      { data: response, error: null } satisfies ApiResponse<ShoppingListResponse>,
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
 * PATCH /api/shopping-lists/[id]
 * ステータス更新（active → completed）
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();
    const body: { status?: string } = await request.json();

    if (!body.status) {
      return NextResponse.json(
        { data: null, error: "status is required" } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("shopping_lists")
      .update({ status: body.status })
      .eq("id", id)
      .select("id, status")
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
