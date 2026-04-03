import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";
import type { UpdateShoppingItem } from "@/types/shopping-list";

type Params = { params: Promise<{ id: string; itemId: string }> };

/**
 * PATCH /api/shopping-lists/[id]/items/[itemId]
 * チェック状態の更新等。Supabase Realtimeで2人に同期。
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { itemId } = await params;
    const supabase = createSupabaseServerClient();
    const body: UpdateShoppingItem = await request.json();

    const updates: Record<string, unknown> = {};
    if (body.is_checked !== undefined) updates.is_checked = body.is_checked;
    if (body.checked_by !== undefined) updates.checked_by = body.checked_by;
    if (body.amount !== undefined) updates.amount = body.amount;
    if (body.name !== undefined) updates.name = body.name;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { data: null, error: "No fields to update" } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("shopping_items")
      .update(updates)
      .eq("id", itemId)
      .select("id, name, amount, unit, category, is_checked, checked_by")
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
 * DELETE /api/shopping-lists/[id]/items/[itemId]
 * 買い物アイテムの削除
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { itemId } = await params;
    const supabase = createSupabaseServerClient();

    const { error } = await supabase
      .from("shopping_items")
      .delete()
      .eq("id", itemId);

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: { id: itemId }, error: null } satisfies ApiResponse<{ id: string }>,
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
