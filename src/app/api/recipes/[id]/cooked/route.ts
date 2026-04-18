import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { consumeIngredientsFromPantry } from "@/lib/utils/pantry-sync";
import type { ApiResponse } from "@/types/common";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/recipes/[id]/cooked
 * 「作った！」→ 在庫から食材を自動差し引き
 *
 * Body: { servings: number, slot_id?: string }
 *
 * slot_id が指定された場合、その meal_slot.cooked_at を使って冪等性を担保する:
 *   - 既に cooked_at が set → 既消費済みとして何もしない
 *   - null → 消費 + cooked_at を set
 * slot_id が無い場合、当日前後1週間で「recipe_id 一致 & cooked_at=null」の slot を探し、
 * 見つかればその slot_id を使って冪等化。
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();
    const body: { servings?: number; slot_id?: string } = await request.json();
    const servings = body.servings || 2;

    let slotId = body.slot_id || null;

    // slot_id 未指定なら前後1週間で候補を探す
    if (!slotId) {
      const today = new Date();
      const from = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);
      const to = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
      const { data: candidates } = await supabase
        .from("meal_slots")
        .select("id, date")
        .eq("recipe_id", id)
        .is("cooked_at", null)
        .eq("is_skipped", false)
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: true });
      if (candidates && candidates.length > 0) {
        slotId = candidates[0].id as string;
      }
    }

    // slot が特定できた → 冪等パス
    if (slotId) {
      const { data: slot } = await supabase
        .from("meal_slots")
        .select("id, recipe_id, cooked_at")
        .eq("id", slotId)
        .maybeSingle();

      if (slot && slot.cooked_at == null) {
        try {
          await consumeIngredientsFromPantry(supabase, id, servings);
        } catch {
          // pantry に該当食材がない等は想定内
        }
        await supabase
          .from("meal_slots")
          .update({ cooked_at: new Date().toISOString(), memo: "調理済み" })
          .eq("id", slotId);
      }
      // cooked_at が既にある → 二重消費を防ぐため何もしない
    } else {
      // slot 無し (レシピ単独での調理) → legacy 消費
      try {
        await consumeIngredientsFromPantry(supabase, id, servings);
      } catch {
        /* ignore */
      }
    }

    return NextResponse.json(
      {
        data: { consumed: true, slot_id: slotId },
        error: null,
      } satisfies ApiResponse<{ consumed: boolean; slot_id: string | null }>,
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
