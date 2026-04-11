"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Check,
  SkipForward,
  ChefHat,
  MoreHorizontal,
  Sun,
  Moon,
  ChevronRight,
  BookOpen,
  Replace,
  Search,
  X,
  Heart,
  RotateCcw,
  Sparkles,
  Clock,
} from "lucide-react";
import type { MealSlotResponse } from "@/types/weekly-menu";
import type { RecipeListItem } from "@/types/recipe";
import type { ApiResponse } from "@/types/common";

type AiCandidate = {
  recipe_id: string;
  title: string;
  reason: string;
  cook_method: "hotcook" | "stove" | "other";
  cook_time_min: number | null;
};

type Props = {
  slot: MealSlotResponse | null;
  mealType: "lunch" | "dinner";
  isToday?: boolean;
  onUpdate?: () => void;
};

export default function MealSlotRow({ slot, mealType, isToday, onUpdate }: Props) {
  const [acting, setActing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isLunch = mealType === "lunch";
  const MealIcon = isLunch ? Sun : Moon;
  const mealLabel = isLunch ? "昼" : "夜";
  const mealColor = isLunch ? "text-orange" : "text-indigo";

  const handleCooked = useCallback(async () => {
    if (!slot || acting) return;
    setActing(true);
    try {
      await fetch(`/api/meal-slots/${slot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cooked: true }),
      });
      onUpdate?.();
    } catch {
      /* ignore */
    } finally {
      setActing(false);
      setMenuOpen(false);
    }
  }, [slot, acting, onUpdate]);

  const handleSkip = useCallback(async () => {
    if (!slot || acting) return;
    setActing(true);
    try {
      await fetch(`/api/meal-slots/${slot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_skipped: true, memo: "スキップ" }),
      });
      onUpdate?.();
    } catch {
      /* ignore */
    } finally {
      setActing(false);
      setMenuOpen(false);
    }
  }, [slot, acting, onUpdate]);

  const handleUnskip = useCallback(async () => {
    if (!slot || acting) return;
    setActing(true);
    try {
      await fetch(`/api/meal-slots/${slot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_skipped: false, memo: null }),
      });
      onUpdate?.();
    } catch {
      /* ignore */
    } finally {
      setActing(false);
      setMenuOpen(false);
    }
  }, [slot, acting, onUpdate]);

  const handleSwap = useCallback(
    async (newRecipeId: string) => {
      if (!slot || acting) return;
      setActing(true);
      try {
        await fetch(`/api/meal-slots/${slot.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipe_id: newRecipeId }),
        });
        onUpdate?.();
      } catch {
        /* ignore */
      } finally {
        setActing(false);
        setMenuOpen(false);
      }
    },
    [slot, acting, onUpdate]
  );

  // No slot
  if (!slot) {
    return (
      <div className="flex min-h-[44px] items-center gap-3 px-4 py-2.5">
        <MealIcon size={18} className={mealColor} strokeWidth={1.5} />
        <span className="text-[17px] text-label-tertiary">{mealLabel} · 未設定</span>
      </div>
    );
  }

  // Skipped
  if (slot.is_skipped) {
    return (
      <div className="flex min-h-[44px] items-center gap-3 px-4 py-2.5 opacity-50">
        <MealIcon size={18} className="text-gray" strokeWidth={1.5} />
        <span className="flex-1 text-[17px] text-label-secondary line-through">
          {slot.recipe_title || "スキップ"}
        </span>
        <button
          type="button"
          onClick={handleUnskip}
          disabled={acting}
          className="shrink-0 rounded-full p-2 text-blue active:bg-fill disabled:opacity-50"
          aria-label="スキップ解除"
        >
          <RotateCcw size={14} strokeWidth={2} />
        </button>
      </div>
    );
  }

  // Cooked (新フラグ cooked_at を優先、旧 memo="調理済み" もフォールバック)
  if (slot.cooked_at != null || slot.memo === "調理済み") {
    return (
      <div className="flex min-h-[44px] items-center gap-3 px-4 py-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green">
          <Check size={16} className="text-white" strokeWidth={3} />
        </div>
        <span className="flex-1 text-[17px] text-label-secondary">
          {slot.recipe_title || "完了"}
        </span>
        <span className="text-[15px] text-label-tertiary">{slot.servings}人</span>
      </div>
    );
  }

  // TODAY — buttons always visible
  if (isToday) {
    return (
      <>
        <div>
          <div className="flex min-h-[44px] items-center gap-3 px-4 py-2.5">
            <MealIcon size={18} className={`shrink-0 ${mealColor}`} strokeWidth={1.5} />
            {slot.recipe_id ? (
              <Link
                href={`/menu/${slot.recipe_id}?servings=${slot.servings}`}
                className="min-w-0 flex-1 truncate text-[17px] text-label active:text-blue"
              >
                {slot.recipe_title}
              </Link>
            ) : (
              <span className="min-w-0 flex-1 truncate text-[17px] text-label-tertiary">
                {slot.memo || "未設定"}
              </span>
            )}
            <span className="shrink-0 text-[15px] text-label-tertiary">{slot.servings}人</span>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-label-tertiary active:bg-fill"
              aria-label="アクション"
            >
              <MoreHorizontal size={18} strokeWidth={2} />
            </button>
          </div>

          {/* Inline action bar (today 向けの主ボタン) */}
          <div className="flex gap-2 px-4 pb-3 pt-1">
            {slot.recipe_id && (
              <Link
                href={`/menu/${slot.recipe_id}?servings=${slot.servings}`}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-fill px-3 py-2 text-[15px] font-medium text-blue active:bg-fill-secondary"
              >
                <BookOpen size={14} strokeWidth={2} />
                調理
              </Link>
            )}
            <button
              type="button"
              onClick={handleCooked}
              disabled={acting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-fill px-3 py-2 text-[15px] font-medium text-green active:bg-fill-secondary disabled:opacity-50"
            >
              <ChefHat size={14} strokeWidth={2} />
              作った
            </button>
            <button
              type="button"
              onClick={handleSkip}
              disabled={acting}
              className="flex items-center justify-center gap-1.5 rounded-[10px] bg-fill px-3 py-2 text-[15px] font-medium text-gray active:bg-fill-secondary disabled:opacity-50"
              aria-label="スキップ"
            >
              <SkipForward size={14} strokeWidth={2} />
            </button>
          </div>
        </div>

        <MealSlotActionSheet
          open={menuOpen}
          onOpenChange={setMenuOpen}
          slot={slot}
          acting={acting}
          onCooked={handleCooked}
          onSkip={handleSkip}
          onSwap={handleSwap}
        />
      </>
    );
  }

  // Non-today: compact row with ... menu
  return (
    <>
      <div className="flex min-h-[44px] items-center gap-3 px-4 py-2.5">
        <MealIcon size={18} className={`shrink-0 ${mealColor}`} strokeWidth={1.5} />
        {slot.recipe_id ? (
          <Link
            href={`/menu/${slot.recipe_id}?servings=${slot.servings}`}
            className="min-w-0 flex-1 truncate text-[17px] text-label active:text-blue"
          >
            {slot.recipe_title}
          </Link>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[17px] text-label-tertiary">
            {slot.memo || "未設定"}
          </span>
        )}
        <span className="shrink-0 text-[15px] text-label-tertiary">{slot.servings}人</span>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-label-tertiary active:bg-fill"
          aria-label="アクション"
        >
          <MoreHorizontal size={18} strokeWidth={2} />
        </button>
      </div>

      <MealSlotActionSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        slot={slot}
        acting={acting}
        onCooked={handleCooked}
        onSkip={handleSkip}
        onSwap={handleSwap}
      />
    </>
  );
}

