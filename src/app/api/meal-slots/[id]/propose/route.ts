import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGeminiClient } from "@/lib/gemini/client";
import type { ApiResponse } from "@/types/common";
import type { Type } from "@google/genai";
import {
  formatPantryLineForAi,
  buildUrgentConsumeSection,
  redUrgencyNames,
} from "@/lib/utils/pantry-freshness";
import {
  computeInventoryMatch,
  sortByInventoryPriority,
  type InventoryMatch,
} from "@/lib/utils/inventory-match";
import {
  getRecipeRatingsMap,
  formatRatingTag,
  buildRatingPreferenceSection,
  isLowRated,
} from "@/lib/utils/rating-map";

// Gemini thinking model でも余裕をもって返せるように
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export type SlotProposeCandidate = {
  recipe_id: string;
  title: string;
  reason: string;
  cook_method: "hotcook" | "stove" | "other";
  cook_time_min: number | null;
  inventory?: InventoryMatch | null;
  is_favorite?: boolean;
  rating?: { avg: number | null; count: number } | null;
};

type SlotProposeResponse = {
  candidates: SlotProposeCandidate[];
};

const T: Record<string, Type> = {
  STRING: "STRING" as Type,
  INTEGER: "INTEGER" as Type,
  NUMBER: "NUMBER" as Type,
  OBJECT: "OBJECT" as Type,
  ARRAY: "ARRAY" as Type,
};

const responseSchema = {
  type: T.OBJECT,
  properties: {
    candidates: {
      type: T.ARRAY,
      description: "3件のレシピ候補",
      items: {
        type: T.OBJECT,
        properties: {
          recipe_id: { type: T.STRING, description: "既存DBレシピのUUID（必須）" },
          title: { type: T.STRING },
          reason: {
            type: T.STRING,
            description: "この候補を選んだ理由。在庫/鮮度/マンネリ回避/気分を具体的に説明",
          },
        },
        required: ["recipe_id", "title", "reason"],
      },
    },
  },
  required: ["candidates"],
};

