'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { ArrowLeft, Camera, Save } from 'lucide-react';
import { AVATAR_PLACEHOLDER } from '@/lib/constants';
import Link from 'next/link';
import type { Profile } from '@/types/database';

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    bio: '',
    is_driver: false,
    car_make: '',
    car_model: '',
    car_year: '',
    car_color: '',
    car_plate: '',
  });

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/auth/login'); return; }

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (data) {
      setProfile(data as Profile);
      setForm({
        full_name: data.full_name || '',
        phone: data.phone || '',
        bio: data.bio || '',
        is_driver: data.is_driver || false,
        car_make: data.car_make || '',
        car_model: data.car_model || '',
        car_year: data.car_year ? String(data.car_year) : '',
        car_color: data.car_color || '',
        car_plate: data.car_plate || '',
      });
    }
    setLoading(false);
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);

    let avatar_url = profile.avatar_url;

    // Upload avatar if changed
    if (avatarFile) {
      const ext = avatarFile.name.split('.').pop();
      const path = `${profile.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, avatarFile, { upsert: true });

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
        avatar_url = urlData.publicUrl;
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name,
        phone: form.phone || null,
        bio: form.bio || null,
        avatar_url,
        is_driver: form.is_driver,
        car_make: form.is_driver ? form.car_make || null : null,
        car_model: form.is_driver ? form.car_model || null : null,
        car_year: form.is_driver && form.car_year ? parseInt(form.car_year) : null,
        car_color: form.is_driver ? form.car_color || null : null,
        car_plate: form.is_driver ? form.car_plate || null : null,
      })
      .eq('id', profile.id);

    setSaving(false);
    if (!error) {
      setToast('Profile updated!');
      setTimeout(() => setToast(null), 2000);
    }
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const avatarSrc = avatarPreview || profile?.avatar_url || `${AVATAR_PLACEHOLDER}${form.full_name}`;

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40 flex items-center gap-3">
        <Link href="/app/profile" className="p-1 text-surface-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold text-white">Settings</h1>
      </header>

      <form onSubmit={handleSave} className="p-4 space-y-6">
        {/* Avatar */}
        <div className="flex flex-col items-center">
          <div className="relative">
            <img
              src={avatarSrc}
              alt=""
              className="w-24 h-24 rounded-full object-cover bg-surface-800"
            />
            <label className="absolute bottom-0 right-0 p-2 bg-brand-600 rounded-full cursor-pointer hover:bg-brand-700 transition-colors">
              <Camera className="w-4 h-4 text-white" />
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </label>
          </div>
          <p className="text-xs text-surface-500 mt-2">Tap camera to change photo</p>
        </div>

        {/* Basic info */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-surface-400 uppercase tracking-wide">Personal Info</h2>
          <div>
            <label className="block text-sm text-surface-400 mb-1">Display Name</label>
            <input
              type="text"
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm text-surface-400 mb-1">Phone Number</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+30 69x xxx xxxx"
              className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm text-surface-400 mb-1">Bio</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              rows={3}
              placeholder="Tell others about yourself..."
              className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>
        </div>

        {/* Driver toggle */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-surface-400 uppercase tracking-wide">Driver Mode</h2>
              <p className="text-xs text-surface-500 mt-0.5">Enable to offer rides</p>
            </div>
            <button
              type="button"
              onClick={() => setForm({ ...form, is_driver: !form.is_driver })}
              className={`relative w-12 h-7 rounded-full transition-colors ${form.is_driver ? 'bg-brand-600' : 'bg-surface-700'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform ${form.is_driver ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {/* Car details */}
          {form.is_driver && (
            <div className="space-y-4 pl-0">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-surface-400 mb-1">Make</label>
                  <input
                    type="text"
                    value={form.car_make}
                    onChange={(e) => setForm({ ...form, car_make: e.target.value })}
                    placeholder="e.g. Toyota"
                    className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-surface-400 mb-1">Model</label>
                  <input
                    type="text"
                    value={form.car_model}
                    onChange={(e) => setForm({ ...form, car_model: e.target.value })}
                    placeholder="e.g. Yaris"
                    className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-surface-400 mb-1">Year</label>
                  <input
                    type="number"
                    value={form.car_year}
                    onChange={(e) => setForm({ ...form, car_year: e.target.value })}
                    placeholder="2020"
                    min="1990"
                    max="2030"
                    className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-surface-400 mb-1">Color</label>
                  <input
                    type="text"
                    value={form.car_color}
                    onChange={(e) => setForm({ ...form, car_color: e.target.value })}
                    placeholder="e.g. White"
                    className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-surface-400 mb-1">License Plate</label>
                <input
                  type="text"
                  value={form.car_plate}
                  onChange={(e) => setForm({ ...form, car_plate: e.target.value })}
                  placeholder="e.g. ABC-1234"
                  className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Save button */}
        <button
          type="submit"
          disabled={saving || !form.full_name.trim()}
          className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-green-500/90 backdrop-blur-sm text-white px-5 py-3 rounded-xl shadow-lg">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}
    </div>
  );
}
