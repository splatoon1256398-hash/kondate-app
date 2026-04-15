"use client";

import { useEffect, useState } from "react";
import { ChefHat, Clock, Flame, ChevronLeft, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RecipeDetail as RecipeDetailType } from "@/types/recipe";
import type { ApiResponse } from "@/types/common";
import { formatIngredientAmount } from "@/lib/utils/format-ingredient";

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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue border-t-transparent" />
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="bg-bg-grouped px-4 pt-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 flex items-center gap-0.5 text-[17px] text-blue active:opacity-60"
        >
          <ChevronLeft size={22} strokeWidth={2.5} />
          戻る
        </button>
        <p className="text-[15px] text-red">{error || "レシピが見つかりません"}</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-grouped pb-8">
      {/* Navigation Bar */}
      <div className="material-bar separator-bottom flex items-center px-2 py-2.5">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-0.5 px-2 text-[17px] text-blue active:opacity-60"
        >
          <ChevronLeft size={22} strokeWidth={2.5} />
          戻る
        </button>
        <h1 className="line-clamp-1 flex-1 text-center text-[17px] font-semibold text-label">
          {recipe.title}
        </h1>
        <div className="w-16" />
      </div>

      {/* Recipe image */}
      {recipe.image_url && (
        <div className="mx-4 mt-4 overflow-hidden rounded-[14px]">
          <img
            src={recipe.image_url}
            alt={recipe.title}
            className="h-56 w-full object-cover"
          />
        </div>
      )}

      {/* Hotcook info */}
      {recipe.cook_method === "hotcook" && (
        <div className="mx-4 mt-4">
          <h2 className="mb-1.5 pl-4 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
            ホットクック
          </h2>
          <div className="rounded-[10px] bg-bg-grouped-secondary p-4">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-blue">
              <ChefHat size={16} strokeWidth={1.5} />
              {recipe.hotcook_menu_number && <span>No.{recipe.hotcook_menu_number}</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-label-secondary">
              {recipe.hotcook_unit && <span>まぜ技: {recipe.hotcook_unit}</span>}
              {recipe.prep_time_min != null && (
                <span className="flex items-center gap-1">
                  <Clock size={12} strokeWidth={1.5} />
                  下ごしらえ {recipe.prep_time_min}分
                </span>
              )}
              {recipe.cook_time_min != null && (
                <span className="flex items-center gap-1">
                  <Flame size={12} strokeWidth={1.5} />
                  加熱 {recipe.cook_time_min}分
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Servings */}
      <div className="mx-4 mt-4 text-[13px] text-label-tertiary">
        {servings ?? recipe.servings_base}人分
        {servings && servings !== recipe.servings_base && (
          <span className="ml-1">(元: {recipe.servings_base}人分)</span>
        )}
      </div>

      {/* Ingredients */}
      <section className="mt-2 px-4">
        <h2 className="mb-1.5 pl-4 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
          材料
        </h2>
        <div className="cell-separator overflow-hidden rounded-[10px] bg-bg-grouped-secondary">
          {recipe.ingredients.map((ing) => (
            <div key={ing.id} className="flex min-h-[44px] items-center justify-between px-4 py-2.5">
              <span className="text-[17px] text-label">{ing.name}</span>
              <span className="text-[15px] text-label-secondary">
                {formatIngredientAmount(ing.amount, ing.unit)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Steps */}
      <section className="mt-5 px-4">
        <div className="mb-1.5 flex items-center justify-between pl-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
            手順
          </h2>
          {recipe.steps.length > 0 && (
            <Link
              href={`/cooking/${recipeId}`}
              className="flex items-center gap-1 rounded-full bg-blue px-3 py-1.5 text-[13px] font-semibold text-white active:opacity-80"
            >
              <Play size={12} strokeWidth={2} />
              クッキングモード
            </Link>
          )}
        </div>
        <div className="cell-separator overflow-hidden rounded-[10px] bg-bg-grouped-secondary">
          {recipe.steps.map((step) => (
            <div key={step.id} className="flex gap-3 px-4 py-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue text-[13px] font-bold text-white">
                {step.step_number}
              </span>
              <div className="flex-1">
                <p className="text-[15px] leading-snug text-label">{step.instruction}</p>
                {step.tip && (
                  <p className="mt-1 text-[13px] text-orange">💡 {step.tip}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
