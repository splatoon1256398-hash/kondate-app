"use client";

import { useEffect, useState } from "react";
import { ChefHat, Clock, Flame, ChevronLeft, Pencil, Trash2, Heart, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RecipeDetail } from "@/types/recipe";
import type { ApiResponse } from "@/types/common";
import { formatIngredientAmount } from "@/lib/utils/format-ingredient";
import RatingStars from "./RatingStars";

type Props = {
  recipeId: string;
};

export default function RecipeDetailPage({ recipeId }: Props) {
  const router = useRouter();
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    async function fetchRecipe() {
      setLoading(true);
      try {
        const res = await fetch(`/api/recipes/${recipeId}`);
        const json: ApiResponse<RecipeDetail> = await res.json();
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
  }, [recipeId]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/recipes/${recipeId}`, { method: "DELETE" });
      const json: ApiResponse<{ id: string }> = await res.json();
      if (json.error) {
        alert(json.error);
        setDeleting(false);
        return;
      }
      router.push("/recipes");
    } catch {
      alert("削除に失敗しました");
      setDeleting(false);
    }
  };

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
          onClick={() => router.push("/recipes")}
          className="flex items-center gap-0.5 px-2 text-[17px] text-blue active:opacity-60"
        >
          <ChevronLeft size={22} strokeWidth={2.5} />
          レシピ
        </button>
        <div className="flex flex-1 items-center justify-center gap-1.5 px-2">
          {recipe.is_favorite && (
            <Heart size={14} className="fill-red text-red" />
          )}
          <h1 className="line-clamp-1 text-[17px] font-semibold text-label">{recipe.title}</h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => router.push(`/recipes/${recipeId}/edit`)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-blue active:bg-fill"
            aria-label="編集"
          >
            <Pencil size={18} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-red active:bg-fill"
            aria-label="削除"
          >
            <Trash2 size={18} strokeWidth={1.5} />
          </button>
        </div>
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

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="mx-4 mt-3 rounded-[10px] bg-red/10 p-4">
          <p className="text-[15px] text-red">このレシピを削除しますか？</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex h-9 items-center rounded-[10px] bg-red px-4 text-[15px] font-semibold text-white active:opacity-80 disabled:opacity-50"
            >
              {deleting ? "削除中..." : "削除"}
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="flex h-9 items-center rounded-[10px] bg-fill px-4 text-[15px] text-label active:bg-fill-secondary"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Description */}
      {recipe.description && (
        <p className="mx-4 mt-3 text-[15px] text-label-secondary">{recipe.description}</p>
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
              {recipe.hotcook_menu_number && (
                <span>No.{recipe.hotcook_menu_number}</span>
              )}
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
      <div className="mx-4 mt-4 text-[13px] text-label-tertiary">{recipe.servings_base}人分</div>

      {/* Ingredients */}
      <section className="mt-2 px-4">
        <h2 className="mb-1.5 pl-4 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
          材料
        </h2>
        {recipe.ingredients.length > 0 ? (
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
        ) : (
          <p className="text-[13px] text-label-tertiary">材料が登録されていません</p>
        )}
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
        {recipe.steps.length > 0 ? (
          <div className="cell-separator overflow-hidden rounded-[10px] bg-bg-grouped-secondary">
            {recipe.steps.map((step) => (
              <div key={step.id} className="flex gap-3 px-4 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue text-[13px] font-bold text-white">
                  {step.step_number}
                </span>
                <div className="flex-1">
                  <p className="text-[15px] leading-snug text-label">{step.instruction}</p>
                  {step.tip && (
                    <p className="mt-1 flex items-start gap-1 text-[13px] text-orange">
                      💡 {step.tip}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-label-tertiary">手順が登録されていません</p>
        )}
      </section>

      {/* Rating section */}
      <RatingStars
        recipeId={recipeId}
        isFavorite={recipe.is_favorite}
        onFavoriteChange={(val) => setRecipe((prev) => prev ? { ...prev, is_favorite: val } : prev)}
      />
    </div>
  );
}
