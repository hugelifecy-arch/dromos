import BottomNav from '@/components/ui/BottomNav';
import { ToastProvider } from '@/components/ui/Toast';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-surface-950 pb-20">
        {children}
        <BottomNav />
      </div>
    </ToastProvider>
  );
}
