# 献立アプリ API設計書

## 設計方針

- Next.js 15 App Router の Route Handlers（`app/api/`）を使用
- Supabaseクライアントはサーバーサイドで生成
- 認証は既存の Supabase Auth（家計簿アプリと共有）
- Supabase Realtime は `shopping_items` テーブルのみ
- AI関連は Gemini 2.5 Flash + Function Calling
- レスポンスは全て `{ data, error }` 形式で統一

## APIルート一覧

```
app/api/
├── weekly-menus/
│   ├── route.ts              GET / POST
│   └── [id]/
│       ├── route.ts          GET / PATCH / DELETE
│       └── confirm/
│           └── route.ts      POST
├── meal-slots/
│   ├── route.ts              POST
│   └── [id]/
│       └── route.ts          PATCH / DELETE
├── recipes/
│   ├── route.ts              GET / POST
│   └── [id]/
│       └── route.ts          GET
├── shopping-lists/
│   ├── route.ts              GET
│   └── [id]/
│       ├── route.ts          GET / PATCH
│       └── items/
│           ├── route.ts      POST
│           └── [itemId]/
│               └── route.ts  PATCH / DELETE
└── meal-plan/
    └── chat/
        └── route.ts          POST
```

全13エンドポイント、5リソースグループ。

## 共通型定義

```typescript
// types/common.ts

type ApiResponse<T> = {
  data: T | null;
  error: string | null;
};

// HTTPステータスコード
// 200: 成功
// 201: 作成成功
// 400: バリデーションエラー
// 401: 未認証
// 404: リソースなし
// 500: サーバーエラー
```

---

## 1. Weekly Menus（週間献立）

### `GET /api/weekly-menus`

指定した週の献立を取得。weekly_menuが存在しない週は `data: null` を返す（自動作成しない）。

```typescript
// Request Query
type Query = {
  week_start_date?: string;  // YYYY-MM-DD（省略時は今週）
};

// Response
type Response = ApiResponse<{
  id: string;
  week_start_date: string;
  status: "draft" | "confirmed";
  notes: string | null;
  meal_slots: {
    id: string;
    date: string;
    meal_type: "lunch" | "dinner";
    servings: number;
    recipe_id: string | null;
    recipe_title: string | null;
    memo: string | null;
    is_skipped: boolean;
  }[];
} | null>;
```

**Supabaseクエリ:**
```typescript
const { data } = await supabase
  .from("weekly_menus")
  .select(`
    *,
    meal_slots (
      id, date, meal_type, servings, recipe_id, memo, is_skipped,
      recipes ( title )
    )
  `)
  .eq("week_start_date", weekStartDate)
  .maybeSingle();

// 存在しない場合は data: null を返す
```

### `POST /api/weekly-menus`

新しい週間献立を作成。

```typescript
// Request Body
type CreateWeeklyMenu = {
  week_start_date: string;
  notes?: string;
};

// Response
type Response = ApiResponse<{
  id: string;
  week_start_date: string;
  status: "draft";
}>;
```

### `GET /api/weekly-menus/[id]`

週間献立の詳細取得（meal_slots + recipes含む）。

### `PATCH /api/weekly-menus/[id]`

週間献立の更新（ステータス変更、メモ更新等）。

```typescript
type UpdateWeeklyMenu = {
  status?: "draft" | "confirmed";
  notes?: string;
};
```

### `DELETE /api/weekly-menus/[id]`

週間献立を削除（CASCADE で meal_slots も削除）。

### `POST /api/weekly-menus/[id]/confirm`

献立を確定し、買い物リストを自動生成する。
食材集約には `lib/utils/aggregate-ingredients.ts` の共通関数を使用。
`generate_shopping_list` FC実行時も同じ関数を呼ぶ。

```typescript
// Request Body: なし

// Response
type Response = ApiResponse<{
  weekly_menu: { id: string; status: "confirmed" };
  shopping_list: {
    id: string;
    items: {
      name: string;
      amount: number;
      unit: string;
      category: string;
    }[];
  };
}>;
```

