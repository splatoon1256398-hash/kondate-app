# 献立アプリ Phase 2 実装指示書

## 概要

MVP（週間献立・買い物リスト・レシピ表示・AI献立提案）が完成。
Phase 2 では以下の5機能を追加実装する。

**実装推奨順序:**
1. 売り場別リスト自動分類（既存UIの改善、低リスク）
2. 評価・殿堂入りシステム（新テーブル追加、中規模）
3. クッキングモードUI（フロントのみ、DB変更なし）
4. バーチャル冷蔵庫（新テーブル+ロジック追加、大規模）
5. 家計簿連携（外部テーブル参照、Phase 2の最後）

---

## 機能1: 売り場別リスト自動分類

### 目的
買い物リストの食材を「肉コーナー」「野菜コーナー」「調味料」「乳製品」「乾物」等、実際のスーパーの売り場に合わせて自動分類する。今のcategory（meat/vegetable/seasoning/other）を拡張する。

### DB変更

```sql
-- shopping_items の category CHECK制約を更新
ALTER TABLE shopping_items DROP CONSTRAINT IF EXISTS shopping_items_category_check;
ALTER TABLE shopping_items ADD CONSTRAINT shopping_items_category_check
  CHECK (category IN (
    'meat_fish',    -- 肉・魚
    'vegetable',    -- 野菜・果物
    'seasoning',    -- 調味料
    'dairy_egg',    -- 乳製品・卵
    'dry_goods',    -- 乾物・缶詰・粉類
    'tofu_natto',   -- 豆腐・納豆・練り物
    'frozen',       -- 冷凍食品
    'other'         -- その他
  ));

-- 既存データのマイグレーション
UPDATE shopping_items SET category = 'meat_fish' WHERE category = 'meat';
```

### ロジック変更

`src/lib/utils/aggregate-ingredients.ts` の `guessCategory` 関数を拡張：

```typescript
function guessCategory(name: string): string {
  const meatFish = ["肉", "豚", "鶏", "牛", "ひき肉", "ベーコン", "ウインナー", "ソーセージ", "鮭", "魚", "えび", "ツナ", "いか", "たこ", "しらす", "ちくわ"];
  const vegetable = ["大根", "玉ねぎ", "にんじん", "キャベツ", "もやし", "ほうれん草", "白菜", "じゃがいも", "ネギ", "きのこ", "しめじ", "トマト", "ピーマン", "なす", "かぼちゃ", "ブロッコリー", "小松菜", "レタス", "きゅうり"];
  const seasoning = ["醤油", "みりん", "酒", "砂糖", "塩", "胡椒", "味噌", "酢", "油", "バター", "だし", "コンソメ", "ケチャップ", "マヨネーズ", "ソース", "ルー", "めんつゆ", "ポン酢"];
  const dairyEgg = ["卵", "牛乳", "チーズ", "ヨーグルト", "生クリーム", "バター"];
  const dryGoods = ["パスタ", "うどん", "そば", "米", "パン粉", "小麦粉", "片栗粉", "ツナ缶", "トマト缶", "春雨", "乾燥わかめ"];
  const tofuNatto = ["豆腐", "納豆", "油揚げ", "厚揚げ", "こんにゃく", "はんぺん"];
  const frozen = ["冷凍"];

  if (meatFish.some(m => name.includes(m))) return "meat_fish";
  if (dairyEgg.some(m => name.includes(m))) return "dairy_egg";
  if (tofuNatto.some(m => name.includes(m))) return "tofu_natto";
  if (vegetable.some(v => name.includes(v))) return "vegetable";
  if (seasoning.some(s => name.includes(s))) return "seasoning";
  if (dryGoods.some(d => name.includes(d))) return "dry_goods";
  if (frozen.some(f => name.includes(f))) return "frozen";
  return "other";
}
```

### UI変更

`src/components/kondate/ShoppingList.tsx` の `CATEGORY_CONFIG` を更新：

```typescript
const CATEGORY_CONFIG: Record<string, { label: string; emoji: string; order: number }> = {
  meat_fish:  { label: "肉・魚コーナー", emoji: "🥩", order: 0 },
  vegetable:  { label: "野菜・果物", emoji: "🥬", order: 1 },
  tofu_natto: { label: "豆腐・練り物", emoji: "🫘", order: 2 },
  dairy_egg:  { label: "乳製品・卵", emoji: "🥚", order: 3 },
  dry_goods:  { label: "乾物・缶詰", emoji: "🥫", order: 4 },
  seasoning:  { label: "調味料", emoji: "🧂", order: 5 },
  frozen:     { label: "冷凍食品", emoji: "🧊", order: 6 },
  other:      { label: "その他", emoji: "📦", order: 7 },
};
```

