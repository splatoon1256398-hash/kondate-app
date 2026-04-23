# 献立アプリ AI機能設計書

## 概要

Gemini 2.5 Flash を使用したAI献立提案機能。
Function Callingで献立のDB保存と買い物リスト生成を自動実行する。

## レシピ選定ポリシー (2026-04 改訂)

**Gemini生成優先 + DB参考ハイブリッド** へ転換:

- 旧: DB既存レシピを第一選択、新規生成は最後の手段 → ヘルシオデリ系宅配キットが混入し、機種・在庫・要望に合わない固定レシピが提示される問題があった
- 新: Gemini が機種 (KN-HW24H 等)・人数・在庫・要望を踏まえ**オリジナル配合**を生成する。DBレシピは「過去に高評価だった参考候補」として、殿堂入り/★3.5+/直近使用のみ絞り込んでプロンプト注入 (最大 60 件)
- DBの再利用も可: 殿堂入りレシピをアレンジした場合は `slot.adapted_from_recipe_id` を立て、DBへ保存するとき `recipes.source_recipe_id` に記録 (リネージ追跡)
- ヘルシオデリ系除外: `recipes.is_kit=true` または材料 < 3 件 & `source='imported'` のレシピはプロンプト候補・相談候補ともに除外 (`src/lib/utils/recipe-filter.ts`)

## 相談チャット (consult)

`ConsultRequest.context.recipe_context` の有無でモード分岐:

| モード | 用途 | FC | System Prompt |
|--------|------|----|---------------|
| 候補提案 (既存) | 「今夜何作る？」のカジュアル相談 | `suggest_dinner_candidates` | DBレシピ絞り込みリスト + 在庫 |
| レシピ調整 (新規) | レシピ詳細画面「Geminiに相談」経由。特定レシピを調整 | なし (会話テキストのみ) | 対象レシピ全文 + 機種 |

レシピ調整モードでは `suggest_dinner_candidates` を登録せず、代替材料・辛さ調整・Tips を会話で返す。

## モデル

| 項目 | 値 |
|------|-----|
| モデル | gemini-2.5-flash |
| 入力コスト | $0.15 / 100万トークン |
| 出力コスト | $0.60 / 100万トークン |
| 月間想定コスト | 数十円（週1〜2回、各数千トークン） |
| Function Calling | 対応 |

家計簿アプリと同じGemini APIキーを共有。

## システムプロンプト

```typescript
// lib/gemini/prompts.ts

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
  ? context.recentMeals.map(m => `${m.date} ${m.meal_type}: ${m.title}`).join('\n')
  : 'なし（初回利用）'
}

## 応答スタイル
- カジュアルで親しみやすい日本語
- 「〜はどうですか？」「〜にしましょうか」のような提案型
- 食材の使い回しポイントを説明する`;
}
```

## コンテキスト注入

```typescript
// lib/gemini/prompts.ts

export type MealPlanContext = {
  today: string;                    // "2026-04-03"
  weekStartDate: string;            // "2026-04-06"（次の月曜）
  weekEndDate: string;              // "2026-04-12"
  recentMeals: {
    date: string;
    meal_type: "lunch" | "dinner";
    title: string;
  }[];
};

// サーバー側でコンテキストを構築
export async function buildContext(supabase: SupabaseClient): Promise<MealPlanContext> {
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
    weekStartDate: getNextMonday(today),
    weekEndDate: getNextSunday(today),
    recentMeals: (recentSlots || []).map(s => ({
      date: s.date,
      meal_type: s.meal_type,
      title: s.recipes?.title || "",
    })),
  };
}
```

## Function Calling 定義

3つのFunction Callingを定義。Geminiが会話の流れに応じて自動発火する。

```typescript
// lib/gemini/functions.ts

