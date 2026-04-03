import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { aggregateIngredients } from "@/lib/utils/aggregate-ingredients";
import type { SlotWithRecipe } from "@/lib/utils/aggregate-ingredients";
import type { ApiResponse } from "@/types/common";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/weekly-menus/[id]/confirm
 * 献立を確定し、買い物リストを自動生成する。
 */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();

    // 1. weekly_menus.status → "confirmed"
    const { error: updateError } = await supabase
      .from("weekly_menus")
      .update({ status: "confirmed", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        { data: null, error: updateError.message } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    // 2. meal_slots の recipe_id 経由で全 recipe_ingredients を取得
    const { data: slots, error: slotsError } = await supabase
      .from("meal_slots")
      .select("servings, recipes ( servings_base, recipe_ingredients (*) )")
      .eq("weekly_menu_id", id)
      .eq("is_skipped", false)
      .not("recipe_id", "is", null);

    if (slotsError) {
      return NextResponse.json(
        { data: null, error: slotsError.message } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    // 3. 食材集約
    const aggregatedItems = aggregateIngredients((slots || []) as unknown as SlotWithRecipe[]);

    // 4. shopping_lists INSERT
    const { data: list, error: listError } = await supabase
      .from("shopping_lists")
      .insert({ weekly_menu_id: id, status: "active" })
      .select("id")
      .single();

    if (listError) {
      return NextResponse.json(
        { data: null, error: listError.message } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    // 5. shopping_items 一括 INSERT
    if (aggregatedItems.length > 0) {
      const { error: itemsError } = await supabase
        .from("shopping_items")
        .insert(
          aggregatedItems.map((item) => ({
            shopping_list_id: list.id,
            name: item.name,
            amount: item.totalAmount,
            unit: item.unit,
            category: item.category,
            is_checked: false,
          }))
        );

      if (itemsError) {
        return NextResponse.json(
          { data: null, error: itemsError.message } satisfies ApiResponse<null>,
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      {
        data: {
          weekly_menu: { id, status: "confirmed" as const },
          shopping_list: {
            id: list.id,
            items: aggregatedItems.map((item) => ({
              name: item.name,
              amount: item.totalAmount,
              unit: item.unit,
              category: item.category,
            })),
          },
        },
        error: null,
      },
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
