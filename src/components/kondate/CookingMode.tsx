"use client";

import { useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, ChefHat, Lightbulb, Check, ListOrdered } from "lucide-react";
import { useRouter } from "next/navigation";
import type { RecipeDetail } from "@/types/recipe";
import type { ApiResponse } from "@/types/common";
import { cleanSteps } from "@/lib/utils/recipe-step-filter";

type Props = {
  recipeId: string;
};

export default function CookingMode({ recipeId }: Props) {
  const router = useRouter();
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(-1);
  const [touchStart, setTouchStart] = useState(0);
  const [consumed, setConsumed] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/recipes/${recipeId}`);
      const json: ApiResponse<RecipeDetail> = await res.json();
      if (json.data) {
        // インポートされた広告ステップを除去
        setRecipe({ ...json.data, steps: cleanSteps(json.data.steps) });
      }
      setLoading(false);
    }
    load();
  }, [recipeId]);

  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    async function requestWakeLock() {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await navigator.wakeLock.request("screen");
        }
      } catch { /* noop */ }
    }
    requestWakeLock();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") requestWakeLock();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      wakeLock?.release();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const totalSteps = recipe?.steps.length ?? 0;
  const totalPages = totalSteps + 1;
  const currentPage = step + 1;

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
      <div className="flex min-h-dvh items-center justify-center bg-bg-primary">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue border-t-transparent" />
      </div>
    );
  }

  if (!recipe || totalSteps === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg-primary px-4 text-center">
        <p className="text-[15px] text-label-secondary">手順が登録されていません</p>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-[10px] bg-fill px-6 py-2.5 text-[15px] text-blue active:bg-fill-secondary"
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
      className="flex min-h-dvh flex-col bg-bg-primary select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Progress bar - top of screen */}
      <div className="h-[3px] w-full bg-fill-tertiary">
        <div
          className="h-full bg-blue transition-all duration-300 ease-ios"
          style={{ width: `${((currentPage + 1) / totalPages) * 100}%` }}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 pt-safe">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-fill-tertiary text-label active:bg-fill"
        >
          <X size={20} strokeWidth={2} />
        </button>
        <div className="text-center">
          <div className="line-clamp-1 max-w-[200px] text-[12px] text-label-tertiary">
            {recipe.title}
          </div>
          <div className="text-[15px] font-semibold text-label">
            {isIngredientsPage ? "材料" : `${step + 1} / ${totalSteps}`}
          </div>
        </div>
        {!isIngredientsPage ? (
          <button
            type="button"
            onClick={() => setShowIngredients(!showIngredients)}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
              showIngredients
                ? "bg-blue text-white"
                : "bg-fill-tertiary text-label active:bg-fill"
            }`}
            aria-label="材料一覧"
          >
            <ListOrdered size={18} strokeWidth={1.5} />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* Hotcook info bar */}
      {recipe.cook_method === "hotcook" && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-[10px] bg-blue/10 px-3 py-2.5">
          <ChefHat size={16} className="shrink-0 text-blue" strokeWidth={1.5} />
          <div className="flex flex-wrap gap-x-3 text-[13px] font-medium text-blue">
            {recipe.hotcook_menu_number && (
              <span className="font-semibold">No.{recipe.hotcook_menu_number}</span>
            )}
            {recipe.hotcook_unit && <span>まぜ技: {recipe.hotcook_unit}</span>}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex flex-1 flex-col overflow-y-auto px-5 py-6">
        {isIngredientsPage ? (
          <div>
            <h2 className="mb-4 text-center text-[20px] font-semibold text-label">
              材料（{recipe.servings_base}人分）
            </h2>
            <div className="cell-separator overflow-hidden rounded-[10px] bg-bg-grouped-secondary">
              {recipe.ingredients.map((ing) => (
                <div
                  key={ing.id}
                  className="flex min-h-[44px] items-center justify-between px-4 py-2.5"
                >
                  <span className="text-[17px] text-label">{ing.name}</span>
                  <span className="text-[15px] text-label-secondary">
                    {ing.amount} {ing.unit}
                  </span>
                </div>
              ))}
            </div>
            {recipe.ingredients.length === 0 && (
              <p className="mt-8 text-center text-[15px] text-label-tertiary">
                材料が登録されていません
              </p>
            )}
          </div>
        ) : showIngredients ? (
          <div>
            <h2 className="mb-3 text-center text-[15px] font-semibold text-label-secondary">
              材料一覧（{recipe.servings_base}人分）
            </h2>
            <div className="cell-separator overflow-hidden rounded-[10px] bg-bg-grouped-secondary">
              {recipe.ingredients.map((ing) => (
                <div
                  key={ing.id}
                  className="flex min-h-[40px] items-center justify-between px-3 py-2"
                >
                  <span className="text-[15px] text-label">{ing.name}</span>
                  <span className="text-[13px] text-label-secondary">
                    {ing.amount} {ing.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center">
            <p className="text-center text-[28px] font-medium leading-[34px] text-label">
              {recipe.steps[step].instruction}
            </p>

            {recipe.steps[step].tip && (
              <div className="mt-8 flex max-w-md items-start gap-2 rounded-[14px] bg-orange/10 px-4 py-3">
                <Lightbulb size={18} className="mt-0.5 shrink-0 text-orange" strokeWidth={1.5} />
                <p className="text-[15px] text-orange">{recipe.steps[step].tip}</p>
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
          className="flex h-[56px] flex-1 items-center justify-center gap-2 rounded-[12px] bg-fill text-[17px] font-semibold text-blue active:bg-fill-secondary disabled:opacity-30"
        >
          <ChevronLeft size={22} strokeWidth={2.5} />
          {step === 0 ? "材料" : "前へ"}
        </button>
        {!isLastStep ? (
          <button
            type="button"
            onClick={goNext}
            className="flex h-[56px] flex-1 items-center justify-center gap-2 rounded-[12px] bg-blue text-[17px] font-semibold text-white active:opacity-80"
          >
            {isIngredientsPage ? "手順へ" : "次へ"}
            <ChevronRight size={22} strokeWidth={2.5} />
          </button>
        ) : consumed ? (
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-[56px] flex-1 items-center justify-center gap-2 rounded-[12px] bg-green text-[17px] font-semibold text-white active:opacity-80"
          >
            <Check size={20} strokeWidth={2.5} />
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
            className="flex h-[56px] flex-1 items-center justify-center gap-2 rounded-[12px] bg-green text-[17px] font-semibold text-white active:opacity-80"
          >
            作った！
          </button>
        )}
      </div>
    </div>
  );
}
