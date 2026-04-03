import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGeminiClient } from "@/lib/gemini/client";
import { buildContext, buildSystemPrompt } from "@/lib/gemini/prompts";
import { functionDeclarations } from "@/lib/gemini/functions";
import {
  executePropose,
  executeSaveWeeklyMenu,
  executeGenerateShoppingList,
} from "@/lib/gemini/handlers";
import type { ChatRequest, SSEEvent } from "@/types/meal-plan";
import type { Content, Part } from "@google/genai";

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

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        function send(event: SSEEvent) {
          controller.enqueue(encoder.encode(sseEncode(event)));
        }

        try {
          // Build conversation contents for multi-turn
          const contents = convertMessages(messages);

          // Call Gemini (non-streaming for FC support)
          const response = await gemini.models.generateContent({
            model: "gemini-2.5-flash",
            contents,
            config: {
              systemInstruction: systemPrompt,
              tools: [{ functionDeclarations }],
            },
          });

          const candidate = response.candidates?.[0];
          if (!candidate?.content?.parts) {
            send({ type: "text", content: "応答を生成できませんでした。もう一度お試しください。" });
            send({ type: "done" });
            controller.close();
            return;
          }

          // Process parts — may have text + function calls
          let pendingFcContents = [...contents];
          let parts = candidate.content.parts;
          let maxRounds = 5; // guard against infinite FC loops

          while (maxRounds-- > 0) {
            let hasFunctionCall = false;
            const fcResponseParts: Part[] = [];

            for (const part of parts) {
              // Text part
              if (part.text) {
                send({ type: "text", content: part.text });
              }

              // Function call
              if (part.functionCall) {
                hasFunctionCall = true;
                const { name, args } = part.functionCall;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const fcArgs = args as any;

                let result: unknown;
                try {
                  switch (name) {
                    case "propose_weekly_menu":
                      result = executePropose(fcArgs);
                      break;
                    case "save_weekly_menu":
                      result = await executeSaveWeeklyMenu(supabase, fcArgs);
                      break;
                    case "generate_shopping_list":
                      result = await executeGenerateShoppingList(supabase, fcArgs);
                      break;
                    default:
                      result = { error: `Unknown function: ${name}` };
                  }
                } catch (e) {
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

            // If no FC, we're done
            if (!hasFunctionCall) break;

            // Send FC results back to Gemini for continuation
            pendingFcContents = [
              ...pendingFcContents,
              { role: "model" as const, parts },
              { role: "user" as const, parts: fcResponseParts },
            ];

            const followUp = await gemini.models.generateContent({
              model: "gemini-2.5-flash",
              contents: pendingFcContents,
              config: {
                systemInstruction: systemPrompt,
                tools: [{ functionDeclarations }],
              },
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
          controller.close();
        }
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
