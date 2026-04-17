import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGeminiClient } from "@/lib/gemini/client";
import { formatDate } from "@/lib/utils/date";
import type { Content, FunctionDeclaration, Part, Type } from "@google/genai";
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

// Gemini 2.5 Flash thinking + FC を含めても余裕を見て
export const maxDuration = 90;

type ConsultMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ConsultCandidate = {
  recipe_id: string;
  title: string;
  reason: string;
  cook_method: "hotcook" | "stove" | "other";
  cook_time_min: number | null;
  inventory?: InventoryMatch | null;
  is_favorite?: boolean;
  rating?: { avg: number | null; count: number } | null;
};

export type ConsultSSEEvent =
  | { type: "text"; content: string }
  | { type: "candidates"; candidates: ConsultCandidate[] }
  | { type: "error"; message: string }
  | { type: "done" };

type ConsultRequest = {
  messages: ConsultMessage[];
  context?: {
    target_date?: string; // YYYY-MM-DD (default: today)
    target_meal_type?: "lunch" | "dinner"; // default: dinner
  };
};

const T: Record<string, Type> = {
  STRING: "STRING" as Type,
  OBJECT: "OBJECT" as Type,
  ARRAY: "ARRAY" as Type,
};

const suggestFunction: FunctionDeclaration = {
  name: "suggest_dinner_candidates",
  description:
    "ユーザーに2-3個のレシピ候補を提示したいときに必ず呼ぶ。既存DBのレシピから選び、recipe_id必須。ユーザーの質問に素早く応えるため、説明テキストは短めで良い。",
  parameters: {
    type: T.OBJECT,
    properties: {
      candidates: {
        type: T.ARRAY,
        description: "2〜3件のレシピ候補",
        items: {
          type: T.OBJECT,
          properties: {
            recipe_id: { type: T.STRING, description: "既存DBレシピのUUID（必須）" },
            title: { type: T.STRING },
            reason: { type: T.STRING, description: "なぜこの候補か 1文" },
          },
          required: ["recipe_id", "title", "reason"],
        },
      },
    },
    required: ["candidates"],
  },
};

function sseEncode(event: ConsultSSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function convertMessages(messages: ConsultMessage[]): Content[] {
  return messages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));
}

