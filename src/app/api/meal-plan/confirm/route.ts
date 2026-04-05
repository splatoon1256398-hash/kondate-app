import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  executeSaveWeeklyMenu,
  executeGenerateShoppingList,
  validateSaveArgs,
} from "@/lib/gemini/handlers";
import type { ApiResponse } from "@/types/common";

/**
 * POST /api/meal-plan/confirm
 * 提案データをそのままDB保存 + 買い物リスト生成（Geminiを経由しない）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate with Zod
    const validation = validateSaveArgs(body);
    if (!validation.success) {
      return NextResponse.json(
        { data: null, error: validation.error } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();

    // 1. Save weekly menu + recipes + meal slots
    const saveResult = await executeSaveWeeklyMenu(supabase, validation.data);

    // 2. Generate shopping list
    let shoppingListId: string | null = null;
    try {
      const shoppingResult = await executeGenerateShoppingList(supabase, {
        weekly_menu_id: saveResult.weekly_menu_id,
      });
      shoppingListId = shoppingResult.shopping_list_id;
    } catch (e) {
      console.error("[confirm] shopping list generation failed:", e);
      // Partial success — menu saved but shopping list failed
    }

    return NextResponse.json(
      {
        data: {
          weekly_menu_id: saveResult.weekly_menu_id,
          saved_slots: saveResult.saved_slots,
          shopping_list_id: shoppingListId,
        },
        error: null,
      } satisfies ApiResponse<{
        weekly_menu_id: string;
        saved_slots: number;
        shopping_list_id: string | null;
      }>,
      { status: 200 }
    );
  } catch (e) {
    console.error("[confirm] error:", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json(
      { data: null, error: message } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}
