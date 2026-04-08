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
    <nav
      className="material-bar separator-top fixed bottom-0 left-0 right-0 z-50 pb-safe-nav"
    >
      <div className="mx-auto flex h-[49px] max-w-lg items-stretch justify-around">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ease-ios ${
                isActive ? "text-blue" : "text-gray"
              }`}
            >
              <Icon size={24} strokeWidth={isActive ? 2 : 1.5} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
