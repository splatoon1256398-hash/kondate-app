"use client";

import { useEffect, useState } from "react";
import { ChefHat, Clock, Flame, ArrowLeft, Pencil, Trash2, Heart, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RecipeDetail } from "@/types/recipe";
import type { ApiResponse } from "@/types/common";
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
        <button type="button" onClick={() => router.push("/recipes")} className="text-muted hover:text-foreground">
          <ArrowLeft size={20} />
        </button>
        <h1 className="flex-1 text-base font-bold leading-tight">
          {recipe.is_favorite && (
            <Heart size={14} className="mr-1 inline fill-danger text-danger" />
          )}
          {recipe.title}
        </h1>
        <button
          type="button"
          onClick={() => router.push(`/recipes/${recipeId}/edit`)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-card hover:text-foreground"
        >
          <Pencil size={16} />
        </button>
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="mx-4 mb-3 rounded-lg border border-danger/30 bg-danger/5 p-3">
          <p className="text-sm text-danger">このレシピを削除しますか？</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg bg-danger px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {deleting ? "削除中..." : "削除する"}
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-lg bg-card px-4 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Description */}
      {recipe.description && (
        <p className="mx-4 mb-3 text-sm text-muted">{recipe.description}</p>
      )}

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
            {recipe.hotcook_unit && <span>まぜ技ユニット: {recipe.hotcook_unit}</span>}
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
      <div className="mx-4 mt-3 text-xs text-muted">{recipe.servings_base}人分</div>

      {/* Ingredients */}
      <section className="mt-4 px-4">
        <h2 className="mb-2 text-sm font-bold text-accent">材料</h2>
        {recipe.ingredients.length > 0 ? (
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
        ) : (
          <p className="text-xs text-muted">材料が登録されていません</p>
        )}
      </section>

      {/* Steps */}
      <section className="mt-5 px-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-accent">手順</h2>
          {recipe.steps.length > 0 && (
            <Link
              href={`/cooking/${recipeId}`}
              className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-background transition-opacity active:opacity-80"
            >
              <Play size={12} />
              クッキングモード
            </Link>
          )}
        </div>
        {recipe.steps.length > 0 ? (
          <ol className="space-y-3">
            {recipe.steps.map((step) => (
              <li key={step.id} className="flex gap-3 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                  {step.step_number}
                </span>
                <div className="flex-1">
                  <p>{step.instruction}</p>
                  {step.tip && <p className="mt-1 text-xs text-orange">{step.tip}</p>}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-muted">手順が登録されていません</p>
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