**処理フロー:**
```typescript
import { aggregateIngredients } from "@/lib/utils/aggregate-ingredients";

// 1. weekly_menus.status → "confirmed"
await supabase
  .from("weekly_menus")
  .update({ status: "confirmed", updated_at: new Date().toISOString() })
  .eq("id", id);

// 2. meal_slots の recipe_id 経由で全 recipe_ingredients を取得
const { data: slots } = await supabase
  .from("meal_slots")
  .select("servings, recipes ( servings_base, recipe_ingredients (*) )")
  .eq("weekly_menu_id", id)
  .eq("is_skipped", false)
  .not("recipe_id", "is", null);

// 3. 共通関数で食材集約（同一名+同一単位のみ合算、異単位は別行）
const aggregatedItems = aggregateIngredients(slots || []);

// 4. shopping_lists + shopping_items を INSERT
const { data: list } = await supabase
  .from("shopping_lists")
  .insert({ weekly_menu_id: id, status: "active" })
  .select("id")
  .single();

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
```

---

## 2. Meal Slots（食事枠）

### `POST /api/meal-slots`

AI提案結果を一括で登録する際に使用。

```typescript
// Request Body
type CreateMealSlots = {
  weekly_menu_id: string;
  slots: {
    date: string;
    meal_type: "lunch" | "dinner";
    servings: number;
    recipe_id?: string;
    memo?: string;
    is_skipped?: boolean;
  }[];
};

// Response
type Response = ApiResponse<{
  id: string;
  date: string;
  meal_type: string;
}[]>;
```

### `PATCH /api/meal-slots/[id]`

個別の食事枠を更新（外食に変更、レシピ差し替え、人数変更など）。

```typescript
type UpdateMealSlot = {
  servings?: number;
  recipe_id?: string | null;
  memo?: string;
  is_skipped?: boolean;
};
```

### `DELETE /api/meal-slots/[id]`

食事枠を削除。

---

## 3. Recipes（レシピ）

### `GET /api/recipes`

レシピ検索。

```typescript
// Request Query
type Query = {
  q?: string;            // タイトル部分一致
  cook_method?: string;   // "hotcook" / "stove" / "other"
  limit?: number;         // default 20
  offset?: number;
};

// Response
type Response = ApiResponse<{
  id: string;
  title: string;
  cook_method: string;
  hotcook_menu_number: string | null;
  prep_time_min: number | null;
  cook_time_min: number | null;
  source: string;
}[]>;
```

### `POST /api/recipes`

新規レシピ登録。`save_weekly_menu` FC内で内部的に呼ばれるロジックと共通。

```typescript
type CreateRecipe = {
  title: string;
  description?: string;
  servings_base: number;
  cook_method: "hotcook" | "stove" | "other";
  hotcook_menu_number?: string;
  hotcook_unit?: string;
  prep_time_min?: number;
  cook_time_min?: number;
  source: "ai" | "manual" | "imported";
  ingredients: {
    name: string;
    amount: number;
    unit: string;
    sort_order: number;
  }[];
  steps: {
    step_number: number;
    instruction: string;
    tip?: string;
  }[];
};
```

### `GET /api/recipes/[id]`

レシピ詳細（材料 + 手順を含む）。servingsクエリで分量を自動計算。

```typescript
// Request Query
type Query = {
  servings?: number;  // 指定人数で分量計算（省略時はservings_base）
};

// Response
type Response = ApiResponse<{
  id: string;
  title: string;
  description: string | null;
  servings_base: number;
  cook_method: string;
  hotcook_menu_number: string | null;
  hotcook_unit: string | null;
  prep_time_min: number | null;
  cook_time_min: number | null;
  source: string;
  ingredients: {
    id: string;
    name: string;
    amount: number;      // servings比で計算済み
    unit: string;
    sort_order: number;
  }[];
  steps: {
    id: string;
    step_number: number;
    instruction: string;
    tip: string | null;
  }[];
}>;
```

