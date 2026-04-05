export type PantrySource = "manual" | "shopping";

export type PantryItem = {
  id: string;
  name: string;
  amount: number | null;
  unit: string | null;
  category: string;
  expiry_date: string | null;
  source: PantrySource;
  created_at: string;
  updated_at: string;
};

export type CreatePantryItem = {
  name: string;
  amount?: number;
  unit?: string;
  category?: string;
  expiry_date?: string;
};

export type UpdatePantryItem = {
  amount?: number;
  unit?: string;
  expiry_date?: string | null;
};