/**
 * POST /api/meal-slots/[id]/propose
 * 特定の食事枠(1スロット)に対して、AIに3案のレシピ候補を出してもらう。
 *
 * 選択基準（優先度順）:
 *   1. 🔴 鮮度が近い食材（今日/明日まで）を使い切れるもの ★最優先
 *   2. 在庫とのマッチ率が高いもの（買い足し少なく作れる）
 *   3. 直近2週間で出していない（マンネリ回避）
 *   4. 同週の他スロットと食材 or ジャンルが被らない
 *
 * 返り値の candidates は server-side で在庫マッチを計算し、鮮度→マッチ率の順にソート済み。
 *
 * Body: { free_text?: string }  ← 任意のリクエスト「さっぱりしたい」等
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();

    let freeText = "";
    try {
      const body = await request.json();
      if (typeof body?.free_text === "string") freeText = body.free_text.slice(0, 200);
    } catch {
      // body なしでもOK
    }

    // 1. 対象スロット
    const { data: slot } = await supabase
      .from("meal_slots")
      .select("id, date, meal_type, servings, weekly_menu_id, recipe_id")
      .eq("id", id)
      .maybeSingle();

    if (!slot) {
      return NextResponse.json(
        { data: null, error: "slot not found" } satisfies ApiResponse<null>,
        { status: 404 }
      );
    }

    // 2. context 取得（並列）
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const [
      { data: pantry },
      { data: weekSlots },
      { data: recentSlots },
      { data: availableRecipes },
    ] = await Promise.all([
      supabase
        .from("pantry_items")
        .select("name, amount, unit, is_staple, category, expiry_date"),
      slot.weekly_menu_id
        ? supabase
            .from("meal_slots")
            .select("date, meal_type, is_skipped, recipes(title)")
            .eq("weekly_menu_id", slot.weekly_menu_id)
            .neq("id", id)
        : Promise.resolve({ data: [] as unknown[] }),
      supabase
        .from("meal_slots")
        .select("date, meal_type, recipes(title)")
        .gte("date", twoWeeksAgo)
        .eq("is_skipped", false)
        .not("recipe_id", "is", null)
        .order("date", { ascending: false }),
      supabase
        .from("recipes")
        .select("id, title, cook_method, cook_time_min, is_favorite")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    // 全件の rating map を取得（300件のIDに絞っても良いが、ratings 自体が少量なので全件でも安い）
    const ratingMap = await getRecipeRatingsMap(supabase);

    // 先週の残り = 常備品でない & 調味料でない
    const nonStaplePantry = (
      pantry || []
    ).filter(
      (i: {
        is_staple: boolean;
        category: string | null;
      }) => !i.is_staple && (i.category || "other") !== "seasoning"
    ) as {
      name: string;
      amount: number | null;
      unit: string | null;
      is_staple: boolean;
      category: string | null;
      expiry_date: string | null;
    }[];

    const recipeMap = new Map(
      (availableRecipes || []).map(
        (r: { id: string; title: string; is_favorite?: boolean }) => [r.id, r]
      )
    );

    const hasAnyFavorite = (availableRecipes || []).some(
      (r: { is_favorite?: boolean }) => r.is_favorite === true
    );

    // 3. プロンプト構築
    const mealLabel = slot.meal_type === "lunch" ? "昼食" : "夕食";
    const otherSlotsText = ((weekSlots as unknown as {
      date: string;
      meal_type: string;
      is_skipped: boolean;
      recipes: { title: string } | null;
    }[]) || [])
      .filter((s) => !s.is_skipped && s.recipes?.title)
      .map((s) => `- ${s.date} ${s.meal_type === "lunch" ? "昼" : "夜"}: ${s.recipes!.title}`)
      .join("\n");

    const recentText = ((recentSlots as unknown as {
      date: string;
      meal_type: string;
      recipes: { title: string } | null;
    }[]) || [])
      .slice(0, 20)
      .map((s) => s.recipes?.title)
      .filter(Boolean)
      .join("、");

    const pantryText =
      nonStaplePantry.length > 0
        ? nonStaplePantry.map(formatPantryLineForAi).join("\n")
        : "（在庫なし）";

    const urgentSection = buildUrgentConsumeSection(nonStaplePantry);

    const recipesList = (availableRecipes || [])
      .map(
        (r: {
          id: string;
          title: string;
          cook_method: string;
          cook_time_min: number | null;
          is_favorite?: boolean;
        }) =>
          `- [${r.id}] ${r.title}（${r.cook_method}${
            r.cook_time_min ? `, ${r.cook_time_min}分` : ""
          }）${formatRatingTag(ratingMap.get(r.id), r.is_favorite === true)}`
      )
      .join("\n");

    const ratingSection = buildRatingPreferenceSection(ratingMap, hasAnyFavorite);

    const prompt = `あなたは在庫ファーストな献立アドバイザーです。${slot.date}(${mealLabel})の献立を、以下のDBレシピの中から3案選んでください。

## 🔴 選び方の大原則（厳守・優先度順）
1. **必ず下の「利用可能なレシピDB」から recipe_id を指定する**（新規レシピ生成は禁止）
2. **冷蔵庫にある食材を最大限使えるレシピを選ぶ**（買い物は週1まとめ、買い足しを増やさないのが最優先）
3. **鮮度が近い食材（🔴 / 🟠）を優先的に使い切るレシピにする**（腐らせない）
4. 直近2週間と重複しないレシピ（マンネリ防止）
5. 同じ週の他スロットと食材やジャンルが被らない
6. ${slot.meal_type === "lunch" ? "昼は調理時間短め（30分以内目安）" : "夜はじっくり系もOK"}
${freeText ? `7. ユーザーリクエスト: 「${freeText}」を反映（ただし原則1〜3は優先）` : ""}

${
  urgentSection
    ? `## 🔴 今すぐ使い切るべき食材（${"今日明日で使わないと腐る"}）
${urgentSection}

**↑ これらを使うレシピが3候補のうち最低でも1つ以上含まれるように選ぶこと。**
`
    : ""
}
${ratingSection || ""}
## 🥬 冷蔵庫の残り食材（全部、残日数つき）
${pantryText}

## 同じ週の他の献立（${slot.weekly_menu_id ? "被らないように" : "なし"}）
${otherSlotsText || "（なし）"}

## 直近2週間で出したメニュー（マンネリ防止）
${recentText || "（なし）"}

## 利用可能なレシピDB（${(availableRecipes || []).length}件）
${recipesList || "（DB空）"}

## 出力
candidates に **3件** のレシピを返してください。
reason は 40文字程度で、**「どの在庫食材を使えるか」「鮮度を回せるか」を必ず含める**。
例: 「鶏もも(残2日🟠)使い切り。玉ねぎも消費できる」「在庫の豚こまで作れる、買い足し不要」`;

    // 4. Gemini 呼び出し（JSON mode）
    const gemini = getGeminiClient();
    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema,
        thinkingConfig: { thinkingBudget: 1024 },
      },
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return NextResponse.json(
        { data: null, error: "AI が応答を返しませんでした" } satisfies ApiResponse<null>,
        { status: 502 }
      );
    }

    let parsed: { candidates?: { recipe_id: string; title: string; reason: string }[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { data: null, error: "AI応答のJSONパースに失敗" } satisfies ApiResponse<null>,
        { status: 502 }
      );
    }

    // 5. DBレシピと突き合わせ。存在しないIDは落とす。★2.5以下は除外
    const candidates: SlotProposeCandidate[] = [];
    for (const c of parsed.candidates || []) {
      const match = recipeMap.get(c.recipe_id) as
        | {
            id: string;
            title: string;
            cook_method: string;
            cook_time_min: number | null;
            is_favorite?: boolean;
          }
        | undefined;
      if (!match) continue;
      if (candidates.find((x) => x.recipe_id === match.id)) continue;
      const r = ratingMap.get(match.id);
      // 殿堂入りは低評価でも救済。そうでなければ ★2.5以下は弾く
      if (!match.is_favorite && isLowRated(r)) continue;
      candidates.push({
        recipe_id: match.id,
        title: match.title,
        reason: c.reason || "",
        cook_method: (match.cook_method as "hotcook" | "stove" | "other") || "other",
        cook_time_min: match.cook_time_min,
        inventory: null,
        is_favorite: match.is_favorite === true,
        rating: r ? { avg: r.avg, count: r.count } : null,
      });
      if (candidates.length >= 3) break;
    }

    if (candidates.length === 0) {
      return NextResponse.json(
        {
          data: null,
          error: "AI が有効な候補を返しませんでした。もう一度お試しください。",
        } satisfies ApiResponse<null>,
        { status: 502 }
      );
    }

    // 6. 在庫マッチを server-side で計算（AI自己申告より信頼できる）
    const candidateIds = candidates.map((c) => c.recipe_id);
    const { data: ingRows } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id, name, amount, unit")
      .in("recipe_id", candidateIds);

    const ingByRecipe = new Map<
      string,
      { name: string; amount: number | null; unit: string | null }[]
    >();
    for (const row of (ingRows || []) as {
      recipe_id: string;
      name: string;
      amount: number | null;
      unit: string | null;
    }[]) {
      const arr = ingByRecipe.get(row.recipe_id) || [];
      arr.push({ name: row.name, amount: row.amount, unit: row.unit });
      ingByRecipe.set(row.recipe_id, arr);
    }

    const redNames = redUrgencyNames(nonStaplePantry);
    for (const c of candidates) {
      const ings = ingByRecipe.get(c.recipe_id) || [];
      c.inventory = computeInventoryMatch(ings, nonStaplePantry, redNames);
    }

    // 7. 鮮度優先でソート
    const sorted = sortByInventoryPriority(candidates);

    return NextResponse.json(
      { data: { candidates: sorted }, error: null } satisfies ApiResponse<SlotProposeResponse>,
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
