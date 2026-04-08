"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, Loader2, Wallet, Check } from "lucide-react";
import * as Checkbox from "@radix-ui/react-checkbox";
import type { ApiResponse } from "@/types/common";

type Props = {
  shoppingListId: string;
  onComplete: () => void;
};

export default function ShoppingComplete({ shoppingListId, onComplete }: Props) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [recordToKakeibo, setRecordToKakeibo] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ total: number; recorded: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const total = parseInt(amount, 10);
    if (!total || total <= 0) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/shopping-lists/${shoppingListId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actual_total: total,
          record_to_kakeibo: recordToKakeibo,
        }),
      });
      const json: ApiResponse<{ actual_total: number; transaction_id: string | null }> = await res.json();

      if (json.data) {
        setResult({ total: json.data.actual_total, recorded: !!json.data.transaction_id });
        setTimeout(() => {
          setOpen(false);
          onComplete();
        }, 2000);
      }
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[12px] bg-green text-[17px] font-semibold text-white active:opacity-80 ease-ios transition-opacity"
        >
          <CheckCircle2 size={18} strokeWidth={2} />
          買い物完了
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg rounded-t-[14px] bg-bg-secondary pb-safe shadow-2xl">
          {/* Grab bar */}
          <div className="flex justify-center pt-2 pb-1">
            <div className="h-1 w-9 rounded-full bg-gray3" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2">
            {result ? (
              <div className="w-full text-center">
                <Dialog.Title className="text-[17px] font-semibold text-label">完了</Dialog.Title>
              </div>
            ) : (
              <>
                <Dialog.Close className="text-[17px] text-blue active:opacity-60">
                  キャンセル
                </Dialog.Close>
                <Dialog.Title className="text-[17px] font-semibold text-label">買い物完了</Dialog.Title>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!amount || parseInt(amount) <= 0 || submitting}
                  className="text-[17px] font-semibold text-blue active:opacity-60 disabled:opacity-30"
                >
                  完了
                </button>
              </>
            )}
          </div>

          {result ? (
            <div className="px-4 py-10 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green">
                <Check size={32} className="text-white" strokeWidth={3} />
              </div>
              <p className="mt-4 text-[34px] font-bold text-label">
                ¥{result.total.toLocaleString()}
              </p>
              <p className="mt-2 text-[15px] text-label-secondary">
                {result.recorded ? "家計簿に記録しました" : "金額を保存しました"}
              </p>
              <p className="mt-1 text-[13px] text-label-tertiary">食材を在庫に追加しました</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5 px-4 pb-6 pt-3">
              {/* Amount input */}
              <div>
                <h3 className="mb-1.5 pl-4 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
                  合計金額
                </h3>
                <div className="rounded-[10px] bg-bg-grouped-secondary p-4">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-[28px] font-semibold text-label-tertiary">¥</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0"
                      className="w-32 bg-transparent text-center text-[34px] font-bold text-label placeholder:text-label-tertiary focus:outline-none"
                      autoFocus
                    />
                  </div>
                </div>
              </div>

              {/* Kakeibo toggle */}
              <div>
                <h3 className="mb-1.5 pl-4 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
                  家計簿
                </h3>
                <label className="flex min-h-[44px] items-center gap-3 rounded-[10px] bg-bg-grouped-secondary px-4 py-3">
                  <Wallet size={18} className="text-blue" strokeWidth={1.5} />
                  <span className="flex-1 text-[17px] text-label">家計簿に記録する</span>
                  <Checkbox.Root
                    checked={recordToKakeibo}
                    onCheckedChange={(v) => setRecordToKakeibo(v === true)}
                    className="flex h-7 w-12 items-center rounded-full bg-fill-tertiary p-0.5 transition-colors data-[state=checked]:bg-green"
                  >
                    <Checkbox.Indicator className="block">
                      <div className="ml-5 h-6 w-6 rounded-full bg-white shadow" />
                    </Checkbox.Indicator>
                    {!recordToKakeibo && <div className="h-6 w-6 rounded-full bg-white shadow" />}
                  </Checkbox.Root>
                </label>
              </div>

              {submitting && (
                <div className="flex items-center justify-center gap-2 text-[15px] text-label-secondary">
                  <Loader2 size={16} className="animate-spin" />
                  処理中...
                </div>
              )}
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
