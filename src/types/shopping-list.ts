export type ShoppingListStatus = "active" | "completed";
export type ItemCategory =
  | "meat_fish"
  | "vegetable"
  | "seasoning"
  | "dairy_egg"
  | "dry_goods"
  | "tofu_natto"
  | "frozen"
  | "other";

export type ShoppingItemResponse = {
  id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  category: string;
  is_checked: boolean;
  checked_by: string | null;
  /** この食材を使うレシピのタイトル一覧（"カレー用" のような用途表示に利用） */
  recipe_titles: string[];
};

export type ShoppingListResponse = {
  id: string;
  weekly_menu_id: string;
  status: ShoppingListStatus;
  week_start_date: string;
  actual_total: number | null;
  transaction_id: string | null;
  items: ShoppingItemResponse[];
};

export type CreateShoppingItem = {
  name: string;
  amount?: number;
  unit?: string;
  category?: ItemCategory;
};

export type UpdateShoppingItem = {
  is_checked?: boolean;
  checked_by?: string;
  amount?: number;
  name?: string;
};
