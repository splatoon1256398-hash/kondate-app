import type { MealType } from "./weekly-menu";

export type CreateMealSlot = {
  date: string;
  meal_type: MealType;
  servings: number;
  recipe_id?: string;
  memo?: string;
  is_skipped?: boolean;
};

export type CreateMealSlots = {
  weekly_menu_id: string;
  slots: CreateMealSlot[];
};

export type UpdateMealSlot = {
  servings?: number;
  recipe_id?: string | null;
  memo?: string;
  is_skipped?: boolean;
  /**
   * true を渡すと cooked_at=now() をセット + pantry から食材を減算（冪等）。
   * false を渡すと cooked_at=null をセット（減算は巻き戻さない — 手動調整してください）
   */
  cooked?: boolean;
};
