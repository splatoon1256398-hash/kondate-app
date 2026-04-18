"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles, ShoppingCart, Loader2, Check } from "lucide-react";
import Link from "next/link";
import {
  getMonday,
  getWeekDays,
  shortDate,
  dayLabel,
  prevWeek,
  nextWeek,
  formatDate,
} from "@/lib/utils/date";
import type { WeeklyMenuResponse, MealSlotResponse } from "@/types/weekly-menu";
import type { ApiResponse } from "@/types/common";
import MealSlotRow from "./MealSlotRow";

export default function WeeklyCalendar() {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [menu, setMenu] = useState<WeeklyMenuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [justGenerated, setJustGenerated] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMenu = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/weekly-menus?week_start_date=${date}`);
      const json: ApiResponse<WeeklyMenuResponse | null> = await res.json();
      setMenu(json.data ?? null);
    } catch {
      setMenu(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMenu(weekStart);
  }, [weekStart, fetchMenu]);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const generateShoppingList = useCallback(async () => {
    if (!menu || generating) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/weekly-menus/${menu.id}/shopping-list`, {
        method: "POST",
      });
      const json: ApiResponse<{ shopping_list_id: string; items_count: number }> = await res.json();
      if (json.data) {
        setJustGenerated(true);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setJustGenerated(false), 2500);
      } else {
        alert(`買い物リストの生成に失敗しました: ${json.error ?? "不明なエラー"}`);
      }
    } catch (e) {
      alert(`通信エラー: ${e instanceof Error ? e.message : "failed"}`);
    } finally {
      setGenerating(false);
    }
  }, [menu, generating]);

  const days = getWeekDays(weekStart);
  const today = formatDate(new Date());
  const weekEndDate = days[days.length - 1];

  function slotsForDay(date: string): {
    lunch: MealSlotResponse | null;
    dinner: MealSlotResponse | null;
  } {
    if (!menu) return { lunch: null, dinner: null };
    const daySlots = menu.meal_slots.filter((s) => s.date === date);
    return {
      lunch: daySlots.find((s) => s.meal_type === "lunch") ?? null,
      dinner: daySlots.find((s) => s.meal_type === "dinner") ?? null,
    };
  }

  return (
    <div className="bg-bg-grouped">
      {/* Large Title Navigation */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <h1 className="text-[34px] font-bold leading-[41px] text-label">献立</h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setWeekStart(prevWeek(weekStart))}
              className="flex h-9 w-9 items-center justify-center rounded-full text-blue active:bg-fill"
              aria-label="前の週"
            >
              <ChevronLeft size={22} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={() => setWeekStart(nextWeek(weekStart))}
              className="flex h-9 w-9 items-center justify-center rounded-full text-blue active:bg-fill"
              aria-label="次の週"
            >
              <ChevronRight size={22} strokeWidth={2.5} />
            </button>
          </div>
        </div>
        <p className="text-[15px] text-label-secondary">
          {shortDate(weekStart)} 〜 {shortDate(weekEndDate)}
          {menu && (
            <span
              className={`ml-2 text-[13px] font-medium ${
                menu.status === "confirmed" ? "text-green" : "text-blue"
              }`}
            >
              · {menu.status === "confirmed" ? "確定済み" : "下書き"}
            </span>
          )}
        </p>
        {menu && menu.status === "confirmed" && (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={generateShoppingList}
              disabled={generating}
              className="flex h-8 items-center gap-1.5 rounded-full bg-blue/10 px-3 text-[13px] font-medium text-blue active:bg-blue/20 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <Loader2 size={12} className="animate-spin" strokeWidth={2.5} />
                  生成中...
                </>
              ) : justGenerated ? (
                <>
                  <Check size={12} strokeWidth={2.5} />
                  生成しました
                </>
              ) : (
                <>
                  <ShoppingCart size={12} strokeWidth={2.5} />
                  買い物リストを生成
                </>
              )}
            </button>
            {justGenerated && (
              <Link
                href="/shopping"
                className="text-[13px] font-medium text-blue active:opacity-60"
              >
                見に行く →
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue border-t-transparent" />
        </div>
      ) : !menu ? (
        <EmptyWeekState />
      ) : (
        <div className="px-4 pb-4">
          {days.map((date) => {
            const { lunch, dinner } = slotsForDay(date);
            const isToday = date === today;
            const isPast = date < today;
            const dayOfWeek = new Date(date).getDay();
            const isSun = dayOfWeek === 0;
            const isSat = dayOfWeek === 6;

            return (
              <div key={date} className={`mt-5 ${isPast ? "opacity-50" : ""}`}>
                {/* Section header — iOS Settings style */}
                <div className="mb-1.5 flex items-center gap-1.5 pl-4">
                  <span
                    className={`text-[13px] font-semibold uppercase tracking-wide ${
                      isToday
                        ? "text-blue"
                        : isSun
                          ? "text-red"
                          : isSat
                            ? "text-blue"
                            : "text-label-secondary"
                    }`}
                  >
                    {dayLabel(date)}曜日 · {shortDate(date)}
                  </span>
                  {isToday && (
                    <span className="rounded-full bg-blue px-1.5 text-[10px] font-bold leading-[14px] text-white">
                      TODAY
                    </span>
                  )}
                </div>

                {/* Inset grouped card */}
                <div className="cell-separator overflow-hidden rounded-[10px] bg-bg-grouped-secondary">
                  <MealSlotRow
                    slot={lunch}
                    mealType="lunch"
                    isToday={isToday}
                    onUpdate={() => fetchMenu(weekStart)}
                  />
                  <MealSlotRow
                    slot={dinner}
                    mealType="dinner"
                    isToday={isToday}
                    onUpdate={() => fetchMenu(weekStart)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyWeekState() {
  return (
    <div className="flex flex-col items-center justify-center gap-5 px-6 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-fill">
        <Sparkles size={28} className="text-blue" strokeWidth={1.5} />
      </div>
      <p className="text-[17px] text-label-secondary">この週の献立はまだありません</p>
      <Link
        href="/ai"
        className="flex h-[50px] items-center gap-2 rounded-[12px] bg-blue px-6 text-[17px] font-semibold text-white active:opacity-80 ease-ios transition-opacity"
      >
        <Sparkles size={18} strokeWidth={2} />
        AIに提案してもらう
      </Link>
    </div>
  );
}
