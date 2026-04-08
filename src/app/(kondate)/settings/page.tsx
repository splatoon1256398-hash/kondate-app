"use client";

import { useState, useEffect } from "react";
import { User, Palette, ChefHat, Settings } from "lucide-react";
import Link from "next/link";

const USERS = [
  { name: "れん", color: "bg-blue/10 text-blue border-blue/20", role: "料理・買い出し・献立計画" },
  { name: "あかね", color: "bg-green/10 text-green border-green/20", role: "レシピ確認・調理" },
] as const;

const HOTCOOK_MODELS = [
  { value: "KN-HW24H", label: "KN-HW24H (2.4L)" },
  { value: "KN-HW16H", label: "KN-HW16H (1.6L)" },
  { value: "KN-HW24G", label: "KN-HW24G (2.4L)" },
  { value: "KN-HW16G", label: "KN-HW16G (1.6L)" },
  { value: "KN-HW24F", label: "KN-HW24F (2.4L)" },
  { value: "KN-HW16F", label: "KN-HW16F (1.6L)" },
  { value: "KN-HW24E", label: "KN-HW24E (2.4L)" },
  { value: "KN-HW16E", label: "KN-HW16E (1.6L)" },
];

export default function SettingsPage() {
  const [model, setModel] = useState("KN-HW24H");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("hotcook_model");
    if (stored) setModel(stored);
  }, []);

  function handleModelChange(value: string) {
    setModel(value);
    localStorage.setItem("hotcook_model", value);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="pb-6">
      <div className="px-4 py-3">
        <h1 className="text-lg font-bold">設定</h1>
      </div>

      <div className="space-y-5 px-4">
        {/* Hotcook model */}
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <ChefHat size={16} className="text-accent" />
            ホットクック機種
          </h2>
          <select
            value={model}
            onChange={(e) => handleModelChange(e.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium focus:border-accent focus:outline-none"
          >
            {HOTCOOK_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          {saved && (
            <p className="mt-1.5 text-xs text-green">保存しました</p>
          )}
          <p className="mt-1.5 text-[10px] text-muted">
            レシピのインポート時に使用されます
          </p>
        </section>

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

        {/* App info */}
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Settings size={16} className="text-muted" />
            アプリ情報
          </h2>
          <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted">
            <div className="flex justify-between">
              <span>バージョン</span>
              <span>0.2.0</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>スタック</span>
              <span>Next.js + Supabase + Gemini</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>レシピ数</span>
              <span>220+</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
