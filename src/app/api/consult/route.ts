import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGeminiClient } from "@/lib/gemini/client";
import { formatDate } from "@/lib/utils/date";
import type { Content, FunctionDeclaration, Part, Type } from "@google/genai";

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
    supabase.from("pantry_items").select("name, amount, unit, is_staple, category"),
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
    supabase
      .from("meal_slots")
      .select("id, recipes(title)")
      .eq("date", targetDate)
      .eq("meal_type", targetMealType)
      .maybeSingle(),
  ]);

  const nonStaplePantry = (pantry || []).filter(
    (i: { is_staple: boolean; category: string | null }) =>
      !i.is_staple && (i.category || "other") !== "seasoning"
  );

  const pantryText =
    nonStaplePantry.length > 0
      ? nonStaplePantry
          .map(
            (i: { name: string; amount: number | null; unit: string | null }) =>
              `- ${i.name}${i.amount != null ? `: ${i.amount}${i.unit || ""}` : ""}`
          )
          .join("\n")
      : "（在庫なし）";

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
      }) =>
        `- [${r.id}] ${r.title}（${r.cook_method}${
          r.cook_time_min ? `, ${r.cook_time_min}分` : ""
        }）`
    )
    .join("\n");

  const currentSlotTitle =
    (targetSlot as unknown as { recipes: { title: string } | null } | null)?.recipes
      ?.title || "(未設定)";

  const mealLabel = targetMealType === "lunch" ? "昼食" : "夕食";

  return {
    systemPrompt: `あなたは親しみやすい献立アドバイザーです。ユーザーは「今日/明日何作ろう」とカジュアルに相談してきます。

## スタンス
- カジュアルで短めの日本語（1-3文）
- 提案するときは **suggest_dinner_candidates** ツールを必ず呼ぶ
- レシピは必ず下の「利用可能なレシピDB」から選ぶ（recipe_id指定）
- 新規レシピは作らない

## 対象日
- 日付: ${targetDate}
- 食事: ${mealLabel}
- 現在の登録: ${currentSlotTitle}

## 冷蔵庫の残り食材（使い切り優先）
${pantryText}

## 直近2週間で作ったもの（マンネリ回避）
${recentText || "（なし）"}

## 利用可能なレシピDB（${(availableRecipes || []).length}件）
${recipesList || "（DB空）"}

## 応答のコツ
- 候補を出す前に一言だけ共感や理由を添える（「疲れた日ならあっさり系が良さそう」等）
- 候補は2〜3個。多すぎない
- reason は「〇〇を使い切れる」「前回△△だったので変化を」のように具体的に1文`,
    candidatesByIdMap: new Map(
      (availableRecipes || []).map(
        (r: {
          id: string;
          title: string;
          cook_method: string;
          cook_time_min: number | null;
        }) => [r.id, r]
      )
    ),
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

    const { systemPrompt, candidatesByIdMap } = await buildSystemPrompt(
      supabase,
      targetDate,
      targetMealType
    );

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
                    }
                  | undefined;
                if (!match) continue;
                if (resolved.find((x) => x.recipe_id === match.id)) continue;
                resolved.push({
                  recipe_id: match.id,
                  title: match.title,
                  reason: c.reason || "",
                  cook_method:
                    (match.cook_method as "hotcook" | "stove" | "other") || "other",
                  cook_time_min: match.cook_time_min,
                });
                if (resolved.length >= 3) break;
              }
              if (resolved.length > 0) {
                send({ type: "candidates", candidates: resolved });
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
