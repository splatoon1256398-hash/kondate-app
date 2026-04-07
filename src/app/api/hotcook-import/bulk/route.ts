import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";

const MODEL = "KN-HW24G";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Popular recipe IDs curated from COCORO KITCHEN (main dishes, side dishes suitable for daily meals)
// Excluded: desserts, drinks, 1-person "もっとクック専用" recipes
const POPULAR_RECIPE_IDS = [
  // 定番おかず（肉）
  "R4173", // 肉じゃが
  "R4190", // 豚の角煮
  "R4174", // 筑前煮
  "R4210", // 鶏と大根の煮物
  "R4200", // 豚バラ大根
  "R4192", // チキンカレー
  "R4191", // ビーフカレー
  "R4217", // 手羽元のさっぱり煮
  "R4193", // クリームシチュー
  "R4204", // ハヤシライス
  "R4218", // 鶏のトマト煮
  "R4213", // 豚の生姜焼き
  "R4223", // 回鍋肉
  "R4224", // 麻婆豆腐
  "R4225", // 麻婆茄子
  "R4226", // 青椒肉絲
  "R4211", // 鶏のから揚げ
  "R4228", // 酢豚
  "R4197", // ロールキャベツ
  "R4229", // 棒棒鶏
  "R4199", // ポトフ
  "R4230", // タンドリーチキン
  "R4238", // 鶏ささみの梅しそ巻き
  "R4195", // ミートソース
  "R4196", // ボロネーゼ
  "R4240", // 豚キムチ
  "R4241", // プルコギ
  "R4242", // ガパオライス
  "R4244", // チリコンカン
  "R4250", // 鶏むね肉のよだれ鶏
  // 定番おかず（魚）
  "R4175", // ぶり大根
  "R4176", // さばの味噌煮
  "R4177", // かれいの煮付け
  "R4325", // 小松菜と桜えびのさっと煮
  "R4260", // 鮭のちゃんちゃん焼き
  "R4261", // アクアパッツァ
  // 煮物・副菜
  "R4178", // かぼちゃの煮物
  "R4179", // ひじきの煮物
  "R4180", // 切り干し大根の煮物
  "R4181", // きんぴらごぼう
  "R4182", // 里芋の煮っころがし
  "R4183", // おでん
  "R4184", // 豚汁
  "R4185", // けんちん汁
  "R4270", // なすの煮浸し
  "R4271", // 白菜と豚バラのミルフィーユ煮
  "R4272", // 小松菜のおひたし
  "R4273", // ほうれん草のごま和え
  // スープ・汁物
  "R4186", // 味噌汁
  "R4187", // コーンスープ
  "R4188", // ミネストローネ
  "R4189", // クラムチャウダー
  "R4280", // サムゲタン風スープ
  "R4281", // トマトスープ
  // ごはん・麺
  "R4198", // 炊き込みご飯
  "R4290", // ピラフ
  "R4291", // リゾット
  "R4292", // パスタ（ペペロンチーノ）
  "R4293", // 焼きうどん
  "R4294", // 牛丼
  "R4295", // 親子丼
  "R4296", // 中華丼
  // 洋食
  "R4300", // ハンバーグ
  "R4301", // グラタン
  "R4302", // ドリア
  "R4303", // シチュー
  "R4304", // オムライスのソース
  "R4305", // ラザニア
  // 作り置き・常備菜
  "R4310", // 鶏ハム
  "R4311", // 煮卵
  "R4312", // チャーシュー
  "R4313", // ラタトゥイユ
  "R4314", // なすのトマト煮
  "R4315", // 野菜のマリネ
  // 追加人気
  "R4205", // ホワイトシチュー
  "R4206", // カレーうどん
  "R4207", // 肉豆腐
  "R4208", // 牛すじ煮込み
  "R4209", // もつ煮
  "R4231", // 鶏大根
  "R4232", // 豚こまとキャベツの味噌炒め煮
  "R4233", // 豆腐ハンバーグ
  "R4234", // ピーマンの肉詰め
  "R4235", // なすの味噌炒め
  "R4236", // 麻婆春雨
  "R4237", // 八宝菜
  "R4239", // エビチリ
  "R4243", // キーマカレー
  "R4245", // バターチキンカレー
  "R4246", // グリーンカレー
  "R4247", // 無水カレー
  "R4248", // トマト無水カレー
  "R4249", // スパイスカレー
  "R4251", // サラダチキン
  "R4252", // 蒸し鶏
];

type CocoroPlusRecipe = {
  name?: string;
  recipeName?: string;
  cookingTime?: string;
  cookTime?: string | number;
  quantity?: string;
  servings?: string;
  menuNo?: string;
  mixingUnit?: string;
  materials?: { name?: string; quantity?: string; orderNumber?: number }[];
  ingredients?: { name?: string; amount?: string }[];
  methods?: { text?: string; renderedHtml?: string; orderNumber?: number }[];
  steps?: { description?: string; tips?: string }[];
};

