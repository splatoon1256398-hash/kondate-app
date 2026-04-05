"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
import MealSlotCard from "./MealSlotCard";
import EmptySlot from "./EmptySlot";

export default function WeeklyCalendar() {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [menu, setMenu] = useState<WeeklyMenuResponse | null>(null);
  const [loading, setLoading] = useState(true);

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
    <div>
      {/* Week header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => setWeekStart(prevWeek(weekStart))}
          className="rounded-lg p-2 text-muted transition-colors hover:bg-card hover:text-foreground"
          aria-label="前の週"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="text-center">
          <h2 className="text-sm font-semibold">
            {shortDate(weekStart)} 〜 {shortDate(weekEndDate)}
          </h2>
          {menu && (
            <span
              className={`text-[10px] font-medium ${
                menu.status === "confirmed"
                  ? "text-green"
                  : "text-accent"
              }`}
            >
              {menu.status === "confirmed" ? "確定済み" : "下書き"}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setWeekStart(nextWeek(weekStart))}
          className="rounded-lg p-2 text-muted transition-colors hover:bg-card hover:text-foreground"
          aria-label="次の週"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Calendar body */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : !menu ? (
        <EmptyWeekState />
      ) : (
        <div className="space-y-1 px-3">
          {days.map((date) => {
            const { lunch, dinner } = slotsForDay(date);
            const isToday = date === today;

            return (
              <div
                key={date}
                className={`rounded-xl p-2 ${
                  isToday ? "bg-accent/5 ring-1 ring-accent/20" : ""
                }`}
              >
                {/* Day label */}
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      isToday
                        ? "bg-accent text-background"
                        : "text-muted"
                    }`}
                  >
                    {dayLabel(date)}
                  </span>
                  <span className={`text-xs ${isToday ? "font-semibold text-accent" : "text-muted"}`}>
                    {shortDate(date)}
                  </span>
                </div>

                {/* Meal slots */}
                <div className="flex min-w-0 gap-2">
                  {lunch ? (
                    <MealSlotCard slot={lunch} />
                  ) : (
                    <EmptySlot date={date} mealType="lunch" />
                  )}
                  {dinner ? (
                    <MealSlotCard slot={dinner} />
                  ) : (
                    <EmptySlot date={date} mealType="dinner" />
                  )}
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
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
      <p className="text-sm text-muted">この週の献立はまだありません</p>
      <a
        href="/ai"
        className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
      >
        AIに提案してもらう
      </a>
    </div>
  );
}
