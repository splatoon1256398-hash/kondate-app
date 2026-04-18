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
  type InventoryMatch,
} from "@/lib/utils/inventory-match";
import {
  getRecipeRatingsMap,
  formatRatingTag,
  buildRatingPreferenceSection,
  isLowRated,
} from "@/lib/utils/rating-map";
import {
  formatDate,
  getMonday,
  getWeekDays,
  dayLabel,
} from "@/lib/utils/date";

/**
 * POST /api/meal-plan/use-up-week
 *
 * 「買い物は週1まとめ + 食材を腐らせない」を最大化する
 * 1週間(14スロット)まとめ提案。保存はしない（UIで確認→/api/meal-plan/confirm で保存）。
 *
 * 既存 /ai タブ (チャット型・自由な相談) に対して、
 * こちらは "在庫を使い切る" 1点集中のワンショット。
 *
 * Body: { week_start_date?: "YYYY-MM-DD" (default: 今週月曜), servings?: number (default: 2) }
 *
 * Response:
 *   plan: 14スロットの提案 (date, meal_type, recipe_id, title, reason, inventory?)
 *   pantry_usage: 在庫ごとに「使うレシピタイトル[] / 未使用」
 *   summary: { used: N, unused: M, covered_slots: K/14, near_expiry_covered }
 */

export const maxDuration = 120;

export type UseUpSlot = {
  date: string;
  meal_type: "lunch" | "dinner";
  servings: number;
  recipe_id: string;
  title: string;
  reason: string;
  cook_method: "hotcook" | "stove" | "other";
  cook_time_min: number | null;
  inventory?: InventoryMatch | null;
  is_favorite?: boolean;
  rating?: { avg: number | null; count: number } | null;
};

export type PantryUsageEntry = {
  name: string;
  amount: number | null;
  unit: string | null;
  expiry_date: string | null;
  purchased_at: string | null;
  category: string | null;
  used_in: { date: string; meal_type: "lunch" | "dinner"; title: string }[];
};

export type UseUpWeekResponse = {
  week_start_date: string;
  plan: UseUpSlot[];
  pantry_usage: PantryUsageEntry[];
  summary: {
    total_pantry: number;
    used_pantry: number;
    unused_pantry: number;
    near_expiry_total: number;
    near_expiry_covered: number;
  };
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
    slots: {
      type: T.ARRAY,
      description:
        "14件(月〜日 × lunch/dinner)のスロット。在庫を最大限使い切るよう配置。",
      items: {
        type: T.OBJECT,
        properties: {
          date: { type: T.STRING, description: "YYYY-MM-DD" },
          meal_type: { type: T.STRING, description: "lunch or dinner" },
          recipe_id: {
            type: T.STRING,
            description: "既存DBレシピのUUID。空白は許可しない。",
          },
          reason: {
            type: T.STRING,
            description: "なぜこのレシピか。使う在庫食材を明記（30文字程度）",
          },
        },
        required: ["date", "meal_type", "recipe_id", "reason"],
      },
    },
  },
  required: ["slots"],
};

type PantryRow = {
  name: string;
  amount: number | null;
  unit: string | null;
  is_staple: boolean;
  category: string | null;
  expiry_date: string | null;
  purchased_at: string | null;
};

