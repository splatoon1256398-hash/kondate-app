import BottomNav from "@/components/kondate/BottomNav";

export default function KondateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1 pb-16">{children}</main>
      <BottomNav />
    </div>
  );
}
