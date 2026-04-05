"use client";

import { useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, ChefHat, Lightbulb, Check } from "lucide-react";
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
  const [step, setStep] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [consumed, setConsumed] = useState(false);

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

    // Re-acquire on visibility change
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

  const goNext = useCallback(() => {
    setStep((s) => Math.min(s + 1, totalSteps - 1));
  }, [totalSteps]);

  const goPrev = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
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

  const currentStep = recipe.steps[step];

  return (
    <div
      className="flex min-h-dvh flex-col bg-background select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 pb-safe">
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
            {step + 1} / {totalSteps}
          </div>
        </div>
        <div className="w-10" />
      </div>

      {/* Progress bar */}
      <div className="mx-4 h-1 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
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

      {/* Step content */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-8">
        <p className="text-center text-xl font-medium leading-relaxed">
          {currentStep.instruction}
        </p>

        {currentStep.tip && (
          <div className="mt-6 flex items-start gap-2 rounded-xl bg-orange/10 px-4 py-3">
            <Lightbulb size={18} className="mt-0.5 shrink-0 text-orange" />
            <p className="text-sm text-orange">{currentStep.tip}</p>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex gap-3 px-4 pb-safe-nav pt-2">
        <button
          type="button"
          onClick={goPrev}
          disabled={step === 0}
          className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-card text-sm font-semibold text-foreground transition-colors active:bg-card-hover disabled:opacity-30"
        >
          <ChevronLeft size={20} />
          前へ
        </button>
        {step < totalSteps - 1 ? (
          <button
            type="button"
            onClick={goNext}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-background transition-opacity active:opacity-80"
          >
            次へ
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
            作った！（在庫消費）
          </button>
        )}
      </div>
    </div>
  );
}
