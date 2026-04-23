import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDate } from "@/lib/utils/date";
import {
  formatPantryLineForAi,
  buildUrgentConsumeSection,
} from "@/lib/utils/pantry-freshness";
import {
  getRecipeRatingsMap,
  formatRatingTag,
  buildRatingPreferenceSection,
  type RatingSummary,
} from "@/lib/utils/rating-map";
import { filterPromptRecipes } from "@/lib/utils/recipe-filter";

export type MealPlanContext = {
  today: string;
  weekStartDate: string;
  weekEndDate: string;
  hotcookModel: string;
  recentMeals: {
    date: string;
    meal_type: "lunch" | "dinner";
    title: string;
  }[];
  favoriteRecipes: { id: string; title: string; cook_method: string }[];
  ratingMap?: Map<string, RatingSummary>;
  favoriteIds?: Set<string>;
  pantryItems: {
    name: string;
    amount: number | null;
    unit: string | null;
    is_staple: boolean;
    expiry_date?: string | null;
    purchased_at?: string | null;
    category?: string | null;
  }[];
  availableRecipes: {
    id: string;
    title: string;
    cook_method: string;
    cook_time_min: number | null;
    is_favorite?: boolean;
  }[];
};

export function buildSystemPrompt(context: MealPlanContext): string {
  const nonStaplePantry = context.pantryItems.filter((i) => !i.is_staple);
  const stapleItems = context.pantryItems.filter((i) => i.is_staple);
  const urgentSection = buildUrgentConsumeSection(nonStaplePantry);
  const ratingMap = context.ratingMap || new Map<string, RatingSummary>();
  const favIds = context.favoriteIds || new Set<string>();
  const hasAnyFavorite = context.favoriteRecipes.length > 0;
  const ratingSection = buildRatingPreferenceSection(ratingMap, hasAnyFavorite);

  return `あなたは在庫ファーストなホットクック献立アドバイザーです。

## 🔴 ユーザーのホットクック機種
${context.hotcookModel}（容量・まぜ技の有無を踏まえたレシピを組むこと）

## 基本ルール
- ホットクックで作れるレシピを優先提案する
- **在庫を使い切ることが最優先**（買い物は週1まとめ、食材を腐らせない）
- 1人分と2人分の献立を区別する
- meal_typeは「lunch」と「dinner」のみ（朝食なし）
- 提案時は必ず propose_weekly_menu を使って構造化データで返す
- **確定は画面カードの「この献立で確定する」ボタンから行うのが推奨**。提案後は「下のカードの『この献立で確定する』ボタンを押してください」と案内する
- ユーザーがチャットで「確定」「これでOK」等と明示した場合のみ save_weekly_menu を呼ぶ（通常はカード側で処理される）
- save_weekly_menu を呼ぶと買い物リストは自動生成される。別途 generate_shopping_list を呼ぶ必要はない

## 🔴 重要: レシピ選択ルール（Gemini生成優先 + DB参考ハイブリッド）
以下の優先順位で献立を組む：

1. **最優先: オリジナルレシピを生成する**
   → slotに \`recipe\` オブジェクトを返す（title, ingredients, steps 必須）
   → 機種・人数・在庫・要望を踏まえた**具体的な配合**で書く
   → 下記「過去に高評価だった参考レシピ」があればアレンジ元として活用し、
     その場合は \`adapted_from_recipe_id\` に参考にした recipe_id を記録する

2. **次善: DB レシピをそのまま流用**（殿堂入りや高評価で、変更不要な場合）
   → slotに \`recipe_id\` を返す（\`recipe\` フィールドは空）
   → 下記「過去に高評価だった参考レシピ」リストからのみ選ぶこと

## 🔴 レシピ生成時のルール（厳守）
- **具体数量を必ず書く**: 醤油 大さじ1、塩 小さじ1/2、鶏もも肉 300g など（「適量」の乱発禁止）
- **ホットクック機種依存の手順を書く**: ${context.hotcookModel} の容量とまぜ技の有無に合わせる
- **制約 (乳不使用・減塩・辛さ等) があれば**: 代替材料と理由を description に 1-2 文で明記
- **宅配キット前提の材料は禁止**: 「専用ソース」「ミールキット」「ヘルシオデリ」等の汎用性のない素材名は使わず、市販素材で組み直すこと
- 「前日の残り丼」「こんにゃく炒め」のような手抜きレシピも禁止

${
  urgentSection
    ? `## 🔴 最優先: 今すぐ使い切るべき食材（腐る前に）
${urgentSection}

**↑ 上記食材は今週の献立に必ず組み込むこと。スルーすると腐って無駄になる。**
`
    : ""
}
## 🥬 冷蔵庫在庫（残日数つき・使い切り前提で献立を組む）
${nonStaplePantry.length > 0
    ? nonStaplePantry.map(formatPantryLineForAi).join("\n")
    : "（在庫なし）"}

- **在庫があるレシピを優先して選ぶ**（買い足しを最小限に）
- 期限が近い食材ほど早い曜日のスロットに配置
- 特に肉・魚・葉物野菜は早めに使う
- ${nonStaplePantry.length > 0 ? "上記在庫の少なくとも半分以上が1週間の献立内で消費される設計にする" : ""}

## 🔴 重要: 常備品（always in kitchen）
以下は常備品なので買い物リストには自動で追加されない：
${stapleItems.length > 0
    ? stapleItems.map((i) => `- ${i.name}`).join("\n")
    : "（未登録）"}

${ratingSection || ""}
## 📋 過去に高評価だった参考レシピ（${context.availableRecipes.length}件）
以下は殿堂入り・高評価 (★3.5+) ・直近使用のDBレシピ。**生成の参考にしたり、変更不要ならそのまま recipe_id で流用してよい**（キット系は除外済）：

${context.availableRecipes.length > 0
    ? context.availableRecipes
        .map((r) => `- [${r.id}] ${r.title}（${r.cook_method}${r.cook_time_min ? `, ${r.cook_time_min}分` : ""}）${formatRatingTag(ratingMap.get(r.id), favIds.has(r.id))}`)
        .join("\n")
    : "（参考レシピなし、自由に生成してよい）"}

## 提案のコツ
- 同じ食材を複数の献立で活用する（例：大根→煮物＋味噌汁）
- 作り置きできるものは2日分で提案
- 調理時間が短いものを昼食に、じっくり系を夕食に
- 前回と同じメニューは避ける（直近の献立を参照）

## コンテキスト情報
- 今日の日付: ${context.today}
- 提案対象の週: ${context.weekStartDate} 〜 ${context.weekEndDate}

## 直近2週間の献立（マンネリ防止）
${context.recentMeals.length > 0
    ? context.recentMeals.map(m => `${m.date} ${m.meal_type}: ${m.title}`).join("\n")
    : "なし（初回利用）"}

## 殿堂入りレシピ（お気に入り）
${context.favoriteRecipes.length > 0
    ? context.favoriteRecipes.map(r => `- [${r.id}] ${r.title}`).join("\n")
    : "なし"}

ユーザーが「殿堂入りから選んで」と言ったら、このリストから優先的に選ぶ。

## 応答スタイル
- カジュアルで親しみやすい日本語
- 「〜はどうですか？」「〜にしましょうか」のような提案型
- 食材の使い回しポイントを説明する
- 在庫を使い切るポイントも説明する`;
}

