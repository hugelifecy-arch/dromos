import BottomNav from '@/components/ui/BottomNav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-950 pb-20">
      {children}
      <BottomNav />
    </div>
  );
}
