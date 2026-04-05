"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, X, Loader2, Wallet } from "lucide-react";
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
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-green py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90"
        >
          <CheckCircle2 size={16} />
          買い物完了
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-sm font-bold">買い物完了</Dialog.Title>
            <Dialog.Close className="text-muted hover:text-foreground">
              <X size={18} />
            </Dialog.Close>
          </div>

          {result ? (
            <div className="py-6 text-center">
              <CheckCircle2 size={40} className="mx-auto text-green" />
              <p className="mt-3 text-lg font-bold">
                &yen;{result.total.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-muted">
                {result.recorded ? "家計簿に記録しました" : "金額を保存しました"}
              </p>
              <p className="mt-1 text-xs text-muted">食材を冷蔵庫に追加しました</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-muted">合計金額（円）</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">&yen;</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="3200"
                    className="w-full rounded-lg border border-border bg-background py-3 pl-8 pr-4 text-lg font-semibold placeholder:text-muted focus:border-accent focus:outline-none"
                    autoFocus
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 rounded-lg bg-background p-3">
                <Checkbox.Root
                  checked={recordToKakeibo}
                  onCheckedChange={(v) => setRecordToKakeibo(v === true)}
                  className="flex h-5 w-5 items-center justify-center rounded border border-border bg-background data-[state=checked]:border-accent data-[state=checked]:bg-accent"
                >
                  <Checkbox.Indicator>
                    <CheckCircle2 size={14} className="text-background" />
                  </Checkbox.Indicator>
                </Checkbox.Root>
                <div className="flex items-center gap-1.5 text-sm">
                  <Wallet size={14} className="text-accent" />
                  家計簿に記録する
                </div>
              </label>

              <button
                type="submit"
                disabled={!amount || parseInt(amount) <= 0 || submitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-green py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    処理中...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    完了する
                  </>
                )}
              </button>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
