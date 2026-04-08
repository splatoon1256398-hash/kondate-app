"use client";

import { Check } from "lucide-react";
import type { ShoppingItemResponse } from "@/types/shopping-list";

type Props = {
  item: ShoppingItemResponse;
  onToggle: (item: ShoppingItemResponse) => void;
};

export default function ShoppingItem({ item, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={() => onToggle(item)}
      className="flex w-full min-h-[44px] items-center gap-3 px-4 py-2.5 text-left active:bg-fill-tertiary transition-colors"
    >
      {/* iOS-style circular checkbox */}
      <span
        className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-all ${
          item.is_checked
            ? "border-blue bg-blue text-white"
            : "border-gray3"
        }`}
      >
        {item.is_checked && <Check size={14} strokeWidth={3} />}
      </span>

      {/* Name */}
      <span
        className={`min-w-0 flex-1 truncate text-[17px] ${
          item.is_checked ? "text-label-tertiary line-through" : "text-label"
        }`}
      >
        {item.name}
      </span>

      {/* Amount */}
      {item.amount != null && (
        <span className="shrink-0 text-[15px] text-label-tertiary">
          {item.amount}
          {item.unit ? ` ${item.unit}` : ""}
        </span>
      )}

      {/* Checked by */}
      {item.is_checked && item.checked_by && (
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
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
