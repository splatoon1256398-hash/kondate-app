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
};
