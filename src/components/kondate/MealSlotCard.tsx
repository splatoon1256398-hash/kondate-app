"use client";

import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import type { MealSlotResponse } from "@/types/weekly-menu";

type Props = {
  slot: MealSlotResponse;
};

export default function MealSlotCard({ slot }: Props) {
  if (slot.is_skipped) {
    return (
      <div className="flex-1 rounded-lg border border-border bg-card/50 p-2.5 opacity-60">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">
            {slot.meal_type === "lunch" ? "昼" : "夜"}
          </span>
          <span className="text-[10px] text-muted">{slot.servings}人</span>
        </div>
        <p className="mt-1 text-xs text-muted line-through">
          {slot.memo || "スキップ"}
        </p>
      </div>
    );
  }

  if (!slot.recipe_id) {
    return (
      <div className="flex-1 rounded-lg border border-dashed border-border bg-card/30 p-2.5">
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
    <Link
      href={`/menu/${slot.recipe_id}?servings=${slot.servings}`}
      className="flex-1 rounded-lg border border-border bg-card p-2.5 transition-colors hover:bg-card-hover active:bg-card-hover"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs text-accent">
          <UtensilsCrossed size={12} />
          {slot.meal_type === "lunch" ? "昼" : "夜"}
        </span>
        <span className="text-[10px] text-muted">{slot.servings}人</span>
      </div>
      <p className="mt-1 truncate text-sm font-medium">{slot.recipe_title}</p>
    </Link>
  );
}