type RecipeRow = {
  id: string;
  title: string;
  cook_method: string;
  cook_time_min: number | null;
  is_favorite?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();

    let weekStart: string | undefined;
    let servings = 2;
    try {
      const body = await request.json();
      if (typeof body?.week_start_date === "string") weekStart = body.week_start_date;
      if (typeof body?.servings === "number") servings = body.servings;
    } catch {
      /* body なしOK */
    }

    const weekStartDate = weekStart || getMonday(new Date());
    const days = getWeekDays(weekStartDate);
    const twoWeeksAgo = formatDate(new Date(Date.now() - 14 * 86400000));

    // 並列 fetch
    const [
      { data: pantry },
      { data: recentSlots },
      { data: availableRecipes },
    ] = await Promise.all([
      supabase
        .from("pantry_items")
        .select("name, amount, unit, is_staple, category, expiry_date, purchased_at"),
      supabase
        .from("meal_slots")
        .select("date, meal_type, recipes(title)")
        .gte("date", twoWeeksAgo)
        .lt("date", weekStartDate)
        .eq("is_skipped", false)
        .not("recipe_id", "is", null)
        .order("date", { ascending: false }),
      supabase
        .from("recipes")
        .select("id, title, cook_method, cook_time_min, is_favorite")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    const ratingMap = await getRecipeRatingsMap(supabase);
    const hasAnyFavorite = ((availableRecipes || []) as RecipeRow[]).some(
      (r) => r.is_favorite === true
    );
    const ratingSection = buildRatingPreferenceSection(ratingMap, hasAnyFavorite);

    const nonStaplePantry = ((pantry || []) as PantryRow[]).filter(
      (i) => !i.is_staple && (i.category || "other") !== "seasoning"
    );

    const recipeMap = new Map(
      ((availableRecipes || []) as RecipeRow[]).map((r) => [r.id, r])
    );

    const pantryText =
      nonStaplePantry.length > 0
        ? nonStaplePantry.map(formatPantryLineForAi).join("\n")
        : "（在庫なし）";

    const urgentSection = buildUrgentConsumeSection(nonStaplePantry);

    const recentText = ((recentSlots as unknown as {
      date: string;
      meal_type: string;
      recipes: { title: string } | null;
    }[]) || [])
      .slice(0, 20)
      .map((s) => s.recipes?.title)
      .filter(Boolean)
      .join("、");

    const recipesList = ((availableRecipes || []) as RecipeRow[])
      .map(
        (r) =>
          `- [${r.id}] ${r.title}（${r.cook_method}${
            r.cook_time_min ? `, ${r.cook_time_min}分` : ""
          }）${formatRatingTag(ratingMap.get(r.id), r.is_favorite === true)}`
      )
      .join("\n");

    const daysList = days
      .map((d) => `- ${d} (${dayLabel(d)})`)
      .join("\n");

    const prompt = `あなたは在庫ファーストな献立プランナーです。
「買い物は週1まとめ / 食材を腐らせない」を最大化する1週間の献立を組んでください。

## 出力フォーマット
14スロット（月〜日 × lunch/dinner）をまとめて返してください。
- date: 下の「対象日」から選ぶ
- meal_type: "lunch" or "dinner"
- recipe_id: 下の「利用可能なレシピDB」から選ぶ（必須・新規生成禁止）
- reason: 使う在庫食材を必ず含めて30文字程度

## 🔴 配置ルール（優先度順・厳守）
1. **🔴の食材（期限近い）は前半（月〜水）のスロットに必ず配置**（腐らせない）
2. 🟠（2-3日）は前半〜中盤に配置
3. **在庫食材の半分以上が14スロット内で消費される設計**（買い足し最小化）
4. 在庫マッチ率の高いレシピを優先
5. 同じ食材・ジャンルが連続しないよう分散（マンネリ回避）
6. 直近2週間のメニューと重複させない
7. 昼は30分以内、夜はじっくりもOK
8. 1スロット = ${servings}人分

## 対象日 (7日分)
${daysList}

${
  urgentSection
    ? `## 🔴 今すぐ使い切るべき食材（腐る前に必ず消費）
${urgentSection}

**↑ これらは必ず月〜水のスロットに配置すること。**
`
    : ""
}
${ratingSection || ""}
## 🥬 冷蔵庫の在庫（全部・残日数つき）
${pantryText}

## 直近2週間のメニュー（マンネリ回避）
${recentText || "（なし）"}

## 利用可能なレシピDB（${(availableRecipes || []).length}件）
${recipesList || "（DB空）"}

## 最終チェック
- 14スロットすべて埋まっているか
- 🔴食材を前半に配置したか
- 在庫食材を最大限使う設計か`;

    const gemini = getGeminiClient();
    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema,
        thinkingConfig: { thinkingBudget: 4096 },
      },
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return NextResponse.json(
        { data: null, error: "AIが応答を返しませんでした" } satisfies ApiResponse<null>,
        { status: 502 }
      );
    }

    let parsed: {
      slots?: {
        date: string;
        meal_type: string;
        recipe_id: string;
        reason: string;
      }[];
    };
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { data: null, error: "AI応答のJSONパースに失敗" } satisfies ApiResponse<null>,
        { status: 502 }
      );
    }

    const dateSet = new Set(days);
    const uniqKey = new Set<string>();
    const plan: UseUpSlot[] = [];

    for (const s of parsed.slots || []) {
      if (!dateSet.has(s.date)) continue;
      if (s.meal_type !== "lunch" && s.meal_type !== "dinner") continue;
      const key = `${s.date}_${s.meal_type}`;
      if (uniqKey.has(key)) continue;
      const recipe = recipeMap.get(s.recipe_id);
      if (!recipe) continue;
      const r = ratingMap.get(recipe.id);
      // 殿堂入り以外で ★2.5 以下は弾く
      if (!recipe.is_favorite && isLowRated(r)) continue;
      uniqKey.add(key);
      plan.push({
        date: s.date,
        meal_type: s.meal_type as "lunch" | "dinner",
        servings,
        recipe_id: recipe.id,
        title: recipe.title,
        reason: s.reason || "",
        cook_method:
          (recipe.cook_method as "hotcook" | "stove" | "other") || "other",
        cook_time_min: recipe.cook_time_min,
        inventory: null,
        is_favorite: recipe.is_favorite === true,
        rating: r ? { avg: r.avg, count: r.count } : null,
      });
    }

    if (plan.length === 0) {
      return NextResponse.json(
        {
          data: null,
          error: "有効な計画を生成できませんでした。もう一度お試しください。",
        } satisfies ApiResponse<null>,
        { status: 502 }
      );
    }

    // 日付→食事順に整列
    plan.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.meal_type === "lunch" ? -1 : 1;
    });

    // recipe_ingredients 一括取得
    const recipeIdsInPlan = Array.from(new Set(plan.map((p) => p.recipe_id)));
    const { data: ingRows } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id, name, amount, unit")
      .in("recipe_id", recipeIdsInPlan);

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
    for (const slot of plan) {
      const ings = ingByRecipe.get(slot.recipe_id) || [];
      slot.inventory = computeInventoryMatch(ings, nonStaplePantry, redNames);
    }

    // pantry usage rollup: 各在庫食材がどこで使われるか
    const usage: PantryUsageEntry[] = nonStaplePantry.map((item) => ({
      name: item.name,
      amount: item.amount,
      unit: item.unit,
      expiry_date: item.expiry_date,
      purchased_at: item.purchased_at,
      category: item.category,
      used_in: [],
    }));
    for (const slot of plan) {
      const ings = ingByRecipe.get(slot.recipe_id) || [];
      for (const ing of ings) {
        for (const entry of usage) {
          const a = entry.name.trim().toLowerCase();
          const b = ing.name.trim().toLowerCase();
          if (!a || !b) continue;
          if (a === b || a.includes(b) || b.includes(a)) {
            // 重複登録を避ける
            if (
              !entry.used_in.find(
                (u) => u.date === slot.date && u.meal_type === slot.meal_type
              )
            ) {
              entry.used_in.push({
                date: slot.date,
                meal_type: slot.meal_type,
                title: slot.title,
              });
            }
          }
        }
      }
    }

    const usedPantry = usage.filter((u) => u.used_in.length > 0).length;
    const nearExpiryTotal = redNames.size;
    const nearExpiryCovered = usage.filter(
      (u) => redNames.has(u.name) && u.used_in.length > 0
    ).length;

    return NextResponse.json(
      {
        data: {
          week_start_date: weekStartDate,
          plan,
          pantry_usage: usage,
          summary: {
            total_pantry: nonStaplePantry.length,
            used_pantry: usedPantry,
            unused_pantry: nonStaplePantry.length - usedPantry,
            near_expiry_total: nearExpiryTotal,
            near_expiry_covered: nearExpiryCovered,
          },
        },
        error: null,
      } satisfies ApiResponse<UseUpWeekResponse>,
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

