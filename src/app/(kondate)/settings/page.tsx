"use client";

import { User, Palette } from "lucide-react";

const USERS = [
  { name: "れん", color: "bg-blue/10 text-blue border-blue/20", role: "料理・買い出し・献立計画" },
  { name: "あかね", color: "bg-green/10 text-green border-green/20", role: "レシピ確認・調理" },
] as const;

const THEME_COLORS = [
  { name: "パープル", value: "#a78bfa", class: "bg-[#a78bfa]" },
  { name: "ブルー", value: "#60a5fa", class: "bg-[#60a5fa]" },
  { name: "グリーン", value: "#4ade80", class: "bg-[#4ade80]" },
  { name: "オレンジ", value: "#fb923c", class: "bg-[#fb923c]" },
];

export default function SettingsPage() {
  return (
    <div className="pb-6">
      <div className="px-4 py-3">
        <h1 className="text-lg font-bold">設定</h1>
      </div>

      <div className="space-y-5 px-4">
        {/* Users */}
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <User size={16} className="text-muted" />
            ユーザー
          </h2>
          <div className="space-y-2">
            {USERS.map((user) => (
              <div
                key={user.name}
                className={`rounded-lg border p-3 ${user.color}`}
              >
                <div className="text-sm font-bold">{user.name}</div>
                <div className="mt-0.5 text-xs opacity-80">{user.role}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Theme */}
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Palette size={16} className="text-muted" />
            テーマカラー
          </h2>
          <div className="flex gap-3">
            {THEME_COLORS.map((color) => (
              <div key={color.value} className="flex flex-col items-center gap-1">
                <div
                  className={`h-8 w-8 rounded-full ${color.class} ${
                    color.value === "#a78bfa" ? "ring-2 ring-white/30" : ""
                  }`}
                />
                <span className="text-[10px] text-muted">{color.name}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted">
            テーマ変更機能は今後追加予定です
          </p>
        </section>

        {/* App info */}
        <section>
          <h2 className="mb-2 text-sm font-semibold">アプリ情報</h2>
          <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted">
            <div className="flex justify-between">
              <span>バージョン</span>
              <span>0.1.0</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>スタック</span>
              <span>Next.js + Supabase</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
