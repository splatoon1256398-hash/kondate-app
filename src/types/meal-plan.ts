export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type MealPlanRecipeDraft = {
  title: string;
  description?: string;
  servings_base?: number;
  cook_method: "hotcook" | "stove" | "other";
  hotcook_menu_number?: string;
  hotcook_unit?: string;
  prep_time_min?: number;
  cook_time_min?: number;
  ingredients?: {
    name: string;
    amount: number;
    unit: string;
    sort_order: number;
  }[];
  steps?: {
    step_number: number;
    instruction: string;
    tip?: string;
  }[];
};

export type MealPlanSlotProposal = {
  date: string;
  meal_type: "lunch" | "dinner";
  servings: number;
  is_skipped?: boolean;
  memo?: string;
  recipe_id?: string;
  recipe?: MealPlanRecipeDraft;
};

export type MealPlanProposal = {
  week_start_date: string;
  slots: MealPlanSlotProposal[];
};

export type SaveWeeklyMenuResult = {
  weekly_menu_id: string;
  saved_slots: number;
  shopping_list_id?: string | null;
  shopping_items_count?: number;
};

export type GenerateShoppingListResult = {
  shopping_list_id: string;
  items_count?: number;
};

export type FunctionCallErrorResult = {
  error: string;
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
  | {
      type: "function_call";
      name: "propose_weekly_menu";
      result: MealPlanProposal;
    }
  | {
      type: "function_call";
      name: "save_weekly_menu";
      result: SaveWeeklyMenuResult | FunctionCallErrorResult;
    }
  | {
      type: "function_call";
      name: "generate_shopping_list";
      result: GenerateShoppingListResult | FunctionCallErrorResult;
    }
  | { type: "error"; message: string }
  | { type: "done" };
