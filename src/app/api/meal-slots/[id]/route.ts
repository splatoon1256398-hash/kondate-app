import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { consumeIngredientsFromPantry } from "@/lib/utils/pantry-sync";
import { regenerateShoppingList } from "@/lib/gemini/handlers";
import type { ApiResponse } from "@/types/common";
import type { UpdateMealSlot } from "@/types/meal-slot";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/meal-slots/[id]
 * 個別の食事枠を更新（外食に変更、レシピ差し替え、人数変更、調理完了マーク）
 *
 * 主な挙動:
 *   - `cooked: true`: cooked_at をセット + pantry から食材を自動減算（冪等）
 *   - recipe_id/servings/is_skipped の変更: 該当週の shopping_list を差分マージで自動再計算
 *     （チェック済みアイテムは保持、手動追加アイテムも保持）
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();
    const body: UpdateMealSlot = await request.json();

    // 1. 現在の slot を fetch（cooked_at + 差分判定用 + weekly_menu_id）
    const { data: current } = await supabase
      .from("meal_slots")
      .select("weekly_menu_id, recipe_id, servings, is_skipped, cooked_at")
      .eq("id", id)
      .maybeSingle();

    if (!current) {
      return NextResponse.json(
        { data: null, error: "meal slot not found" } satisfies ApiResponse<null>,
        { status: 404 }
      );
    }

    // 2. updates 構築
    const updates: Record<string, unknown> = {};
    if (body.servings !== undefined) updates.servings = body.servings;
    if (body.recipe_id !== undefined) updates.recipe_id = body.recipe_id;
    if (body.memo !== undefined) updates.memo = body.memo;
    if (body.is_skipped !== undefined) updates.is_skipped = body.is_skipped;

    // 2.5 skip トグル / レシピ差し替え で cooked_at を巻き戻す
    //    - is_skipped を切り替えたら「まだ調理していない」状態に
    //    - 別レシピに差し替えたら元レシピの cooked_at は意味をなさない
    //    (pantry 減算は巻き戻さない。手動調整してください)
    const isSkipToggled =
      body.is_skipped !== undefined && body.is_skipped !== current.is_skipped;
    const isRecipeSwapped =
      body.recipe_id !== undefined && body.recipe_id !== current.recipe_id;
    if ((isSkipToggled || isRecipeSwapped) && current.cooked_at != null) {
      updates.cooked_at = null;
      if (body.memo === undefined && current.is_skipped === false) {
        updates.memo = null;
      }
    }

    // 3. 調理完了マーク: pantry 減算 + cooked_at 記録（冪等）
    if (body.cooked === true) {
      if (current.cooked_at == null && current.recipe_id) {
        try {
          await consumeIngredientsFromPantry(
            supabase,
            current.recipe_id,
            body.servings ?? current.servings
          );
        } catch {
          // best-effort: pantry に該当食材がない等は想定内
        }
      }
      updates.cooked_at = new Date().toISOString();
      if (body.memo === undefined) updates.memo = "調理済み";
    } else if (body.cooked === false) {
      updates.cooked_at = null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { data: null, error: "No fields to update" } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    // 4. 更新実行
    const { data, error } = await supabase
      .from("meal_slots")
      .update(updates)
      .eq("id", id)
      .select("id, date, meal_type, servings, recipe_id, memo, is_skipped, cooked_at")
      .single();

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message } satisfies ApiResponse<null>,
        { status: error.code === "PGRST116" ? 404 : 500 }
      );
    }

    // 5. 買い物リスト自動再計算トリガー判定
    //    recipe_id / servings / is_skipped のいずれかが実際に変化した場合のみ
    const needsRegen =
      (body.recipe_id !== undefined && body.recipe_id !== current.recipe_id) ||
      (body.servings !== undefined && body.servings !== current.servings) ||
      (body.is_skipped !== undefined && body.is_skipped !== current.is_skipped);

    if (needsRegen && current.weekly_menu_id) {
      try {
        await regenerateShoppingList(supabase, current.weekly_menu_id);
      } catch {
        // best-effort: 買い物リストが未確定(存在しない)等は想定内
      }
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
 * DELETE /api/meal-slots/[id]
 * 食事枠を削除
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();

    const { error } = await supabase
      .from("meal_slots")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: { id }, error: null } satisfies ApiResponse<{ id: string }>,
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