`ShoppingAddDialog.tsx` のカテゴリ選択肢も同様に更新。

### 型定義変更

`src/types/shopping-list.ts`:
```typescript
export type ItemCategory = "meat_fish" | "vegetable" | "seasoning" | "dairy_egg" | "dry_goods" | "tofu_natto" | "frozen" | "other";
```

---

## 機能2: 評価・殿堂入りシステム

### 目的
食べた後にれん・あかねがそれぞれ5段階評価+コメントを残せる。高評価レシピは「殿堂入り」としてフィルタ表示できる。AI献立提案時に「殿堂入りから選ぶ」が可能になる。

### DB変更

```sql
-- レシピ評価テーブル
CREATE TABLE recipe_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_name text NOT NULL CHECK (user_name IN ('れん', 'あかね')),
  rating int NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(recipe_id, user_name)  -- 1レシピにつきユーザー1評価
);

-- recipesテーブルに殿堂入りフラグ追加
ALTER TABLE recipes ADD COLUMN is_favorite boolean NOT NULL DEFAULT false;

-- インデックス
CREATE INDEX idx_recipe_ratings_recipe ON recipe_ratings(recipe_id);
CREATE INDEX idx_recipes_favorite ON recipes(is_favorite) WHERE is_favorite = true;

-- RLS
ALTER TABLE recipe_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_access" ON recipe_ratings
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- updated_at トリガー
CREATE TRIGGER set_updated_at_recipe_ratings
  BEFORE UPDATE ON recipe_ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

### APIエンドポイント追加

```
app/api/
├── recipes/
│   └── [id]/
│       ├── route.ts          既存（GET）
│       ├── ratings/
│       │   └── route.ts      GET（評価一覧）/ POST（評価登録）
│       └── favorite/
│           └── route.ts      POST（殿堂入り切替）
```

**GET /api/recipes/[id]/ratings**
- そのレシピのれん・あかね両方の評価を返す

**POST /api/recipes/[id]/ratings**
```typescript
type CreateRating = {
  user_name: "れん" | "あかね";
  rating: number; // 1-5
  comment?: string;
};
```
- UPSERT（同じユーザーが再評価したら上書き）

**POST /api/recipes/[id]/favorite**
```typescript
type ToggleFavorite = {
  is_favorite: boolean;
};
```
- 自動判定ロジック: れん+あかねの平均が4.5以上なら自動で殿堂入り提案

### UI追加

**レシピ詳細画面（RecipeDetail.tsx）に追加：**
- 手順の下に「評価する」セクション
- ★1〜5のタップ式評価UI（れん用/あかね用をタブ切替 or 並列表示）
- コメント入力欄
- 殿堂入りバッジ（❤️アイコン、is_favorite = true の場合表示）

**週間カレンダーのMealSlotCard.tsx：**
- 殿堂入りレシピには❤️バッジ追加

**レシピ一覧画面を新規追加（任意）：**
- `/recipes` ページ
- 「殿堂入りのみ」フィルタ
- 評価順ソート
- ボトムナビに追加するか、設定画面からリンク

### AI連携

`src/lib/gemini/prompts.ts` のコンテキストに殿堂入りレシピを追加：

```typescript
// buildContext に追加
const { data: favorites } = await supabase
  .from("recipes")
  .select("title, cook_method")
  .eq("is_favorite", true)
  .limit(20);

// システムプロンプトに追加
## 殿堂入りレシピ（ユーザーのお気に入り）
${favorites?.map(r => `- ${r.title}（${r.cook_method}）`).join("\n") || "なし"}

