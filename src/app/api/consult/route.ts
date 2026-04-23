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
import { filterPromptRecipes } from "@/lib/utils/recipe-filter";

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
    hotcook_model?: string; // 例: KN-HW24H
    recipe_context?: {
      recipe_id: string;
      servings: number;
    };
  };
};

type RecipeAdjustmentContext = {
  title: string;
  description: string | null;
  cook_method: string;
  hotcook_menu_number: string | null;
  hotcook_unit: string | null;
  prep_time_min: number | null;
  cook_time_min: number | null;
  servings_base: number;
  servings: number;
  ingredients: { name: string; amount: number | null; unit: string | null }[];
  steps: { step_number: number; instruction: string; tip: string | null }[];
};

async function loadRecipeForAdjustment(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  recipeId: string,
  servings: number
): Promise<RecipeAdjustmentContext | null> {
  const { data } = await supabase
    .from("recipes")
    .select(
      `id, title, description, cook_method, hotcook_menu_number, hotcook_unit,
       prep_time_min, cook_time_min, servings_base,
       recipe_ingredients ( name, amount, unit, sort_order ),
       recipe_steps ( step_number, instruction, tip )`
    )
    .eq("id", recipeId)
    .maybeSingle();

  if (!data) return null;

  const base = (data.servings_base as number) || 1;
  const ratio = base > 0 ? servings / base : 1;

  const ingredients = ((data.recipe_ingredients || []) as {
    name: string;
    amount: number | null;
    unit: string | null;
    sort_order: number;
  }[])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => ({
      name: i.name,
      amount: i.amount != null ? i.amount * ratio : null,
      unit: i.unit,
    }));

  const steps = ((data.recipe_steps || []) as {
    step_number: number;
    instruction: string;
    tip: string | null;
  }[])
    .slice()
    .sort((a, b) => a.step_number - b.step_number)
    .map((s) => ({ step_number: s.step_number, instruction: s.instruction, tip: s.tip }));

  return {
    title: data.title as string,
    description: (data.description as string | null) ?? null,
    cook_method: (data.cook_method as string) ?? "other",
    hotcook_menu_number: (data.hotcook_menu_number as string | null) ?? null,
    hotcook_unit: (data.hotcook_unit as string | null) ?? null,
    prep_time_min: (data.prep_time_min as number | null) ?? null,
    cook_time_min: (data.cook_time_min as number | null) ?? null,
    servings_base: base,
    servings,
    ingredients,
    steps,
  };
}

