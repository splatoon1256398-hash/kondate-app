"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ShoppingCart, Sparkles, BookOpen, Settings } from "lucide-react";

const tabs = [
  { href: "/menu", label: "献立", icon: CalendarDays },
  { href: "/shopping", label: "買い物", icon: ShoppingCart },
  { href: "/ai", label: "AI提案", icon: Sparkles },
  { href: "/recipes", label: "レシピ", icon: BookOpen },
  { href: "/settings", label: "設定", icon: Settings },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md pb-safe">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-around">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs transition-colors ${
                isActive
                  ? "text-accent"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
