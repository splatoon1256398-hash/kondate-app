"use client";

import { useState, useCallback } from "react";
import {
  Sparkles,
  X,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChefHat,
  Flame,
  Shuffle,
} from "lucide-react";
import {
  getMonday,
  getWeekDays,
  shortDate,
  dayLabel,
  nextWeek,
  prevWeek,
} from "@/lib/utils/date";

type MealType = "lunch" | "dinner";
type CookMode = "hotcook" | "stove" | "mixed";

type SlotConfig = {
  enabled: boolean;
  servings: number;
};

type WeekSlots = Record<string, Record<MealType, SlotConfig>>;

function buildInitialSlots(mondayStr: string): WeekSlots {
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

type Props = {
  onSubmit: (message: string, weekStart: string) => void;
};

export default function AiSuggestionForm({ onSubmit }: Props) {
  const [weekStart, setWeekStart] = useState(() =>
    nextWeek(getMonday(new Date()))
  );
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [slots, setSlots] = useState<WeekSlots>(() =>
    buildInitialSlots(weekStart)
  );
  const [notes, setNotes] = useState("");
  const [cookMode, setCookMode] = useState<CookMode>("hotcook");

  const days = getWeekDays(weekStart);

  // Week navigation
  const goToPrevWeek = useCallback(() => {
    setWeekStart((prev) => {
      const next = prevWeek(prev);
      setSlots(buildInitialSlots(next));
      return next;
    });
  }, []);

  const goToNextWeek = useCallback(() => {
    setWeekStart((prev) => {
      const next = nextWeek(prev);
      setSlots(buildInitialSlots(next));
      return next;
    });
  }, []);

  const addIngredient = useCallback(() => {
    const v = inputValue.trim();
    if (!v || ingredients.includes(v)) return;
    setIngredients((prev) => [...prev, v]);
    setInputValue("");
  }, [inputValue, ingredients]);

  const removeIngredient = useCallback((name: string) => {
    setIngredients((prev) => prev.filter((i) => i !== name));
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addIngredient();
      }
    },
    [addIngredient]
  );

  const toggleSlot = useCallback((date: string, meal: MealType) => {
    setSlots((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        [meal]: {
          ...prev[date][meal],
          enabled: !prev[date][meal].enabled,
        },
      },
    }));
  }, []);

  const setServings = useCallback(
    (date: string, meal: MealType, servings: number) => {
      setSlots((prev) => ({
        ...prev,
        [date]: {
          ...prev[date],
          [meal]: { ...prev[date][meal], servings },
        },
      }));
    },
    []
  );

  const handleSubmit = useCallback(() => {
    const parts: string[] = [];

    // Cook mode
    const modeLabel =
      cookMode === "hotcook"
        ? "ホットクックのみ"
        : cookMode === "stove"
          ? "コンロのみ"
          : "ホットクック＋コンロ混合";
    parts.push(`調理方法: ${modeLabel}`);

    if (ingredients.length > 0) {
      parts.push(`冷蔵庫の残り物: ${ingredients.join("、")}`);
    }

    // Build schedule text
    const scheduleLines: string[] = [];
    for (const date of days) {
      const daySlot = slots[date];
      const parts2: string[] = [];
      if (daySlot.lunch.enabled) {
        parts2.push(`昼${daySlot.lunch.servings}人`);
      }
      if (daySlot.dinner.enabled) {
        parts2.push(`夜${daySlot.dinner.servings}人`);
      }
      if (parts2.length > 0) {
        scheduleLines.push(
          `${dayLabel(date)}(${shortDate(date)}): ${parts2.join("、")}`
        );
      } else {
        scheduleLines.push(`${dayLabel(date)}(${shortDate(date)}): なし`);
      }
    }
    parts.push(`\n今週の予定:\n${scheduleLines.join("\n")}`);

    // Skipped slots
    const skipped: string[] = [];
    for (const date of days) {
      const daySlot = slots[date];
      if (!daySlot.lunch.enabled) skipped.push(`${dayLabel(date)}昼`);
      if (!daySlot.dinner.enabled) skipped.push(`${dayLabel(date)}夜`);
    }
    if (skipped.length > 0) {
      parts.push(`\n不要な枠（外食など）: ${skipped.join("、")}`);
    }

    if (notes.trim()) {
      parts.push(`\nメモ: ${notes.trim()}`);
    }

    parts.push("\n献立を提案してください！");

    onSubmit(parts.join("\n"), weekStart);
  }, [ingredients, days, slots, notes, weekStart, cookMode, onSubmit]);

  const weekEndDate = days[days.length - 1];

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <Sparkles size={20} className="text-accent" />
        <h1 className="text-lg font-bold">AI献立提案</h1>
      </div>

      <div className="space-y-5 px-4">
        {/* Week selector */}
        <section>
          <h2 className="mb-2 text-sm font-semibold">対象の週</h2>
          <div className="flex items-center justify-between rounded-xl bg-card p-2">
            <button
              type="button"
              onClick={goToPrevWeek}
              className="rounded-lg p-2 text-muted transition-colors hover:bg-card-hover hover:text-foreground"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-sm font-semibold">
              {shortDate(weekStart)} 〜 {shortDate(weekEndDate)}
            </span>
            <button
              type="button"
              onClick={goToNextWeek}
              className="rounded-lg p-2 text-muted transition-colors hover:bg-card-hover hover:text-foreground"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </section>

        {/* Cook mode */}
        <section>
          <h2 className="mb-2 text-sm font-semibold">調理方法</h2>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { key: "hotcook", label: "ホットクック", icon: ChefHat },
                { key: "stove", label: "コンロ", icon: Flame },
                { key: "mixed", label: "混合", icon: Shuffle },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setCookMode(key)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-xs font-medium transition-all ${
                  cookMode === key
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-card text-muted hover:text-foreground"
                }`}
              >
                <Icon size={20} />
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* Remaining ingredients */}
        <section>
          <h2 className="mb-2 text-sm font-semibold">残り食材</h2>
          <div className="flex flex-wrap gap-1.5">
            {ingredients.map((name) => (
              <span
                key={name}
                className="flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs text-accent"
              >
                {name}
                <button
                  type="button"
                  onClick={() => removeIngredient(name)}
                  className="ml-0.5 text-accent/60 hover:text-accent"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="食材名を入力"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={addIngredient}
              disabled={!inputValue.trim()}
              className="flex items-center gap-1 rounded-lg bg-card px-3 py-2 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-40"
            >
              <Plus size={14} />
              追加
            </button>
          </div>
        </section>

        {/* Week schedule */}
        <section>
          <h2 className="mb-2 text-sm font-semibold">食事の予定</h2>
          <p className="mb-3 text-[11px] text-muted">
            外食などでスキップする場合はタップしてOFFに
          </p>

          <div className="space-y-1.5">
            {days.map((date) => {
              const daySlots = slots[date];
              return (
                <div
                  key={date}
                  className="flex items-center gap-2 rounded-xl bg-card p-2"
                >
                  {/* Day label */}
                  <div className="w-10 shrink-0 text-center">
                    <div className="text-xs font-bold text-foreground">
                      {dayLabel(date)}
                    </div>
                    <div className="text-[10px] text-muted">
                      {shortDate(date)}
                    </div>
                  </div>

                  {/* Lunch */}
                  <MealSlotToggle
                    label="昼"
                    config={daySlots.lunch}
                    onToggle={() => toggleSlot(date, "lunch")}
                    onServingsChange={(s) => setServings(date, "lunch", s)}
                  />

                  {/* Dinner */}
                  <MealSlotToggle
                    label="夜"
                    config={daySlots.dinner}
                    onToggle={() => toggleSlot(date, "dinner")}
                    onServingsChange={(s) => setServings(date, "dinner", s)}
                  />
                </div>
              );
            })}
          </div>
        </section>

        {/* Additional notes */}
        <section>
          <h2 className="mb-2 text-sm font-semibold">メモ</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="作り置き希望、苦手な食材など..."
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </section>

        {/* Submit button */}
        <button
          type="button"
          onClick={handleSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 active:opacity-80"
        >
          <Sparkles size={16} />
          献立を提案してもらう
        </button>
      </div>
    </div>
  );
}

function MealSlotToggle({
  label,
  config,
  onToggle,
  onServingsChange,
}: {
  label: string;
  config: { enabled: boolean; servings: number };
  onToggle: () => void;
  onServingsChange: (s: number) => void;
}) {
  if (!config.enabled) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2.5 text-xs text-muted transition-colors active:border-accent active:text-accent"
      >
        {label} — スキップ
      </button>
    );
  }

  return (
    <div className="flex flex-1 items-center gap-1.5 rounded-lg bg-card-hover p-1.5">
      {/* Toggle off */}
      <button
        type="button"
        onClick={onToggle}
        className="shrink-0 text-[10px] text-danger active:opacity-60"
        aria-label="スキップ"
      >
        ✕
      </button>

      {/* Label */}
      <span className="shrink-0 text-xs font-medium text-foreground">
        {label}
      </span>

      {/* Servings */}
      <div className="ml-auto flex overflow-hidden rounded-lg border border-border">
        {[1, 2].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onServingsChange(n)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              config.servings === n
                ? "bg-accent text-background"
                : "text-muted active:text-foreground"
            }`}
          >
            {n}人
          </button>
        ))}
      </div>
    </div>
  );
}
