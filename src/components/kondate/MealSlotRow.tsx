"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Check, SkipForward, ChefHat, MoreHorizontal, Sun, Moon, Play } from "lucide-react";
import type { MealSlotResponse } from "@/types/weekly-menu";

type Props = {
  slot: MealSlotResponse | null;
  mealType: "lunch" | "dinner";
  isToday?: boolean;
  onUpdate?: () => void;
};

export default function MealSlotRow({ slot, mealType, isToday, onUpdate }: Props) {
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
      </div>
    );
  }

  // Active meal — TODAY gets inline action buttons
  if (isToday) {
    return (
      <div className="space-y-1.5">
        {/* Recipe row */}
        <div className="flex items-center gap-2 rounded-xl bg-card px-3 py-2.5">
          <MealIcon size={14} className={`shrink-0 ${mealColor}`} />
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
          <span className="shrink-0 text-[10px] text-muted">{slot.servings}人</span>
        </div>

        {/* Always-visible action buttons for today */}
        <div className="flex gap-1.5 px-1">
          {slot.recipe_id && (
            <Link
              href={`/cooking/${slot.recipe_id}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent/10 py-2 text-[11px] font-semibold text-accent active:bg-accent/20"
            >
              <Play size={11} />
              クッキングモード
            </Link>
          )}
          <button
            type="button"
            onClick={handleCooked}
            disabled={acting}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-green/10 py-2 text-[11px] font-semibold text-green active:bg-green/20 disabled:opacity-50"
          >
            <ChefHat size={11} />
            作った
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={acting}
            className="flex items-center justify-center gap-1 rounded-lg bg-card px-3 py-2 text-[11px] font-medium text-muted active:bg-card-hover disabled:opacity-50"
          >
            <SkipForward size={11} />
          </button>
        </div>
      </div>
    );
  }

  // Non-today: compact with ... menu
  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl bg-card px-3 py-2.5">
        <MealIcon size={14} className={`shrink-0 ${mealColor}`} />

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

        <span className="shrink-0 text-[10px] text-muted">{slot.servings}人</span>

        <button
          type="button"
          onClick={() => setShowMenu(!showMenu)}
          className="shrink-0 rounded-lg p-1 text-muted active:text-foreground"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      {/* Dropdown action menu */}
      {showMenu && (
        <div className="absolute right-0 top-full z-10 mt-1 flex gap-1 rounded-xl border border-border bg-card p-1.5 shadow-lg">
          {slot.recipe_id && (
            <Link
              href={`/cooking/${slot.recipe_id}`}
              className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-2 text-xs font-medium text-accent active:bg-accent/20"
            >
              <Play size={12} />
              調理
            </Link>
          )}
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
          </button>
          <button
            type="button"
            onClick={() => setShowMenu(false)}
            className="rounded-lg px-2 py-2 text-xs text-muted active:text-foreground"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
