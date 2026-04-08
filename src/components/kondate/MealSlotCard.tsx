"use client";

import { useState } from "react";
import Link from "next/link";
import { UtensilsCrossed, Check, SkipForward, Pencil, ChefHat, X } from "lucide-react";
import type { MealSlotResponse } from "@/types/weekly-menu";

type Props = {
  slot: MealSlotResponse;
  onUpdate?: () => void;
};

export default function MealSlotCard({ slot, onUpdate }: Props) {
  const [acting, setActing] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const handleCooked = async () => {
    if (acting) return;
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
      setShowActions(false);
    }
  };

  const handleSkip = async () => {
    if (acting) return;
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
      setShowActions(false);
    }
  };

  const mealLabel = slot.meal_type === "lunch" ? "昼" : "夜";

  // Skipped state
  if (slot.is_skipped) {
    return (
      <div className="min-w-0 flex-1 rounded-xl bg-card/30 p-2.5">
        <div className="text-[10px] text-muted">{mealLabel}</div>
        <p className="mt-0.5 text-xs text-muted line-through">
          {slot.recipe_title || "スキップ"}
        </p>
      </div>
    );
  }

  // Cooked state
  if (slot.memo === "調理済み") {
    return (
      <div className="min-w-0 flex-1 rounded-xl border border-green/20 bg-green/5 p-2.5">
        <div className="flex items-center gap-1 text-[10px] text-green">
          <Check size={10} />
          {mealLabel}
        </div>
        <p className="mt-0.5 truncate text-xs font-medium text-green/80">
          {slot.recipe_title || "完了"}
        </p>
      </div>
    );
  }

  // Empty state
  if (!slot.recipe_id) {
    return (
      <div className="min-w-0 flex-1 rounded-xl border border-dashed border-border p-2.5">
        <div className="text-[10px] text-muted">{mealLabel} {slot.servings}人</div>
        <p className="mt-0.5 text-xs text-muted">{slot.memo || "未設定"}</p>
      </div>
    );
  }

  // Active recipe card
  return (
    <div className="min-w-0 flex-1">
      {/* Action overlay */}
      {showActions && (
        <div className="mb-1 flex gap-1 animate-in fade-in slide-in-from-top-1 duration-150">
          <button
            type="button"
            onClick={handleCooked}
            disabled={acting}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-green/15 py-1.5 text-[10px] font-semibold text-green active:bg-green/25 disabled:opacity-50"
          >
            <ChefHat size={10} />
            作った
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={acting}
            className="flex items-center justify-center gap-1 rounded-lg bg-card px-2.5 py-1.5 text-[10px] font-medium text-muted active:bg-card-hover disabled:opacity-50"
          >
            <SkipForward size={10} />
          </button>
          <Link
            href={`/menu/${slot.recipe_id}?servings=${slot.servings}`}
            className="flex items-center justify-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1.5 text-[10px] font-medium text-accent active:bg-accent/20"
          >
            <Pencil size={10} />
          </Link>
          <button
            type="button"
            onClick={() => setShowActions(false)}
            className="flex items-center justify-center rounded-lg px-1.5 py-1.5 text-[10px] text-muted active:text-foreground"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Card */}
      <button
        type="button"
        onClick={() => setShowActions(!showActions)}
        className="w-full rounded-xl border border-border bg-card p-2.5 text-left transition-colors active:bg-card-hover"
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-[10px] text-accent">
            <UtensilsCrossed size={10} />
            {mealLabel}
          </span>
          <span className="text-[10px] text-muted">{slot.servings}人</span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm font-medium leading-tight">
          {slot.recipe_title}
        </p>
      </button>
    </div>
  );
}
