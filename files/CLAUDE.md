# CLAUDE.md

## プロジェクト概要
ふたり暮らし向け週間献立管理アプリ（家計簿アプリと同一リポジトリ or 同一Supabase）

## ドキュメント
- docs/requirements.md — MVP要件定義
- docs/db-schema.md — テーブル定義 + RLS + SQL
- docs/ui-design.md — 画面構成 + 遷移図
- docs/ai-design.md — Gemini プロンプト + FC定義
- docs/api-design.md — エンドポイント + 型定義
ß
## 技術スタック
- Next.js 15 (App Router) / TypeScript / React 19
- Supabase (既存の家計簿と同一プロジェクト)
- Gemini 2.5 Flash (Function Calling)
- Tailwind CSS + Radix UI
- Vercel

## 実装順序
1. DBテーブル作成（db-schema.mdのSQLをSupabaseで実行）
2. API Routes（api-design.md準拠）
3. 画面実装（ui-design.md準拠、家計簿のコンポーネントを流用）
4. AI連携（ai-design.md準拠）