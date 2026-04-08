"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ShoppingCart, Sparkles, BookOpen, Refrigerator } from "lucide-react";

const tabs = [
  { href: "/menu", label: "献立", icon: CalendarDays },
  { href: "/shopping", label: "買い物", icon: ShoppingCart },
  { href: "/ai", label: "AI提案", icon: Sparkles },
  { href: "/pantry", label: "在庫", icon: Refrigerator },
  { href: "/recipes", label: "レシピ", icon: BookOpen },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md pb-safe-nav">
      <div className="mx-auto flex h-[4.25rem] max-w-lg items-center justify-around">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 px-3 py-2.5 text-[11px] font-medium transition-colors ${
                isActive
                  ? "text-accent"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <Icon size={24} strokeWidth={isActive ? 2.5 : 1.5} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
