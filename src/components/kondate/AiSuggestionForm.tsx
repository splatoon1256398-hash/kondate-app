"use client";

import { useState, useCallback } from "react";
import { Sparkles, X, Plus } from "lucide-react";
import { getMonday, getWeekDays, shortDate, dayLabel, nextWeek } from "@/lib/utils/date";

type MealType = "lunch" | "dinner";

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
  const [weekStart] = useState(() => nextWeek(getMonday(new Date())));
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [slots, setSlots] = useState<WeekSlots>(() => buildInitialSlots(weekStart));
  const [notes, setNotes] = useState("");

  const days = getWeekDays(weekStart);

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
      }
    },
    []
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

  const setServings = useCallback((date: string, meal: MealType, servings: number) => {
    setSlots((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        [meal]: { ...prev[date][meal], servings },
      },
    }));
  }, []);

  const handleSubmit = useCallback(() => {
    // Build user message from form state
    const parts: string[] = [];

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
        scheduleLines.push(`${dayLabel(date)}(${shortDate(date)}): ${parts2.join("、")}`);
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
  }, [ingredients, days, slots, notes, weekStart, onSubmit]);

  return (
    <div className="pb-6">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <Sparkles size={20} className="text-accent" />
        <h1 className="text-lg font-bold">AI献立提案</h1>
      </div>

      <div className="space-y-5 px-4">
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

        {/* Week schedule grid */}
        <section>
          <h2 className="mb-2 text-sm font-semibold">
            週の予定
            <span className="ml-2 text-xs font-normal text-muted">
              {shortDate(days[0])} 〜 {shortDate(days[6])}
            </span>
          </h2>

          {/* Grid header */}
          <div className="grid grid-cols-[3rem_1fr_1fr] gap-1 text-center text-[10px] text-muted">
            <div />
            <div>昼</div>
            <div>夜</div>
          </div>

          {/* Grid rows */}
          <div className="mt-1 space-y-1">
            {days.map((date) => {
              const daySlots = slots[date];
              return (
                <div
                  key={date}
                  className="grid grid-cols-[3rem_1fr_1fr] items-center gap-1"
                >
                  <span className="text-center text-xs font-medium text-muted">
                    {dayLabel(date)}
                    <br />
                    <span className="text-[10px]">{shortDate(date)}</span>
                  </span>

                  <SlotCell
                    config={daySlots.lunch}
                    onToggle={() => toggleSlot(date, "lunch")}
                    onServingsChange={(s) => setServings(date, "lunch", s)}
                  />

                  <SlotCell
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
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none resize-none"
          />
        </section>

        {/* Submit button */}
        <button
          type="button"
          onClick={handleSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90"
        >
          <Sparkles size={16} />
          献立を提案してもらう
        </button>
      </div>
    </div>
  );
}

function SlotCell({
  config,
  onToggle,
  onServingsChange,
}: {
  config: { enabled: boolean; servings: number };
  onToggle: () => void;
  onServingsChange: (s: number) => void;
}) {
  if (!config.enabled) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="rounded-lg border border-dashed border-border py-2 text-center text-[10px] text-muted transition-colors hover:border-accent hover:text-accent"
      >
        なし
      </button>
    );
  }

  return (
    <div className="flex items-center justify-center gap-1 rounded-lg bg-card p-1.5">
      <button
        type="button"
        onClick={onToggle}
        className="text-[10px] text-danger hover:underline"
      >
        ✕
      </button>
      <div className="flex overflow-hidden rounded-md border border-border">
        {[1, 2].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onServingsChange(n)}
            className={`px-2 py-0.5 text-[11px] transition-colors ${
              config.servings === n
                ? "bg-accent text-background"
                : "text-muted hover:text-foreground"
            }`}
          >
            {n}人
          </button>
        ))}
      </div>
    </div>
  );
}
