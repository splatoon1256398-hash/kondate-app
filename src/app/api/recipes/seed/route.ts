import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SEED_RECIPES } from "@/data/seed-recipes";
import type { ApiResponse } from "@/types/common";

/**
 * POST /api/recipes/seed
 * Body: { offset?: number, count?: number }
 *
 * 王道・人気レシピを DB に一括投入する管理用エンドポイント。
 *   - 既存 title と被ったものはスキップ
 *   - source="imported" で保存
 *   - 失敗した1件はスキップして続行
 *
 * 使い方:
 *   curl -X POST http://localhost:3000/api/recipes/seed \
 *     -H 'Content-Type: application/json' \
 *     -d '{"offset": 0, "count": 25}'
 *
 * 100件あるので 25件ずつ 4回に分けて叩くのが安全（タイムアウト回避）。
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body = (await request.json().catch(() => ({}))) as {
      offset?: number;
      count?: number;
    };
    const offset = Math.max(body.offset ?? 0, 0);
    const count = Math.min(Math.max(body.count ?? 25, 1), 100);

    const batch = SEED_RECIPES.slice(offset, offset + count);
    if (batch.length === 0) {
      return NextResponse.json(
        {
          data: {
            total: SEED_RECIPES.length,
            offset,
            count,
            imported: 0,
            skipped: 0,
            failed: 0,
            titles: [],
          },
          error: null,
        } satisfies ApiResponse<{
          total: number;
          offset: number;
          count: number;
          imported: number;
          skipped: number;
          failed: number;
          titles: string[];
        }>,
        { status: 200 }
      );
    }

    // 既存の title を取得してスキップ判定
    const { data: existing } = await supabase.from("recipes").select("title");
    const existingTitles = new Set((existing || []).map((r) => r.title));

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const importedTitles: string[] = [];

    for (const seed of batch) {
      if (existingTitles.has(seed.title)) {
        skipped++;
        continue;
      }

      try {
        // 1. recipes INSERT
        const { data: recipe, error: recipeError } = await supabase
          .from("recipes")
          .insert({
            title: seed.title,
            description: seed.description ?? null,
            servings_base: seed.servings_base,
            cook_method: seed.cook_method,
            hotcook_menu_number: null,
            hotcook_unit: null,
            prep_time_min: seed.prep_time_min ?? null,
            cook_time_min: seed.cook_time_min ?? null,
            source: "imported",
          })
          .select("id")
          .single();

        if (recipeError || !recipe) {
          failed++;
          continue;
        }

        // 2. recipe_ingredients INSERT
        if (seed.ingredients.length > 0) {
          const { error: ingError } = await supabase
            .from("recipe_ingredients")
            .insert(
              seed.ingredients.map((ing, idx) => ({
                recipe_id: recipe.id,
                name: ing.name,
                amount: ing.amount,
                unit: ing.unit,
                sort_order: idx + 1,
              }))
            );
          if (ingError) {
            failed++;
            // レシピは残す（手順だけ足せる）
            continue;
          }
        }

        // 3. recipe_steps INSERT
        if (seed.steps.length > 0) {
          const { error: stepError } = await supabase
            .from("recipe_steps")
            .insert(
              seed.steps.map((step, idx) => ({
                recipe_id: recipe.id,
                step_number: idx + 1,
                instruction: step.instruction,
                tip: step.tip ?? null,
              }))
            );
          if (stepError) {
            failed++;
            continue;
          }
        }

        imported++;
        existingTitles.add(seed.title);
        importedTitles.push(seed.title);
      } catch {
        failed++;
      }
    }

    return NextResponse.json(
      {
        data: {
          total: SEED_RECIPES.length,
          offset,
          count: batch.length,
          imported,
          skipped,
          failed,
          titles: importedTitles,
        },
        error: null,
      } satisfies ApiResponse<{
        total: number;
        offset: number;
        count: number;
        imported: number;
        skipped: number;
        failed: number;
        titles: string[];
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

/**
 * GET /api/recipes/seed
 * seed データのカウントだけを返す（動作確認用）
 */
export async function GET() {
  return NextResponse.json(
    {
      data: {
        total: SEED_RECIPES.length,
        titles: SEED_RECIPES.map((r) => r.title),
      },
      error: null,
    } satisfies ApiResponse<{ total: number; titles: string[] }>,
    { status: 200 }
  );
}
