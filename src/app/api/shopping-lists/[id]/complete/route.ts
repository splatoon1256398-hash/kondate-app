import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncShoppingToPantry } from "@/lib/utils/pantry-sync";
import type { ApiResponse } from "@/types/common";

type Params = { params: Promise<{ id: string }> };

type CompleteRequest = {
  actual_total: number;
  record_to_kakeibo: boolean;
};

/**
 * POST /api/shopping-lists/[id]/complete
 * 買い物完了 → 金額記録 + 家計簿連携 + 在庫追加
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();
    const body: CompleteRequest = await request.json();

    // 1. Update shopping list status and total
    const { error: updateError } = await supabase
      .from("shopping_lists")
      .update({
        status: "completed",
        actual_total: body.actual_total,
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        { data: null, error: updateError.message } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    // 2. Record to kakeibo (transactions table)
    let transactionId: string | null = null;
    if (body.record_to_kakeibo && body.actual_total > 0) {
      // Get shopping list info for context (week_start_date is in weekly_menus)
      const { data: listData } = await supabase
        .from("shopping_lists")
        .select("weekly_menus ( week_start_date )")
        .eq("id", id)
        .single();
      const list = {
        week_start_date: (listData?.weekly_menus as unknown as { week_start_date: string } | null)?.week_start_date,
      };

      const { data: tx, error: txError } = await supabase
        .from("transactions")
        .insert({
          user_type: "共同",
          type: "expense",
          date: new Date().toISOString().split("T")[0],
          category_main: "食費",
          category_sub: "食材",
          amount: body.actual_total,
          items: JSON.stringify({
            source: "kondate_app",
            shopping_list_id: id,
            week_start_date: list?.week_start_date,
          }),
        })
        .select("id")
        .single();

      if (!txError && tx) {
        transactionId = tx.id;
        await supabase
          .from("shopping_lists")
          .update({ transaction_id: tx.id })
          .eq("id", id);
      }
    }

    // 3. Sync checked items to pantry
    await syncShoppingToPantry(supabase, id);

    return NextResponse.json(
      {
        data: {
          shopping_list_id: id,
          actual_total: body.actual_total,
          transaction_id: transactionId,
          pantry_synced: true,
        },
        error: null,
      } satisfies ApiResponse<{
        shopping_list_id: string;
        actual_total: number;
        transaction_id: string | null;
        pantry_synced: boolean;
      }>,
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
