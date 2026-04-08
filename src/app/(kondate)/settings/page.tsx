"use client";

import { useState, useEffect } from "react";
import { ChefHat, ChevronLeft, ChevronRight, Check } from "lucide-react";
import Link from "next/link";

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
  const [showModelPicker, setShowModelPicker] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("hotcook_model");
    if (stored) setModel(stored);
  }, []);

  function handleModelChange(value: string) {
    setModel(value);
    localStorage.setItem("hotcook_model", value);
    setSaved(true);
    setShowModelPicker(false);
    setTimeout(() => setSaved(false), 2000);
  }

  const currentModel = HOTCOOK_MODELS.find((m) => m.value === model);

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
                {HOTCOOK_MODELS.map((m) => (
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
