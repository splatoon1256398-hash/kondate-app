"use client";

import { useCallback, useState } from "react";
import AiSuggestionForm from "@/components/kondate/AiSuggestionForm";
import AiChat from "@/components/kondate/AiChat";

type ChatState = {
  message: string;
  weekStart: string;
} | null;

export default function AiPage() {
  const [chatState, setChatState] = useState<ChatState>(null);

  const handleFormSubmit = useCallback((message: string, weekStart: string) => {
    setChatState({ message, weekStart });
  }, []);

  const handleBack = useCallback(() => {
    setChatState(null);
  }, []);

  if (chatState) {
    return (
      <AiChat
        initialMessage={chatState.message}
        weekStartDate={chatState.weekStart}
        onBack={handleBack}
      />
    );
  }

  return <AiSuggestionForm onSubmit={handleFormSubmit} />;
}
