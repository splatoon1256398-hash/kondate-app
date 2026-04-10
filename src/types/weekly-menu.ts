export type WeeklyMenuStatus = "draft" | "confirmed";

export type MealType = "lunch" | "dinner";

export type MealSlotResponse = {
  id: string;
  date: string;
  meal_type: MealType;
  servings: number;
  recipe_id: string | null;
  recipe_title: string | null;
  memo: string | null;
  is_skipped: boolean;
  /** 調理済みフラグ。non-null なら調理完了（pantry 減算済み） */
  cooked_at: string | null;
};

export type WeeklyMenuResponse = {
  id: string;
  week_start_date: string;
  status: WeeklyMenuStatus;
  notes: string | null;
  meal_slots: MealSlotResponse[];
};

export type CreateWeeklyMenu = {
  week_start_date: string;
  notes?: string;
};
