import { dayLabel, getWeekDays, shortDate } from "@/lib/utils/date";
import type { PantryItem } from "@/types/pantry";

export type MealType = "lunch" | "dinner";
export type CookMode = "hotcook" | "stove" | "mixed";

export type SlotConfig = {
  enabled: boolean;
  servings: number;
};

export type WeekSlots = Record<string, Record<MealType, SlotConfig>>;

export type RequestedRecipe = {
  id: string;
  title: string;
};

type BuildMealPlanRequestInput = {
  cookMode: CookMode;
  pantryItems: PantryItem[];
  prioritizedIds: string[];
  extraIngredients: string[];
  days: string[];
  slots: WeekSlots;
  notes: string;
  wantRecipes: RequestedRecipe[];
};

export function buildInitialSlots(mondayStr: string): WeekSlots {
  const days = getWeekDays(mondayStr);
  const slots: WeekSlots = {};

  for (const date of days) {
    slots[date] = {
      lunch: { enabled: true, servings: 1 },
      dinner: { enabled: true, servings: 2 },
    };
  }

  return slots;
}

export function buildMealPlanRequestMessage({
  cookMode,
  pantryItems,
  prioritizedIds,
  extraIngredients,
  days,
  slots,
  notes,
  wantRecipes,
}: BuildMealPlanRequestInput): string {
  const parts: string[] = [];

  const modeLabel =
    cookMode === "hotcook"
      ? "ホットクックのみ"
      : cookMode === "stove"
        ? "コンロのみ"
        : "ホットクック＋コンロ混合";
  parts.push(`調理方法: ${modeLabel}`);

  const prioritizedPantryItems = pantryItems.filter((item) => prioritizedIds.includes(item.id));
  if (prioritizedPantryItems.length > 0) {
    const lines = prioritizedPantryItems.map(
      (item) => `${item.name}${item.amount != null ? ` ${item.amount}${item.unit || ""}` : ""}`
    );
    parts.push(`優先して使い切る在庫: ${lines.join("、")}`);
  }

  if (extraIngredients.length > 0) {
    parts.push(`追加の残り食材: ${extraIngredients.join("、")}`);
  }

  const scheduleLines: string[] = [];
  for (const date of days) {
    const daySlot = slots[date];
    const slotTexts: string[] = [];
    if (daySlot.lunch.enabled) {
      slotTexts.push(`昼${daySlot.lunch.servings}人`);
    }
    if (daySlot.dinner.enabled) {
      slotTexts.push(`夜${daySlot.dinner.servings}人`);
    }
    if (slotTexts.length > 0) {
      scheduleLines.push(`${dayLabel(date)}(${shortDate(date)}): ${slotTexts.join("、")}`);
    } else {
      scheduleLines.push(`${dayLabel(date)}(${shortDate(date)}): なし`);
    }
  }
  parts.push(`\n今週の予定:\n${scheduleLines.join("\n")}`);

  const skipped: string[] = [];
  for (const date of days) {
    const daySlot = slots[date];
    if (!daySlot.lunch.enabled) {
      skipped.push(`${dayLabel(date)}昼`);
    }
    if (!daySlot.dinner.enabled) {
      skipped.push(`${dayLabel(date)}夜`);
    }
  }
  if (skipped.length > 0) {
    parts.push(`\n不要な枠（外食など）: ${skipped.join("、")}`);
  }

  if (wantRecipes.length > 0) {
    parts.push(
      `\n食べたいレシピ（必ず組み込んで）:\n${wantRecipes
        .map((recipe) => `- ${recipe.title}`)
        .join("\n")}`
    );
  }

  if (notes.trim()) {
    parts.push(`\nメモ: ${notes.trim()}`);
  }

  parts.push("\n献立を提案してください！");

  return parts.join("\n");
}
