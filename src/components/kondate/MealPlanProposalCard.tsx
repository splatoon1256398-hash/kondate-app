"use client";

import { useEffect, useState } from "react";
import { ChefHat, CheckCircle2, Loader2, Sun, Moon, Check, Database, Sparkles } from "lucide-react";
import { dayLabel, parseDate } from "@/lib/utils/date";
import type { ApiResponse } from "@/types/common";
import type { MealPlanSlotProposal } from "@/types/meal-plan";

type Props = {
  weekStartDate: string;
  slots: MealPlanSlotProposal[];
  confirmed?: boolean;
  confirming?: boolean;
  onConfirm?: () => void;
};

type RecipeLite = {
  id: string;
  title: string;
  cook_method: string;
};

export default function MealPlanProposalCard({ slots, confirmed, confirming, onConfirm }: Props) {
  const [recipeMap, setRecipeMap] = useState<Map<string, RecipeLite>>(new Map());

  // Fetch recipe details for any slot with recipe_id
  useEffect(() => {
    const ids = slots
      .map((s) => s.recipe_id)
      .filter((id): id is string => !!id && !recipeMap.has(id));
    if (ids.length === 0) return;

    async function loadRecipes() {
      const fetched: Array<[string, RecipeLite]> = [];
      for (const id of ids) {
        try {
          const res = await fetch(`/api/recipes/${id}`);
          const json: ApiResponse<RecipeLite> = await res.json();
          if (json.data) fetched.push([id, json.data]);
        } catch { /* ignore */ }
      }
      if (fetched.length > 0) {
        setRecipeMap((prev) => {
          const next = new Map(prev);
          for (const [id, r] of fetched) next.set(id, r);
          return next;
        });
      }
    }
    loadRecipes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  const byDate = new Map<string, MealPlanSlotProposal[]>();
  for (const slot of slots) {
    if (!byDate.has(slot.date)) byDate.set(slot.date, []);
    byDate.get(slot.date)!.push(slot);
  }

  const sorted = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-blue">
        <Sparkles size={11} strokeWidth={2.5} />
        献立提案（{sorted.length}日分）
      </div>

      <div className="space-y-2">
        {sorted.map(([date, daySlots]) => {
          const d = parseDate(date);
          const dow = dayLabel(date);
          const isWeekend = dow === "土" || dow === "日";
          return (
            <div
              key={date}
              className="overflow-hidden rounded-[12px] bg-bg-secondary"
            >
              {/* 日付ヘッダ: 曜日と日付を大きく */}
              <div
                className={`flex items-baseline gap-2 px-3 py-2 ${
                  isWeekend ? "bg-blue/10" : "bg-fill-tertiary"
                }`}
              >
                <span
                  className={`text-[17px] font-bold leading-none ${
                    dow === "日" ? "text-red" : dow === "土" ? "text-blue" : "text-label"
                  }`}
                >
                  {dow}
                </span>
                <span className="text-[15px] font-semibold leading-none text-label">
                  {d.getMonth() + 1}/{d.getDate()}
                </span>
              </div>

              {/* スロット */}
              <div className="cell-separator">
                {daySlots
                  .sort((a, b) => (a.meal_type === "lunch" ? -1 : 1) - (b.meal_type === "lunch" ? -1 : 1))
                  .map((slot, i) => {
                    const isLunch = slot.meal_type === "lunch";
                    const Icon = isLunch ? Sun : Moon;

                    const dbRecipe = slot.recipe_id ? recipeMap.get(slot.recipe_id) : undefined;
                    const display = dbRecipe
                      ? { title: dbRecipe.title, cook_method: dbRecipe.cook_method, source: "db" as const }
                      : slot.recipe
                        ? { title: slot.recipe.title, cook_method: slot.recipe.cook_method, source: "new" as const }
                        : null;

                    return (
                      <div key={i} className="flex items-center gap-2 px-3 py-2">
                        <div className="flex w-10 shrink-0 items-center gap-1">
                          <Icon
                            size={13}
                            className={isLunch ? "text-orange" : "text-indigo"}
                            strokeWidth={2}
                          />
                          <span className="text-[11px] font-semibold text-label-secondary">
                            {isLunch ? "昼" : "夜"}
                          </span>
                        </div>
                        {slot.is_skipped ? (
                          <span className="flex-1 text-[14px] text-label-tertiary line-through">
                            {slot.memo || "スキップ"}
                          </span>
                        ) : display ? (
                          <span className="flex flex-1 items-center gap-1 truncate text-[14px] text-label">
                            <span className="truncate">{display.title}</span>
                            {display.cook_method === "hotcook" && (
                              <ChefHat size={11} className="shrink-0 text-blue" strokeWidth={1.5} />
                            )}
                            {display.source === "db" ? (
                              <Database size={9} className="shrink-0 text-green" strokeWidth={2} />
                            ) : (
                              <Sparkles size={9} className="shrink-0 text-purple" strokeWidth={2} />
                            )}
                          </span>
                        ) : (
                          <span className="flex-1 text-[14px] text-label-tertiary">未設定</span>
                        )}
                        <span className="shrink-0 text-[11px] text-label-tertiary">
                          {slot.servings}人
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 text-[11px] text-label-tertiary">
        <span className="flex items-center gap-0.5">
          <Database size={10} className="text-green" strokeWidth={2} />
          既存レシピ
        </span>
        <span className="flex items-center gap-0.5">
          <Sparkles size={10} className="text-purple" strokeWidth={2} />
          AI生成
        </span>
      </div>

      {/* Confirm */}
      {onConfirm && !confirmed && (
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirming}
          className="flex h-[44px] w-full items-center justify-center gap-2 rounded-[12px] bg-blue text-[15px] font-semibold text-white active:opacity-80 disabled:opacity-50"
        >
          {confirming ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              保存中...
            </>
          ) : (
            <>
              <CheckCircle2 size={15} strokeWidth={2} />
              この献立で確定する
            </>
          )}
        </button>
      )}
      {confirmed && (
        <div className="flex items-center justify-center gap-1.5 rounded-[10px] bg-green/10 py-2 text-[13px] font-medium text-green">
          <Check size={14} strokeWidth={2.5} />
          確定済み
        </div>
      )}
    </div>
  );
}