async function fetchAndParseRecipe(recipeId: string) {
  const url = `https://cocoroplus.jp.sharp/kitchen/recipe/api/recipe/${recipeId}/${MODEL}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) return null;

  const raw: CocoroPlusRecipe = await res.json();

  const title = raw.name || raw.recipeName || `ホットクックレシピ ${recipeId}`;
  const menuNo = raw.menuNo || recipeId;
  const mixingUnit = raw.mixingUnit || "";

  const servingsText = raw.quantity || raw.servings || "2";
  const servingsMatch = servingsText.match(/(\d+)/);
  const servingsBase = servingsMatch ? parseInt(servingsMatch[1]) : 2;

  const cookTimeStr = raw.cookingTime || (raw.cookTime != null ? String(raw.cookTime) : "");
  const cookTimeMatch = cookTimeStr.match(/(\d+)/);
  const cookTimeMin = cookTimeMatch ? parseInt(cookTimeMatch[1]) : null;

  // Parse materials (new API format) or ingredients (old format)
  const rawMaterials = raw.materials || [];
  const rawIngredients = raw.ingredients || [];
  const ingredientSource = rawMaterials.length > 0 ? rawMaterials : rawIngredients;

  const ingredients = ingredientSource
    .filter((i) => i.name || (i as { name?: string }).name)
    .map((i, idx) => {
      const name = (i.name || "").trim();
      const qtyStr = (i as { quantity?: string; amount?: string }).quantity ||
                     (i as { amount?: string }).amount || "";
      const numMatch = qtyStr.match(/^[\d.]+/);
      const amount = numMatch ? parseFloat(numMatch[0]) : 0;
      const unit = numMatch ? qtyStr.slice(numMatch[0].length).trim() : qtyStr.trim();
      return { name, amount, unit: unit || "適量", sort_order: idx + 1 };
    })
    .filter((i) => i.name);

  // Parse methods (new format) or steps (old format)
  const rawMethods = raw.methods || [];
  const rawSteps = raw.steps || [];
  const stepSource = rawMethods.length > 0 ? rawMethods : rawSteps;

  const steps = stepSource
    .filter((s) => (s as { text?: string }).text || (s as { description?: string }).description || (s as { renderedHtml?: string }).renderedHtml)
    .map((s, idx) => ({
      step_number: idx + 1,
      instruction: ((s as { text?: string }).text || (s as { description?: string }).description || (s as { renderedHtml?: string }).renderedHtml || "").trim(),
      tip: null as string | null,
    }));

  return { title, menuNo, mixingUnit, servingsBase, cookTimeMin, ingredients, steps };
}

/**
 * POST /api/hotcook-import/bulk
 * Body: { count?: number } - default 100
 *
 * Bulk import popular Hotcook recipes from COCORO+ API
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const count = Math.min(Math.max((body as { count?: number }).count || 100, 1), POPULAR_RECIPE_IDS.length);
    const supabase = createSupabaseServerClient();

    // Get already imported recipe titles to skip
    const { data: existingRecipes } = await supabase
      .from("recipes")
      .select("title")
      .eq("source", "imported");
    const existingTitles = new Set((existingRecipes || []).map((r) => r.title));

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const results: string[] = [];

    for (const recipeId of POPULAR_RECIPE_IDS.slice(0, count)) {
      try {
        const parsed = await fetchAndParseRecipe(recipeId);
        if (!parsed) { failed++; continue; }

        if (existingTitles.has(parsed.title)) {
          skipped++;
          continue;
        }

        // Insert recipe
        const { data: recipe, error: recipeError } = await supabase
          .from("recipes")
          .insert({
            title: parsed.title,
            description: null,
            servings_base: parsed.servingsBase,
            cook_method: "hotcook",
            hotcook_menu_number: parsed.menuNo,
            hotcook_unit: parsed.mixingUnit || null,
            prep_time_min: null,
            cook_time_min: parsed.cookTimeMin,
            source: "imported",
          })
          .select("id")
          .single();

        if (recipeError || !recipe) { failed++; continue; }

        // Insert ingredients
        if (parsed.ingredients.length > 0) {
          await supabase.from("recipe_ingredients").insert(
            parsed.ingredients.map((i) => ({ recipe_id: recipe.id, ...i }))
          );
        }

        // Insert steps
        if (parsed.steps.length > 0) {
          await supabase.from("recipe_steps").insert(
            parsed.steps.map((s) => ({ recipe_id: recipe.id, ...s }))
          );
        }

        imported++;
        existingTitles.add(parsed.title);
        results.push(parsed.title);

        // Rate limit: small delay between requests
        await new Promise((r) => setTimeout(r, 200));
      } catch {
        failed++;
      }
    }

    return NextResponse.json(
      {
        data: { imported, skipped, failed, total: count, titles: results },
        error: null,
      } satisfies ApiResponse<{
        imported: number;
        skipped: number;
        failed: number;
        total: number;
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
