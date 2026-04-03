"use client";

import { useCallback, useRef, useState } from "react";
import { Send, Sparkles, Loader2, ShoppingCart, ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ChatMessage, SSEEvent } from "@/types/meal-plan";
import AiChatBubble from "./AiChatBubble";
import MealPlanProposalCard from "./MealPlanProposalCard";

type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposal?: { week_start_date: string; slots: unknown[] } | null;
  savedMenuId?: string | null;
  shoppingListCreated?: boolean;
};

type Props = {
  initialMessage: string;
  weekStartDate: string;
  onBack: () => void;
};

export default function AiChat({ initialMessage, weekStartDate, onBack }: Props) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [started, setStarted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatHistoryRef = useRef<ChatMessage[]>([]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
  }, []);

  const sendToApi = useCallback(
    async (userText: string) => {
      // Add user message
      const userMsg: DisplayMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: userText,
      };
      setMessages((prev) => [...prev, userMsg]);

      chatHistoryRef.current = [
        ...chatHistoryRef.current,
        { role: "user", content: userText },
      ];

      setStreaming(true);
      scrollToBottom();

      // Prepare assistant message placeholder
      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", proposal: null, savedMenuId: null, shoppingListCreated: false },
      ]);

      try {
        const res = await fetch("/api/meal-plan/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: chatHistoryRef.current,
            context: { week_start_date: weekStartDate },
          }),
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

            let event: SSEEvent;
            try {
              event = JSON.parse(jsonStr);
            } catch {
              continue;
            }

            switch (event.type) {
              case "text":
                fullText += event.content;
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, content: fullText } : m))
                );
                scrollToBottom();
                break;

              case "function_call":
                if (event.name === "propose_weekly_menu") {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, proposal: event.result as DisplayMessage["proposal"] }
                        : m
                    )
                  );
                } else if (event.name === "save_weekly_menu") {
                  const result = event.result as { weekly_menu_id?: string };
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, savedMenuId: result.weekly_menu_id ?? null }
                        : m
                    )
                  );
                } else if (event.name === "generate_shopping_list") {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId ? { ...m, shoppingListCreated: true } : m
                    )
                  );
                }
                scrollToBottom();
                break;

              case "error":
                fullText += `\n\n[Error: ${event.message}]`;
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, content: fullText } : m))
                );
                break;

              case "done":
                break;
            }
          }
        }

        // Save to history
        chatHistoryRef.current = [
          ...chatHistoryRef.current,
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
    [weekStartDate, scrollToBottom]
  );

  // Start chat with initial message
  const handleStart = useCallback(() => {
    setStarted(true);
    sendToApi(initialMessage);
  }, [initialMessage, sendToApi]);

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

  // Initial "start chat" state
  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-4 py-20 text-center">
        <Sparkles size={32} className="text-accent" />
        <p className="text-sm text-muted">以下の内容でAIに献立を提案してもらいます</p>
        <div className="w-full max-w-sm rounded-xl bg-card p-4 text-left text-sm">
          {initialMessage}
        </div>
        <button
          type="button"
          onClick={handleStart}
          className="flex items-center gap-2 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
        >
          <Sparkles size={16} />
          提案を開始する
        </button>
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ArrowLeft size={14} />
          入力に戻る
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <button type="button" onClick={onBack} className="text-muted hover:text-foreground">
          <ArrowLeft size={18} />
        </button>
        <Sparkles size={16} className="text-accent" />
        <span className="text-sm font-semibold">献立を考えよう</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {messages.map((msg) => (
          <div key={msg.id}>
            <AiChatBubble role={msg.role}>
              {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}

              {/* Proposal card */}
              {msg.proposal && (
                <MealPlanProposalCard
                  weekStartDate={msg.proposal.week_start_date}
                  slots={msg.proposal.slots as Parameters<typeof MealPlanProposalCard>[0]["slots"]}
                />
              )}

              {/* Save confirmation */}
              {msg.savedMenuId && (
                <div className="mt-2 rounded-lg bg-green/10 px-3 py-2 text-xs text-green">
                  献立を保存しました
                </div>
              )}

              {/* Shopping list link */}
              {msg.shoppingListCreated && (
                <Link
                  href="/shopping"
                  className="mt-2 flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                >
                  <ShoppingCart size={14} />
                  買い物リストを見る
                </Link>
              )}
            </AiChatBubble>
          </div>
        ))}

        {streaming && (
          <div className="flex items-center gap-2 px-2 text-xs text-muted">
            <Loader2 size={14} className="animate-spin" />
            考え中...
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-border p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="メッセージを入力..."
            disabled={streaming}
            className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}
