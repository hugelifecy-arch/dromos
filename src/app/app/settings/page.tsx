export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { ArrowLeft, LogOut, Trash2, Bell } from 'lucide-react';
import Link from 'next/link';
import SettingsClient from './client';

interface DriverVerification {
  id: string;
  licence_number: string;
  licence_district: string;
  taxi_type: string;
  verification_status: 'pending' | 'approved' | 'rejected';
  verified_at: string | null;
  rejection_reason: string | null;
  vehicle_plate: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_colour: string | null;
  vehicle_seats: number | null;
  wheelchair_accessible: boolean;
  preferred_districts: string[] | null;
  language_preference: string;
}

const DISTRICTS = [
  { id: 'nicosia', label: 'Nicosia' },
  { id: 'limassol', label: 'Limassol' },
  { id: 'larnaca', label: 'Larnaca' },
  { id: 'paphos', label: 'Paphos' },
  { id: 'famagusta', label: 'Famagusta' },
];

function getVerificationStatusBadge(status: string) {
  switch (status) {
    case 'approved':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
          Approved
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
          Pending
        </span>
      );
    case 'rejected':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
          Rejected
        </span>
      );
    default:
      return null;
  }
}

function formatDistrict(district: string): string {
  const districtMap: Record<string, string> = {
    nicosia: 'Nicosia',
    limassol: 'Limassol',
    larnaca: 'Larnaca',
    paphos: 'Paphos',
    famagusta: 'Famagusta',
  };
  return districtMap[district] || district;
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: verification } = await supabase
    .from('driver_verification')
    .select('*')
    .eq('user_id', user.id)
    .single() as { data: DriverVerification | null };

  if (!verification) {
    return (
      <div className="max-w-lg mx-auto">
        <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40 flex items-center gap-3">
          <Link href="/app/profile" className="p-2 -m-2 text-surface-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold text-white">Settings</h1>
        </header>

        <div className="p-6 text-center">
          <p className="text-surface-400">Driver verification data not found. Please complete your profile setup.</p>
          <Link href="/app/profile" className="mt-4 inline-block px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl transition-colors">
            Back to Profile
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40 flex items-center gap-3">
        <Link href="/app/profile" className="p-2 -m-2 text-surface-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-white">Settings</h1>
      </header>

      <div className="divide-y divide-surface-800">
        {/* Licence Details */}
        <section className="p-6 border-b border-surface-800">
          <h2 className="text-lg font-semibold text-white mb-4">Licence Details</h2>
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-surface-500 mb-1">Licence Number</p>
                <p className="text-white font-medium">{verification.licence_number}</p>
              </div>
            </div>

            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-surface-500 mb-1">District</p>
                <p className="text-white font-medium">{formatDistrict(verification.licence_district)}</p>
              </div>
            </div>

            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-surface-500 mb-1">Taxi Type</p>
                <p className="text-white font-medium capitalize">{verification.taxi_type}</p>
              </div>
            </div>

            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-surface-500 mb-1">Verification Status</p>
                <div className="mt-1">
                  {getVerificationStatusBadge(verification.verification_status)}
                </div>
              </div>
            </div>

            {verification.verification_status === 'rejected' && verification.rejection_reason && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                <p className="text-sm text-red-400">
                  <span className="font-medium">Rejection reason:</span> {verification.rejection_reason}
                </p>
              </div>
            )}

            {verification.verification_status === 'approved' && (
              <a
                href={`mailto:support@dromos.app?subject=Request%20Update%20to%20Licence%20Details`}
                className="inline-block text-sm text-brand-400 hover:text-brand-300 transition-colors font-medium mt-2"
              >
                Request Update →
              </a>
            )}
          </div>
        </section>

        {/* Vehicle Details */}
        <section className="p-6 border-b border-surface-800">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-white mb-2">Vehicle Details</h2>
            <p className="text-sm text-surface-500">Updating vehicle details may trigger a brief review.</p>
          </div>
          <SettingsClient verification={verification} />
        </section>

        {/* Preferred Areas */}
        <section className="p-6 border-b border-surface-800">
          <h2 className="text-lg font-semibold text-white mb-2">Preferred Areas</h2>
          <p className="text-sm text-surface-400 mb-4">Select districts where you mainly operate. Used for feed notifications.</p>
          <div className="space-y-3">
            {DISTRICTS.map((district) => (
              <label key={district.id} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  defaultChecked={verification.preferred_districts?.includes(district.id) ?? false}
                  disabled
                  className="w-5 h-5 rounded border-surface-700 bg-surface-900 text-brand-600 focus:ring-brand-500 cursor-pointer"
                />
                <span className="text-surface-300 group-hover:text-white transition-colors">{district.label}</span>
              </label>
            ))}
          </div>
          <span className="mt-4 inline-block text-sm text-surface-500 font-medium">
            Coming soon
          </span>
        </section>

        {/* Language Preference */}
        <section className="p-6 border-b border-surface-800">
          <h2 className="text-lg font-semibold text-white mb-4">Language Preference</h2>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name="language"
                value="en"
                defaultChecked={verification.language_preference === 'en'}
                disabled
                className="w-5 h-5 text-brand-600 bg-surface-900 border-surface-700 focus:ring-brand-500"
              />
              <span className="text-surface-300 group-hover:text-white transition-colors">English</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name="language"
                value="el"
                defaultChecked={verification.language_preference === 'el'}
                disabled
                className="w-5 h-5 text-brand-600 bg-surface-900 border-surface-700 focus:ring-brand-500"
              />
              <span className="text-surface-300 group-hover:text-white transition-colors">Greek (Ελληνικά)</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name="language"
                value="tr"
                defaultChecked={verification.language_preference === 'tr'}
                disabled
                className="w-5 h-5 text-brand-600 bg-surface-900 border-surface-700 focus:ring-brand-500"
              />
              <span className="text-surface-300 group-hover:text-white transition-colors">Turkish (Türkçe)</span>
            </label>
          </div>
          <span className="mt-4 inline-block text-sm text-surface-500 font-medium">
            Coming soon
          </span>
        </section>

        {/* Notifications */}
        <section className="p-6 border-b border-surface-800">
          <h2 className="text-lg font-semibold text-white mb-4">Notifications</h2>
          <Link
            href="/app/notifications/preferences"
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-surface-900 hover:bg-surface-800 transition-colors text-surface-300 hover:text-white"
          >
            <Bell className="w-5 h-5" />
            <span>Notification Preferences</span>
          </Link>
        </section>

        {/* Account */}
        <section className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Account</h2>
          <div className="space-y-2">
            <form action="/auth/logout" method="post">
              <button
                type="submit"
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-surface-900 hover:bg-surface-800 transition-colors text-surface-300 hover:text-white"
              >
                <LogOut className="w-5 h-5" />
                <span>Sign Out</span>
              </button>
            </form>
            <a
              href="mailto:support@dromos.app?subject=Delete%20My%20Account"
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 transition-colors text-red-400 hover:text-red-300"
            >
              <Trash2 className="w-5 h-5" />
              <span>Delete Account</span>
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