function formatAdjustmentRecipe(r: RecipeAdjustmentContext): string {
  const ingredientsText = r.ingredients
    .map((i) => {
      const amount = i.amount != null ? i.amount.toFixed(2).replace(/\.?0+$/, "") : "";
      return `- ${i.name}${amount ? ` ${amount}` : ""}${i.unit ? ` ${i.unit}` : ""}`;
    })
    .join("\n");
  const stepsText = r.steps
    .map(
      (s) =>
        `${s.step_number}. ${s.instruction}${s.tip ? `\n   (Tip: ${s.tip})` : ""}`
    )
    .join("\n");
  const hot =
    r.cook_method === "hotcook"
      ? `ホットクック${r.hotcook_menu_number ? ` No.${r.hotcook_menu_number}` : ""}${
          r.hotcook_unit ? ` / まぜ技: ${r.hotcook_unit}` : ""
        }${r.cook_time_min ? ` / 加熱: ${r.cook_time_min}分` : ""}`
      : r.cook_method;
  return `### 対象レシピ
- タイトル: ${r.title}
- 調理方法: ${hot}
- 人数設定: ${r.servings}人分（元レシピ: ${r.servings_base}人分）
${r.description ? `- 説明: ${r.description}\n` : ""}
### 材料（${r.servings}人分換算）
${ingredientsText || "（材料なし）"}

### 手順
${stepsText || "（手順なし）"}`;
}

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
  targetMealType: "lunch" | "dinner",
  hotcookModel: string
) {
  const twoWeeksAgo = formatDate(new Date(Date.now() - 14 * 86400000));
  const [
    { data: pantry },
    { data: recentSlots },
    { data: availableRecipes },
    { data: ingCounts },
    { data: targetSlot },
  ] = await Promise.all([
    supabase
      .from("pantry_items")
      .select("name, amount, unit, is_staple, category, expiry_date, purchased_at"),
    supabase
      .from("meal_slots")
      .select("date, meal_type, recipe_id, recipes(title)")
      .gte("date", twoWeeksAgo)
      .eq("is_skipped", false)
      .not("recipe_id", "is", null)
      .order("date", { ascending: false }),
    supabase
      .from("recipes")
      .select("id, title, cook_method, cook_time_min, is_favorite, source")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("recipe_ingredients").select("recipe_id"),
    supabase
      .from("meal_slots")
      .select("id, recipes(title)")
      .eq("date", targetDate)
      .eq("meal_type", targetMealType)
      .maybeSingle(),
  ]);

  const ingCountMap = new Map<string, number>();
  for (const row of (ingCounts || []) as { recipe_id: string }[]) {
    ingCountMap.set(row.recipe_id, (ingCountMap.get(row.recipe_id) ?? 0) + 1);
  }
  const recentRecipeIds = new Set<string>();
  for (const s of ((recentSlots as unknown as { recipe_id: string | null }[]) || [])) {
    if (s.recipe_id) recentRecipeIds.add(s.recipe_id);
  }

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
    purchased_at: string | null;
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

  const filteredRecipes = filterPromptRecipes(
    (availableRecipes || []) as {
      id: string;
      title: string;
      cook_method: string;
      cook_time_min: number | null;
      is_favorite: boolean | null;
      source: string | null;
    }[],
    ingCountMap,
    ratingMap,
    recentRecipeIds
  );

  const recipesList = filteredRecipes
    .map(
      (r) =>
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

## 🔴 ユーザーのホットクック機種
${hotcookModel}

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

## 利用可能なレシピDB（${filteredRecipes.length}件・キット系/低評価は除外済）
${recipesList || "（候補なし）"}

## 応答スタイル
- カジュアルで短めの日本語（1-3文）
- 候補を出す前に一言だけ共感や理由を添える（「鶏もも使い切り行こうか」等）
- 候補は2〜3個
- reason は **「どの在庫食材を使えるか / 鮮度を回せるか」を必ず含めて** 具体的に1文
  例: 「鶏もも(残2日)使い切れる」「豚こま在庫ありで作れる、買い足し不要」`,
    candidatesByIdMap: new Map(filteredRecipes.map((r) => [r.id, r])),
    nonStaplePantry,
    ratingMap,
  };
}

function buildAdjustmentSystemPrompt(
  recipe: RecipeAdjustmentContext,
  hotcookModel: string
): string {
  return `あなたは在庫ファーストなホットクック献立アドバイザー、かつレシピ調整のプロです。
ユーザーは今「特定のレシピを、自分の都合に合わせて調整したい」と相談に来ています。

## 🔴 ユーザーのホットクック機種
${hotcookModel}（容量・まぜ技の有無を踏まえて回答する）

## モード: レシピ調整モード
- 候補レシピを新たに提案するモードではない。**suggest_dinner_candidates は呼ばない**
- 下記「対象レシピ」について、ユーザーの要望に合わせて調整・代替材料・手順の補足・Tipsを会話で返す

${formatAdjustmentRecipe(recipe)}

## 応答スタイル（厳守）
- カジュアルで親しみやすい日本語、見出し＋箇条書きで読みやすく
- 「生クリームなしで」「乳不使用で」「もっと辛く」のような制約・要望があれば：
  - **代替材料**を具体数量で提示（例: 生クリーム 100ml → 牛乳 100ml + 粉チーズ 大さじ2）
  - **なぜその代替が妥当か**の理由も1文で添える
- 調味料は必ず具体数量（大さじ○, 小さじ○, g 等）で書く
- ${hotcookModel} の容量・まぜ技に合わせた手順を書く
- 宅配キット前提の材料名（「専用ソース」「ミールキット」等）は使わず、市販素材で組み直す
- 追加質問歓迎（例: 「もっと時短したい？」「お供は？」と会話を広げる）`;
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
    const hotcookModel = reqContext?.hotcook_model || "KN-HW24H";
    const recipeContextReq = reqContext?.recipe_context;

    const supabase = createSupabaseServerClient();
    const gemini = getGeminiClient();

    // 調整モード: レシピを読み込んで専用プロンプトを組む
    let adjustmentContext: RecipeAdjustmentContext | null = null;
    if (recipeContextReq?.recipe_id) {
      adjustmentContext = await loadRecipeForAdjustment(
        supabase,
        recipeContextReq.recipe_id,
        recipeContextReq.servings > 0 ? recipeContextReq.servings : 2
      );
    }

    const isAdjustmentMode = adjustmentContext !== null;

    const baseCtx = isAdjustmentMode
      ? null
      : await buildSystemPrompt(supabase, targetDate, targetMealType, hotcookModel);

    const systemPrompt = isAdjustmentMode
      ? buildAdjustmentSystemPrompt(adjustmentContext!, hotcookModel)
      : baseCtx!.systemPrompt;
    const candidatesByIdMap = baseCtx?.candidatesByIdMap ?? new Map();
    const nonStaplePantry = baseCtx?.nonStaplePantry ?? [];
    const ratingMap = baseCtx?.ratingMap ?? new Map();

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
            // 調整モードでは候補提案FCを登録しない（会話テキストのみ）
            ...(isAdjustmentMode
              ? {}
              : { tools: [{ functionDeclarations: [suggestFunction] }] }),
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
