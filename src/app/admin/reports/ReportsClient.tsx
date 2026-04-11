'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Flag, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';

interface Report {
  id: string;
  reporter: { full_name: string; email: string } | null;
  reviewer: { full_name: string } | null;
  content_type: string;
  content_id: string;
  reason: string;
  description: string | null;
  status: string;
  action_taken: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface Props {
  reports: Report[];
}

export default function ReportsClient({ reports: initialReports }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [reports, setReports] = useState(initialReports);
  const [filter, setFilter] = useState('all');
  const [actionNote, setActionNote] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const filtered = filter === 'all' ? reports : reports.filter(r => r.status === filter);

  async function handleAction(reportId: string, newStatus: string) {
    const { error } = await supabase
      .from('reported_content')
      .update({
        status: newStatus,
        action_taken: actionNote || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', reportId);

    if (!error) {
      setReports(reports.map(r =>
        r.id === reportId ? { ...r, status: newStatus, action_taken: actionNote } : r
      ));
      setActiveId(null);
      setActionNote('');
      router.refresh();
    }
  }

  const statusIcon: Record<string, any> = {
    pending: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
    reviewed: <CheckCircle className="w-4 h-4 text-blue-400" />,
    action_taken: <CheckCircle className="w-4 h-4 text-green-400" />,
    dismissed: <XCircle className="w-4 h-4 text-surface-500" />,
  };

  const reasonColors: Record<string, string> = {
    spam: 'bg-yellow-500/10 text-yellow-400',
    harassment: 'bg-red-500/10 text-red-400',
    inappropriate: 'bg-orange-500/10 text-orange-400',
    scam: 'bg-red-500/10 text-red-400',
    other: 'bg-surface-700 text-surface-400',
  };

  const filters = ['all', 'pending', 'reviewed', 'action_taken', 'dismissed'];

  return (
    <>
      <div className="flex gap-1 mb-6 overflow-x-auto">
        {filters.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-2 text-xs rounded-xl transition-colors capitalize whitespace-nowrap ${
              filter === f ? 'bg-brand-600 text-white' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
            }`}
          >
            {f === 'all' ? 'All' : f.replace('_', ' ')}
            {f === 'pending' && ` (${reports.filter(r => r.status === 'pending').length})`}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map(report => (
          <div key={report.id} className="bg-surface-900 border border-surface-800 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{statusIcon[report.status] || <Flag className="w-4 h-4 text-surface-500" />}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${reasonColors[report.reason] || ''}`}>
                    {report.reason}
                  </span>
                  <span className="text-xs text-surface-500 capitalize">
                    {report.content_type}
                  </span>
                  <span className="text-xs text-surface-600">
                    {format(new Date(report.created_at), 'MMM d, HH:mm')}
                  </span>
                </div>
                {report.description && (
                  <p className="text-sm text-surface-300 mb-1">{report.description}</p>
                )}
                <p className="text-xs text-surface-500">
                  Reported by: {report.reporter?.full_name || 'Unknown'}
                </p>
                {report.action_taken && (
                  <p className="text-xs text-surface-400 mt-1">
                    Action: {report.action_taken}
                  </p>
                )}
              </div>
            </div>

            {/* Actions for pending reports */}
            {report.status === 'pending' && (
              <div className="mt-3 pt-3 border-t border-surface-800">
                {activeId === report.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={actionNote}
                      onChange={e => setActionNote(e.target.value)}
                      placeholder="Action note (optional)..."
                      className="w-full bg-surface-800 border border-surface-700 rounded-xl px-3 py-2 text-xs text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAction(report.id, 'action_taken')}
                        className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        Take Action
                      </button>
                      <button
                        onClick={() => handleAction(report.id, 'dismissed')}
                        className="px-3 py-1.5 text-xs bg-surface-700 text-surface-300 rounded-lg hover:bg-surface-600"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => { setActiveId(null); setActionNote(''); }}
                        className="px-3 py-1.5 text-xs text-surface-500 hover:text-surface-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setActiveId(report.id)}
                    className="text-xs text-brand-400 hover:text-brand-300"
                  >
                    Review this report
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-surface-500">
            <Flag className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg mb-1">No reports</p>
            <p className="text-sm">
              {filter === 'pending' ? 'All caught up!' : 'No reports found for this filter.'}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
