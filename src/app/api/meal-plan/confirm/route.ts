import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  executeSaveWeeklyMenu,
  executeGenerateShoppingList,
  validateSaveArgs,
} from "@/lib/gemini/handlers";
import { apiError, apiSuccess } from "@/lib/api/response";

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
      return apiError(validation.error, 400);
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

    return apiSuccess<{
      weekly_menu_id: string;
      saved_slots: number;
      shopping_list_id: string | null;
    }>(
      {
        weekly_menu_id: saveResult.weekly_menu_id,
        saved_slots: saveResult.saved_slots,
        shopping_list_id: shoppingListId,
      },
      200
    );
  } catch (e) {
    console.error("[confirm] error:", e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return apiError(message, 500);
  }
}