export const functionDeclarations = [
  // ① 献立提案
  {
    name: "propose_weekly_menu",
    description: "1週間の献立を提案する。ユーザーに確認してもらうためのプレビュー表示用。DBには保存しない。",
    parameters: {
      type: "object",
      properties: {
        week_start_date: {
          type: "string",
          description: "週の開始日（月曜）。YYYY-MM-DD形式",
        },
        slots: {
          type: "array",
          description: "各食事枠の提案",
          items: {
            type: "object",
            properties: {
              date: { type: "string", description: "日付 YYYY-MM-DD" },
              meal_type: { type: "string", enum: ["lunch", "dinner"] },
              servings: { type: "integer", description: "人数 1 or 2" },
              is_skipped: { type: "boolean", description: "外食等でスキップ" },
              recipe: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  servings_base: { type: "integer" },
                  cook_method: { type: "string", enum: ["hotcook", "stove", "other"] },
                  hotcook_menu_number: { type: "string" },
                  hotcook_unit: { type: "string" },
                  prep_time_min: { type: "integer" },
                  cook_time_min: { type: "integer" },
                  ingredients: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        amount: { type: "number" },
                        unit: { type: "string" },
                        sort_order: { type: "integer" },
                      },
                      required: ["name", "amount", "unit", "sort_order"],
                    },
                  },
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        step_number: { type: "integer" },
                        instruction: { type: "string" },
                        tip: { type: "string" },
                      },
                      required: ["step_number", "instruction"],
                    },
                  },
                },
                required: ["title", "servings_base", "cook_method", "ingredients", "steps"],
              },
            },
            required: ["date", "meal_type", "servings"],
          },
        },
      },
      required: ["week_start_date", "slots"],
    },
  },

  // ② 献立確定・保存
  {
    name: "save_weekly_menu",
    description: "ユーザーが「確定」「これでOK」と言った時のみ呼ぶ。提案した献立をDBに保存する。",
    parameters: {
      type: "object",
      properties: {
        week_start_date: {
          type: "string",
          description: "週の開始日（月曜）。YYYY-MM-DD形式",
        },
        slots: {
          type: "array",
          description: "確定する全食事枠（propose_weekly_menuと同じ構造）",
          items: {
            type: "object",
            properties: {
              date: { type: "string" },
              meal_type: { type: "string", enum: ["lunch", "dinner"] },
              servings: { type: "integer" },
              is_skipped: { type: "boolean" },
              memo: { type: "string" },
              recipe: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  servings_base: { type: "integer" },
                  cook_method: { type: "string", enum: ["hotcook", "stove", "other"] },
                  hotcook_menu_number: { type: "string" },
                  hotcook_unit: { type: "string" },
                  prep_time_min: { type: "integer" },
                  cook_time_min: { type: "integer" },
                  ingredients: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        amount: { type: "number" },
                        unit: { type: "string" },
                        sort_order: { type: "integer" },
                      },
                      required: ["name", "amount", "unit", "sort_order"],
                    },
                  },
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        step_number: { type: "integer" },
                        instruction: { type: "string" },
                        tip: { type: "string" },
                      },
                      required: ["step_number", "instruction"],
                    },
                  },
                },
                required: ["title", "servings_base", "cook_method", "ingredients", "steps"],
              },
            },
            required: ["date", "meal_type", "servings"],
          },
        },
      },
      required: ["week_start_date", "slots"],
    },
  },

  // ③ 買い物リスト生成
  {
    name: "generate_shopping_list",
    description: "献立確定後に自動で呼ばれる。全レシピの食材を集約して買い物リストを生成する。",
    parameters: {
      type: "object",
      properties: {
        weekly_menu_id: {
          type: "string",
          description: "save_weekly_menuで返されたweekly_menu_id",
        },
      },
      required: ["weekly_menu_id"],
    },
  },
];
```

## Function Call 実行ハンドラ

```typescript
// lib/gemini/handlers.ts

import { aggregateIngredients } from "@/lib/utils/aggregate-ingredients";

