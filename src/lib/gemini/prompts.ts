import type { SupabaseClient } from "@supabase/supabase-js";

export type MealPlanContext = {
  today: string;
  weekStartDate: string;
  weekEndDate: string;
  recentMeals: {
    date: string;
    meal_type: "lunch" | "dinner";
    title: string;
  }[];
};

export function buildSystemPrompt(context: MealPlanContext): string {
  return `あなたはホットクック料理のプロフェッショナルな献立アドバイザーです。

## 基本ルール
- ホットクックで作れるレシピを優先提案する
- 食材を無駄なく使い切る献立を組む
- 1人分と2人分の献立を区別する
- meal_typeは「lunch」と「dinner」のみ（朝食なし）
- ユーザーが「確定」「これでOK」等と言うまで save_weekly_menu を呼ばない
- 提案時は必ず propose_weekly_menu を使って構造化データで返す

## 提案のコツ
- 同じ食材を複数の献立で活用する（例：大根→煮物＋味噌汁）
- 作り置きできるものは2日分で提案
- 調理時間が短いものを昼食に、じっくり系を夕食に
- 前回と同じメニューは避ける（直近の献立を参照）

## コンテキスト情報
- 今日の日付: ${context.today}
- 提案対象の週: ${context.weekStartDate} 〜 ${context.weekEndDate}
- ユーザーの入力（残り物・予定）: 会話から読み取る

## 直近2週間の献立（マンネリ防止）
${context.recentMeals.length > 0
    ? context.recentMeals.map(m => `${m.date} ${m.meal_type}: ${m.title}`).join("\n")
    : "なし（初回利用）"
  }

## 応答スタイル
- カジュアルで親しみやすい日本語
- 「〜はどうですか？」「〜にしましょうか」のような提案型
- 食材の使い回しポイントを説明する`;
}

function getNextMonday(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function getNextSunday(dateStr: string): string {
  const monday = getNextMonday(dateStr);
  const d = new Date(monday);
  d.setDate(d.getDate() + 6);
  return d.toISOString().split("T")[0];
}

export async function buildContext(
  supabase: SupabaseClient,
  overrideWeekStart?: string
): Promise<MealPlanContext> {
  const today = new Date().toISOString().split("T")[0];
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];

  const { data: recentSlots } = await supabase
    .from("meal_slots")
    .select("date, meal_type, recipes(title)")
    .gte("date", twoWeeksAgo)
    .eq("is_skipped", false)
    .not("recipe_id", "is", null)
    .order("date", { ascending: false });

  return {
    today,
    weekStartDate: overrideWeekStart || getNextMonday(today),
    weekEndDate: overrideWeekStart
      ? (() => { const d = new Date(overrideWeekStart); d.setDate(d.getDate() + 6); return d.toISOString().split("T")[0]; })()
      : getNextSunday(today),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recentMeals: (recentSlots || []).map((s: any) => ({
      date: s.date as string,
      meal_type: s.meal_type as "lunch" | "dinner",
      title: (s.recipes as { title: string } | null)?.title || "",
    })),
  };
}
