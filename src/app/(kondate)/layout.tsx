import BottomNav from "@/components/kondate/BottomNav";

export default function KondateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg-grouped">
      <main className="flex-1 pb-[calc(60px+env(safe-area-inset-bottom))]">{children}</main>
      <BottomNav />
    </div>
  );
}
