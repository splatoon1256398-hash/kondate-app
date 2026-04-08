"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Check, SkipForward, ChefHat, MoreHorizontal, Sun, Moon, ChevronRight, BookOpen } from "lucide-react";
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
  const mealColor = isLunch ? "text-orange" : "text-indigo";

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
      <div className="flex min-h-[44px] items-center gap-3 px-4 py-2.5">
        <MealIcon size={18} className={mealColor} strokeWidth={1.5} />
        <span className="text-[17px] text-label-tertiary">{mealLabel} · 未設定</span>
      </div>
    );
  }

  // Skipped
  if (slot.is_skipped) {
    return (
      <div className="flex min-h-[44px] items-center gap-3 px-4 py-2.5 opacity-50">
        <MealIcon size={18} className="text-gray" strokeWidth={1.5} />
        <span className="flex-1 text-[17px] text-label-secondary line-through">
          {slot.recipe_title || "スキップ"}
        </span>
        <SkipForward size={16} className="text-gray" strokeWidth={1.5} />
      </div>
    );
  }

  // Cooked
  if (slot.memo === "調理済み") {
    return (
      <div className="flex min-h-[44px] items-center gap-3 px-4 py-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green">
          <Check size={16} className="text-white" strokeWidth={3} />
        </div>
        <span className="flex-1 text-[17px] text-label-secondary">
          {slot.recipe_title || "完了"}
        </span>
        <span className="text-[15px] text-label-tertiary">{slot.servings}人</span>
      </div>
    );
  }

  // TODAY — buttons always visible
  if (isToday) {
    return (
      <div>
        <div className="flex min-h-[44px] items-center gap-3 px-4 py-2.5">
          <MealIcon size={18} className={`shrink-0 ${mealColor}`} strokeWidth={1.5} />
          {slot.recipe_id ? (
            <Link
              href={`/menu/${slot.recipe_id}?servings=${slot.servings}`}
              className="min-w-0 flex-1 truncate text-[17px] text-label active:text-blue"
            >
              {slot.recipe_title}
            </Link>
          ) : (
            <span className="min-w-0 flex-1 truncate text-[17px] text-label-tertiary">
              {slot.memo || "未設定"}
            </span>
          )}
          <span className="shrink-0 text-[15px] text-label-tertiary">{slot.servings}人</span>
          <ChevronRight size={18} className="shrink-0 text-label-tertiary" strokeWidth={2} />
        </div>

        {/* Inline action bar */}
        <div className="flex gap-2 px-4 pb-3 pt-1">
          {slot.recipe_id && (
            <Link
              href={`/menu/${slot.recipe_id}?servings=${slot.servings}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-fill px-3 py-2 text-[15px] font-medium text-blue active:bg-fill-secondary"
            >
              <BookOpen size={14} strokeWidth={2} />
              調理
            </Link>
          )}
          <button
            type="button"
            onClick={handleCooked}
            disabled={acting}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-fill px-3 py-2 text-[15px] font-medium text-green active:bg-fill-secondary disabled:opacity-50"
          >
            <ChefHat size={14} strokeWidth={2} />
            作った
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={acting}
            className="flex items-center justify-center gap-1.5 rounded-[10px] bg-fill px-3 py-2 text-[15px] font-medium text-gray active:bg-fill-secondary disabled:opacity-50"
            aria-label="スキップ"
          >
            <SkipForward size={14} strokeWidth={2} />
          </button>
        </div>
      </div>
    );
  }

  // Non-today: compact row with ... menu
  return (
    <div className="relative">
      <div className="flex min-h-[44px] items-center gap-3 px-4 py-2.5">
        <MealIcon size={18} className={`shrink-0 ${mealColor}`} strokeWidth={1.5} />
        {slot.recipe_id ? (
          <Link
            href={`/menu/${slot.recipe_id}?servings=${slot.servings}`}
            className="min-w-0 flex-1 truncate text-[17px] text-label active:text-blue"
          >
            {slot.recipe_title}
          </Link>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[17px] text-label-tertiary">
            {slot.memo || "未設定"}
          </span>
        )}
        <span className="shrink-0 text-[15px] text-label-tertiary">{slot.servings}人</span>
        <button
          type="button"
          onClick={() => setShowMenu(!showMenu)}
          className="shrink-0 rounded-full p-1 text-label-tertiary active:text-label"
          aria-label="アクション"
        >
          <MoreHorizontal size={18} strokeWidth={2} />
        </button>
      </div>

      {showMenu && (
        <div className="absolute right-3 top-full z-10 mt-1 flex gap-1 rounded-[10px] border border-separator bg-bg-grouped-secondary p-1.5 shadow-xl">
          {slot.recipe_id && (
            <Link
              href={`/menu/${slot.recipe_id}?servings=${slot.servings}`}
              onClick={() => setShowMenu(false)}
              className="flex items-center gap-1.5 rounded-[8px] bg-fill px-3 py-2 text-[13px] font-medium text-blue active:bg-fill-secondary"
            >
              <BookOpen size={12} strokeWidth={2} />
              調理
            </Link>
          )}
          <button
            type="button"
            onClick={handleCooked}
            disabled={acting}
            className="flex items-center gap-1.5 rounded-[8px] bg-fill px-3 py-2 text-[13px] font-medium text-green active:bg-fill-secondary disabled:opacity-50"
          >
            <ChefHat size={12} strokeWidth={2} />
            作った
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={acting}
            className="flex items-center gap-1.5 rounded-[8px] bg-fill px-3 py-2 text-[13px] font-medium text-gray active:bg-fill-secondary disabled:opacity-50"
            aria-label="スキップ"
          >
            <SkipForward size={12} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}
