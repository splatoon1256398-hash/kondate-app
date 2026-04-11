import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGeminiClient } from "@/lib/gemini/client";
import type { ApiResponse } from "@/types/common";
import type { Type } from "@google/genai";

// Gemini thinking model でも余裕をもって返せるように
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export type SlotProposeCandidate = {
  recipe_id: string;
  title: string;
  reason: string;
  cook_method: "hotcook" | "stove" | "other";
  cook_time_min: number | null;
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
            description: "この候補を選んだ理由。なるべく在庫/マンネリ回避/食べたい気分を説明",
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
 * 既存DBレシピからのみ選ぶ（新規生成はしない）。
 * 選択基準:
 *   - pantry の残り食材を優先的に使えるもの
 *   - 直近2週間で出していない（マンネリ回避）
 *   - 同週の他スロットと食材 or ジャンルが被らない
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
      supabase.from("pantry_items").select("name, amount, unit, is_staple, category"),
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
        .select("id, title, cook_method, cook_time_min")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    // 先週の残り = 常備品でない & 調味料でない
    const nonStaplePantry = (pantry || []).filter(
      (i: { is_staple: boolean; category: string | null }) =>
        !i.is_staple && (i.category || "other") !== "seasoning"
    );

    const recipeMap = new Map(
      (availableRecipes || []).map((r: { id: string; title: string }) => [r.id, r])
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
        ? nonStaplePantry
            .map(
              (i: { name: string; amount: number | null; unit: string | null }) =>
                `- ${i.name}${i.amount != null ? `: ${i.amount}${i.unit || ""}` : ""}`
            )
            .join("\n")
        : "（在庫なし）";

    const recipesList = (availableRecipes || [])
      .map(
        (r: {
          id: string;
          title: string;
          cook_method: string;
          cook_time_min: number | null;
        }) =>
          `- [${r.id}] ${r.title}（${r.cook_method}${
            r.cook_time_min ? `, ${r.cook_time_min}分` : ""
          }）`
      )
      .join("\n");

    const prompt = `あなたは献立アドバイザーです。${slot.date}(${mealLabel})の献立を、以下のDBレシピの中から3案選んでください。

## 選び方のルール（重要度順）
1. **必ず下の「利用可能なレシピDB」から recipe_id を指定すること**（新規レシピ生成は禁止）
2. 冷蔵庫にある残り食材を使えるレシピを優先
3. 直近2週間で出したレシピと重複しない（マンネリ防止）
4. 同じ週の他スロットと食材やジャンルが被らない
5. ${slot.meal_type === "lunch" ? "昼は調理時間短め（30分以内目安）" : "夜はじっくり系もOK"}
${freeText ? `6. ユーザーからのリクエスト: 「${freeText}」を最大限反映` : ""}

## 冷蔵庫の残り食材
${pantryText}

## 同じ週の他の献立（${slot.weekly_menu_id ? "被らないように" : "なし"}）
${otherSlotsText || "（なし）"}

## 直近2週間で出したメニュー（マンネリ防止）
${recentText || "（なし）"}

## 利用可能なレシピDB（${(availableRecipes || []).length}件）
${recipesList || "（DB空）"}

## 出力
candidates に **3件** のレシピを、reason（なぜこの候補か）付きで返してください。
reason は 1-2 文、40文字程度で「残り〇〇を使える」「前回○○だったので変化を」のように具体的に。`;

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

    // 5. DBレシピと突き合わせ。存在しないIDは落とす
    const candidates: SlotProposeCandidate[] = [];
    for (const c of parsed.candidates || []) {
      const match = recipeMap.get(c.recipe_id) as
        | { id: string; title: string; cook_method: string; cook_time_min: number | null }
        | undefined;
      if (!match) continue;
      if (candidates.find((x) => x.recipe_id === match.id)) continue;
      candidates.push({
        recipe_id: match.id,
        title: match.title,
        reason: c.reason || "",
        cook_method: (match.cook_method as "hotcook" | "stove" | "other") || "other",
        cook_time_min: match.cook_time_min,
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

    return NextResponse.json(
      { data: { candidates }, error: null } satisfies ApiResponse<SlotProposeResponse>,
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
