export type ShoppingListStatus = "active" | "completed";
export type ItemCategory = "meat" | "vegetable" | "seasoning" | "other";

export type ShoppingItemResponse = {
  id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  category: string;
  is_checked: boolean;
  checked_by: string | null;
};

export type ShoppingListResponse = {
  id: string;
  weekly_menu_id: string;
  status: ShoppingListStatus;
  week_start_date: string;
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
