"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Sparkles,
  X,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChefHat,
  Flame,
  Shuffle,
  Search,
  Heart,
} from "lucide-react";
import type { RecipeListItem } from "@/types/recipe";
import type { ApiResponse } from "@/types/common";
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
  const [wantRecipes, setWantRecipes] = useState<{ id: string; title: string }[]>([]);
  const [recipeSearch, setRecipeSearch] = useState("");
  const [searchResults, setSearchResults] = useState<RecipeListItem[]>([]);
  const [showRecipeSearch, setShowRecipeSearch] = useState(false);
  const [recommended, setRecommended] = useState<RecipeListItem[]>([]);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const days = getWeekDays(weekStart);

  // Fetch recommended recipes on mount
  useEffect(() => {
    async function loadRecommended() {
      try {
        const res = await fetch("/api/recipes/recommended");
        const json: ApiResponse<RecipeListItem[]> = await res.json();
        if (json.data) setRecommended(json.data);
      } catch { /* ignore */ }
    }
    loadRecommended();
  }, []);

  // Recipe search
  useEffect(() => {
    if (!recipeSearch.trim()) {
      setSearchResults([]);
      return;
    }
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/recipes?q=${encodeURIComponent(recipeSearch)}&limit=10`);
        const json: ApiResponse<RecipeListItem[]> = await res.json();
        if (json.data) setSearchResults(json.data);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [recipeSearch]);

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

    // Requested recipes
    if (wantRecipes.length > 0) {
      parts.push(
        `\n食べたいレシピ（必ず組み込んで）:\n${wantRecipes.map((r) => `- ${r.title}`).join("\n")}`
      );
    }

    if (notes.trim()) {
      parts.push(`\nメモ: ${notes.trim()}`);
    }

    parts.push("\n献立を提案してください！");

    onSubmit(parts.join("\n"), weekStart);
  }, [ingredients, days, slots, notes, weekStart, cookMode, wantRecipes, onSubmit]);

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

        {/* Recipe requests */}
        <section>
          <h2 className="mb-2 text-sm font-semibold">食べたいレシピ</h2>

          {/* Selected recipes */}
          {wantRecipes.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {wantRecipes.map((r) => (
                <span
                  key={r.id}
                  className="flex items-center gap-1 rounded-full bg-green/10 px-2.5 py-1 text-xs text-green"
                >
                  {r.title}
                  <button
                    type="button"
                    onClick={() =>
                      setWantRecipes((prev) => prev.filter((x) => x.id !== r.id))
                    }
                    className="ml-0.5 text-green/60 hover:text-green"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Search toggle */}
          {!showRecipeSearch ? (
            <button
              type="button"
              onClick={() => setShowRecipeSearch(true)}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted transition-colors active:border-accent active:text-accent"
            >
              <Search size={14} />
              レシピを検索して追加
            </button>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  type="text"
                  value={recipeSearch}
                  onChange={(e) => setRecipeSearch(e.target.value)}
                  placeholder="レシピ名で検索..."
                  autoFocus
                  className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-8 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowRecipeSearch(false);
                    setRecipeSearch("");
                    setSearchResults([]);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Search results */}
              {searchResults.length > 0 && (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-1.5">
                  {searchResults
                    .filter((r) => !wantRecipes.some((w) => w.id === r.id))
                    .map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setWantRecipes((prev) => [
                            ...prev,
                            { id: r.id, title: r.title },
                          ]);
                          setRecipeSearch("");
                          setSearchResults([]);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-card-hover active:bg-accent/10"
                      >
                        <Plus size={14} className="shrink-0 text-accent" />
                        <span className="flex-1 truncate">{r.title}</span>
                        {r.is_favorite && (
                          <Heart
                            size={10}
                            className="shrink-0 fill-danger text-danger"
                          />
                        )}
                        {r.cook_method === "hotcook" && (
                          <ChefHat size={12} className="shrink-0 text-accent" />
                        )}
                      </button>
                    ))}
                </div>
              )}

              {recipeSearch.trim() && searchResults.length === 0 && (
                <p className="px-2 text-xs text-muted">該当なし</p>
              )}
            </div>
          )}

          {/* Recommended recipes */}
          {recommended.length > 0 && (
            <div className="mt-3">
              <h3 className="mb-1.5 text-[11px] font-semibold text-muted">
                おすすめ
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {recommended
                  .filter((r) => !wantRecipes.some((w) => w.id === r.id))
                  .slice(0, 12)
                  .map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() =>
                        setWantRecipes((prev) => [
                          ...prev,
                          { id: r.id, title: r.title },
                        ])
                      }
                      className="flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1.5 text-[11px] transition-colors active:border-accent active:bg-accent/10"
                    >
                      {r.is_favorite && (
                        <Heart size={10} className="fill-danger text-danger" />
                      )}
                      {r.cook_method === "hotcook" && (
                        <ChefHat size={10} className="text-accent" />
                      )}
                      <span className="max-w-[10rem] truncate">{r.title}</span>
                      <Plus size={10} className="text-muted" />
                    </button>
                  ))}
              </div>
            </div>
          )}
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