ユーザーが「殿堂入りから選んで」と言ったら、このリストから優先的に提案する。
```

---

## 機能3: クッキングモードUI

### 目的
レシピの手順を調理中にスマホで見やすく表示する。大きな文字、スワイプで次のステップ、濡れた手でも操作しやすいUI。

### DB変更
なし（既存の recipe_steps テーブルをそのまま使用）

### 実装

**新規コンポーネント:** `src/components/kondate/CookingMode.tsx`

**新規ページ:** `src/app/(kondate)/menu/[recipeId]/cooking/page.tsx`

**機能：**
- レシピ詳細画面に「クッキングモードで開く」ボタンを追加
- 全画面表示（ボトムナビ非表示）
- 手順を1ステップずつ大きな文字で表示
- 左右スワイプ or 大きなボタンで前後移動
- 現在のステップ番号 / 全ステップ数を表示
- ホットクック情報（メニューNo.、まぜ技ユニット）を常時表示
- tipがある場合は💡アイコンで表示
- 画面スリープ防止（Wake Lock API）
- 「終了」ボタンでレシピ詳細に戻る

**UI仕様：**
```
┌──────────────────────────┐
│  ✕                  2/5  │  ← 閉じる / ステップ番号
├──────────────────────────┤
│                          │
│  ホットクック No.085      │  ← 常時表示
│  まぜ技ユニット：あり     │
│                          │
│ ┌──────────────────────┐ │
│ │                      │ │
│ │  内鍋に大根を         │ │  ← 大きな文字（20px以上）
│ │  下に敷く             │ │
│ │                      │ │
│ │  💡 大根は2cm幅に     │ │  ← tip
│ │  切ると火が通りやすい  │ │
│ │                      │ │
│ └──────────────────────┘ │
│                          │
│  [◀ 前へ]    [次へ ▶]    │  ← 大きなタップ領域
│                          │
└──────────────────────────┘
```

**スワイプ実装：**
```typescript
// タッチイベントで実装
const [touchStart, setTouchStart] = useState(0);

onTouchStart={(e) => setTouchStart(e.touches[0].clientX)}
onTouchEnd={(e) => {
  const diff = touchStart - e.changedTouches[0].clientX;
  if (diff > 50) goNext();      // 左スワイプ → 次へ
  if (diff < -50) goPrev();     // 右スワイプ → 前へ
}}
```

**Wake Lock API：**
```typescript
useEffect(() => {
  let wakeLock: WakeLockSentinel | null = null;
  async function requestWakeLock() {
    try {
      wakeLock = await navigator.wakeLock.request("screen");
    } catch {}
  }
  requestWakeLock();
  return () => { wakeLock?.release(); };
}, []);
```

**レイアウトの注意:**
- `(kondate)/menu/[recipeId]/cooking/page.tsx` は `(kondate)/layout.tsx` の中に入るため、ボトムナビが表示される
- クッキングモードではボトムナビを非表示にする → layout に state を渡すか、クッキングモード用の別レイアウトグループを作る
- 推奨：`(cooking)/` という別のレイアウトグループを作り、ボトムナビなしのレイアウトにする

```
src/app/
├── (kondate)/          # ボトムナビあり
│   └── ...
└── (cooking)/          # ボトムナビなし（全画面）
    └── cooking/[recipeId]/
        └── page.tsx