function getNextMonday(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  d.setDate(d.getDate() + diff);
  return formatDate(d);
}

function getNextSunday(dateStr: string): string {
  const monday = getNextMonday(dateStr);
  const d = new Date(monday);
  d.setDate(d.getDate() + 6);
  return formatDate(d);
}

export const DEFAULT_HOTCOOK_MODEL = "KN-HW24H";

export async function buildContext(
  supabase: SupabaseClient,
  overrideWeekStart?: string,
  hotcookModel: string = DEFAULT_HOTCOOK_MODEL
): Promise<MealPlanContext> {
  const today = formatDate(new Date());
  const twoWeeksAgo = formatDate(new Date(Date.now() - 14 * 86400000));

  const [
    { data: recentSlots },
    { data: favorites },
    { data: pantry },
    { data: allRecipes },
    { data: ingCounts },
    ratingMap,
  ] = await Promise.all([
    supabase
      .from("meal_slots")
      .select("date, meal_type, recipe_id, recipes(title)")
      .gte("date", twoWeeksAgo)
      .eq("is_skipped", false)
      .not("recipe_id", "is", null)
      .order("date", { ascending: false }),
    supabase
      .from("recipes")
      .select("id, title, cook_method")
      .eq("is_favorite", true)
      .limit(30),
    supabase
      .from("pantry_items")
      .select("name, amount, unit, is_staple, expiry_date, purchased_at, category")
      .order("category"),
    supabase
      .from("recipes")
      .select("id, title, cook_method, cook_time_min, source, is_favorite")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("recipe_ingredients").select("recipe_id"),
    getRecipeRatingsMap(supabase),
  ]);

  const favoriteIds = new Set(
    (favorites || []).map((r: { id: string }) => r.id)
  );

  // 材料数マップ (キット系判定に使う)
  const ingCountMap = new Map<string, number>();
  for (const row of (ingCounts || []) as { recipe_id: string }[]) {
    ingCountMap.set(row.recipe_id, (ingCountMap.get(row.recipe_id) ?? 0) + 1);
  }

  // 直近使用レシピID
  const recentRecipeIds = new Set<string>();
  for (const s of ((recentSlots as unknown as { recipe_id: string | null }[]) || [])) {
    if (s.recipe_id) recentRecipeIds.add(s.recipe_id);
  }

  const filteredRecipes = filterPromptRecipes(
    (allRecipes || []) as {
      id: string;
      title: string;
      cook_method: string;
      cook_time_min: number | null;
      source: string | null;
      is_favorite: boolean | null;
    }[],
    ingCountMap,
    ratingMap,
    recentRecipeIds
  );

  return {
    today,
    weekStartDate: overrideWeekStart || getNextMonday(today),
    weekEndDate: overrideWeekStart
      ? (() => {
          const d = new Date(overrideWeekStart);
          d.setDate(d.getDate() + 6);
          return formatDate(d);
        })()
      : getNextSunday(today),
    hotcookModel,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recentMeals: (recentSlots || []).map((s: any) => ({
      date: s.date as string,
      meal_type: s.meal_type as "lunch" | "dinner",
      title: (s.recipes as { title: string } | null)?.title || "",
    })),
    favoriteRecipes: (favorites || []).map(
      (r: { id: string; title: string; cook_method: string }) => ({
        id: r.id,
        title: r.title,
        cook_method: r.cook_method,
      })
    ),
    pantryItems: (pantry || []).map(
      (i: {
        name: string;
        amount: number | null;
        unit: string | null;
        is_staple: boolean;
        expiry_date: string | null;
        purchased_at: string | null;
        category: string | null;
      }) => ({
        name: i.name,
        amount: i.amount,
        unit: i.unit,
        is_staple: i.is_staple ?? false,
        expiry_date: i.expiry_date ?? null,
        purchased_at: i.purchased_at ?? null,
        category: i.category ?? null,
      })
    ),
    availableRecipes: filteredRecipes.map((r) => ({
      id: r.id,
      title: r.title as string,
      cook_method: r.cook_method as string,
      cook_time_min: r.cook_time_min ?? null,
      is_favorite: r.is_favorite === true,
    })),
    ratingMap,
    favoriteIds,
  };
}