// save_weekly_menu の実行
export async function executeSaveWeeklyMenu(
  supabase: SupabaseClient,
  args: SaveWeeklyMenuArgs
): Promise<SaveResult> {
  // 1. weekly_menus を UPSERT（同じ週が既にあれば上書き）
  const { data: menu } = await supabase
    .from("weekly_menus")
    .upsert({
      week_start_date: args.week_start_date,
      status: "confirmed",
      updated_at: new Date().toISOString(),
    }, { onConflict: "week_start_date" })
    .select("id")
    .single();

  // 既存のmeal_slotsを削除（上書き）
  await supabase
    .from("meal_slots")
    .delete()
    .eq("weekly_menu_id", menu.id);

  // 2. 各slotのレシピを保存
  for (const slot of args.slots) {
    let recipeId: string | null = null;

    if (slot.recipe && !slot.is_skipped) {
      // レシピの重複チェック（タイトルで検索）
      const { data: existing } = await supabase
        .from("recipes")
        .select("id")
        .eq("title", slot.recipe.title)
        .maybeSingle();

      if (existing) {
        recipeId = existing.id;
      } else {
        // 新規レシピ INSERT
        const { data: newRecipe } = await supabase
          .from("recipes")
          .insert({
            title: slot.recipe.title,
            description: slot.recipe.description,
            servings_base: slot.recipe.servings_base,
            cook_method: slot.recipe.cook_method,
            hotcook_menu_number: slot.recipe.hotcook_menu_number,
            hotcook_unit: slot.recipe.hotcook_unit,
            prep_time_min: slot.recipe.prep_time_min,
            cook_time_min: slot.recipe.cook_time_min,
            source: "ai",
          })
          .select("id")
          .single();

        recipeId = newRecipe.id;

        // recipe_ingredients INSERT
        await supabase
          .from("recipe_ingredients")
          .insert(slot.recipe.ingredients.map(i => ({
            recipe_id: recipeId,
            ...i,
          })));

        // recipe_steps INSERT
        await supabase
          .from("recipe_steps")
          .insert(slot.recipe.steps.map(s => ({
            recipe_id: recipeId,
            ...s,
          })));
      }
    }

    // 3. meal_slots INSERT
    await supabase.from("meal_slots").insert({
      weekly_menu_id: menu.id,
      date: slot.date,
      meal_type: slot.meal_type,
      servings: slot.servings,
      recipe_id: recipeId,
      memo: slot.memo,
      is_skipped: slot.is_skipped || false,
    });
  }

  return { weekly_menu_id: menu.id, saved_slots: args.slots.length };
}

// generate_shopping_list の実行
// ※ aggregateIngredients は lib/utils/aggregate-ingredients.ts の共通関数を使用
//   POST /api/weekly-menus/[id]/confirm でも同じ関数を呼ぶ
export async function executeGenerateShoppingList(
  supabase: SupabaseClient,
  args: { weekly_menu_id: string }
): Promise<ShoppingListResult> {
  // 1. meal_slots + recipes + recipe_ingredients を取得
  const { data: slots } = await supabase
    .from("meal_slots")
    .select("servings, recipes ( servings_base, recipe_ingredients (*) )")
    .eq("weekly_menu_id", args.weekly_menu_id)
    .eq("is_skipped", false)
    .not("recipe_id", "is", null);

  // 2. 食材集約（共通関数を使用）
  const aggregatedItems = aggregateIngredients(slots || []);

  // 3. shopping_lists INSERT
  const { data: list } = await supabase
    .from("shopping_lists")
    .insert({
      weekly_menu_id: args.weekly_menu_id,
      status: "active",
    })
    .select("id")
    .single();

  // 4. shopping_items 一括 INSERT
  await supabase
    .from("shopping_items")
    .insert(aggregatedItems.map(item => ({
      shopping_list_id: list.id,
      name: item.name,
      amount: item.totalAmount,
      unit: item.unit,
      category: item.category,
      is_checked: false,
    })));

  return {
    shopping_list_id: list.id,
    items: aggregatedItems,
  };
}
```

## 食材集約ロジック（共通関数）

```typescript
// lib/utils/aggregate-ingredients.ts

type SlotWithRecipe = {
  servings: number;
  recipes: {
    servings_base: number;
    recipe_ingredients: {
      name: string;
      amount: number;
      unit: string;
    }[];
  } | null;
};

type AggregatedItem = {
  name: string;
  totalAmount: number;
  unit: string;
  category: string;
};

