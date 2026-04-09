"use client";

import { useState } from "react";
import { ChefHat, ChevronLeft, ChevronRight, Check } from "lucide-react";
import Link from "next/link";
import {
  HOTCOOK_MODEL_OPTIONS,
  useHotcookModelPreference,
  type HotcookModel,
} from "@/lib/preferences/hotcook-model";

export default function SettingsPage() {
  const [model, setModel] = useHotcookModelPreference();
  const [saved, setSaved] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);

  function handleModelChange(value: HotcookModel) {
    setModel(value);
    setSaved(true);
    setShowModelPicker(false);
    setTimeout(() => setSaved(false), 2000);
  }

  const currentModel =
    HOTCOOK_MODEL_OPTIONS.find((option) => option.value === model) ??
    HOTCOOK_MODEL_OPTIONS[0];

  return (
    <div className="bg-bg-grouped pb-6">
      {/* Navigation Bar */}
      <div className="material-bar separator-bottom flex items-center px-2 py-2.5">
        <Link
          href="/recipes"
          className="flex items-center gap-0.5 px-2 text-[17px] text-blue active:opacity-60"
        >
          <ChevronLeft size={22} strokeWidth={2.5} />
          レシピ
        </Link>
        <h1 className="flex-1 text-center text-[17px] font-semibold text-label">設定</h1>
        <div className="w-16" />
      </div>

      {/* Large Title */}
      <div className="px-4 pt-3 pb-4">
        <h1 className="text-[34px] font-bold leading-[41px] text-label">設定</h1>
      </div>

      <div className="px-4">
        {/* Hotcook model */}
        <section>
          <h2 className="mb-1.5 flex items-center gap-1.5 pl-4 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
            <ChefHat size={11} strokeWidth={2} className="text-blue" />
            ホットクック機種
          </h2>
          <div className="overflow-hidden rounded-[10px] bg-bg-grouped-secondary">
            {!showModelPicker ? (
              <button
                type="button"
                onClick={() => setShowModelPicker(true)}
                className="flex min-h-[44px] w-full items-center px-4 py-2.5 active:bg-fill-tertiary"
              >
                <span className="flex-1 text-left text-[17px] text-label">機種</span>
                <span className="text-[17px] text-label-secondary">{currentModel?.label}</span>
                <ChevronRight size={18} className="ml-1 text-label-tertiary" strokeWidth={2} />
              </button>
            ) : (
              <div className="cell-separator">
                {HOTCOOK_MODEL_OPTIONS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => handleModelChange(m.value)}
                    className="flex min-h-[44px] w-full items-center px-4 py-2.5 active:bg-fill-tertiary"
                  >
                    <span className="flex-1 text-left text-[17px] text-label">{m.label}</span>
                    {model === m.value && (
                      <Check size={18} className="text-blue" strokeWidth={2.5} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          {saved && (
            <p className="mt-1.5 pl-4 text-[12px] text-green">✓ 保存しました</p>
          )}
          <p className="mt-1.5 pl-4 text-[12px] text-label-tertiary">
            レシピのインポート時に使用されます
          </p>
        </section>

        {/* App info */}
        <section className="mt-6">
          <h2 className="mb-1.5 pl-4 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
            アプリ情報
          </h2>
          <div className="cell-separator overflow-hidden rounded-[10px] bg-bg-grouped-secondary">
            <div className="flex min-h-[44px] items-center px-4 py-2.5">
              <span className="flex-1 text-[17px] text-label">バージョン</span>
              <span className="text-[17px] text-label-secondary">0.3.0</span>
            </div>
            <div className="flex min-h-[44px] items-center px-4 py-2.5">
              <span className="flex-1 text-[17px] text-label">スタック</span>
              <span className="text-[15px] text-label-secondary">Next.js · Supabase</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
