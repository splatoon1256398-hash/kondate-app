import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGeminiClient } from "@/lib/gemini/client";
import { buildContext, buildSystemPrompt } from "@/lib/gemini/prompts";
import { functionDeclarations } from "@/lib/gemini/functions";
import {
  executePropose,
  executeSaveWeeklyMenu,
  executeGenerateShoppingList,
  validateSaveArgs,
} from "@/lib/gemini/handlers";
import type { ChatRequest, SSEEvent } from "@/types/meal-plan";
import type { Content, Part } from "@google/genai";

// Gemini 2.5 Flash (thinking model) + FC can take >60s
export const maxDuration = 120;

function sseEncode(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function convertMessages(messages: ChatRequest["messages"]): Content[] {
  return messages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { messages, context: reqContext } = body;

    if (!messages || messages.length === 0) {
      return new Response(
        sseEncode({ type: "error", message: "messages is required" }),
        { status: 400, headers: { "Content-Type": "text/event-stream" } }
      );
    }

    const supabase = createSupabaseServerClient();
    const gemini = getGeminiClient();

    // Build context
    const mealPlanContext = await buildContext(supabase, reqContext?.week_start_date);
    const systemPrompt = buildSystemPrompt(mealPlanContext);

    // Stream state — single source of truth
    let closed = false;
    let aborted = false;

    // Listen for client disconnect
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

        function send(event: SSEEvent) {
          if (closed || aborted) return;
          try {
            controller.enqueue(encoder.encode(sseEncode(event)));
          } catch {
            // Controller errored (client disconnected)
            closed = true;
          }
        }

        // Keep-alive comment
        send({ type: "text", content: "" });

        try {
          const contents = convertMessages(messages);

          const geminiConfig = {
            systemInstruction: systemPrompt,
            tools: [{ functionDeclarations }],
            thinkingConfig: { thinkingBudget: 2048 },
          };
          const response = await gemini.models.generateContent({
            model: "gemini-2.5-flash",
            contents,
            config: geminiConfig,
          });

          const candidate = response.candidates?.[0];
          if (!candidate?.content?.parts) {
            send({ type: "text", content: "応答を生成できませんでした。もう一度お試しください。" });
            send({ type: "done" });
            closeOnce();
            return;
          }

          let pendingFcContents = [...contents];
          let parts = candidate.content.parts;
          let maxRounds = 5;

          while (maxRounds-- > 0 && !aborted) {
            let hasFunctionCall = false;
            const fcResponseParts: Part[] = [];

            for (const part of parts) {
              if (aborted) break;

              if (part.text) {
                send({ type: "text", content: part.text });
              }

              if (part.functionCall) {
                hasFunctionCall = true;
                const { name, args } = part.functionCall;

                let result: unknown;
                try {
                  switch (name) {
                    case "propose_weekly_menu":
                      result = executePropose(args as Parameters<typeof executePropose>[0]);
                      break;
                    case "save_weekly_menu": {
                      const validation = validateSaveArgs(args);
                      if (!validation.success) {
                        result = { error: validation.error };
                      } else {
                        result = await executeSaveWeeklyMenu(supabase, validation.data);
                      }
                      break;
                    }
                    case "generate_shopping_list":
                      result = await executeGenerateShoppingList(
                        supabase,
                        args as { weekly_menu_id: string }
                      );
                      break;
                    default:
                      result = { error: `Unknown function: ${name}` };
                  }
                } catch (e) {
                  console.error(`[FC:${name}] error:`, e);
                  result = { error: e instanceof Error ? e.message : "FC execution failed" };
                }

                send({ type: "function_call", name: name!, result });

                fcResponseParts.push({
                  functionResponse: {
                    name: name!,
                    response: result as Record<string, unknown>,
                  },
                });
              }
            }

            if (!hasFunctionCall || aborted) break;

            pendingFcContents = [
              ...pendingFcContents,
              { role: "model" as const, parts },
              { role: "user" as const, parts: fcResponseParts },
            ];

            const followUp = await gemini.models.generateContent({
              model: "gemini-2.5-flash",
              contents: pendingFcContents,
              config: geminiConfig,
            });

            const followCandidate = followUp.candidates?.[0];
            if (!followCandidate?.content?.parts) break;

            parts = followCandidate.content.parts;
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
