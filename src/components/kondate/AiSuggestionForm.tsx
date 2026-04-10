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
import type { PantryItem } from "@/types/pantry";
import type { ApiResponse } from "@/types/common";
import {
  getMonday,
  getWeekDays,
  shortDate,
  dayLabel,
  nextWeek,
  prevWeek,
} from "@/lib/utils/date";
import {
  buildInitialSlots,
  buildMealPlanRequestMessage,
  type MealType,
  type CookMode,
  type WeekSlots,
} from "@/lib/meal-plan/request";

type Props = {
  onSubmit: (message: string, weekStart: string) => void;
};

export default function AiSuggestionForm({ onSubmit }: Props) {
  const [weekStart, setWeekStart] = useState(() =>
    nextWeek(getMonday(new Date()))
  );
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [prioritizedIds, setPrioritizedIds] = useState<string[]>([]);
  const [extraIngredients, setExtraIngredients] = useState<string[]>([]);
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
  const [popular, setPopular] = useState<RecipeListItem[]>([]);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const days = getWeekDays(weekStart);
  const normalizedRecipeSearch = recipeSearch.trim();
  const visibleSearchResults = normalizedRecipeSearch ? searchResults : [];

  // Fetch recommended + popular + pantry on mount
  useEffect(() => {
    async function load() {
      try {
        const [recRes, popRes, panRes] = await Promise.all([
          fetch("/api/recipes/recommended"),
          fetch("/api/recipes/popular"),
          fetch("/api/pantry"),
        ]);
        const recJson: ApiResponse<RecipeListItem[]> = await recRes.json();
        const popJson: ApiResponse<RecipeListItem[]> = await popRes.json();
        const panJson: ApiResponse<PantryItem[]> = await panRes.json();
        if (recJson.data) setRecommended(recJson.data);
        if (popJson.data) setPopular(popJson.data);
        if (panJson.data) {
          // 調味料は「残り食材」として提示しない（常時あるものとして扱う）
          const nonStaples = panJson.data.filter(
            (i) => !i.is_staple && i.category !== "seasoning"
          );
          setPantryItems(nonStaples);
          // Auto-prioritize all pantry items by default
          setPrioritizedIds(nonStaples.map((i) => i.id));
        }
      } catch { /* ignore */ }
    }
    load();
  }, []);

  // Recipe search
  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    if (!normalizedRecipeSearch) return;

    let cancelled = false;
    const query = normalizedRecipeSearch;

    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/recipes?q=${encodeURIComponent(query)}&limit=10`);
        const json: ApiResponse<RecipeListItem[]> = await res.json();
        if (!cancelled) {
          setSearchResults(json.data ?? []);
        }
      } catch {
        if (!cancelled) {
          setSearchResults([]);
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(searchTimerRef.current);
    };
  }, [normalizedRecipeSearch]);

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

  const addExtraIngredient = useCallback(() => {
    const v = inputValue.trim();
    if (!v || extraIngredients.includes(v)) return;
    setExtraIngredients((prev) => [...prev, v]);
    setInputValue("");
  }, [inputValue, extraIngredients]);

  const removeExtraIngredient = useCallback((name: string) => {
    setExtraIngredients((prev) => prev.filter((i) => i !== name));
  }, []);

  const togglePrioritized = useCallback((id: string) => {
    setPrioritizedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addExtraIngredient();
      }
    },
    [addExtraIngredient]
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
    const message = buildMealPlanRequestMessage({
      cookMode,
      pantryItems,
      prioritizedIds,
      extraIngredients,
      days,
      slots,
      notes,
      wantRecipes,
    });

    onSubmit(message, weekStart);
  }, [pantryItems, prioritizedIds, extraIngredients, days, slots, notes, weekStart, cookMode, wantRecipes, onSubmit]);

  const weekEndDate = days[days.length - 1];

  return (
    <div className="bg-bg-grouped pb-6">
      {/* Large Title */}
      <div className="px-4 pt-3 pb-2">
        <h1 className="text-[34px] font-bold leading-[41px] text-label">AI提案</h1>
      </div>

      <div className="space-y-5 px-4">
        {/* Week selector */}
        <section>
          <h2 className="mb-1.5 pl-4 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
            対象の週
          </h2>
          <div className="flex items-center justify-between rounded-[10px] bg-bg-grouped-secondary px-2 py-1">
            <button
              type="button"
              onClick={goToPrevWeek}
              className="flex h-9 w-9 items-center justify-center rounded-full text-blue active:bg-fill"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
            <span className="text-[17px] font-semibold text-label">
              {shortDate(weekStart)} 〜 {shortDate(weekEndDate)}
            </span>
            <button
              type="button"
              onClick={goToNextWeek}
              className="flex h-9 w-9 items-center justify-center rounded-full text-blue active:bg-fill"
            >
              <ChevronRight size={20} strokeWidth={2.5} />
            </button>
          </div>
        </section>

        {/* Cook mode */}
        <section>
          <h2 className="mb-1.5 pl-4 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
            調理方法
          </h2>
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
                className={`flex flex-col items-center justify-center gap-1 rounded-[10px] py-3 transition-all ${
                  cookMode === key
                    ? "bg-blue text-white"
                    : "bg-bg-grouped-secondary text-label"
                }`}
              >
                <Icon size={20} strokeWidth={1.5} />
                <span className="text-[13px] font-semibold">{label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Week schedule */}
        <section>
          <h2 className="mb-1.5 pl-4 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
            食事の予定
          </h2>
          <div className="cell-separator overflow-hidden rounded-[10px] bg-bg-grouped-secondary">
            {days.map((date) => {
              const daySlots = slots[date];
              return (
                <div key={date} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-10 shrink-0">
                    <div className="text-[15px] font-semibold text-label">
                      {dayLabel(date)}
                    </div>
                    <div className="text-[11px] text-label-tertiary">
                      {shortDate(date)}
                    </div>
                  </div>
                  <div className="flex flex-1 gap-2">
                    <MealSlotToggle
                      label="昼"
                      config={daySlots.lunch}
                      onToggle={() => toggleSlot(date, "lunch")}
                      onServingsChange={(s) => setServings(date, "lunch", s)}
                    />
                    <MealSlotToggle
                      label="夜"
                      config={daySlots.dinner}
                      onToggle={() => toggleSlot(date, "dinner")}
                      onServingsChange={(s) => setServings(date, "dinner", s)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 pl-4 text-[12px] text-label-tertiary">
            外食などでスキップする場合はスキップを押す
          </p>
        </section>

        {/* Pantry-based ingredients */}
        <section>
          <h2 className="mb-1.5 pl-4 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
            残り食材
          </h2>
          <div className="rounded-[10px] bg-bg-grouped-secondary p-3">
            {pantryItems.length > 0 ? (
              <div className="mb-2">
                <p className="mb-2 text-[12px] text-label-secondary">
                  冷蔵庫にある食材（タップで優先使用）
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {pantryItems.map((item) => {
                    const isPrioritized = prioritizedIds.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => togglePrioritized(item.id)}
                        className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-medium transition-colors ${
                          isPrioritized
                            ? "bg-blue text-white"
                            : "bg-fill-tertiary text-label-secondary"
                        }`}
                      >
                        {item.name}
                        {item.amount != null && (
                          <span className="text-[11px] opacity-70">
                            {item.amount}{item.unit || ""}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="mb-2 text-[12px] text-label-tertiary">
                冷蔵庫は空です。追加は在庫タブから。
              </p>
            )}

            {/* Extra manual ingredients */}
            {extraIngredients.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {extraIngredients.map((name) => (
                  <span
                    key={name}
                    className="flex items-center gap-1 rounded-full bg-green/10 px-2.5 py-1 text-[13px] font-medium text-green"
                  >
                    {name}
                    <button
                      type="button"
                      onClick={() => removeExtraIngredient(name)}
                      className="ml-0.5 text-green/60"
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Manual add (for items not in fridge yet) */}
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="他に使いたい食材"
                className="flex-1 rounded-[10px] bg-fill-tertiary px-3 py-2 text-[15px] text-label placeholder:text-label-tertiary focus:outline-none"
              />
              <button
                type="button"
                onClick={addExtraIngredient}
                disabled={!inputValue.trim()}
                className="rounded-[10px] bg-fill px-3 py-2 text-[15px] font-medium text-blue active:bg-fill-secondary disabled:opacity-40"
              >
                追加
              </button>
            </div>
          </div>
        </section>

        {/* Notes (renamed to 要望) */}
        <section>
          <h2 className="mb-1.5 pl-4 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
            要望
          </h2>
          <div className="rounded-[10px] bg-bg-grouped-secondary p-3">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="作り置き希望、苦手な食材、味の好みなど..."
              rows={3}
              className="w-full resize-none rounded-[10px] bg-fill-tertiary px-3 py-2 text-[15px] text-label placeholder:text-label-tertiary focus:outline-none"
            />
          </div>
        </section>

        {/* Recipe requests */}
        <section>
          <h2 className="mb-1.5 pl-4 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
            食べたいレシピ
          </h2>
          <div className="rounded-[10px] bg-bg-grouped-secondary p-3">
            {/* Selected */}
            {wantRecipes.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {wantRecipes.map((r) => (
                  <span
                    key={r.id}
                    className="flex items-center gap-1 rounded-full bg-green/10 px-2.5 py-1 text-[13px] font-medium text-green"
                  >
                    {r.title}
                    <button
                      type="button"
                      onClick={() => setWantRecipes((prev) => prev.filter((x) => x.id !== r.id))}
                      className="ml-0.5 text-green/60"
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search */}
            {!showRecipeSearch ? (
              <button
                type="button"
                onClick={() => setShowRecipeSearch(true)}
                className="flex w-full items-center gap-2 rounded-[10px] bg-fill-tertiary px-3 py-2 text-[15px] text-label-tertiary"
              >
                <Search size={14} strokeWidth={2} />
                レシピ名で検索
              </button>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-label-tertiary"
                    strokeWidth={2}
                  />
                  <input
                    type="text"
                    value={recipeSearch}
                    onChange={(e) => setRecipeSearch(e.target.value)}
                    placeholder="レシピ名で検索..."
                    autoFocus
                    className="w-full rounded-[10px] bg-fill-tertiary py-2 pl-8 pr-8 text-[15px] text-label placeholder:text-label-tertiary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setShowRecipeSearch(false);
                      setRecipeSearch("");
                      setSearchResults([]);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-label-tertiary"
                  >
                    <X size={14} strokeWidth={2.5} />
                  </button>
                </div>
                {visibleSearchResults.length > 0 && (
                  <div className="cell-separator max-h-60 overflow-y-auto rounded-[10px] bg-bg-secondary">
                    {visibleSearchResults
                      .filter((r) => !wantRecipes.some((w) => w.id === r.id))
                      .map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            setWantRecipes((prev) => [...prev, { id: r.id, title: r.title }]);
                            setRecipeSearch("");
                            setSearchResults([]);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[15px] active:bg-fill"
                        >
                          <Plus size={14} className="shrink-0 text-blue" strokeWidth={2.5} />
                          <span className="flex-1 truncate">{r.title}</span>
                          {r.is_favorite && <Heart size={10} className="shrink-0 fill-red text-red" />}
                          {r.cook_method === "hotcook" && (
                            <ChefHat size={12} className="shrink-0 text-blue" strokeWidth={1.5} />
                          )}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Popular ranking */}
          {popular.length > 0 && (
            <div className="mt-3">
              <h3 className="mb-1.5 pl-4 text-[12px] font-semibold uppercase tracking-wide text-orange">
                人気ランキング
              </h3>
              <div className="rounded-[10px] bg-bg-grouped-secondary p-3">
                <div className="flex flex-wrap gap-1.5">
                  {popular
                    .filter((r) => !wantRecipes.some((w) => w.id === r.id))
                    .slice(0, 10)
                    .map((r, i) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setWantRecipes((prev) => [...prev, { id: r.id, title: r.title }])}
                        className="flex max-w-full items-start gap-1 rounded-[12px] bg-orange/10 px-2.5 py-1.5 text-left text-[13px] font-medium text-orange active:bg-orange/20"
                      >
                        <span className="mt-[2px] shrink-0 text-[10px] font-bold">{i + 1}</span>
                        <span className="whitespace-normal break-words leading-[1.3]">{r.title}</span>
                      </button>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* AI Recommended */}
          {recommended.length > 0 && (
            <div className="mt-3">
              <h3 className="mb-1.5 pl-4 text-[12px] font-semibold uppercase tracking-wide text-purple">
                AIおすすめ
              </h3>
              <div className="rounded-[10px] bg-bg-grouped-secondary p-3">
                <div className="flex flex-wrap gap-1.5">
                  {recommended
                    .filter((r) => !wantRecipes.some((w) => w.id === r.id))
                    .filter((r) => !popular.some((p) => p.id === r.id))
                    .slice(0, 10)
                    .map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setWantRecipes((prev) => [...prev, { id: r.id, title: r.title }])}
                        className="flex max-w-full items-start gap-1 rounded-[12px] bg-purple/10 px-2.5 py-1.5 text-left text-[13px] font-medium text-purple active:bg-purple/20"
                      >
                        {r.is_favorite && (
                          <Heart size={10} className="mt-[3px] shrink-0 fill-red text-red" />
                        )}
                        <span className="whitespace-normal break-words leading-[1.3]">{r.title}</span>
                      </button>
                    ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[12px] bg-blue text-[17px] font-semibold text-white active:opacity-80 ease-ios transition-opacity"
        >
          <Sparkles size={18} strokeWidth={2} />
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
        className="flex flex-1 items-center justify-center gap-1 rounded-[8px] border border-dashed border-separator py-2 text-[12px] font-medium text-label-tertiary active:bg-fill"
      >
        <span className="text-label-secondary">{label}</span>
        <span className="text-label-tertiary">スキップ</span>
      </button>
    );
  }

  return (
    <div className="flex flex-1 items-center gap-1 rounded-[8px] bg-fill-tertiary p-1">
      {/* Label (non-clickable) */}
      <span className="flex h-7 w-6 shrink-0 items-center justify-center text-[11px] font-semibold text-label-secondary">
        {label}
      </span>
      {/* Servings */}
      <div className="flex flex-1 gap-0.5">
        {[1, 2].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onServingsChange(n)}
            className={`flex-1 rounded-[6px] py-1.5 text-[12px] font-semibold transition-colors ${
              config.servings === n
                ? "bg-blue text-white"
                : "text-label-secondary active:bg-fill"
            }`}
          >
            {n}人
          </button>
        ))}
      </div>
      {/* Explicit skip button */}
      <button
        type="button"
        onClick={onToggle}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-label-tertiary active:bg-fill"
        aria-label="スキップ"
      >
        <X size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}