/**
 * 献立スロット用のボトムシート。
 * - デフォルト: 調理 / 作った / スキップ / 差し替え
 * - 差し替えモード: レシピ名検索 → 選択で PATCH
 */
function MealSlotActionSheet({
  open,
  onOpenChange,
  slot,
  acting,
  onCooked,
  onSkip,
  onSwap,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slot: MealSlotResponse;
  acting: boolean;
  onCooked: () => void;
  onSkip: () => void;
  onSwap: (recipeId: string) => void;
}) {
  const [mode, setMode] = useState<"menu" | "swap" | "ai">("menu");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RecipeListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // AIおまかせ用のstate
  const [aiCandidates, setAiCandidates] = useState<AiCandidate[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiFreeText, setAiFreeText] = useState("");

  // シートを開くたびにモードをリセット
  useEffect(() => {
    if (open) {
      setMode("menu");
      setQuery("");
      setResults([]);
      setAiCandidates([]);
      setAiError(null);
      setAiFreeText("");
    }
  }, [open]);

  const fetchAiCandidates = useCallback(
    async (freeText?: string) => {
      setAiLoading(true);
      setAiError(null);
      setAiCandidates([]);
      try {
        const res = await fetch(`/api/meal-slots/${slot.id}/propose`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ free_text: freeText ?? "" }),
        });
        const json: ApiResponse<{ candidates: AiCandidate[] }> = await res.json();
        if (json.error || !json.data) {
          setAiError(json.error || "AI提案に失敗しました");
          return;
        }
        setAiCandidates(json.data.candidates);
      } catch {
        setAiError("通信エラーが発生しました");
      } finally {
        setAiLoading(false);
      }
    },
    [slot.id]
  );

  // デバウンスレシピ検索
  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    if (mode !== "swap") return;
    // 空検索時は「人気/全件」を出す
    const q = query.trim();
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        params.set("limit", "20");
        const res = await fetch(`/api/recipes?${params}`);
        const json: ApiResponse<RecipeListItem[]> = await res.json();
        setResults(json.data ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(searchTimerRef.current);
  }, [mode, query]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-h-[85vh] max-w-lg overflow-hidden rounded-t-[14px] bg-bg-secondary pb-safe shadow-2xl">
          <div className="flex justify-center pt-2 pb-1">
            <div className="h-1 w-9 rounded-full bg-gray3" />
          </div>

          <div className="flex items-center justify-between px-4 py-2">
            {mode === "menu" ? (
              <Dialog.Close className="text-[17px] text-blue active:opacity-60">
                閉じる
              </Dialog.Close>
            ) : (
              <button
                type="button"
                onClick={() => setMode("menu")}
                className="text-[17px] text-blue active:opacity-60"
              >
                戻る
              </button>
            )}
            <Dialog.Title className="truncate px-3 text-[17px] font-semibold text-label">
              {mode === "swap"
                ? "レシピ差し替え"
                : mode === "ai"
                ? "AIにおまかせ"
                : slot.recipe_title || "メニュー操作"}
            </Dialog.Title>
            <span className="w-10" />
          </div>

          {mode === "ai" ? (
            <div className="flex flex-col px-4 pb-4 pt-2">
              {/* 自由入力欄 */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  fetchAiCandidates(aiFreeText.trim() || undefined);
                }}
              >
                <div className="relative">
                  <Sparkles
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-purple"
                    strokeWidth={2}
                  />
                  <input
                    type="text"
                    value={aiFreeText}
                    onChange={(e) => setAiFreeText(e.target.value)}
                    placeholder="さっぱりしたい・肉系 など（任意）"
                    className="w-full rounded-[10px] bg-fill-tertiary py-2.5 pl-9 pr-20 text-[15px] text-label placeholder:text-label-tertiary focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={aiLoading}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[7px] bg-purple px-2.5 py-1 text-[12px] font-semibold text-white active:opacity-70 disabled:opacity-40"
                  >
                    再提案
                  </button>
                </div>
              </form>

              <div className="mt-3 max-h-[55vh] overflow-y-auto">
                {aiLoading ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-10">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple border-t-transparent" />
                    <p className="text-[13px] text-label-tertiary">AIが候補を考えています…</p>
                  </div>
                ) : aiError ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <p className="text-[13px] text-red">{aiError}</p>
                    <button
                      type="button"
                      onClick={() => fetchAiCandidates(aiFreeText.trim() || undefined)}
                      className="rounded-[10px] bg-fill px-4 py-2 text-[13px] font-medium text-blue active:bg-fill-secondary"
                    >
                      もう一度試す
                    </button>
                  </div>
                ) : aiCandidates.length === 0 ? (
                  <div className="py-10 text-center text-[13px] text-label-tertiary">
                    候補なし
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {aiCandidates.map((c, idx) => (
                      <button
                        key={c.recipe_id}
                        type="button"
                        onClick={() => onSwap(c.recipe_id)}
                        disabled={acting}
                        className="flex flex-col gap-1.5 rounded-[12px] bg-bg-grouped-secondary p-3.5 text-left active:bg-fill disabled:opacity-50"
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple/15 text-[11px] font-bold text-purple">
                            {idx + 1}
                          </span>
                          <span className="flex-1 text-[17px] font-medium text-label">
                            {c.title}
                          </span>
                          {c.cook_method === "hotcook" && (
                            <ChefHat
                              size={13}
                              className="mt-1 shrink-0 text-label-tertiary"
                              strokeWidth={1.5}
                            />
                          )}
                        </div>
                        <div className="flex items-start gap-2 pl-7">
                          <p className="flex-1 text-[13px] leading-[18px] text-label-secondary">
                            {c.reason}
                          </p>
                        </div>
                        {c.cook_time_min != null && (
                          <div className="flex items-center gap-1 pl-7 text-[11px] text-label-tertiary">
                            <Clock size={10} strokeWidth={2} />
                            {c.cook_time_min}分
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : mode === "menu" ? (
            <div className="flex flex-col gap-2 px-4 pb-4 pt-2">
              {slot.recipe_id && (
                <Link
                  href={`/menu/${slot.recipe_id}?servings=${slot.servings}`}
                  onClick={() => onOpenChange(false)}
                  className="flex h-12 items-center gap-3 rounded-[10px] bg-bg-grouped-secondary px-4 text-[17px] font-medium text-blue active:bg-fill"
                >
                  <BookOpen size={18} strokeWidth={2} />
                  調理を開始
                </Link>
              )}
              <button
                type="button"
                onClick={onCooked}
                disabled={acting}
                className="flex h-12 items-center gap-3 rounded-[10px] bg-bg-grouped-secondary px-4 text-[17px] font-medium text-green active:bg-fill disabled:opacity-50"
              >
                <ChefHat size={18} strokeWidth={2} />
                作った（在庫から減算）
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("ai");
                  fetchAiCandidates();
                }}
                disabled={acting}
                className="flex h-12 items-center gap-3 rounded-[10px] bg-bg-grouped-secondary px-4 text-[17px] font-medium text-purple active:bg-fill disabled:opacity-50"
              >
                <Sparkles size={18} strokeWidth={2} />
                AIにおまかせ
              </button>
              <button
                type="button"
                onClick={() => setMode("swap")}
                disabled={acting}
                className="flex h-12 items-center gap-3 rounded-[10px] bg-bg-grouped-secondary px-4 text-[17px] font-medium text-label active:bg-fill disabled:opacity-50"
              >
                <Replace size={18} strokeWidth={2} />
                別のレシピに差し替え
              </button>
              <button
                type="button"
                onClick={onSkip}
                disabled={acting}
                className="flex h-12 items-center gap-3 rounded-[10px] bg-bg-grouped-secondary px-4 text-[17px] font-medium text-gray active:bg-fill disabled:opacity-50"
              >
                <SkipForward size={18} strokeWidth={2} />
                スキップ（外食など）
              </button>
            </div>
          ) : (
            <div className="flex flex-col px-4 pb-4 pt-2">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-label-tertiary"
                  strokeWidth={2}
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="レシピ名で検索..."
                  autoFocus
                  className="w-full rounded-[10px] bg-fill-tertiary py-2.5 pl-9 pr-9 text-[17px] text-label placeholder:text-label-tertiary focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-label-tertiary"
                  >
                    <X size={14} strokeWidth={2.5} />
                  </button>
                )}
              </div>

              <div className="mt-3 max-h-[50vh] overflow-y-auto">
                {searching ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue border-t-transparent" />
                  </div>
                ) : results.length === 0 ? (
                  <div className="py-8 text-center text-[13px] text-label-tertiary">
                    該当するレシピがありません
                  </div>
                ) : (
                  <div className="cell-separator overflow-hidden rounded-[10px] bg-bg-grouped-secondary">
                    {results
                      .filter((r) => r.id !== slot.recipe_id)
                      .map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => onSwap(r.id)}
                          disabled={acting}
                          className="flex min-h-[48px] w-full items-center gap-2 px-4 py-2 text-left active:bg-fill disabled:opacity-50"
                        >
                          {r.is_favorite && (
                            <Heart size={11} className="shrink-0 fill-red text-red" />
                          )}
                          <span className="flex-1 truncate text-[17px] text-label">
                            {r.title}
                          </span>
                          {r.cook_method === "hotcook" && (
                            <ChefHat
                              size={12}
                              className="shrink-0 text-label-tertiary"
                              strokeWidth={1.5}
                            />
                          )}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
