"use client";

import { useState } from "react";
import Link from "next/link";
import { UtensilsCrossed, ChefHat, Check, SkipForward } from "lucide-react";
import type { MealSlotResponse } from "@/types/weekly-menu";

type Props = {
  slot: MealSlotResponse;
  onUpdate?: () => void;
};

export default function MealSlotCard({ slot, onUpdate }: Props) {
  const [acting, setActing] = useState(false);

  const handleCooked = async () => {
    if (acting) return;
    setActing(true);
    try {
      // Mark as cooked → consume pantry
      if (slot.recipe_id) {
        await fetch(`/api/recipes/${slot.recipe_id}/cooked`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ servings: slot.servings }),
        });
      }
      // Mark slot with memo
      await fetch(`/api/meal-slots/${slot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo: "調理済み" }),
      });
      onUpdate?.();
    } catch { /* ignore */ } finally {
      setActing(false);
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
    }
  };

  if (slot.is_skipped) {
    return (
      <div className="min-w-0 flex-1 rounded-lg border border-border bg-card/50 p-2.5 opacity-60">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">
            {slot.meal_type === "lunch" ? "昼" : "夜"}
          </span>
          <span className="text-[10px] text-muted">{slot.servings}人</span>
        </div>
        <p className="mt-1 text-xs text-muted line-through">
          {slot.recipe_title || slot.memo || "スキップ"}
        </p>
      </div>
    );
  }

  if (slot.memo === "調理済み") {
    return (
      <div className="min-w-0 flex-1 rounded-lg border border-green/30 bg-green/5 p-2.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-xs text-green">
            <Check size={12} />
            {slot.meal_type === "lunch" ? "昼" : "夜"}
          </span>
          <span className="text-[10px] text-muted">{slot.servings}人</span>
        </div>
        <p className="mt-1 break-words text-sm font-medium leading-snug text-green/80">
          {slot.recipe_title || "完了"}
        </p>
      </div>
    );
  }

  if (!slot.recipe_id) {
    return (
      <div className="min-w-0 flex-1 rounded-lg border border-dashed border-border bg-card/30 p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">
            {slot.meal_type === "lunch" ? "昼" : "夜"}
          </span>
          <span className="text-[10px] text-muted">{slot.servings}人</span>
        </div>
        <p className="mt-1 text-xs text-muted">{slot.memo || "未設定"}</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1">
      <Link
        href={`/menu/${slot.recipe_id}?servings=${slot.servings}`}
        className="block rounded-lg border border-border bg-card p-2.5 transition-colors hover:bg-card-hover active:bg-card-hover"
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-xs text-accent">
            <UtensilsCrossed size={12} />
            {slot.meal_type === "lunch" ? "昼" : "夜"}
          </span>
          <span className="text-[10px] text-muted">{slot.servings}人</span>
        </div>
        <p className="mt-1 break-words text-sm font-medium leading-snug">{slot.recipe_title}</p>
      </Link>
      {/* Action buttons */}
      <div className="mt-1 flex gap-1">
        <button
          type="button"
          onClick={handleCooked}
          disabled={acting}
          className="flex flex-1 items-center justify-center gap-0.5 rounded-md bg-green/10 py-1 text-[10px] font-medium text-green transition-colors active:bg-green/20 disabled:opacity-50"
        >
          <ChefHat size={10} />
          作った
        </button>
        <button
          type="button"
          onClick={handleSkip}
          disabled={acting}
          className="flex flex-1 items-center justify-center gap-0.5 rounded-md bg-card py-1 text-[10px] font-medium text-muted transition-colors active:bg-card-hover disabled:opacity-50"
        >
          <SkipForward size={10} />
          スキップ
        </button>
      </div>
    </div>
  );
}
