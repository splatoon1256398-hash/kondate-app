"use client";

import { ChefHat, UtensilsCrossed, CheckCircle2, Loader2 } from "lucide-react";
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
  // Group by date
  const byDate = new Map<string, SlotProposal[]>();
  for (const slot of slots) {
    if (!byDate.has(slot.date)) byDate.set(slot.date, []);
    byDate.get(slot.date)!.push(slot);
  }

  const sorted = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-2 rounded-xl border border-accent/20 bg-accent/5 p-3">
      <div className="text-xs font-semibold text-accent">献立提案</div>
      {sorted.map(([date, daySlots]) => (
        <div key={date} className="flex items-start gap-2">
          <div className="w-10 shrink-0 text-center">
            <span className="text-xs font-bold text-muted">{dayLabel(date)}</span>
            <br />
            <span className="text-[10px] text-muted">{shortDate(date)}</span>
          </div>
          <div className="flex flex-1 gap-1.5">
            {daySlots
              .sort((a, b) => (a.meal_type === "lunch" ? -1 : 1) - (b.meal_type === "lunch" ? -1 : 1))
              .map((slot, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-md p-1.5 text-xs ${
                    slot.is_skipped ? "bg-card/50 text-muted" : "bg-card"
                  }`}
                >
                  <div className="flex items-center gap-1 text-[10px] text-muted">
                    <UtensilsCrossed size={10} />
                    {slot.meal_type === "lunch" ? "昼" : "夜"} {slot.servings}人
                  </div>
                  {slot.is_skipped ? (
                    <span className="text-muted line-through">{slot.memo || "スキップ"}</span>
                  ) : slot.recipe ? (
                    <div className="mt-0.5">
                      <span className="font-medium">{slot.recipe.title}</span>
                      {slot.recipe.cook_method === "hotcook" && (
                        <ChefHat size={10} className="ml-1 inline text-accent" />
                      )}
                    </div>
                  ) : (
                    <span className="text-muted">未設定</span>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}

      {/* Confirm button */}
      {onConfirm && !confirmed && (
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirming}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {confirming ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              保存中...
            </>
          ) : (
            <>
              <CheckCircle2 size={16} />
              この献立で確定する
            </>
          )}
        </button>
      )}
      {confirmed && (
        <div className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-green/10 py-2 text-xs font-medium text-green">
          <CheckCircle2 size={14} />
          確定済み
        </div>
      )}
    </div>
  );
}
