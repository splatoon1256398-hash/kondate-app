# パフォーマンスレビュー / 改善タスク一覧

作成日: 2026-04-10
対象ブランチ: main
対象リビジョン: db3dd0c

## 概要

本アプリの体感遅延は **99% AI献立提案（Gemini）に集中** している。
原因は明確で、以下4つが主因：

1. `thinkingBudget: 2048` が常時 ON
2. Gemini をストリーミングではなく `generateContent`（バッファ型）で呼んでいる
3. システムプロンプトに **300件のレシピDB全文** を毎回埋め込み
4. FC マルチラウンドで往復が多い

Phase 1 を当日中に全部入れるだけで、**AI応答 TTFT が 10〜40秒 → 0.5〜1.5秒** に短縮できる見込み。
精度面は `thinkingBudget` だけ慎重に A/B し、他はほぼ影響なし（FC に `search_recipes` を導入すれば逆に向上する可能性）。

## 品質ゲート実測（レビュー時点）

| ゲート | 結果 |
|---|---|
| `npm run build` | ✅ 成功（Turbopack 1.7秒でコンパイル、22ページ生成） |
| `npm run lint` | ⚠️ 0 errors / 3 warnings（全て `<img>` 未最適化） |
| `npm run test` | ✅ 4 files / 7 tests pass |
| 静的チャンク計 | ~1.1 MB、最大 228 KB |

## 技術スタック

- Next.js 16.2.2 / React 19.2.4 / TypeScript / App Router / Turbopack
- Supabase（service_role 直叩き・API Routes 専用）
- Gemini 2.5 Flash + Function Calling（`@google/genai`）
- Tailwind v4 / Radix UI / lucide-react
- Vitest + Testing Library

---

## 期待効果（Phase 1 完了時点）

| 指標 | 現状 | 後 |
|---|---|---|
| AI初回応答 TTFT | 10〜40秒 | 0.5〜1.5秒 |
| AI確定フロー全体 | +5〜15秒 | -5〜15秒短縮 |
| レシピ一覧 LCP | 1〜3秒悪化 | 最適化済み |
| 「作った」ボタン応答 | 直列2本 | 並列 |
| `executeSaveWeeklyMenu` | 最大56往復 | 1〜3往復 |

---

# 🔥 Phase 1: AI応答の即効改善（最優先）

