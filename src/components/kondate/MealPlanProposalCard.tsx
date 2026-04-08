"use client";

import { ChefHat, CheckCircle2, Loader2, Sun, Moon, Check } from "lucide-react";
import { shortDate, dayLabel } from "@/lib/utils/date";

type SlotProposal = {
  date: string;
  meal_type: "lunch" | "dinner";
  servings: number;
  is_skipped?: boolean;
  memo?: string;
  recipe?: {
    title: string;
    cook_method: string;
    hotcook_menu_number?: string;
  };
};

type Props = {
  weekStartDate: string;
  slots: SlotProposal[];
  confirmed?: boolean;
  confirming?: boolean;
  onConfirm?: () => void;
};

export default function MealPlanProposalCard({ slots, confirmed, confirming, onConfirm }: Props) {
  const byDate = new Map<string, SlotProposal[]>();
  for (const slot of slots) {
    if (!byDate.has(slot.date)) byDate.set(slot.date, []);
    byDate.get(slot.date)!.push(slot);
  }

  const sorted = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-blue">献立提案</div>

      {/* Days */}
      <div className="cell-separator overflow-hidden rounded-[10px] bg-bg-secondary">
        {sorted.map(([date, daySlots]) => (
          <div key={date} className="px-3 py-2.5">
            <div className="mb-1.5 text-[12px] font-semibold text-label-secondary">
              {dayLabel(date)}曜日 · {shortDate(date)}
            </div>
            <div className="space-y-1">
              {daySlots
                .sort((a, b) => (a.meal_type === "lunch" ? -1 : 1) - (b.meal_type === "lunch" ? -1 : 1))
                .map((slot, i) => {
                  const isLunch = slot.meal_type === "lunch";
                  const Icon = isLunch ? Sun : Moon;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <Icon size={14} className={isLunch ? "text-orange" : "text-indigo"} strokeWidth={1.5} />
                      {slot.is_skipped ? (
                        <span className="flex-1 text-[14px] text-label-tertiary line-through">
                          {slot.memo || "スキップ"}
                        </span>
                      ) : slot.recipe ? (
                        <span className="flex flex-1 items-center gap-1 truncate text-[14px] text-label">
                          {slot.recipe.title}
                          {slot.recipe.cook_method === "hotcook" && (
                            <ChefHat size={11} className="text-blue" strokeWidth={1.5} />
                          )}
                        </span>
                      ) : (
                        <span className="flex-1 text-[14px] text-label-tertiary">未設定</span>
                      )}
                      <span className="text-[11px] text-label-tertiary">{slot.servings}人</span>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
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
