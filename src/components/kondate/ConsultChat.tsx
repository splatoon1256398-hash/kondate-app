"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Send,
  Sparkles,
  Loader2,
  ChefHat,
  Clock,
  Check,
  Refrigerator,
} from "lucide-react";
import AiChatBubble from "./AiChatBubble";
import type { ApiResponse } from "@/types/common";
import type {
  ConsultCandidate,
  ConsultSSEEvent,
} from "@/app/api/consult/route";

type ConsultMessage = {
  role: "user" | "assistant";
  content: string;
};

type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  candidates?: ConsultCandidate[];
  appliedRecipeId?: string | null;
};

type TargetMealType = "lunch" | "dinner";

const SUGGESTIONS = [
  "今夜あっさりしたものが食べたい",
  "疲れてるから簡単なやつ",
  "冷蔵庫の残りで",
  "肉系の気分",
] as const;

function formatTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTomorrowIso(): string {
  const d = new Date(Date.now() + 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ConsultChat() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [targetDate, setTargetDate] = useState<"today" | "tomorrow">("today");
  const [targetMealType, setTargetMealType] = useState<TargetMealType>("dinner");
  const [applying, setApplying] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<ConsultMessage[]>([]);

  const targetDateIso = useMemo(
    () => (targetDate === "today" ? formatTodayIso() : formatTomorrowIso()),
    [targetDate]
  );

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 50);
  }, []);

  const sendToApi = useCallback(
    async (userText: string) => {
      const userMsg: DisplayMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: userText,
      };
      setMessages((prev) => [...prev, userMsg]);

      historyRef.current = [
        ...historyRef.current,
        { role: "user", content: userText },
      ];

      setStreaming(true);
      scrollToBottom();

      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", candidates: undefined },
      ]);

      try {
        const res = await fetch("/api/consult", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: historyRef.current,
            context: {
              target_date: targetDateIso,
              target_meal_type: targetMealType,
            },
          }),
          signal: AbortSignal.timeout(90_000),
        });

        if (!res.ok || !res.body) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: "エラーが発生しました。もう一度お試しください。" }
                : m
            )
          );
          setStreaming(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            let event: ConsultSSEEvent;
            try {
              event = JSON.parse(jsonStr);
            } catch {
              continue;
            }

            switch (event.type) {
              case "text":
                fullText += event.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: fullText } : m
                  )
                );
                scrollToBottom();
                break;
              case "candidates":
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, candidates: event.candidates }
                      : m
                  )
                );
                scrollToBottom();
                break;
              case "error":
                fullText += `\n\n[Error: ${event.message}]`;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: fullText } : m
                  )
                );
                break;
              case "done":
                break;
            }
          }
        }

        historyRef.current = [
          ...historyRef.current,
          { role: "assistant", content: fullText },
        ];
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content || "通信エラーが発生しました。" }
              : m
          )
        );
      } finally {
        setStreaming(false);
        scrollToBottom();
      }
    },
    [targetDateIso, targetMealType, scrollToBottom]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || streaming) return;
      setInput("");
      sendToApi(text);
    },
    [input, streaming, sendToApi]
  );

  const applyCandidate = useCallback(
    async (candidate: ConsultCandidate, msgId: string) => {
      if (applying) return;
      setApplying(true);
      try {
        // 1. 対象スロットを取得
        const res = await fetch(
          `/api/meal-slots/by-date?date=${targetDateIso}&meal_type=${targetMealType}`
        );
        const json: ApiResponse<{ id: string } | null> = await res.json();

        if (json.error || !json.data) {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `${targetDate === "today" ? "今日" : "明日"}の${targetMealType === "lunch" ? "昼" : "夜"}の献立枠がまだありません。先にAI提案タブから今週の献立を作ってください。`,
            },
          ]);
          return;
        }

        // 2. PATCH
        const patchRes = await fetch(`/api/meal-slots/${json.data.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipe_id: candidate.recipe_id }),
        });
        const patchJson: ApiResponse<unknown> = await patchRes.json();

        if (patchJson.error) {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `反映に失敗: ${patchJson.error}`,
            },
          ]);
          return;
        }

        // 3. 画面更新
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, appliedRecipeId: candidate.recipe_id } : m
          )
        );
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "通信エラーが発生しました。",
          },
        ]);
      } finally {
        setApplying(false);
        scrollToBottom();
      }
    },
    [applying, targetDateIso, targetMealType, targetDate, scrollToBottom]
  );

  // 最初にフォーカスを下にもっていく用
  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  const dayLabel = targetDate === "today" ? "今日" : "明日";
  const mealLabel = targetMealType === "lunch" ? "昼" : "夜";

  return (
    <div className="flex h-[calc(100dvh-60px-env(safe-area-inset-bottom))] flex-col bg-bg-grouped">
      {/* Large title + target selector */}
      <div className="px-4 pt-3 pb-3">
        <h1 className="text-[28px] font-bold leading-[34px] text-label">相談</h1>
        <p className="text-[13px] text-label-secondary">
          {dayLabel}の{mealLabel}、何作る？
        </p>

        {/* Target selector: day + meal type */}
        <div className="mt-3 flex gap-2">
          <div className="flex flex-1 gap-1 rounded-[9px] bg-fill-tertiary p-[3px]">
            {(
              [
                { key: "today", label: "今日" },
                { key: "tomorrow", label: "明日" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTargetDate(key)}
                className={`flex flex-1 items-center justify-center rounded-[7px] py-1.5 text-[13px] font-semibold transition-colors ${
                  targetDate === key
                    ? "bg-bg-secondary text-label shadow-sm"
                    : "text-label-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-1 gap-1 rounded-[9px] bg-fill-tertiary p-[3px]">
            {(
              [
                { key: "dinner", label: "夜" },
                { key: "lunch", label: "昼" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTargetMealType(key)}
                className={`flex flex-1 items-center justify-center rounded-[7px] py-1.5 text-[13px] font-semibold transition-colors ${
                  targetMealType === key
                    ? "bg-bg-secondary text-label shadow-sm"
                    : "text-label-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Messages or empty state */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center gap-5 px-2 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-purple/10">
              <Sparkles size={28} className="text-purple" strokeWidth={1.5} />
            </div>
            <div className="space-y-1">
              <p className="text-[17px] font-semibold text-label">
                気分や状況を教えてね
              </p>
              <p className="text-[13px] text-label-secondary">
                冷蔵庫の残りや最近の献立も見て候補を出すよ
              </p>
            </div>
            <div className="flex w-full flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => sendToApi(s)}
                  disabled={streaming}
                  className="flex items-center gap-2 rounded-[12px] bg-bg-grouped-secondary px-4 py-3 text-left text-[15px] text-label active:bg-fill disabled:opacity-50"
                >
                  <Sparkles size={13} className="text-purple" strokeWidth={2} />
                  {s}
                </button>
              ))}
            </div>
            <Link
              href="/pantry"
              className="flex items-center gap-1.5 text-[13px] text-blue active:opacity-60"
            >
              <Refrigerator size={12} strokeWidth={2} />
              冷蔵庫の在庫を確認
            </Link>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id}>
              <AiChatBubble role={msg.role}>
                {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}

                {msg.candidates && msg.candidates.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2">
                    {msg.candidates.map((c, idx) => {
                      const applied = msg.appliedRecipeId === c.recipe_id;
                      return (
                        <div
                          key={c.recipe_id}
                          className={`flex flex-col gap-1.5 rounded-[12px] border p-3 ${
                            applied
                              ? "border-green bg-green/5"
                              : "border-separator bg-bg-secondary"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple/15 text-[11px] font-bold text-purple">
                              {idx + 1}
                            </span>
                            <Link
                              href={`/menu/${c.recipe_id}`}
                              className="flex-1 text-[16px] font-medium text-label active:text-blue"
                            >
                              {c.title}
                            </Link>
                            {c.cook_method === "hotcook" && (
                              <ChefHat
                                size={13}
                                className="mt-1 shrink-0 text-label-tertiary"
                                strokeWidth={1.5}
                              />
                            )}
                          </div>
                          <p className="pl-7 text-[13px] leading-[18px] text-label-secondary">
                            {c.reason}
                          </p>
                          <div className="flex items-center justify-between pl-7">
                            {c.cook_time_min != null ? (
                              <div className="flex items-center gap-1 text-[11px] text-label-tertiary">
                                <Clock size={10} strokeWidth={2} />
                                {c.cook_time_min}分
                              </div>
                            ) : (
                              <span />
                            )}
                            {applied ? (
                              <span className="flex items-center gap-1 text-[12px] font-semibold text-green">
                                <Check size={12} strokeWidth={2.5} />
                                反映済み
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => applyCandidate(c, msg.id)}
                                disabled={applying}
                                className="rounded-[8px] bg-purple px-3 py-1 text-[12px] font-semibold text-white active:opacity-70 disabled:opacity-40"
                              >
                                {dayLabel}の{mealLabel}に反映
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </AiChatBubble>
            </div>
          ))
        )}

        {streaming && (
          <div className="flex items-center gap-2 px-2 text-[13px] text-label-secondary">
            <Loader2 size={14} className="animate-spin" />
            考え中...
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="material-bar separator-top px-4 py-2 pb-3"
      >
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="気分や食材を入力…"
            disabled={streaming}
            className="flex-1 rounded-full bg-fill-tertiary px-4 py-2 text-[17px] text-label placeholder:text-label-tertiary focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple text-white active:opacity-80 disabled:opacity-30"
            aria-label="送信"
          >
            <Send size={16} strokeWidth={2.5} />
          </button>
        </div>
      </form>
    </div>
  );
}
