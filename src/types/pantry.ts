export type PantrySource = "manual" | "shopping";

export type PantryItem = {
  id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  category: string;
  expiry_date: string | null;
  /** 購入日。expiry_date が無い時のフォールバック残日数推定に使う。 */
  purchased_at: string | null;
  source: PantrySource;
  is_staple: boolean;
  created_at: string;
  updated_at: string;
};

export type CreatePantryItem = {
  name: string;
  amount?: number;
  unit?: string;
  category?: string;
  expiry_date?: string;
  purchased_at?: string;
};

export type UpdatePantryItem = {
  amount?: number;
  unit?: string;
  expiry_date?: string | null;
  purchased_at?: string | null;
  is_staple?: boolean;
};