**分量計算:**
```typescript
const ratio = servings / recipe.servings_base;
const adjustedIngredients = recipe.recipe_ingredients.map(i => ({
  ...i,
  amount: Math.round(i.amount * ratio * 10) / 10,
}));
```

---

## 4. Shopping Lists（買い物リスト）

### `GET /api/shopping-lists`

アクティブな買い物リストを取得。

```typescript
// Request Query
type Query = {
  status?: "active" | "completed";  // default "active"
};

// Response
type Response = ApiResponse<{
  id: string;
  weekly_menu_id: string;
  status: string;
  week_start_date: string;
  items: {
    id: string;
    name: string;
    amount: number | null;
    unit: string | null;
    category: string;
    is_checked: boolean;
    checked_by: string | null;
  }[];
}[]>;
```

### `GET /api/shopping-lists/[id]`

買い物リストの詳細取得。

### `PATCH /api/shopping-lists/[id]`

ステータス更新（active → completed）。

```typescript
type UpdateShoppingList = {
  status: "active" | "completed";
};
```

### `POST /api/shopping-lists/[id]/items`

手動で買い物アイテムを追加。

```typescript
type CreateShoppingItem = {
  name: string;
  amount?: number;
  unit?: string;
  category?: string;
};
```

### `PATCH /api/shopping-lists/[id]/items/[itemId]`

チェック状態の更新。Supabase Realtimeで2人に同期。

```typescript
type UpdateShoppingItem = {
  is_checked?: boolean;
  checked_by?: string;
  amount?: number;
  name?: string;
};
```

### `DELETE /api/shopping-lists/[id]/items/[itemId]`

買い物アイテムの削除。

---

## 5. AI Meal Plan Chat（AI献立提案）

### `POST /api/meal-plan/chat`

AI献立提案チャット。SSE（Server-Sent Events）でストリーミング返却。

```typescript
// Request Body
type ChatRequest = {
  messages: {
    role: "user" | "assistant";
    content: string;
  }[];
  context?: {
    week_start_date?: string;
    weekly_menu_id?: string;
    hotcook_model?: string; // 例: KN-HW24H (未指定なら KN-HW24H)
  };
};

// `/api/consult` は更に recipe_context を受ける:
type ConsultRequest = {
  messages: { role: "user" | "assistant"; content: string }[];
  context?: {
    target_date?: string;
    target_meal_type?: "lunch" | "dinner";
    hotcook_model?: string;
    /** 指定すると「レシピ調整モード」起動 (FC なし、会話のみ) */
    recipe_context?: { recipe_id: string; servings: number };
  };
};

// Response: SSE Stream
// Content-Type: text/event-stream

// SSEイベント型
type SSEEvent =
  | { type: "text"; content: string }
  | { type: "function_call"; name: string; result: unknown }
  | { type: "error"; message: string }
  | { type: "done" };
```

**サーバー側処理:**
```typescript
export async function POST(req: Request) {
  const { messages, context } = await req.json();

  // 1. コンテキスト構築
  const mealPlanContext = await buildContext(supabase);
  const systemPrompt = buildSystemPrompt(mealPlanContext);

  // 2. 直近2週間の献立を取得（マンネリ防止）
  // → buildContext 内で実行済み

  // 3. Gemini API呼び出し
  const response = await gemini.generateContent({
    model: "gemini-2.5-flash",
    systemInstruction: systemPrompt,
    contents: convertMessages(messages),
    tools: [{ functionDeclarations }],
  });

  // 4. Function Call があれば実行
  //    - save_weekly_menu → executeSaveWeeklyMenu()
  //    - generate_shopping_list → executeGenerateShoppingList()
  //      ※ aggregateIngredients 共通関数を使用

  // 5. SSE でストリーミング返却
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
```

