export type UserName = "れん" | "あかね";

export type RecipeRating = {
  id: string;
  recipe_id: string;
  user_name: UserName;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateRating = {
  user_name: UserName;
  rating: number;
  comment?: string;
};