```

---

## 機能4: バーチャル冷蔵庫（在庫自動管理）

### 目的
冷蔵庫の食材在庫を管理する。買い物リストでチェックした食材が自動で在庫に入り、料理を作ったら自動で消費される。AI献立提案時に在庫を参照できる。

### DB変更

```sql
-- 冷蔵庫在庫テーブル
CREATE TABLE pantry_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  amount decimal,
  unit text,
  category text DEFAULT 'other' CHECK (category IN (
    'meat_fish', 'vegetable', 'seasoning', 'dairy_egg',
    'dry_goods', 'tofu_natto', 'frozen', 'other'
  )),
  expiry_date date,                    -- 賞味期限（任意）
  source text DEFAULT 'manual' CHECK (source IN ('manual', 'shopping')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- インデックス
CREATE INDEX idx_pantry_items_name ON pantry_items(name);
CREATE INDEX idx_pantry_items_category ON pantry_items(category);

-- RLS
ALTER TABLE pantry_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_access" ON pantry_items
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- updated_atトリガー
CREATE TRIGGER set_updated_at_pantry_items
  BEFORE UPDATE ON pantry_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

### APIエンドポイント追加

```
app/api/
├── pantry/
│   ├── route.ts              GET（在庫一覧）/ POST（手動追加）
│   └── [id]/
│       └── route.ts          PATCH（数量変更）/ DELETE（削除）
```

### 自動連携ロジック

**買い物完了 → 在庫追加（shopping_items → pantry_items）：**

`src/lib/utils/pantry-sync.ts` を新規作成：

```typescript
// 買い物リストの全アイテムがチェックされた時に呼ぶ
export async function syncShoppingToPantry(
  supabase: SupabaseClient,
  shoppingListId: string
) {
  const { data: items } = await supabase
    .from("shopping_items")
    .select("name, amount, unit, category")
    .eq("shopping_list_id", shoppingListId)
    .eq("is_checked", true);

  if (!items?.length) return;

  for (const item of items) {
    // 同じ名前+単位の既存在庫を探す
    const { data: existing } = await supabase
      .from("pantry_items")
      .select("id, amount")
      .eq("name", item.name)
      .eq("unit", item.unit || "")
      .maybeSingle();

    if (existing) {
      // 合算
      await supabase.from("pantry_items").update({
        amount: (existing.amount || 0) + (item.amount || 0),
      }).eq("id", existing.id);
    } else {
      // 新規追加
      await supabase.from("pantry_items").insert({
        name: item.name,
        amount: item.amount,
        unit: item.unit,
        category: item.category,
        source: "shopping",
      });
    }
  }
}
```

**料理完了 → 在庫消費：**

レシピを「作った」ボタンを押した時に、そのレシピの材料を在庫から差し引く。

```typescript
export async function consumeIngredientsFromPantry(
  supabase: SupabaseClient,
  recipeId: string,
  servings: number
) {
  const { data: recipe } = await supabase
    .from("recipes")
    .select("servings_base, recipe_ingredients(*)")
    .eq("id", recipeId)
    .single();

  if (!recipe) return;

  const ratio = servings / recipe.servings_base;

  for (const ing of recipe.recipe_ingredients) {
    const consumed = ing.amount * ratio;

    const { data: pantryItem } = await supabase
      .from("pantry_items")
      .select("id, amount")
      .eq("name", ing.name)
      .maybeSingle();

    if (pantryItem) {
      const remaining = (pantryItem.amount || 0) - consumed;
      if (remaining <= 0) {
        await supabase.from("pantry_items").delete().eq("id", pantryItem.id);
      } else {
        await supabase.from("pantry_items").update({ amount: remaining }).eq("id", pantryItem.id);
      }
    }
  }
}
```

### UI追加

**新規ページ:** `src/app/(kondate)/pantry/page.tsx`

ボトムナビにタブ追加（5タブ目）、または設定画面からリンク。

**画面構成：**
```
┌──────────────────────────┐
│  🧊 冷蔵庫               │
├──────────────────────────┤
│  🥩 肉・魚               │
│  豚こま切れ肉 ... 200g   │
│  鶏もも肉 ..... 300g     │
├──────────────────────────┤
│  🥬 野菜                 │
│  大根 ......... 1本      │
│  ⚠️ にんじん ... 2本     │  ← 期限近い
├──────────────────────────┤
│         [＋ 追加]         │
└──────────────────────────┘
```

**レシピ詳細画面に追加：**
- 「作った！」ボタン → 在庫から食材を自動差し引き
- 材料リストの横に「在庫あり ✓ / 不足」の表示

### AI連携

`buildContext` に在庫情報を追加：

```typescript
const { data: pantryItems } = await supabase
  .from("pantry_items")
  .select("name, amount, unit, category")
  .order("category");

// システムプロンプトに追加
## 現在の冷蔵庫在庫
${pantryItems?.map(i => `- ${i.name}: ${i.amount}${i.unit}`).join("\n") || "在庫情報なし"}

在庫にある食材を優先的に使い切る献立を提案すること。
```

---

## 機能5: 家計簿連携（食費自動記録）

### 目的
買い物リストの完了時に、実際の購入金額を家計簿アプリの `transactions` テーブルに自動記録。週の食費予算との比較も表示。

### 前提条件
- 家計簿アプリの `transactions` テーブルと `budgets` テーブルが同じSupabaseプロジェクトに存在
- 家計簿のカテゴリに「食費」が登録済み

### DB変更

```sql
-- shopping_lists にコスト記録用カラム追加
ALTER TABLE shopping_lists ADD COLUMN actual_total integer;         -- 実際の購入金額（円）
ALTER TABLE shopping_lists ADD COLUMN transaction_id uuid;          -- 家計簿連携時のtransaction ID

-- shopping_items に単価追加
ALTER TABLE shopping_items ADD COLUMN price integer;                -- 個別アイテムの金額（円、任意）
```

### APIエンドポイント追加

```
app/api/
├── shopping-lists/
│   └── [id]/
│       └── complete/
│           └── route.ts      POST（買い物完了 → 家計簿記録）
```

**POST /api/shopping-lists/[id]/complete**

```typescript
type CompleteShoppingRequest = {
  actual_total: number;     // 実際の購入金額
  record_to_kakeibo: boolean; // 家計簿に記録するか
};

// 処理フロー
// 1. shopping_lists.status → "completed", actual_total を保存
// 2. record_to_kakeibo = true なら transactions に INSERT
// 3. pantry_items に在庫追加（機能4連携）
```

**家計簿への記録：**
```typescript
if (body.record_to_kakeibo) {
  const { data: tx } = await supabase
    .from("transactions")
    .insert({
      user_type: "共同",
      type: "expense",
      date: new Date().toISOString().split("T")[0],
      category_main: "食費",
      category_sub: "食材",
      amount: body.actual_total,
      items: JSON.stringify({
        source: "kondate_app",
        shopping_list_id: id,
        week_start_date: list.week_start_date,
      }),
    })
    .select("id")
    .single();

  // shopping_lists に transaction_id を紐付け
  await supabase
    .from("shopping_lists")
    .update({ transaction_id: tx.id })
    .eq("id", id);
}
```

### UI追加

**買い物リスト画面に追加：**
- 全アイテムチェック完了時に「買い物完了」ボタン表示
- 金額入力ダイアログ（合計金額を手入力）
- 「家計簿に記録する」チェックボックス
- 完了後に「¥3,200 を記録しました」トースト表示

**週間献立画面に追加（任意）：**
- その週の食費表示（actual_total）
- 家計簿の食費予算との比較バー

**予算参照ロジック：**
```typescript
// 家計簿の食費予算を取得
const { data: budget } = await supabase
  .from("budgets")
  .select("monthly_budget")
  .eq("user_type", "共同")
  .eq("category_main", "食費")
  .maybeSingle();

// 週あたり予算 = 月間予算 / 4.3（平均週数）
const weeklyBudget = budget ? Math.round(budget.monthly_budget / 4.3) : null;
```

### AI連携

`buildContext` に予算情報を追加：

```typescript
// システムプロンプトに追加
## 食費予算情報
- 月間食費予算: ¥${budget?.monthly_budget?.toLocaleString() || "未設定"}
- 今週の目安: ¥${weeklyBudget?.toLocaleString() || "未設定"}

予算を意識した食材選びを提案すること。高額な食材ばかりにならないよう注意。
```

---

## 実装手順まとめ

### 各機能の Claude Code への指示テンプレート

各機能を実装する際、Claude Code に以下の形式で指示を出す：

```
docs/phase2-implementation-guide.md の「機能N: ○○」セクションを読んで実装して。

手順：
1. DB変更のSQLを出力（Supabase SQL Editorで手動実行）
2. 型定義の追加・変更
3. APIエンドポイントの実装
4. フロントエンドコンポーネントの実装
5. 既存コンポーネントへの統合
6. ビルド確認（npm run build）
```

### ファイル配置先

```
docs/
└── phase2-implementation-guide.md   ← このファイル

src/
├── app/
│   ├── (kondate)/
│   │   ├── pantry/page.tsx          ← 機能4: 冷蔵庫
│   │   └── recipes/page.tsx         ← 機能2: レシピ一覧（殿堂入りフィルタ）
│   ├── (cooking)/                   ← 機能3: クッキングモード
│   │   └── cooking/[recipeId]/page.tsx
│   └── api/
│       ├── recipes/[id]/
│       │   ├── ratings/route.ts     ← 機能2: 評価
│       │   └── favorite/route.ts    ← 機能2: 殿堂入り
│       ├── pantry/
│       │   ├── route.ts             ← 機能4: 在庫CRUD
│       │   └── [id]/route.ts
│       └── shopping-lists/[id]/
│           └── complete/route.ts    ← 機能5: 買い物完了
├── components/kondate/
│   ├── CookingMode.tsx              ← 機能3
│   ├── RatingStars.tsx              ← 機能2
│   ├── PantryList.tsx               ← 機能4
│   └── ShoppingComplete.tsx         ← 機能5
├── lib/utils/
│   └── pantry-sync.ts               ← 機能4: 在庫同期
└── types/
    ├── rating.ts                    ← 機能2
    └── pantry.ts                    ← 機能4
```
