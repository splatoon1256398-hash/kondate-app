import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";
import type { CreateShoppingItem } from "@/types/shopping-list";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/shopping-lists/[id]/items
 * 手動で買い物アイテムを追加
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();
    const body: CreateShoppingItem = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { data: null, error: "name is required" } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("shopping_items")
      .insert({
        shopping_list_id: id,
        name: body.name,
        amount: body.amount ?? null,
        unit: body.unit ?? null,
        category: body.category ?? "other",
        is_checked: false,
      })
      .select("id, name, amount, unit, category, is_checked, checked_by")
      .single();

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
