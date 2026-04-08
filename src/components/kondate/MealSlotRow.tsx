"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Check, SkipForward, ChefHat, MoreHorizontal, Sun, Moon } from "lucide-react";
import type { MealSlotResponse } from "@/types/weekly-menu";

type Props = {
  slot: MealSlotResponse | null;
  mealType: "lunch" | "dinner";
  onUpdate?: () => void;
};

export default function MealSlotRow({ slot, mealType, onUpdate }: Props) {
  const [acting, setActing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const isLunch = mealType === "lunch";
  const MealIcon = isLunch ? Sun : Moon;
  const mealLabel = isLunch ? "昼" : "夜";
  const mealColor = isLunch ? "text-orange" : "text-blue";

  const handleCooked = useCallback(async () => {
    if (!slot || acting) return;
    setActing(true);
    try {
      if (slot.recipe_id) {
        await fetch(`/api/recipes/${slot.recipe_id}/cooked`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ servings: slot.servings }),
        });
      }
      await fetch(`/api/meal-slots/${slot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo: "調理済み" }),
      });
      onUpdate?.();
    } catch { /* ignore */ } finally {
      setActing(false);
      setShowMenu(false);
    }
  }, [slot, acting, onUpdate]);

  const handleSkip = useCallback(async () => {
    if (!slot || acting) return;
    setActing(true);
    try {
      await fetch(`/api/meal-slots/${slot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_skipped: true, memo: "スキップ" }),
      });
      onUpdate?.();
    } catch { /* ignore */ } finally {
      setActing(false);
      setShowMenu(false);
    }
  }, [slot, acting, onUpdate]);

  // No slot
  if (!slot) {
    return (
      <div className="flex items-center gap-3 rounded-xl px-3 py-2">
        <MealIcon size={14} className={mealColor} />
        <span className="text-xs text-muted">{mealLabel} — 未設定</span>
      </div>
    );
  }

  // Skipped
  if (slot.is_skipped) {
    return (
      <div className="flex items-center gap-3 rounded-xl px-3 py-2 opacity-40">
        <MealIcon size={14} className="text-muted" />
        <span className="flex-1 text-xs text-muted line-through">
          {slot.recipe_title || "スキップ"}
        </span>
        <SkipForward size={12} className="text-muted" />
      </div>
    );
  }

  // Cooked
  if (slot.memo === "調理済み") {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-green/5 px-3 py-2">
        <Check size={14} className="text-green" />
        <span className="flex-1 text-xs font-medium text-green/80">
          {slot.recipe_title || "完了"}
        </span>
        <span className="text-[10px] text-green/50">{slot.servings}人</span>
      </div>
    );
  }

  // Active meal
  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl bg-card px-3 py-2.5">
        {/* Meal icon */}
        <MealIcon size={14} className={`shrink-0 ${mealColor}`} />

        {/* Recipe name - tappable to view */}
        {slot.recipe_id ? (
          <Link
            href={`/menu/${slot.recipe_id}?servings=${slot.servings}`}
            className="min-w-0 flex-1 truncate text-sm font-medium active:text-accent"
          >
            {slot.recipe_title}
          </Link>
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm text-muted">
            {slot.memo || "未設定"}
          </span>
        )}

        {/* Servings badge */}
        <span className="shrink-0 text-[10px] text-muted">{slot.servings}人</span>

        {/* More button */}
        <button
          type="button"
          onClick={() => setShowMenu(!showMenu)}
          className="shrink-0 rounded-lg p-1 text-muted active:text-foreground"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      {/* Action menu */}
      {showMenu && (
        <div className="absolute right-0 top-full z-10 mt-1 flex gap-1 rounded-xl border border-border bg-card p-1.5 shadow-lg">
          <button
            type="button"
            onClick={handleCooked}
            disabled={acting}
            className="flex items-center gap-1.5 rounded-lg bg-green/10 px-3 py-2 text-xs font-semibold text-green active:bg-green/20 disabled:opacity-50"
          >
            <ChefHat size={12} />
            作った
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={acting}
            className="flex items-center gap-1.5 rounded-lg bg-card-hover px-3 py-2 text-xs font-medium text-muted active:text-foreground disabled:opacity-50"
          >
            <SkipForward size={12} />
            スキップ
          </button>
          <button
            type="button"
            onClick={() => setShowMenu(false)}
            className="rounded-lg px-2 py-2 text-xs text-muted active:text-foreground"
          >
            閉じる
          </button>
        </div>
      )}
    </div>
  );
}
