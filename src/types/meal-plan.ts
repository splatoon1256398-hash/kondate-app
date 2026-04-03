export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatRequest = {
  messages: ChatMessage[];
  context?: {
    week_start_date?: string;
    weekly_menu_id?: string;
  };
};

export type SSEEvent =
  | { type: "text"; content: string }
  | { type: "function_call"; name: string; result: unknown }
  | { type: "error"; message: string }
  | { type: "done" };