---

## Supabase Realtime

| テーブル | イベント | 用途 | 画面 |
|----------|---------|------|------|
| `shopping_items` | UPDATE | チェック状態の同期 | 買い物リスト |
| `shopping_items` | INSERT | 手動追加の同期 | 買い物リスト |
| `shopping_items` | DELETE | 削除の同期 | 買い物リスト |

Realtimeは `shopping_items` テーブルのみ。他のテーブルは同時編集のユースケースがないため不要。

```typescript
// クライアント側 Realtime subscription
// lib/supabase/realtime.ts

export function subscribeShoppingItems(
  supabase: SupabaseClient,
  shoppingListId: string,
  onUpdate: (item: ShoppingItem) => void,
  onInsert: (item: ShoppingItem) => void,
  onDelete: (id: string) => void
) {
  return supabase
    .channel(`shopping-items-${shoppingListId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "shopping_items",
        filter: `shopping_list_id=eq.${shoppingListId}`,
      },
      (payload) => {
        switch (payload.eventType) {
          case "UPDATE": onUpdate(payload.new as ShoppingItem); break;
          case "INSERT": onInsert(payload.new as ShoppingItem); break;
          case "DELETE": onDelete(payload.old.id); break;
        }
      }
    )
    .subscribe();
}
```

---

## API → 画面 対応表

| 画面 | 使用API | 備考 |
|------|---------|------|
| 週間献立（メイン） | `GET /api/weekly-menus` | week_start_dateで週切り替え |
| 献立カードタップ → レシピ詳細 | `GET /api/recipes/[id]?servings=N` | servingsで分量計算 |
| 空スロット「+」タップ | `POST /api/meal-slots` | 手動追加 |
| 空スロット → AI提案 | `POST /api/meal-plan/chat` | SSEストリーミング |
| 献立の長押し → 編集 | `PATCH /api/meal-slots/[id]` | 外食変更、人数変更 |
| AI確定 → 買い物リスト生成 | FC内で save + generate 実行 | DB自動保存 |
| 手動で献立確定 | `POST /api/weekly-menus/[id]/confirm` | 買い物リスト自動生成 |
| 買い物リスト表示 | `GET /api/shopping-lists` | Realtime subscribe開始 |
| チェックボックスタップ | `PATCH /.../items/[itemId]` | Realtime同期 |
| 手動アイテム追加 | `POST /.../items` | Realtime同期 |

---

## ファイル構成

```
src/
├── app/api/
│   ├── weekly-menus/
│   │   ├── route.ts
│   │   └── [id]/
│   │       ├── route.ts
│   │       └── confirm/route.ts
│   ├── meal-slots/
│   │   ├── route.ts
│   │   └── [id]/route.ts
│   ├── recipes/
│   │   ├── route.ts
│   │   └── [id]/route.ts
│   ├── shopping-lists/
│   │   ├── route.ts
│   │   └── [id]/
│   │       ├── route.ts
│   │       └── items/
│   │           ├── route.ts
│   │           └── [itemId]/route.ts
│   └── meal-plan/
│       └── chat/route.ts
├── lib/
│   ├── supabase/
│   │   ├── server.ts               # サーバーサイド Supabase クライアント
│   │   └── realtime.ts             # Realtime subscription ヘルパー
│   ├── gemini/
│   │   ├── client.ts               # Gemini APIクライアント
│   │   ├── prompts.ts              # システムプロンプト + コンテキスト構築
│   │   ├── functions.ts            # Function Calling定義
│   │   └── handlers.ts             # FC実行ハンドラ
│   └── utils/
│       └── aggregate-ingredients.ts # 食材集約ロジック（共通）
└── types/
    ├── common.ts                    # ApiResponse等
    ├── weekly-menu.ts
    ├── recipe.ts
    ├── shopping-list.ts
    └── meal-plan.ts
```
