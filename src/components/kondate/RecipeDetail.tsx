"use client";

import { useEffect, useState } from "react";
import { ChefHat, Clock, Flame, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { RecipeDetail as RecipeDetailType } from "@/types/recipe";
import type { ApiResponse } from "@/types/common";

type Props = {
  recipeId: string;
  servings?: number;
};

export default function RecipeDetail({ recipeId, servings }: Props) {
  const router = useRouter();
  const [recipe, setRecipe] = useState<RecipeDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRecipe() {
      setLoading(true);
      try {
        const qs = servings ? `?servings=${servings}` : "";
        const res = await fetch(`/api/recipes/${recipeId}${qs}`);
        const json: ApiResponse<RecipeDetailType> = await res.json();
        if (json.error) {
          setError(json.error);
        } else {
          setRecipe(json.data);
        }
      } catch {
        setError("レシピの取得に失敗しました");
      } finally {
        setLoading(false);
      }
    }
    fetchRecipe();
  }, [recipeId, servings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="px-4 pt-6">
        <button type="button" onClick={() => router.back()} className="mb-4 text-muted hover:text-foreground">
          <ArrowLeft size={20} />
        </button>
        <p className="text-sm text-danger">{error || "レシピが見つかりません"}</p>
      </div>
    );
  }

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={() => router.back()} className="text-muted hover:text-foreground">
          <ArrowLeft size={20} />
        </button>
        <h1 className="flex-1 text-base font-bold leading-tight">{recipe.title}</h1>
      </div>

      {/* Hotcook info */}
      {recipe.cook_method === "hotcook" && (
        <div className="mx-4 rounded-lg border border-accent/20 bg-accent/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-accent">
            <ChefHat size={16} />
            ホットクック
            {recipe.hotcook_menu_number && (
              <span className="text-xs text-muted">No.{recipe.hotcook_menu_number}</span>
            )}
          </div>
          <div className="mt-1.5 flex gap-4 text-xs text-muted">
            {recipe.hotcook_unit && (
              <span>まぜ技ユニット: {recipe.hotcook_unit}</span>
            )}
            {recipe.prep_time_min != null && (
              <span className="flex items-center gap-1">
                <Clock size={12} />
                下ごしらえ {recipe.prep_time_min}分
              </span>
            )}
            {recipe.cook_time_min != null && (
              <span className="flex items-center gap-1">
                <Flame size={12} />
                加熱 {recipe.cook_time_min}分
              </span>
            )}
          </div>
        </div>
      )}

      {/* Non-hotcook time info */}
      {recipe.cook_method !== "hotcook" && (recipe.prep_time_min != null || recipe.cook_time_min != null) && (
        <div className="mx-4 mt-2 flex gap-4 text-xs text-muted">
          {recipe.prep_time_min != null && (
            <span className="flex items-center gap-1">
              <Clock size={12} />
              下ごしらえ {recipe.prep_time_min}分
            </span>
          )}
          {recipe.cook_time_min != null && (
            <span className="flex items-center gap-1">
              <Flame size={12} />
              加熱 {recipe.cook_time_min}分
            </span>
          )}
        </div>
      )}

      {/* Servings */}
      <div className="mx-4 mt-3 text-xs text-muted">
        {servings ?? recipe.servings_base}人分
        {servings && servings !== recipe.servings_base && (
          <span className="ml-1">(元レシピ: {recipe.servings_base}人分)</span>
        )}
      </div>

      {/* Ingredients */}
      <section className="mt-4 px-4">
        <h2 className="mb-2 text-sm font-bold text-accent">材料</h2>
        <ul className="space-y-1.5">
          {recipe.ingredients.map((ing) => (
            <li key={ing.id} className="flex items-baseline justify-between text-sm">
              <span>{ing.name}</span>
              <span className="ml-2 shrink-0 text-xs text-muted">
                {ing.amount} {ing.unit}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Steps */}
      <section className="mt-5 px-4">
        <h2 className="mb-2 text-sm font-bold text-accent">手順</h2>
        <ol className="space-y-3">
          {recipe.steps.map((step) => (
            <li key={step.id} className="flex gap-3 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                {step.step_number}
              </span>
              <div className="flex-1">
                <p>{step.instruction}</p>
                {step.tip && (
                  <p className="mt-1 text-xs text-orange">
                    {step.tip}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
