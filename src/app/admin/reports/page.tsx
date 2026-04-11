export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import ReportsClient from './ReportsClient';

export default async function AdminReportsPage() {
  const supabase = await createClient();

  const { data: reports } = await supabase
    .from('reported_content')
    .select('*, reporter:reporter_id(full_name, email), reviewer:reviewed_by(full_name)')
    .order('created_at', { ascending: false })
    .limit(50);

  // Normalize joins
  const normalized = (reports || []).map((r: any) => ({
    ...r,
    reporter: Array.isArray(r.reporter) ? r.reporter[0] : r.reporter,
    reviewer: Array.isArray(r.reviewer) ? r.reviewer[0] : r.reviewer,
  }));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-6">Content Reports</h1>
      <ReportsClient reports={normalized} />
    </div>
  );
}
