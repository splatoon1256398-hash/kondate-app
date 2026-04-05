# Codex レビュー指示書

## プロジェクト概要
ふたり暮らし向け週間献立管理アプリ（Next.js 15 + Supabase + Gemini 2.5 Flash）

## レビュー対象
全ソースコード（特にAPI Routes, Geminiハンドラ, フロントエンドコンポーネント）

---

## 確認済みのエラー・問題

### 1. RLS（Row-Level Security）エラー【最重要】
**現象:** `POST /api/meal-plan/confirm` で献立を確定すると  
`"new row violates row-level security policy for table "weekly_menus""` エラー

**原因:**
- `src/lib/supabase/server.ts` でサーバー側Supabaseクライアントを `NEXT_PUBLIC_SUPABASE_ANON_KEY`（anon key）で作成している
- 全テーブルのRLSポリシーが `auth.role() = 'authenticated'` を要求（`docs/db-schema.md` 参照）
- サーバー側APIルートからのリクエストは未認証状態のため、RLSに弾かれる

**確認すべき点:**
- `src/lib/supabase/server.ts` — anon key ではなく service_role key を使うべきか？
- 全APIルート（`src/app/api/` 配下）で同じクライアントを使っているが、RLSとの整合性は取れているか？
- AI提案チャット（`/api/meal-plan/chat`）が過去に動いていたのはなぜか？（RLSポリシーが当時と異なる可能性）
- 正しい修正方法を提案してほしい（service_role key使用 or RLSポリシー変更 or 認証情報のパススルー）

### 2. ReadableStream controller.close() 二重呼び出し
**現象:** `src/app/api/meal-plan/chat/route.ts:162` で `ERR_INVALID_STATE: Controller is already closed`

**現在の対処:** try-catch で囲んで握りつぶしている  
**確認すべき点:** 根本的に二重closeが起きる原因を特定し、正しい制御フローに修正すべきか

### 3. Gemini Function Calling のデータ欠損
**現象:** Geminiが `save_weekly_menu` を呼ぶ際、`ingredients` や `steps` 配列が `undefined` になることがある

**現在の対処:** `src/lib/gemini/handlers.ts` で `?? []` のデフォルト値を設定  
**確認すべき点:** `src/lib/gemini/functions.ts` のスキーマ定義に `required` で指定しているのに省略される原因

---

## レビュー観点

### A. セキュリティ
- [ ] Supabaseクライアントの認証方式（anon key vs service_role key）の適切性
- [ ] RLSポリシーと実際のAPIアクセスパターンの整合性
- [ ] API Routes に認証チェック（ミドルウェア等）はあるか？ない場合、必要か？
- [ ] ホットクックインポートAPI（`src/app/api/hotcook-import/route.ts`）が外部APIを叩いている — レート制限やエラーハンドリングは十分か？

### B. エラーハンドリング
- [ ] `src/app/api/meal-plan/chat/route.ts` — SSEストリームの途中切断対応
- [ ] `src/lib/gemini/handlers.ts` — DB操作がトランザクションなしで行われている。途中失敗時のデータ不整合リスク
- [ ] `src/app/api/meal-plan/confirm/route.ts` — 新規追加。エラーハンドリングの妥当性
- [ ] `src/app/api/recipes/[id]/route.ts` — PUT/DELETE 新規追加。バリデーションの妥当性

### C. データ整合性
- [ ] `executeSaveWeeklyMenu` — レシピの重複判定が `title` 完全一致のみ。同名別レシピのリスク
- [ ] `executeSaveWeeklyMenu` — 既存slotを全削除→再挿入している。CASCADE削除の影響範囲
- [ ] `executeGenerateShoppingList` — 既存shopping_listを全削除→再作成。チェック済みアイテムが消えるリスク

### D. フロントエンド
- [ ] `src/components/kondate/AiChat.tsx` — 確定ボタン（`confirmProposal`）のUX。ローディング表示・二重送信防止
- [ ] `src/components/kondate/RecipeEditForm.tsx` — 新規作成。バリデーション・エラー表示の妥当性
- [ ] `src/components/kondate/HotcookImportDialog.tsx` — 新規作成。URLパース処理の妥当性

### E. アーキテクチャ
- [ ] `src/lib/supabase/server.ts` vs `src/lib/supabase/client.ts` — サーバー/クライアントの役割分担
- [ ] APIルートの認証ミドルウェアの有無
- [ ] 型安全性（`as any` や `as unknown` のキャスト箇所）

---

## 主要ファイル一覧

### API Routes
- `src/app/api/meal-plan/chat/route.ts` — AIチャット（SSE + Gemini FC）
- `src/app/api/meal-plan/confirm/route.ts` — 献立確定（直接DB保存）【新規】
- `src/app/api/recipes/route.ts` — レシピ一覧・新規作成
- `src/app/api/recipes/[id]/route.ts` — レシピ詳細・編集・削除（PUT/DELETE追加）【変更】
- `src/app/api/hotcook-import/route.ts` — ホットクックレシピインポート【新規】

### Gemini連携
- `src/lib/gemini/functions.ts` — Function Calling スキーマ定義
- `src/lib/gemini/handlers.ts` — FC実行ハンドラ（DB操作）
- `src/lib/gemini/prompts.ts` — システムプロンプト
- `src/lib/gemini/client.ts` — Geminiクライアント初期化

### Supabase
- `src/lib/supabase/server.ts` — サーバー側クライアント（問題の根幹）
- `src/lib/supabase/client.ts` — フロントエンド側クライアント
- `docs/db-schema.md` — テーブル定義 + RLSポリシーSQL

### フロントエンド（新規・変更）
- `src/components/kondate/AiChat.tsx` — AIチャットUI（確定ボタン機能追加）【変更】
- `src/components/kondate/MealPlanProposalCard.tsx` — 提案カード（確定ボタン追加）【変更】
- `src/components/kondate/RecipeList.tsx` — レシピ一覧・検索【新規】
- `src/components/kondate/RecipeDetailPage.tsx` — レシピ詳細（編集・削除付き）【新規】
- `src/components/kondate/RecipeEditForm.tsx` — レシピ編集フォーム【新規】
- `src/components/kondate/HotcookImportDialog.tsx` — インポートダイアログ【新規】
- `src/components/kondate/BottomNav.tsx` — レシピタブ追加【変更】

---

## 期待するアウトプット
1. 上記エラー3件それぞれの修正方針と具体的なコード変更案
2. レビュー観点A〜Eの各項目に対する指摘事項
3. 見落としている潜在的なバグやリスクがあれば報告
