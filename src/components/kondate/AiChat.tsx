"use client";

import { useCallback, useRef, useState } from "react";
import { Send, Sparkles, Loader2, ShoppingCart, ArrowLeft, ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ChatMessage, SSEEvent } from "@/types/meal-plan";
import type { ApiResponse } from "@/types/common";
import AiChatBubble from "./AiChatBubble";
import MealPlanProposalCard from "./MealPlanProposalCard";

type ProposalData = { week_start_date: string; slots: unknown[] };

type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposal?: ProposalData | null;
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
  const [confirming, setConfirming] = useState(false);
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
          signal: AbortSignal.timeout(120_000),
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
        let lastProposalJson = "";

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
                  lastProposalJson = JSON.stringify(event.result);
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

        // Save to history — include FC proposal data so Gemini can save accurately
        const historyContent = lastProposalJson
          ? `${fullText}\n\n[propose_weekly_menu result: ${lastProposalJson}]`
          : fullText;
        chatHistoryRef.current = [
          ...chatHistoryRef.current,
          { role: "assistant", content: historyContent },
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

  // Confirm proposal directly (bypass Gemini — call save API)
  const confirmProposal = useCallback(
    async (proposal: ProposalData, msgId: string) => {
      if (confirming) return; // prevent double submit
      setConfirming(true);
      setStreaming(true);
      scrollToBottom();

      try {
        const res = await fetch("/api/meal-plan/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(proposal),
        });
        const json: ApiResponse<{
          weekly_menu_id: string;
          saved_slots: number;
          shopping_list_id: string | null;
        }> = await res.json();

        if (json.error || !json.data) {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `保存に失敗しました: ${json.error}`,
            },
          ]);
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? {
                    ...m,
                    savedMenuId: json.data!.weekly_menu_id,
                    shoppingListCreated: !!json.data!.shopping_list_id,
                  }
                : m
            )
          );
        }
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
        setConfirming(false);
        setStreaming(false);
        scrollToBottom();
      }
    },
    [confirming, scrollToBottom]
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
      <div className="flex flex-col items-center justify-center gap-5 px-6 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue/10">
          <Sparkles size={28} className="text-blue" strokeWidth={1.5} />
        </div>
        <p className="text-[15px] text-label-secondary">以下の内容でAIに献立を提案してもらいます</p>
        <div className="w-full max-w-sm whitespace-pre-wrap rounded-[10px] bg-bg-grouped-secondary p-4 text-left text-[15px] text-label">
          {initialMessage}
        </div>
        <button
          type="button"
          onClick={handleStart}
          className="flex h-[50px] items-center gap-2 rounded-[12px] bg-blue px-6 text-[17px] font-semibold text-white active:opacity-80"
        >
          <Sparkles size={18} strokeWidth={2} />
          提案を開始する
        </button>
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-[15px] text-blue active:opacity-60"
        >
          <ArrowLeft size={14} strokeWidth={2} />
          入力に戻る
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-49px-env(safe-area-inset-bottom))] flex-col bg-bg-primary">
      {/* Navigation Bar */}
      <div className="material-bar separator-bottom flex items-center px-4 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-0.5 text-[17px] text-blue active:opacity-60"
        >
          <ChevronLeft size={22} strokeWidth={2.5} />
          戻る
        </button>
        <div className="flex flex-1 items-center justify-center gap-1.5">
          <Sparkles size={14} className="text-blue" strokeWidth={2} />
          <span className="text-[17px] font-semibold text-label">AI献立</span>
        </div>
        <div className="w-12" />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((msg) => (
          <div key={msg.id}>
            <AiChatBubble role={msg.role}>
              {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}

              {msg.proposal && (
                <MealPlanProposalCard
                  weekStartDate={msg.proposal.week_start_date}
                  slots={msg.proposal.slots as Parameters<typeof MealPlanProposalCard>[0]["slots"]}
                  confirmed={!!msg.savedMenuId}
                  confirming={confirming}
                  onConfirm={
                    !msg.savedMenuId && !streaming && !confirming
                      ? () => confirmProposal(msg.proposal!, msg.id)
                      : undefined
                  }
                />
              )}

              {msg.savedMenuId && (
                <div className="mt-2 rounded-[10px] bg-green/10 px-3 py-2 text-[13px] text-green">
                  ✓ 献立を保存しました
                </div>
              )}

              {msg.shoppingListCreated && (
                <Link
                  href="/shopping"
                  className="mt-2 flex items-center gap-1.5 rounded-[10px] bg-blue/10 px-3 py-2 text-[13px] font-medium text-blue active:bg-blue/20"
                >
                  <ShoppingCart size={14} strokeWidth={2} />
                  買い物リストを見る
                </Link>
              )}
            </AiChatBubble>
          </div>
        ))}

        {streaming && (
          <div className="flex items-center gap-2 px-2 text-[13px] text-label-secondary">
            <Loader2 size={14} className="animate-spin" />
            考え中...
          </div>
        )}
      </div>

      {/* Input bar */}
      <form onSubmit={handleSubmit} className="material-bar separator-top px-4 py-2 pb-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="メッセージ"
            disabled={streaming}
            className="flex-1 rounded-full bg-fill-tertiary px-4 py-2 text-[17px] text-label placeholder:text-label-tertiary focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue text-white active:opacity-80 disabled:opacity-30"
            aria-label="送信"
          >
            <Send size={16} strokeWidth={2.5} />
          </button>
        </div>
      </form>
    </div>
  );
}
