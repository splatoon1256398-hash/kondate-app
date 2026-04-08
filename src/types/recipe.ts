export type CookMethod = "hotcook" | "stove" | "other";
export type RecipeSource = "ai" | "manual" | "imported";

export type RecipeListItem = {
  id: string;
  title: string;
  cook_method: CookMethod;
  hotcook_menu_number: string | null;
  prep_time_min: number | null;
  cook_time_min: number | null;
  source: RecipeSource;
  is_favorite: boolean;
  image_url: string | null;
};

export type RecipeIngredient = {
  id: string;
  name: string;
  amount: number;
  unit: string;
  sort_order: number;
};

export type RecipeStep = {
  id: string;
  step_number: number;
  instruction: string;
  tip: string | null;
};

export type RecipeDetail = {
  id: string;
  title: string;
  description: string | null;
  servings_base: number;
  cook_method: CookMethod;
  hotcook_menu_number: string | null;
  hotcook_unit: string | null;
  prep_time_min: number | null;
  cook_time_min: number | null;
  source: RecipeSource;
  is_favorite: boolean;
  image_url: string | null;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
};

export type CreateRecipe = {
  title: string;
  description?: string;
  servings_base: number;
  cook_method: CookMethod;
  hotcook_menu_number?: string;
  hotcook_unit?: string;
  prep_time_min?: number;
  cook_time_min?: number;
  source: RecipeSource;
  ingredients: {
    name: string;
    amount: number;
    unit: string;
    sort_order: number;
  }[];
  steps: {
    step_number: number;
    instruction: string;
    tip?: string;
  }[];
};