async function buildSystemPrompt(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  targetDate: string,
  targetMealType: "lunch" | "dinner"
) {
  const twoWeeksAgo = formatDate(new Date(Date.now() - 14 * 86400000));
  const [
    { data: pantry },
    { data: recentSlots },
    { data: availableRecipes },
    { data: targetSlot },
  ] = await Promise.all([
    supabase
      .from("pantry_items")
      .select("name, amount, unit, is_staple, category, expiry_date"),
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
    supabase
      .from("meal_slots")
      .select("id, recipes(title)")
      .eq("date", targetDate)
      .eq("meal_type", targetMealType)
      .maybeSingle(),
  ]);

  const nonStaplePantry = (
    pantry || []
  ).filter(
    (i: { is_staple: boolean; category: string | null }) =>
      !i.is_staple && (i.category || "other") !== "seasoning"
  ) as {
    name: string;
    amount: number | null;
    unit: string | null;
    is_staple: boolean;
    category: string | null;
    expiry_date: string | null;
  }[];

  const pantryText =
    nonStaplePantry.length > 0
      ? nonStaplePantry.map(formatPantryLineForAi).join("\n")
      : "（在庫なし）";

  const urgentSection = buildUrgentConsumeSection(nonStaplePantry);

  // rating 情報取得（全件）
  const ratingMap = await getRecipeRatingsMap(supabase);
  const hasAnyFavorite = ((availableRecipes || []) as {
    is_favorite?: boolean;
  }[]).some((r) => r.is_favorite === true);
  const ratingSection = buildRatingPreferenceSection(ratingMap, hasAnyFavorite);

  const recentText = ((recentSlots as unknown as {
    date: string;
    meal_type: string;
    recipes: { title: string } | null;
  }[]) || [])
    .slice(0, 15)
    .map((s) => s.recipes?.title)
    .filter(Boolean)
    .join("、");

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

  const currentSlotTitle =
    (targetSlot as unknown as { recipes: { title: string } | null } | null)?.recipes
      ?.title || "(未設定)";

  const mealLabel = targetMealType === "lunch" ? "昼食" : "夕食";

  return {
    systemPrompt: `あなたは在庫ファーストな献立アドバイザーです。ユーザーは「今日/明日何作ろう」とカジュアルに相談してきます。

## 🔴 提案ルール（優先度順・厳守）
1. 提案するときは **suggest_dinner_candidates** ツールを必ず呼ぶ
2. レシピは必ず下の「利用可能なレシピDB」から選ぶ（recipe_id指定、新規生成禁止）
3. **冷蔵庫にある食材を最大限使えるレシピを選ぶ**（買い物は週1まとめ、買い足しは最小限）
4. **鮮度🔴/🟠 の食材があれば、それを使うレシピを必ず候補に含める**（腐らせない）
5. 直近2週間と重複しないものを混ぜる（マンネリ回避）

## 対象日
- 日付: ${targetDate}
- 食事: ${mealLabel}
- 現在の登録: ${currentSlotTitle}

${
  urgentSection
    ? `## 🔴 今すぐ使い切るべき食材（腐る前に）
${urgentSection}

**↑ これらを使うレシピを候補に最低1つ入れること。**
`
    : ""
}
${ratingSection || ""}
## 🥬 冷蔵庫の残り食材（残日数つき）
${pantryText}

## 直近2週間で作ったもの（マンネリ回避）
${recentText || "（なし）"}

## 利用可能なレシピDB（${(availableRecipes || []).length}件）
${recipesList || "（DB空）"}

## 応答スタイル
- カジュアルで短めの日本語（1-3文）
- 候補を出す前に一言だけ共感や理由を添える（「鶏もも使い切り行こうか」等）
- 候補は2〜3個
- reason は **「どの在庫食材を使えるか / 鮮度を回せるか」を必ず含めて** 具体的に1文
  例: 「鶏もも(残2日)使い切れる」「豚こま在庫ありで作れる、買い足し不要」`,
    candidatesByIdMap: new Map(
      (availableRecipes || []).map(
        (r: {
          id: string;
          title: string;
          cook_method: string;
          cook_time_min: number | null;
          is_favorite?: boolean;
        }) => [r.id, r]
      )
    ),
    nonStaplePantry,
    ratingMap,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: ConsultRequest = await request.json();
    const { messages, context: reqContext } = body;

    if (!messages || messages.length === 0) {
      return new Response(
        sseEncode({ type: "error", message: "messages is required" }),
        { status: 400, headers: { "Content-Type": "text/event-stream" } }
      );
    }

    const targetDate = reqContext?.target_date || formatDate(new Date());
    const targetMealType = reqContext?.target_meal_type || "dinner";

    const supabase = createSupabaseServerClient();
    const gemini = getGeminiClient();

    const { systemPrompt, candidatesByIdMap, nonStaplePantry, ratingMap } =
      await buildSystemPrompt(supabase, targetDate, targetMealType);

    let closed = false;
    let aborted = false;
    request.signal.addEventListener("abort", () => {
      aborted = true;
    });

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        function closeOnce() {
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
        function send(event: ConsultSSEEvent) {
          if (closed || aborted) return;
          try {
            controller.enqueue(encoder.encode(sseEncode(event)));
          } catch {
            closed = true;
          }
        }

        // Keep-alive
        send({ type: "text", content: "" });

        try {
          const contents = convertMessages(messages);
          const geminiConfig = {
            systemInstruction: systemPrompt,
            tools: [{ functionDeclarations: [suggestFunction] }],
            thinkingConfig: { thinkingBudget: 1024 },
          };

          const response = await gemini.models.generateContent({
            model: "gemini-2.5-flash",
            contents,
            config: geminiConfig,
          });

          const candidate = response.candidates?.[0];
          if (!candidate?.content?.parts) {
            send({
              type: "text",
              content: "うまく応答を生成できませんでした。もう一度送ってみてください。",
            });
            send({ type: "done" });
            closeOnce();
            return;
          }

          for (const part of candidate.content.parts as Part[]) {
            if (aborted) break;
            if (part.text) {
              send({ type: "text", content: part.text });
            }
            if (part.functionCall && part.functionCall.name === "suggest_dinner_candidates") {
              const args = part.functionCall.args as {
                candidates?: { recipe_id: string; title: string; reason: string }[];
              };
              const resolved: ConsultCandidate[] = [];
              for (const c of args.candidates || []) {
                const match = candidatesByIdMap.get(c.recipe_id) as
                  | {
                      id: string;
                      title: string;
                      cook_method: string;
                      cook_time_min: number | null;
                      is_favorite?: boolean;
                    }
                  | undefined;
                if (!match) continue;
                if (resolved.find((x) => x.recipe_id === match.id)) continue;
                const r = ratingMap.get(match.id);
                if (!match.is_favorite && isLowRated(r)) continue;
                resolved.push({
                  recipe_id: match.id,
                  title: match.title,
                  reason: c.reason || "",
                  cook_method:
                    (match.cook_method as "hotcook" | "stove" | "other") || "other",
                  cook_time_min: match.cook_time_min,
                  is_favorite: match.is_favorite === true,
                  rating: r ? { avg: r.avg, count: r.count } : null,
                });
                if (resolved.length >= 3) break;
              }
              if (resolved.length > 0) {
                // 在庫マッチを server-side 計算 → 鮮度優先でソート
                try {
                  const ids = resolved.map((r) => r.recipe_id);
                  const { data: ingRows } = await supabase
                    .from("recipe_ingredients")
                    .select("recipe_id, name, amount, unit")
                    .in("recipe_id", ids);

                  const byRecipe = new Map<
                    string,
                    { name: string; amount: number | null; unit: string | null }[]
                  >();
                  for (const row of (ingRows || []) as {
                    recipe_id: string;
                    name: string;
                    amount: number | null;
                    unit: string | null;
                  }[]) {
                    const arr = byRecipe.get(row.recipe_id) || [];
                    arr.push({ name: row.name, amount: row.amount, unit: row.unit });
                    byRecipe.set(row.recipe_id, arr);
                  }
                  const redNames = redUrgencyNames(nonStaplePantry);
                  for (const r of resolved) {
                    const ings = byRecipe.get(r.recipe_id) || [];
                    r.inventory = computeInventoryMatch(ings, nonStaplePantry, redNames);
                  }
                  const sorted = sortByInventoryPriority(resolved);
                  send({ type: "candidates", candidates: sorted });
                } catch {
                  // 失敗してもUI表示は続行
                  send({ type: "candidates", candidates: resolved });
                }
              }
            }
          }

          send({ type: "done" });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unexpected error";
          send({ type: "error", message: msg });
          send({ type: "done" });
        } finally {
          closeOnce();
        }
      },
      cancel() {
        aborted = true;
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return new Response(sseEncode({ type: "error", message: msg }), {
      status: 500,
      headers: { "Content-Type": "text/event-stream" },
    });
  }
}