/**
 * 食材集約ロジック
 * - 同一食材名 + 同一単位 → 合算
 * - 同一食材名 + 異なる単位 → 別行
 * - servings比で分量調整
 *
 * confirm API（POST /api/weekly-menus/[id]/confirm）と
 * generate_shopping_list FC の両方からこの関数を呼ぶ
 */
export function aggregateIngredients(slots: SlotWithRecipe[]): AggregatedItem[] {
  const map = new Map<string, AggregatedItem>();

  for (const slot of slots) {
    if (!slot.recipes) continue;

    const ratio = slot.servings / slot.recipes.servings_base;

    for (const ing of slot.recipes.recipe_ingredients) {
      // キーは「食材名 + 単位」の組み合わせ
      const key = `${ing.name}::${ing.unit}`;
      const adjusted = ing.amount * ratio;

      if (map.has(key)) {
        map.get(key)!.totalAmount += adjusted;
      } else {
        map.set(key, {
          name: ing.name,
          totalAmount: adjusted,
          unit: ing.unit,
          category: guessCategory(ing.name),
        });
      }
    }
  }

  return Array.from(map.values());
}

function guessCategory(name: string): string {
  const meat = ["肉", "豚", "鶏", "牛", "ひき肉", "ベーコン", "ウインナー", "鮭", "魚", "えび", "ツナ"];
  const vegetable = ["大根", "玉ねぎ", "にんじん", "キャベツ", "もやし", "ほうれん草", "白菜", "じゃがいも", "ネギ", "きのこ", "しめじ", "トマト"];
  const seasoning = ["醤油", "みりん", "酒", "砂糖", "塩", "胡椒", "味噌", "酢", "油", "バター", "だし", "コンソメ", "ケチャップ", "マヨネーズ"];

  if (meat.some(m => name.includes(m))) return "meat";
  if (vegetable.some(v => name.includes(v))) return "vegetable";
  if (seasoning.some(s => name.includes(s))) return "seasoning";
  return "other";
}
```

## SSEストリーミングのフロー

```typescript
// AIチャットのSSEイベント順序

// 1. テキスト応答（ストリーミング）
data: { "type": "text", "content": "こんな献立はどう" }
data: { "type": "text", "content": "ですか？" }

// 2. 献立提案（propose_weekly_menu FC発火）
data: {
  "type": "function_call",
  "name": "propose_weekly_menu",
  "result": {
    "week_start_date": "2026-04-06",
    "slots": [
      {
        "date": "2026-04-06",
        "meal_type": "lunch",
        "servings": 1,
        "recipe": { "title": "豚こま丼", ... }
      },
      ...
    ]
  }
}

// 3. 献立確定（save_weekly_menu FC発火）
data: {
  "type": "function_call",
  "name": "save_weekly_menu",
  "result": {
    "weekly_menu_id": "uuid-xxx",
    "saved_slots": 10
  }
}

// 4. 買い物リスト生成（generate_shopping_list FC発火）
data: {
  "type": "function_call",
  "name": "generate_shopping_list",
  "result": {
    "shopping_list_id": "uuid-yyy",
    "items": [
      { "name": "豚こま切れ肉", "totalAmount": 400, "unit": "g", "category": "meat" },
      { "name": "大根", "totalAmount": 1, "unit": "本", "category": "vegetable" }
    ]
  }
}

// 5. 終了
data: { "type": "done" }
```

## 家計簿AIチャットとの棲み分け

| 項目 | 家計簿AI | 献立AI |
|------|---------|--------|
| 用途 | 支出記録、予算照会 | 献立提案、レシピ生成 |
| FC | 支出保存、貯金操作 | 献立保存、買い物リスト生成 |
| コンテキスト | 予算・貯金状況 | 直近献立、残り物 |
| 画面 | 家計簿アプリ内チャット | 献立アプリAI提案タブ |
| セッション | 限定（DB保存なし） | 限定（DB保存なし） |

将来的にPhase 2で連携：献立AIが食費予算を参照して「予算内の献立提案」ができるようにする。
