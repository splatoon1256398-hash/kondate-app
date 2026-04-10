"use client";

import { Check } from "lucide-react";
import type { ShoppingItemResponse } from "@/types/shopping-list";
import { formatShoppingAmount } from "@/lib/utils/format-amount";

type Props = {
  item: ShoppingItemResponse;
  onToggle: (item: ShoppingItemResponse) => void;
};

export default function ShoppingItem({ item, onToggle }: Props) {
  const { primary, secondary } = formatShoppingAmount(item.amount, item.unit);
  const recipeTitles = item.recipe_titles ?? [];
  const recipeLabel = buildRecipeLabel(recipeTitles);

  return (
    <button
      type="button"
      onClick={() => onToggle(item)}
      className="flex w-full min-h-[44px] items-start gap-3 px-4 py-2.5 text-left active:bg-fill-tertiary transition-colors"
    >
      {/* iOS-style circular checkbox */}
      <span
        className={`mt-[3px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-all ${
          item.is_checked
            ? "border-blue bg-blue text-white"
            : "border-gray3"
        }`}
      >
        {item.is_checked && <Check size={14} strokeWidth={3} />}
      </span>

      {/* Name + recipe label */}
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={`truncate text-[17px] ${
            item.is_checked ? "text-label-tertiary line-through" : "text-label"
          }`}
        >
          {item.name}
        </span>
        {recipeLabel && (
          <span
            className={`mt-0.5 truncate text-[11px] ${
              item.is_checked ? "text-label-tertiary" : "text-blue"
            }`}
          >
            {recipeLabel}
          </span>
        )}
      </span>

      {/* Amount */}
      {primary && (
        <span className="mt-[3px] flex shrink-0 items-baseline gap-1">
          <span
            className={`text-[15px] tabular-nums ${
              item.is_checked ? "text-label-tertiary" : "text-label-secondary"
            }`}
          >
            {primary}
          </span>
          {secondary && (
            <span className="text-[11px] text-label-tertiary">{secondary}</span>
          )}
        </span>
      )}

      {/* Checked by */}
      {item.is_checked && item.checked_by && (
        <span
          className={`mt-[3px] shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            item.checked_by === "れん"
              ? "bg-blue/10 text-blue"
              : "bg-green/10 text-green"
          }`}
        >
          {item.checked_by}
        </span>
      )}
    </button>
  );
}

/**
 * recipe_titles から表示ラベルを組み立てる。
 *   ["カレー"]              → "カレー用"
 *   ["カレー", "親子丼"]     → "カレー・親子丼用"
 *   ["A", "B", "C", "D"]   → "A・B・C 他1件用"
 */
function buildRecipeLabel(titles: string[]): string {
  if (titles.length === 0) return "";
  if (titles.length <= 3) return `${titles.join("・")}用`;
  return `${titles.slice(0, 3).join("・")} 他${titles.length - 3}件用`;
}
