'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { ShieldCheck, ShieldX, Clock, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { AVATAR_PLACEHOLDER } from '@/lib/constants';

interface Verification {
  id: string;
  user_id: string;
  licence_number: string;
  licence_district: string;
  taxi_type: string;
  licence_photo_front_url: string | null;
  licence_photo_back_url: string | null;
  vehicle_plate: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: number | null;
  vehicle_colour: string | null;
  vehicle_seats: number;
  wheelchair_accessible: boolean;
  preferred_districts: string[] | null;
  verification_status: string;
  rejection_reason: string | null;
  verified_at: string | null;
  created_at: string;
  profile: {
    full_name: string;
    email: string;
    avatar_url: string | null;
    phone: string | null;
  } | null;
}

interface Props {
  verifications: Verification[];
}

export default function VerificationsClient({ verifications: initialData }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [verifications, setVerifications] = useState(initialData);
  const [filter, setFilter] = useState('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [loading, setLoading] = useState(false);

  const filtered = filter === 'all'
    ? verifications
    : verifications.filter(v => v.verification_status === filter);

  const counts = {
    all: verifications.length,
    pending: verifications.filter(v => v.verification_status === 'pending').length,
    approved: verifications.filter(v => v.verification_status === 'approved').length,
    rejected: verifications.filter(v => v.verification_status === 'rejected').length,
  };

  async function handleApprove(id: string, userId: string) {
    setLoading(true);
    const { error } = await supabase
      .from('driver_verification')
      .update({
        verification_status: 'approved',
        verified_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq('id', id);

    if (!error) {
      // Also mark the user's profile as verified
      await supabase
        .from('profiles')
        .update({ is_verified: true, is_driver: true })
        .eq('id', userId);

      setVerifications(verifications.map(v =>
        v.id === id ? { ...v, verification_status: 'approved', verified_at: new Date().toISOString() } : v
      ));
      setExpandedId(null);
      router.refresh();
    }
    setLoading(false);
  }

  async function handleReject(id: string, userId: string) {
    if (!rejectionReason.trim()) return;
    setLoading(true);
    const { error } = await supabase
      .from('driver_verification')
      .update({
        verification_status: 'rejected',
        rejection_reason: rejectionReason.trim(),
        verified_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (!error) {
      await supabase
        .from('profiles')
        .update({ is_verified: false })
        .eq('id', userId);

      setVerifications(verifications.map(v =>
        v.id === id ? { ...v, verification_status: 'rejected', rejection_reason: rejectionReason } : v
      ));
      setExpandedId(null);
      setRejectionReason('');
      router.refresh();
    }
    setLoading(false);
  }

  const filters = [
    { key: 'pending', label: `Pending (${counts.pending})` },
    { key: 'approved', label: `Approved (${counts.approved})` },
    { key: 'rejected', label: `Rejected (${counts.rejected})` },
    { key: 'all', label: `All (${counts.all})` },
  ];

  const statusStyle: Record<string, string> = {
    pending: 'bg-yellow-500/10 text-yellow-400',
    approved: 'bg-green-500/10 text-green-400',
    rejected: 'bg-red-500/10 text-red-400',
  };

  return (
    <>
      <div className="flex gap-1 mb-6 overflow-x-auto">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-2 text-xs rounded-xl transition-colors whitespace-nowrap ${
              filter === f.key ? 'bg-brand-600 text-white' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map(v => {
          const isExpanded = expandedId === v.id;
          return (
            <div key={v.id} className="bg-surface-900 border border-surface-800 rounded-2xl overflow-hidden">
              {/* Header row */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : v.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-surface-800/30 transition-colors"
              >
                <img
                  src={v.profile?.avatar_url || `${AVATAR_PLACEHOLDER}${v.profile?.full_name || 'D'}`}
                  alt=""
                  className="w-10 h-10 rounded-full bg-surface-700 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium text-sm">{v.profile?.full_name || 'Unknown'}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusStyle[v.verification_status] || ''}`}>
                      {v.verification_status}
                    </span>
                  </div>
                  <p className="text-xs text-surface-500">
                    {v.licence_district} &middot; {v.taxi_type} &middot; {v.vehicle_make} {v.vehicle_model} &middot; {v.vehicle_plate}
                  </p>
                </div>
                <div className="text-xs text-surface-500 shrink-0 text-right mr-2">
                  {format(new Date(v.created_at), 'MMM d')}
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-surface-500" /> : <ChevronDown className="w-4 h-4 text-surface-500" />}
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-surface-800 pt-4 space-y-4">
                  {/* Driver info */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-surface-500 mb-1">Contact</p>
                      <p className="text-surface-300">{v.profile?.email}</p>
                      <p className="text-surface-300">{v.profile?.phone || 'No phone'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-surface-500 mb-1">Licence</p>
                      <p className="text-surface-300">{v.licence_number}</p>
                      <p className="text-surface-400 capitalize">{v.licence_district} &middot; {v.taxi_type}</p>
                    </div>
                  </div>

                  {/* Vehicle info */}
                  <div>
                    <p className="text-xs text-surface-500 mb-1">Vehicle</p>
                    <p className="text-surface-300">
                      {v.vehicle_make} {v.vehicle_model} {v.vehicle_year && `(${v.vehicle_year})`}
                      {v.vehicle_colour && ` \u00B7 ${v.vehicle_colour}`}
                    </p>
                    <p className="text-surface-400 text-sm">
                      Plate: {v.vehicle_plate} &middot; {v.vehicle_seats} seats
                      {v.wheelchair_accessible && ' \u00B7 \u267F Wheelchair accessible'}
                    </p>
                    {v.preferred_districts && v.preferred_districts.length > 0 && (
                      <p className="text-surface-500 text-xs mt-1">
                        Preferred: {v.preferred_districts.join(', ')}
                      </p>
                    )}
                  </div>

                  {/* Licence photos */}
                  <div>
                    <p className="text-xs text-surface-500 mb-2">Licence Photos</p>
                    <div className="flex gap-3">
                      {v.licence_photo_front_url ? (
                        <a
                          href={v.licence_photo_front_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 bg-surface-800 px-3 py-2 rounded-xl"
                        >
                          <Eye className="w-3 h-3" /> Front
                        </a>
                      ) : (
                        <span className="text-xs text-surface-600">No front photo</span>
                      )}
                      {v.licence_photo_back_url ? (
                        <a
                          href={v.licence_photo_back_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 bg-surface-800 px-3 py-2 rounded-xl"
                        >
                          <Eye className="w-3 h-3" /> Back
                        </a>
                      ) : (
                        <span className="text-xs text-surface-600">No back photo</span>
                      )}
                    </div>
                  </div>

                  {/* Rejection reason (if rejected) */}
                  {v.verification_status === 'rejected' && v.rejection_reason && (
                    <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-3">
                      <p className="text-xs text-red-400 font-medium mb-1">Rejection Reason</p>
                      <p className="text-sm text-surface-300">{v.rejection_reason}</p>
                    </div>
                  )}

                  {/* Action buttons (for pending) */}
                  {v.verification_status === 'pending' && (
                    <div className="flex flex-col gap-3 pt-2 border-t border-surface-800">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(v.id, v.user_id)}
                          disabled={loading}
                          className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50"
                        >
                          <ShieldCheck className="w-4 h-4" /> Approve
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={rejectionReason}
                          onChange={e => setRejectionReason(e.target.value)}
                          placeholder="Rejection reason (required)..."
                          className="flex-1 bg-surface-800 border border-surface-700 rounded-xl px-3 py-2 text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                        <button
                          onClick={() => handleReject(v.id, v.user_id)}
                          disabled={loading || !rejectionReason.trim()}
                          className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600/80 text-white rounded-xl hover:bg-red-600 disabled:opacity-50"
                        >
                          <ShieldX className="w-4 h-4" /> Reject
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-surface-500">
            <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg mb-1">
              {filter === 'pending' ? 'No pending verifications' : 'No verifications found'}
            </p>
            <p className="text-sm">
              {filter === 'pending' ? 'All caught up!' : 'Try changing the filter.'}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
