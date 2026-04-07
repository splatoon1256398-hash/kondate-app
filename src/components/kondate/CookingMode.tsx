"use client";

import { useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, ChefHat, Lightbulb, Check, ListOrdered } from "lucide-react";
import { useRouter } from "next/navigation";
import type { RecipeDetail } from "@/types/recipe";
import type { ApiResponse } from "@/types/common";

type Props = {
  recipeId: string;
};

export default function CookingMode({ recipeId }: Props) {
  const router = useRouter();
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  // step -1 = ingredients page, 0..n-1 = recipe steps
  const [step, setStep] = useState(-1);
  const [touchStart, setTouchStart] = useState(0);
  const [consumed, setConsumed] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/recipes/${recipeId}`);
      const json: ApiResponse<RecipeDetail> = await res.json();
      if (json.data) setRecipe(json.data);
      setLoading(false);
    }
    load();
  }, [recipeId]);

  // Wake Lock API - prevent screen sleep
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    async function requestWakeLock() {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await navigator.wakeLock.request("screen");
        }
      } catch {
        // Wake Lock not supported or denied
      }
    }
    requestWakeLock();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        requestWakeLock();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      wakeLock?.release();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const totalSteps = recipe?.steps.length ?? 0;
  // total pages = ingredients page + steps
  const totalPages = totalSteps + 1;
  const currentPage = step + 1; // 0-indexed page (0=ingredients, 1..n=steps)

  const goNext = useCallback(() => {
    setStep((s) => Math.min(s + 1, totalSteps - 1));
    setShowIngredients(false);
  }, [totalSteps]);

  const goPrev = useCallback(() => {
    setStep((s) => Math.max(s - 1, -1));
    setShowIngredients(false);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const diff = touchStart - e.changedTouches[0].clientX;
      if (diff > 60) goNext();
      if (diff < -60) goPrev();
    },
    [touchStart, goNext, goPrev]
  );

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!recipe || totalSteps === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="text-muted">手順が登録されていません</p>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg bg-card px-6 py-2 text-sm text-foreground"
        >
          戻る
        </button>
      </div>
    );
  }

  const isIngredientsPage = step === -1;
  const isLastStep = step === totalSteps - 1;

  return (
    <div
      className="flex min-h-dvh flex-col bg-background select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-muted transition-colors active:bg-card-hover"
        >
          <X size={20} />
        </button>
        <div className="text-center">
          <div className="text-xs text-muted">{recipe.title}</div>
          <div className="text-sm font-bold text-foreground">
            {isIngredientsPage ? "材料" : `${step + 1} / ${totalSteps}`}
          </div>
        </div>
        {/* Toggle ingredients overlay (on step pages) */}
        {!isIngredientsPage ? (
          <button
            type="button"
            onClick={() => setShowIngredients(!showIngredients)}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
              showIngredients
                ? "bg-accent text-background"
                : "bg-card text-muted active:bg-card-hover"
            }`}
          >
            <ListOrdered size={18} />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* Progress bar */}
      <div className="mx-4 h-1 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${((currentPage + 1) / totalPages) * 100}%` }}
        />
      </div>

      {/* Hotcook info bar */}
      {recipe.cook_method === "hotcook" && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2">
          <ChefHat size={16} className="shrink-0 text-accent" />
          <div className="flex flex-wrap gap-x-3 text-xs text-accent">
            {recipe.hotcook_menu_number && (
              <span className="font-semibold">No.{recipe.hotcook_menu_number}</span>
            )}
            {recipe.hotcook_unit && (
              <span>まぜ技: {recipe.hotcook_unit}</span>
            )}
          </div>
        </div>
      )}

      {/* Content area */}
      <div className="flex flex-1 flex-col overflow-y-auto px-5 py-6">
        {isIngredientsPage ? (
          /* ===== Ingredients page ===== */
          <div>
            <h2 className="mb-4 text-center text-lg font-bold text-accent">
              材料（{recipe.servings_base}人分）
            </h2>
            <div className="space-y-2">
              {recipe.ingredients.map((ing) => (
                <div
                  key={ing.id}
                  className="flex items-baseline justify-between rounded-lg bg-card px-4 py-3"
                >
                  <span className="text-base">{ing.name}</span>
                  <span className="ml-3 shrink-0 text-sm text-muted">
                    {ing.amount} {ing.unit}
                  </span>
                </div>
              ))}
            </div>
            {recipe.ingredients.length === 0 && (
              <p className="mt-8 text-center text-sm text-muted">材料が登録されていません</p>
            )}
          </div>
        ) : showIngredients ? (
          /* ===== Ingredients overlay on step page ===== */
          <div>
            <h2 className="mb-3 text-center text-sm font-semibold text-accent">
              材料一覧（{recipe.servings_base}人分）
            </h2>
            <div className="space-y-1.5">
              {recipe.ingredients.map((ing) => (
                <div
                  key={ing.id}
                  className="flex items-baseline justify-between rounded-lg bg-card px-3 py-2"
                >
                  <span className="text-sm">{ing.name}</span>
                  <span className="ml-2 shrink-0 text-xs text-muted">
                    {ing.amount} {ing.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ===== Step content ===== */
          <div className="flex flex-1 flex-col items-center justify-center">
            <p className="text-center text-xl font-medium leading-relaxed">
              {recipe.steps[step].instruction}
            </p>

            {recipe.steps[step].tip && (
              <div className="mt-6 flex items-start gap-2 rounded-xl bg-orange/10 px-4 py-3">
                <Lightbulb size={18} className="mt-0.5 shrink-0 text-orange" />
                <p className="text-sm text-orange">{recipe.steps[step].tip}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex gap-3 px-4 pb-safe-nav pt-2">
        <button
          type="button"
          onClick={goPrev}
          disabled={isIngredientsPage}
          className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-card text-sm font-semibold text-foreground transition-colors active:bg-card-hover disabled:opacity-30"
        >
          <ChevronLeft size={20} />
          {step === 0 ? "材料" : "前へ"}
        </button>
        {!isLastStep ? (
          <button
            type="button"
            onClick={goNext}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-background transition-opacity active:opacity-80"
          >
            {isIngredientsPage ? "手順へ" : "次へ"}
            <ChevronRight size={20} />
          </button>
        ) : consumed ? (
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-green text-sm font-semibold text-background transition-opacity active:opacity-80"
          >
            <Check size={20} />
            完了
          </button>
        ) : (
          <button
            type="button"
            onClick={async () => {
              await fetch(`/api/recipes/${recipeId}/cooked`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ servings: recipe.servings_base }),
              });
              setConsumed(true);
            }}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-green text-sm font-semibold text-background transition-opacity active:opacity-80"
          >
            作った！
          </button>
        )}
      </div>
    </div>
  );
}