## TASK-1: `thinkingBudget` をゼロに
**ファイル**: [src/app/api/meal-plan/chat/route.ts:129](../src/app/api/meal-plan/chat/route.ts#L129)
**インパクト**: 🔴 最大（1行変更で -3〜10秒）
**リスク**: 🟡 精度低下の可能性 → A/B 必須

### 現状
```ts
const geminiConfig = {
  systemInstruction: systemPrompt,
  tools: [{ functionDeclarations }],
  thinkingConfig: { thinkingBudget: 2048 },
};
```

### 修正
```ts
const geminiConfig = {
  systemInstruction: systemPrompt,
  tools: [{ functionDeclarations }],
  thinkingConfig: { thinkingBudget: 0 },
};
```

### 補足
- 献立選定は判断タスクとしては軽量。thinking 2048 トークンは過剰。
- まずこれ単独で入れて動作確認 → 精度が明らかに落ちたら `512` に。
- 環境変数 `GEMINI_THINKING_BUDGET` で切り替え可能にしておくと A/B が楽。

---

## TASK-2: Gemini をストリーミング化
**ファイル**: [src/app/api/meal-plan/chat/route.ts:131](../src/app/api/meal-plan/chat/route.ts#L131)
**インパクト**: 🔴 最大（TTFT 20秒 → 0.5〜1.5秒）
**リスク**: 🟢 低（SSE パイプは既に用意済み）

### 現状
```ts
const response = await gemini.models.generateContent({
  model: "gemini-2.5-flash",
  contents,
  config: geminiConfig,
});

const candidate = response.candidates?.[0];
if (!candidate?.content?.parts) { ... }
let parts = candidate.content.parts;
```

### 修正方針
```ts
const stream = await gemini.models.generateContentStream({
  model: "gemini-2.5-flash",
  contents,
  config: geminiConfig,
});

const accumulatedParts: Part[] = [];
for await (const chunk of stream) {
  if (aborted) break;
  const chunkParts = chunk.candidates?.[0]?.content?.parts ?? [];
  for (const p of chunkParts) {
    if (p.text) send({ type: "text", content: p.text });
    if (p.functionCall) accumulatedParts.push(p);
  }
  // text の部分もまとめて accumulatedParts に保持
}
// FC 処理ループは accumulatedParts を parts として扱う
```

### 注意点
- FC を含むラウンドでは全 chunk を見てから FC を実行する（chunk の途中で functionCall が確定しないケースあり）。
- `@google/genai` の型は `GenerateContentStreamResponse` のイテレータ。API ドキュメントを要確認。
- follow-up ラウンド（FC 実行後の再呼び出し）も同様に stream 化する。

---

## TASK-3: プロンプト内レシピDBを 300→50件に絞る
**ファイル**: [src/lib/gemini/prompts.ts:154-159](../src/lib/gemini/prompts.ts#L154-L159)
**インパクト**: 🔴 大（入力トークン ~1万削減、TTFT -2〜5秒）
**リスク**: 🟢 低

### 現状
```ts
supabase
  .from("recipes")
  .select("id, title, cook_method, cook_time_min")
  .order("created_at", { ascending: false })
  .limit(300),
```

### 修正
```ts
supabase
  .from("recipes")
  .select("id, title, cook_method, cook_time_min")
  .order("created_at", { ascending: false })
  .limit(50),
```

### 補足
- 1レシピ ≈ 60〜80 文字。300件で約 20,000 文字 ≈ 10,000 トークン → これがチャット往復のたびに入力される。
- できれば「直近使用 + お気に入り + 人気」で重み付けして上位50件。
- 最終的には TASK-17（FC で `search_recipes` を動的検索）に置き換えるのがベスト。

---

## TASK-4: 確定フローを Gemini から剥がす
**ファイル**: [src/app/api/meal-plan/chat/route.ts:149-238](../src/app/api/meal-plan/chat/route.ts#L149-L238)
**インパクト**: 🔴 大（確定時 -5〜15秒）
**リスク**: 🟡 中（フロー変更）

### 現状の問題
`save_weekly_menu` → `generate_shopping_list` の FC が続くと Gemini への follow-up 呼び出しが 2〜3 回発生。
ユーザーの「確定」メッセージに対して LLM を 3 往復させている。

### 修正方針
- `save_weekly_menu` FC を検出した時点で以下に分岐：
  1. サーバ側で `executeSaveWeeklyMenu` → `executeGenerateShoppingList` を連続実行
  2. 結果を `function_call` SSE イベントとして送出
  3. **Gemini への follow-up 呼び出しをスキップ**
  4. 最後に簡単な完了メッセージ（テンプレ文字列）を `text` イベントで送信して終了
- 既存の [`/api/meal-plan/confirm`](../src/app/api/meal-plan/confirm/route.ts) と同じロジックを chat 側にも組み込むイメージ。

### 補足
- LLM は「献立提案・対話」だけに使い、保存オーケストレーションは決定的なサーバコードに任せる方が速く・安く・確実。
- ついでに propose 段階の FC でレシピ情報を保持しておけば、確定時に Gemini に再度 `save_weekly_menu` を投げさせる必要もなくなる。

---

## TASK-5: `next.config.ts` に最適化オプション追加
**ファイル**: [next.config.ts](../next.config.ts)
**インパクト**: 🟠 中（画像最適化 + バンドルサイズ）
**リスク**: 🟢 低

### 現状
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
```

### 修正
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cocoroplus.jp.sharp" },
    ],
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-dialog",
      "@radix-ui/react-tabs",
      "@radix-ui/react-checkbox",
    ],
  },
};

export default nextConfig;
```

### 補足
- `remotePatterns` を入れないと `next/image` が外部ホスト画像を拒否する。
- `optimizePackageImports` で lucide-react の named import がツリーシェイクされやすくなる。

---

## TASK-6: `<img>` → `next/image` 置換
**インパクト**: 🟠 中（LCP -1〜3秒、モバイル帯域削減）
**リスク**: 🟢 低

### 対象ファイル
- [src/components/kondate/RecipeList.tsx:156-160](../src/components/kondate/RecipeList.tsx#L156-L160)
- [src/components/kondate/RecipeDetail.tsx:87](../src/components/kondate/RecipeDetail.tsx#L87)
- [src/components/kondate/RecipeDetailPage.tsx:123-131](../src/components/kondate/RecipeDetailPage.tsx#L123-L131)

### 修正例（RecipeList）
```tsx
import Image from "next/image";

// before
<img src={recipe.image_url} alt="" className="h-12 w-12 ..." />

// after
<Image
  src={recipe.image_url}
  alt=""
  width={48}
  height={48}
  className="h-12 w-12 shrink-0 rounded-[8px] object-cover"
/>
```

### 修正例（RecipeDetailPage — ヒーロー画像）
```tsx
<div className="mx-4 mt-4 overflow-hidden rounded-[14px] relative h-56">
  <Image
    src={recipe.image_url}
    alt={recipe.title}
    fill
    sizes="(max-width: 768px) 100vw, 768px"
    className="object-cover"
    priority
  />
</div>
```

### 注意点
- TASK-5 で `remotePatterns` を入れてからやる。
- 一覧のサムネは `loading="lazy"`（Next/Image デフォルト適用）。
- 詳細ページの LCP 対象画像は `priority` を付ける。

---

## TASK-7: 直列 fetch を `Promise.all` 化

### TASK-7a: MealSlotRow の handleCooked
**ファイル**: [src/components/kondate/MealSlotRow.tsx:27-40](../src/components/kondate/MealSlotRow.tsx#L27-L40)
**インパクト**: 🟠 中（ボタン応答 2倍速）

#### 現状
```tsx
if (slot.recipe_id) {
  await fetch(`/api/recipes/${slot.recipe_id}/cooked`, { ... });
}
await fetch(`/api/meal-slots/${slot.id}`, { ... });
```

#### 修正
```tsx
await Promise.all([
  slot.recipe_id
    ? fetch(`/api/recipes/${slot.recipe_id}/cooked`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servings: slot.servings }),
      })
    : Promise.resolve(),
  fetch(`/api/meal-slots/${slot.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memo: "調理済み" }),
  }),
]);
```

### TASK-7b: ShoppingList の済み削除
**ファイル**: [src/components/kondate/ShoppingList.tsx:218-231](../src/components/kondate/ShoppingList.tsx#L218-L231)
**インパクト**: 🟠 中（N個削除が直列 → 並列）

#### 現状
```tsx
for (const itemId of checkedIds) {
  await fetch(`/api/shopping-lists/${list.id}/items/${itemId}`, { method: "DELETE" });
}
```

#### 修正（暫定：並列化）
```tsx
await Promise.all(
  checkedIds.map((itemId) =>
    fetch(`/api/shopping-lists/${list.id}/items/${itemId}`, { method: "DELETE" })
  )
);
```

#### 修正（理想：bulk エンドポイント新設）
- `DELETE /api/shopping-lists/[id]/items` with body `{ ids: string[] }` を新設
- 1往復で済むようにする

---

# 🟠 Phase 2: 中コスト高効果

## TASK-8: `executeSaveWeeklyMenu` の bulk 化
**ファイル**: [src/lib/gemini/handlers.ts:83-192](../src/lib/gemini/handlers.ts#L83-L192)
**インパクト**: 🔴 大（最大56往復 → 1〜3往復）
**リスク**: 🟡 中（ロジック複雑化）

### 現状の問題
14スロットを for ループで逐次処理、スロット毎に:
1. recipe_id lookup（SELECT）
2. 新規レシピなら insert → ingredients insert → steps insert
3. meal_slot insert

→ 最悪 14 × 4 = 56 往復、2〜4秒。

### 修正方針

#### ステップ1: 既存レシピの解決を1発に
```ts
// slot.recipe_id を持つものの存在確認
const existingRecipeIds = args.slots
  .filter((s) => s.recipe_id && !s.is_skipped)
  .map((s) => s.recipe_id!);

const { data: foundById } = existingRecipeIds.length > 0
  ? await supabase.from("recipes").select("id").in("id", existingRecipeIds)
  : { data: [] };

const foundIdSet = new Set(foundById?.map((r) => r.id) ?? []);

// slot.recipe で新規だが重複するものを一括チェック
const newRecipeKeys = args.slots
  .filter((s) => !s.recipe_id && s.recipe && !s.is_skipped)
  .map((s) => ({ title: s.recipe!.title, cook_method: s.recipe!.cook_method }));

// title + cook_method の組で検索（1クエリ）
const { data: foundByTitle } = newRecipeKeys.length > 0
  ? await supabase
      .from("recipes")
      .select("id, title, cook_method")
      .in("title", newRecipeKeys.map((k) => k.title))
  : { data: [] };

const titleKeyMap = new Map(
  (foundByTitle ?? []).map((r) => [`${r.title}::${r.cook_method}`, r.id])
);
```

#### ステップ2: 新規レシピを一括 INSERT
```ts
const recipesToInsert = args.slots
  .filter((s) => {
    if (s.is_skipped || !s.recipe) return false;
    if (s.recipe_id && foundIdSet.has(s.recipe_id)) return false;
    const key = `${s.recipe.title}::${s.recipe.cook_method}`;
    return !titleKeyMap.has(key);
  })
  .map((s) => ({
    title: s.recipe!.title,
    description: s.recipe!.description ?? null,
    servings_base: s.recipe!.servings_base,
    cook_method: s.recipe!.cook_method,
    hotcook_menu_number: s.recipe!.hotcook_menu_number ?? null,
    hotcook_unit: s.recipe!.hotcook_unit ?? null,
    prep_time_min: s.recipe!.prep_time_min ?? null,
    cook_time_min: s.recipe!.cook_time_min ?? null,
    source: "ai" as const,
  }));

const { data: insertedRecipes } = recipesToInsert.length > 0
  ? await supabase.from("recipes").insert(recipesToInsert).select("id, title, cook_method")
  : { data: [] };

// 新規 recipe の ingredients / steps を一括 INSERT
const allIngredients = [];
const allSteps = [];
for (const slot of args.slots) {
  if (!slot.recipe) continue;
  const newRecipe = insertedRecipes?.find(
    (r) => r.title === slot.recipe!.title && r.cook_method === slot.recipe!.cook_method
  );
  if (!newRecipe) continue;
  allIngredients.push(...slot.recipe.ingredients.map((i) => ({ recipe_id: newRecipe.id, ...i })));
  allSteps.push(...slot.recipe.steps.map((s) => ({ recipe_id: newRecipe.id, ...s })));
}

if (allIngredients.length > 0) {
  await supabase.from("recipe_ingredients").insert(allIngredients);
}
if (allSteps.length > 0) {
  await supabase.from("recipe_steps").insert(allSteps);
}
```

#### ステップ3: meal_slots を一括 INSERT
```ts
const mealSlotsToInsert = args.slots.map((slot) => {
  const recipeId = resolveRecipeId(slot); // 上記の Map から解決
  return {
    weekly_menu_id: menu.id,
    date: slot.date,
    meal_type: slot.meal_type,
    servings: slot.servings,
    recipe_id: recipeId,
    memo: slot.memo ?? null,
    is_skipped: slot.is_skipped,
  };
});

await supabase.from("meal_slots").insert(mealSlotsToInsert);
```

### 理想形: Supabase RPC
```sql
CREATE OR REPLACE FUNCTION save_weekly_menu_atomic(
  p_week_start_date date,
  p_slots jsonb
) RETURNS uuid
LANGUAGE plpgsql
AS $$
-- トランザクション内で upsert menu, insert recipes, insert slots を完結
$$;
```
→ 1往復で完了、アトミック。

---

## TASK-9: `buildContext` のセッションキャッシュ化
**ファイル**: [src/lib/gemini/prompts.ts:125-211](../src/lib/gemini/prompts.ts#L125-L211)
**インパクト**: 🟠 中（チャット2往復目以降 -200〜500ms）
**リスク**: 🟡 中（キャッシュ整合性）

### 現状の問題
チャット1往復ごとに DB 4本クエリが走る。ユーザーが「こう変更して」と返すだけでも毎回同じデータを取得。

### 修正方針A: クライアントから session_id を渡す
```ts
// ChatRequest に sessionId を追加
const body: ChatRequest = await request.json();
const { messages, context: reqContext, sessionId } = body;

// サーバ側で Map<sessionId, { context, timestamp }>
const contextCache = new Map<string, { ctx: MealPlanContext; ts: number }>();
const CACHE_TTL = 5 * 60_000; // 5分

let mealPlanContext: MealPlanContext;
const cached = contextCache.get(sessionId);
if (cached && Date.now() - cached.ts < CACHE_TTL) {
  mealPlanContext = cached.ctx;
} else {
  mealPlanContext = await buildContext(supabase, reqContext?.week_start_date);
  contextCache.set(sessionId, { ctx: mealPlanContext, ts: Date.now() });
}
```

### 修正方針B: Gemini Context Caching
- `@google/genai` の Caching API を使い、`systemInstruction` + レシピリスト部分を別キャッシュに。
- 2回目以降の入力トークンが激減。
- 料金体系も別なので本番向き。

### 注意
- Fluid Compute のインスタンス再利用前提なら、プロセスグローバルの Map でも十分効く。
- 長時間キャッシュすると pantry 変更が反映されないので TTL 短め（5分〜10分）。

---

## TASK-10: `WeeklyCalendar` 楽観的UI化
**ファイル**: [src/components/kondate/WeeklyCalendar.tsx:143-150](../src/components/kondate/WeeklyCalendar.tsx#L143-L150)
**インパクト**: 🟠 中（「作った」ボタン 300〜800ms → 0ms）
**リスク**: 🟢 低

### 現状
```tsx
<MealSlotRow
  slot={lunch}
  mealType="lunch"
  isToday={isToday}
  onUpdate={() => fetchMenu(weekStart)}  // 全リフレッシュ
/>
```

### 修正方針
- API から更新後の slot を返すよう修正
- `MealSlotRow` 側で楽観的に state 更新
- React 19 の `useOptimistic` を活用

```tsx
const [optimisticMenu, setOptimisticMenu] = useOptimistic(
  menu,
  (current, action: { type: "cooked" | "skip"; slotId: string }) => {
    if (!current) return current;
    return {
      ...current,
      meal_slots: current.meal_slots.map((s) =>
        s.id === action.slotId
          ? { ...s, memo: action.type === "cooked" ? "調理済み" : "スキップ", is_skipped: action.type === "skip" }
          : s
      ),
    };
  }
);
```

---

## TASK-11: `/api/recipes/recommended` と `/popular` を SQL 側集計に
**ファイル**:
- [src/app/api/recipes/recommended/route.ts](../src/app/api/recipes/recommended/route.ts)
- [src/app/api/recipes/popular/route.ts](../src/app/api/recipes/popular/route.ts)

**インパクト**: 🟠 中（AI提案画面の初期ロード -500ms〜2秒）
**リスク**: 🟡 中（SQL 追加）

### 現状の問題
- `recommended`: `recipe_ratings` 全件ロード + JS Map 集計
- `popular`: `meal_slots` 全件ロード + JS カウント
- データ増加で線形に悪化

### 修正方針

#### View の例
```sql
CREATE OR REPLACE VIEW v_recipe_stats AS
SELECT
  r.id,
  r.title,
  r.cook_method,
  r.hotcook_menu_number,
  r.prep_time_min,
  r.cook_time_min,
  r.source,
  r.is_favorite,
  r.image_url,
  COALESCE(AVG(rr.rating), 0) AS avg_rating,
  COUNT(DISTINCT rr.id) AS rating_count,
  COUNT(DISTINCT ms.id) FILTER (WHERE ms.is_skipped = false) AS use_count,
  MAX(ms.date) AS last_used_date
FROM recipes r
LEFT JOIN recipe_ratings rr ON rr.recipe_id = r.id
LEFT JOIN meal_slots ms ON ms.recipe_id = r.id
GROUP BY r.id;
```

#### RPC の例
```sql
CREATE OR REPLACE FUNCTION get_recommended_recipes(p_limit int DEFAULT 20)
RETURNS SETOF v_recipe_stats
LANGUAGE sql STABLE
AS $$
  SELECT * FROM v_recipe_stats
  ORDER BY
    (CASE WHEN is_favorite THEN 100 ELSE 0 END) +
    (avg_rating * 20) +
    (CASE WHEN last_used_date IS NULL OR last_used_date < CURRENT_DATE - 14 THEN 30 ELSE 0 END) DESC
  LIMIT p_limit;
$$;
```

#### API Route 側
```ts
const { data } = await supabase.rpc("get_recommended_recipes", { p_limit: 20 });
```

---

## TASK-12: チャット履歴のプルーニング
**ファイル**: [src/components/kondate/AiChat.tsx:176-183](../src/components/kondate/AiChat.tsx#L176-L183)
**インパクト**: 🟠 中（5往復以降のレイテンシ抑制）
**リスク**: 🟢 低

### 現状の問題
```tsx
chatHistoryRef.current = [
  ...chatHistoryRef.current,
  { role: "assistant", content: historyContent },  // FC の JSON 全文を append
];
```
- 履歴が無制限に伸びる
- FC propose 結果の JSON も丸ごと入るので爆発的に増える

### 修正方針
```tsx
const MAX_HISTORY = 8; // 直近 8 メッセージ

// propose 結果は要約化
const summarizedContent = lastProposalJson
  ? `${fullText}\n\n[提案: ${proposal.slots.length}スロット, week=${proposal.week_start_date}]`
  : fullText;

chatHistoryRef.current = [
  ...chatHistoryRef.current,
  { role: "assistant", content: summarizedContent },
].slice(-MAX_HISTORY);
```

---

## TASK-13: AI提案プリロード
**新規ファイル**: `src/app/api/meal-plan/context/route.ts`
**インパクト**: 🟠 中（AI送信時の TTFT -200〜500ms）
**リスク**: 🟢 低

### 方針
1. `buildContext` だけ実行して返す API を新設
2. [src/app/(kondate)/ai/page.tsx](../src/app/(kondate)/ai/page.tsx) マウント時にプリフェッチ
3. クライアントからの `chat` 呼び出し時にキャッシュされた context を参照

### 実装スケッチ
```ts
// src/app/api/meal-plan/context/route.ts
export async function GET(request: NextRequest) {
  const weekStart = request.nextUrl.searchParams.get("week_start_date") ?? undefined;
  const supabase = createSupabaseServerClient();
  const context = await buildContext(supabase, weekStart);
  return apiSuccess(context);
}
```

---

# 🟡 Phase 3: 基盤整備

## TASK-14: Service Worker 刷新
**ファイル**: [public/sw.js](../public/sw.js)
**インパクト**: 🟢 低（オフライン要件が出てからでOK）

### 現状の問題
```js
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
```
`cache.put()` が無いのでキャッシュは常に空。オフライン動作しない。

### 修正方針
```js
const CACHE_NAME = 'kondate-v2';
const SHELL = [
  '/',
  '/menu',
  '/shopping',
  '/recipes',
  '/pantry',
  '/ai',
  '/icon-192x192.png',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return; // API は SW 介さず直接

  // Stale-While-Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request).then((res) => {
        if (res.ok) cache.put(event.request, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
```

---

## TASK-15: Postgres trigram インデックス
**対象**: `recipes.title`
**インパクト**: 🟢 低（データ量が増えてから）

### 方針
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_recipes_title_trgm ON recipes USING gin (title gin_trgm_ops);
```

### 補足
- [src/app/api/recipes/route.ts:25](../src/app/api/recipes/route.ts#L25) の `ilike '%q%'` が生きる。
- 現状は件数少ないので優先度低。

---

## TASK-16: Supabase generated types 導入
**インパクト**: 🟢 低（保守性）

### 方針
```bash
npx supabase gen types typescript --project-id <your-id> > src/types/database.ts
```

### 対象の `any` 排除
- [src/lib/gemini/prompts.ts:172](../src/lib/gemini/prompts.ts#L172)
- [src/app/api/weekly-menus/route.ts:64](../src/app/api/weekly-menus/route.ts#L64) のインライン型
- その他 `satisfies ApiResponse<...>` と組み合わせて型安全化

---

## TASK-17: FC に `search_recipes` を追加
**ファイル**: [src/lib/gemini/functions.ts](../src/lib/gemini/functions.ts), [src/lib/gemini/handlers.ts](../src/lib/gemini/handlers.ts)
**インパクト**: 🔴 大（プロンプトからレシピリスト全廃、トークン激減）
**リスク**: 🟡 中（Gemini が呼ばないケースを想定）

### 方針
```ts
// functions.ts
{
  name: "search_recipes",
  description: "DBから条件に合うレシピを検索する。キーワード・調理方法・食材で絞れる。",
  parameters: {
    type: T.OBJECT,
    properties: {
      keyword: { type: T.STRING, description: "レシピ名の部分一致" },
      cook_method: { type: T.STRING, enum: ["hotcook", "stove", "other"] },
      ingredient: { type: T.STRING, description: "主な材料（例: 大根）" },
      limit: { type: T.INTEGER, description: "最大件数（デフォルト20）" },
    },
  },
},
```

```ts
// handlers.ts
export async function executeSearchRecipes(
  supabase: SupabaseClient,
  args: { keyword?: string; cook_method?: string; ingredient?: string; limit?: number }
) {
  let query = supabase
    .from("recipes")
    .select("id, title, cook_method, cook_time_min, is_favorite");
  if (args.keyword) query = query.ilike("title", `%${args.keyword}%`);
  if (args.cook_method) query = query.eq("cook_method", args.cook_method);
  // ingredient の検索は recipe_ingredients JOIN
  const { data } = await query.limit(args.limit ?? 20);
  return { recipes: data ?? [] };
}
```

### 効果
- システムプロンプトから「300件レシピリスト」を完全に削除できる
- Gemini が必要なタイミングだけ検索するので無駄がない
- TASK-3 の発展形

---

## TASK-18: `createSupabaseServerClient` のキャッシュ戦略見直し
**ファイル**: [src/lib/supabase/server.ts:28-31](../src/lib/supabase/server.ts#L28-L31)
**インパクト**: 🟢 低

### 現状
```ts
global: {
  fetch: (input, init) =>
    fetch(input, { ...init, cache: "no-store" as RequestCache }),
},
```
全 Supabase クエリで Next のフェッチキャッシュを無効化。

### 修正方針
- 読み取り系 API Route は呼び出し側で `unstable_cache` / `use cache` で明示キャッシュ
- 書き込み系は `revalidateTag` で無効化
- Supabase client 自体は `no-store` 強制を外し、呼び出し側で制御

---

## TASK-19: `RecipeList` 検索に AbortController
**ファイル**: [src/components/kondate/RecipeList.tsx:44-47](../src/components/kondate/RecipeList.tsx#L44-L47)
**インパクト**: 🟢 低（race バグ予防）

### 現状
```tsx
useEffect(() => {
  const timer = setTimeout(fetchRecipes, 300);
  return () => clearTimeout(timer);
}, [fetchRecipes]);
```

### 修正
```tsx
useEffect(() => {
  const ctrl = new AbortController();
  const timer = setTimeout(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (cookMethodFilter !== "all") params.set("cook_method", cookMethodFilter);
      if (favoriteOnly) params.set("is_favorite", "true");
      params.set("limit", "100");
      const res = await fetch(`/api/recipes?${params}`, { signal: ctrl.signal });
      const json: ApiResponse<RecipeListItem[]> = await res.json();
      if (json.data) setRecipes(json.data);
    } catch {
      // ignore (abort含む)
    } finally {
      setLoading(false);
    }
  }, 300);
  return () => {
    clearTimeout(timer);
    ctrl.abort();
  };
}, [query, cookMethodFilter, favoriteOnly]);
```

---

## TASK-20: `AiChat` に中止ボタン
**ファイル**: [src/components/kondate/AiChat.tsx](../src/components/kondate/AiChat.tsx)
**インパクト**: 🟢 低（UX）

### 方針
```tsx
const abortRef = useRef<AbortController | null>(null);

// sendToApi 内
const ctrl = new AbortController();
abortRef.current = ctrl;
const res = await fetch("/api/meal-plan/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ... }),
  signal: ctrl.signal,
});

// 中止ボタン
{streaming && (
  <button type="button" onClick={() => abortRef.current?.abort()}>
    中止
  </button>
)}
```
サーバ側は既に `request.signal.addEventListener("abort", ...)` を見ているので即効く。

---

# 実行順推奨

## Day 1（Phase 1 — 当日で完了できる）
1. **TASK-1** `thinkingBudget: 0` だけ先に入れて A/B（単独で動作確認）
2. **TASK-2** ストリーミング化
3. **TASK-3** レシピ数 300 → 50
4. **TASK-4** 確定フローをサーバ完結
5. **TASK-5** next.config.ts
6. **TASK-6** `<img>` → `next/image`
7. **TASK-7a/b** Promise.all

→ この時点で AI 初回応答 TTFT 10〜40秒 → 0.5〜1.5秒、他 UI も応答性2倍。

## Day 2〜（Phase 2）
8. **TASK-8** `executeSaveWeeklyMenu` の bulk 化
9. **TASK-9** `buildContext` キャッシュ
10. **TASK-10** WeeklyCalendar 楽観的UI
11. **TASK-11** recommended/popular の SQL 集計化
12. **TASK-12** チャット履歴プルーニング
13. **TASK-13** AI提案プリロード

## 余裕が出たら（Phase 3）
14. **TASK-14** SW 刷新
15. **TASK-15** trigram インデックス
16. **TASK-16** Supabase types
17. **TASK-17** FC search_recipes（TASK-3 の発展）
18. **TASK-18** Supabase キャッシュ戦略
19. **TASK-19** AbortController
20. **TASK-20** 中止ボタン

---

# 追加すべきテスト

## ユニット
- [ ] `buildSystemPrompt` のプロンプト長・推定トークン数のスナップショット（回帰防止）
- [ ] `executeSaveWeeklyMenu` bulk 版：14スロットで INSERT 回数が N以下
- [ ] `aggregateIngredients` に pantry 差し引きケース追加

## インテグレーション
- [ ] `/api/meal-plan/chat` ストリーミング化後の SSE チャンク検証
- [ ] `/api/meal-plan/confirm` の冪等性（2回呼んでも同じ結果）
- [ ] 書き込み系 API の Zod バリデーションエラー応答

## E2E（Playwright、将来）
- [ ] AI提案 → 確定 → 買い物リスト表示のフロー
- [ ] レシピ一覧の検索・フィルタ
- [ ] 買い物リストのチェック + Realtime 同期（2タブ）

## パフォーマンス回帰
- [ ] `/api/meal-plan/chat` の p95 レスポンスタイム計測（固定プロンプト）
- [ ] `recommended/popular` の DB クエリ回数アサート
- [ ] Lighthouse CI で LCP/TBT 監視

---

# リファクタ提案（パフォーマンス以外）

## コンポーネント分割
- **[src/components/kondate/AiSuggestionForm.tsx](../src/components/kondate/AiSuggestionForm.tsx)** が 632行
  - `WeekSelector`, `CookModeSelector`, `MealScheduleGrid`, `PantryChips`, `RecipePicker` に分割
- **[src/app/api/meal-plan/chat/route.ts](../src/app/api/meal-plan/chat/route.ts)** の `start(controller)` が 130行
  - `runFunctionCallRound()` として切り出し
- **[src/lib/gemini/handlers.ts](../src/lib/gemini/handlers.ts)** の `executeSaveWeeklyMenu`
  - `upsertMenu()`, `resolveRecipeIds()`, `insertNewRecipes()`, `insertMealSlots()` に分解

## 共通化
- 全 Route の try/catch + `NextResponse.json({ data, error })` を [src/lib/api/response.ts](../src/lib/api/response.ts) の `apiSuccess`/`apiError` に統一
- `getCurrentMonday` / `getMonday` が複数箇所にある → [src/lib/utils/date.ts](../src/lib/utils/date.ts) に一本化

## 命名
- `availableRecipes` → `recipeCandidates`
- `pendingFcContents` → `conversationHistory`

---

# 機能提案（中長期）

| # | 機能 | 価値 | 難易度 |
|---|---|---|---|
| F1 | AI提案プリロード（TASK-13 で実装） | 体感 -200〜500ms | 低 |
| F2 | FC `search_recipes`（TASK-17 で実装） | プロンプト激減・精度向上 | 中 |
| F3 | ホットクック バルクインポート UI（[bulk route](../src/app/api/hotcook-import/bulk/route.ts) 既存） | 初期体験改善 | 低 |
| F4 | 買い物中のリアルタイム共有強化 | ふたり暮らしに刺さる | 中 |
| F5 | PWA プッシュ通知 | 継続率UP | 中 |
| F6 | 在庫レシートOCR（Gemini Vision） | 入力コスト激減 | 中 |
| F7 | 作り置き/残り物モード（pantry only） | 廃棄削減 | 低 |
| F8 | 週間献立テンプレ保存 | 時短 | 低 |
| F9 | 栄養バランスヒント | 差別化 | 中 |
| F10 | iOS ショートカット連携 | 地味に便利 | 低 |
