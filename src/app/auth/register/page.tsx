'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { APP_NAME } from '@/lib/constants';
import { LICENCE_DISTRICTS, TAXI_TYPES, CYPRUS_PHONE_PREFIX, CYPRUS_PHONE_REGEX } from '@/lib/constants/locations';
import { DriverVerification } from '@/lib/types/empty-leg';

type Step = 1 | 2 | 3 | 4;

interface RegistrationForm {
  // Step 1 - Basic Info
  full_name: string;
  phone: string;
  email: string;

  // Step 2 - Licence
  licence_front_file: File | null;
  licence_back_file: File | null;
  licence_number: string;
  licence_district: 'nicosia' | 'limassol' | 'larnaca' | 'paphos' | 'famagusta' | '';
  taxi_type: 'urban' | 'rural' | 'tourist' | 'minibus' | '';

  // Step 3 - Vehicle
  vehicle_plate: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: string;
  vehicle_colour: string;
  vehicle_seats: string;
  wheelchair_accessible: boolean;
}

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();

  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  const [form, setForm] = useState<RegistrationForm>({
    full_name: '',
    phone: '',
    email: '',
    licence_front_file: null,
    licence_back_file: null,
    licence_number: '',
    licence_district: '',
    taxi_type: '',
    vehicle_plate: '',
    vehicle_make: '',
    vehicle_model: '',
    vehicle_year: '',
    vehicle_colour: '',
    vehicle_seats: '',
    wheelchair_accessible: false,
  });

  function validateStep1(): boolean {
    if (!form.full_name.trim()) {
      setError('Full name is required');
      return false;
    }
    if (!form.email.trim()) {
      setError('Email is required');
      return false;
    }
    if (!form.phone.trim()) {
      setError('Phone number is required');
      return false;
    }
    if (!CYPRUS_PHONE_REGEX.test(form.phone)) {
      setError('Phone must be +357 followed by 8 digits');
      return false;
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }
    if (password !== passwordConfirm) {
      setError('Passwords do not match');
      return false;
    }
    setError('');
    return true;
  }

  function validateStep2(): boolean {
    if (!form.licence_number.trim()) {
      setError('Licence number is required');
      return false;
    }
    if (!form.licence_district) {
      setError('Licence district is required');
      return false;
    }
    if (!form.taxi_type) {
      setError('Taxi type is required');
      return false;
    }
    if (!form.licence_front_file) {
      setError('Licence front photo is required');
      return false;
    }
    if (!form.licence_back_file) {
      setError('Licence back photo is required');
      return false;
    }
    setError('');
    return true;
  }

  function validateStep3(): boolean {
    if (!form.vehicle_plate.trim()) {
      setError('Licence plate is required');
      return false;
    }
    const seats = parseInt(form.vehicle_seats, 10);
    if (!form.vehicle_seats || seats < 1 || seats > 8) {
      setError('Passenger seats must be between 1 and 8');
      return false;
    }
    setError('');
    return true;
  }

  async function handleNextStep() {
    if (currentStep === 1 && validateStep1()) {
      setCurrentStep(2);
    } else if (currentStep === 2 && validateStep2()) {
      setCurrentStep(3);
    } else if (currentStep === 3 && validateStep3()) {
      setCurrentStep(4);
      await handleSubmit();
    }
  }

  function handlePreviousStep() {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as Step);
      setError('');
    }
  }

  async function handleSubmit() {
    setLoading(true);
    setError('');

    try {
      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) {
        setError(authError.message);
        setCurrentStep(3);
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError('Failed to create account');
        setCurrentStep(3);
        setLoading(false);
        return;
      }

      const userId = authData.user.id;

      // 2. Upload licence photos to Supabase Storage
      let licenceFrontUrl: string | null = null;
      let licenceBackUrl: string | null = null;

      try {
        if (form.licence_front_file) {
          const frontPath = `${userId}/licence-front-${Date.now()}`;
          const { error: uploadError } = await supabase.storage
            .from('licence-photos')
            .upload(frontPath, form.licence_front_file);
          if (!uploadError) {
            const { data } = supabase.storage
              .from('licence-photos')
              .getPublicUrl(frontPath);
            licenceFrontUrl = data.publicUrl;
          }
        }

        if (form.licence_back_file) {
          const backPath = `${userId}/licence-back-${Date.now()}`;
          const { error: uploadError } = await supabase.storage
            .from('licence-photos')
            .upload(backPath, form.licence_back_file);
          if (!uploadError) {
            const { data } = supabase.storage
              .from('licence-photos')
              .getPublicUrl(backPath);
            licenceBackUrl = data.publicUrl;
          }
        }
      } catch (storageError) {
        // Storage bucket may not exist yet, continue without file URLs
        console.log('Storage upload skipped:', storageError);
      }

      // 3. Create driver verification record
      const verificationData: Partial<DriverVerification> = {
        user_id: userId,
        licence_number: form.licence_number,
        licence_district: form.licence_district as any,
        taxi_type: form.taxi_type as any,
        licence_photo_front_url: licenceFrontUrl,
        licence_photo_back_url: licenceBackUrl,
        vehicle_plate: form.vehicle_plate,
        vehicle_make: form.vehicle_make || null,
        vehicle_model: form.vehicle_model || null,
        vehicle_year: form.vehicle_year ? parseInt(form.vehicle_year, 10) : null,
        vehicle_colour: form.vehicle_colour || null,
        vehicle_seats: parseInt(form.vehicle_seats, 10),
        wheelchair_accessible: form.wheelchair_accessible,
        verification_status: 'pending',
        language_preference: 'en',
      };

      const { error: verificationError } = await supabase
        .from('driver_verification')
        .insert([verificationData]);

      if (verificationError) {
        setError(verificationError.message);
        setCurrentStep(3);
        setLoading(false);
        return;
      }

      // 4. Create or update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          full_name: form.full_name,
          phone: form.phone,
          email: form.email,
          is_driver: true,
        });

      if (profileError) {
        console.log('Profile creation warning:', profileError);
      }

      // Stay on step 4 (success screen)
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
      setCurrentStep(3);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <Link href="/" className="block text-center mb-8">
          <h1 className="text-3xl font-bold text-white">{APP_NAME}</h1>
          <p className="text-surface-400 text-sm mt-1">Driver Registration</p>
        </Link>

        {/* Progress Indicator */}
        {currentStep !== 4 && (
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <div className="text-center flex-1">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto font-semibold mb-2 ${currentStep >= 1 ? 'bg-brand-600 text-white' : 'bg-surface-800 text-surface-400'}`}>
                  1
                </div>
                <p className="text-xs text-surface-400">Basic Info</p>
              </div>
              <div className={`flex-1 h-1 mx-2 ${currentStep > 1 ? 'bg-brand-600' : 'bg-surface-800'}`} />
              <div className="text-center flex-1">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto font-semibold mb-2 ${currentStep >= 2 ? 'bg-brand-600 text-white' : 'bg-surface-800 text-surface-400'}`}>
                  2
                </div>
                <p className="text-xs text-surface-400">Licence</p>
              </div>
              <div className={`flex-1 h-1 mx-2 ${currentStep > 2 ? 'bg-brand-600' : 'bg-surface-800'}`} />
              <div className="text-center flex-1">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto font-semibold mb-2 ${currentStep >= 3 ? 'bg-brand-600 text-white' : 'bg-surface-800 text-surface-400'}`}>
                  3
                </div>
                <p className="text-xs text-surface-400">Vehicle</p>
              </div>
            </div>
            <p className="text-center text-surface-400 text-sm">Step {currentStep} of 3</p>
          </div>
        )}

        {/* Form Container */}
        <div className="bg-surface-900 rounded-2xl p-6 border border-surface-800">
          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-white">Basic Information</h2>

              <div>
                <label className="block text-sm text-surface-400 mb-2">Full Name</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  required
                  className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="Your full name"
                />
              </div>

              <div>
                <label className="block text-sm text-surface-400 mb-2">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label className="block text-sm text-surface-400 mb-2">Mobile Number</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => {
                    let val = e.target.value;
                    // Auto-format: ensure +357 prefix
                    if (!val.startsWith('+357')) {
                      val = '+357' + val.replace(/\D/g, '').slice(-8);
                    }
                    setForm({ ...form, phone: val });
                  }}
                  required
                  className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="+357 96123456"
                />
                <p className="text-xs text-surface-500 mt-1">+357 followed by 8 digits</p>
              </div>

              <div>
                <label className="block text-sm text-surface-400 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="Min 6 characters"
                />
              </div>

              <div>
                <label className="block text-sm text-surface-400 mb-2">Confirm Password</label>
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  required
                  minLength={6}
                  className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="Confirm password"
                />
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>
          )}

          {/* Step 2: Licence */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-white">Cyprus Taxi Licence</h2>

              <div>
                <label className="block text-sm text-surface-400 mb-2">Licence Number</label>
                <input
                  type="text"
                  value={form.licence_number}
                  onChange={(e) => setForm({ ...form, licence_number: e.target.value })}
                  required
                  className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="e.g., TX-2024-001"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-surface-400 mb-2">Issuing District</label>
                  <select
                    value={form.licence_district}
                    onChange={(e) => setForm({ ...form, licence_district: e.target.value as any })}
                    required
                    className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  >
                    <option value="">Select district...</option>
                    {LICENCE_DISTRICTS.map((dist) => (
                      <option key={dist} value={dist}>
                        {dist.charAt(0).toUpperCase() + dist.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-surface-400 mb-2">Taxi Type</label>
                  <select
                    value={form.taxi_type}
                    onChange={(e) => setForm({ ...form, taxi_type: e.target.value as any })}
                    required
                    className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  >
                    <option value="">Select type...</option>
                    <option value="urban">Urban Taxi</option>
                    <option value="rural">Rural Taxi</option>
                    <option value="tourist">Tourist Taxi</option>
                    <option value="minibus">Minibus</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-surface-800">
                <p className="text-sm text-surface-400 font-medium mb-4">Licence Photos</p>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-surface-400 mb-2">Front Photo</label>
                    <label className="block cursor-pointer">
                      <div className="bg-surface-800 border-2 border-dashed border-surface-700 rounded-xl p-4 text-center hover:border-brand-500 transition-colors">
                        {form.licence_front_file ? (
                          <p className="text-brand-400 text-sm font-medium">{form.licence_front_file.name}</p>
                        ) : (
                          <div>
                            <p className="text-surface-400 text-sm">Upload front</p>
                            <p className="text-surface-500 text-xs mt-1">JPG, PNG</p>
                          </div>
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setForm({ ...form, licence_front_file: file });
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm text-surface-400 mb-2">Back Photo</label>
                    <label className="block cursor-pointer">
                      <div className="bg-surface-800 border-2 border-dashed border-surface-700 rounded-xl p-4 text-center hover:border-brand-500 transition-colors">
                        {form.licence_back_file ? (
                          <p className="text-brand-400 text-sm font-medium">{form.licence_back_file.name}</p>
                        ) : (
                          <div>
                            <p className="text-surface-400 text-sm">Upload back</p>
                            <p className="text-surface-500 text-xs mt-1">JPG, PNG</p>
                          </div>
                        )}
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setForm({ ...form, licence_back_file: file });
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>
          )}

          {/* Step 3: Vehicle */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-white">Vehicle Details</h2>

              <div>
                <label className="block text-sm text-surface-400 mb-2">Licence Plate</label>
                <input
                  type="text"
                  value={form.vehicle_plate}
                  onChange={(e) => setForm({ ...form, vehicle_plate: e.target.value.toUpperCase() })}
                  required
                  className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="AB 123"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-surface-400 mb-2">Make</label>
                  <input
                    type="text"
                    value={form.vehicle_make}
                    onChange={(e) => setForm({ ...form, vehicle_make: e.target.value })}
                    className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    placeholder="e.g., Toyota"
                  />
                </div>

                <div>
                  <label className="block text-sm text-surface-400 mb-2">Model</label>
                  <input
                    type="text"
                    value={form.vehicle_model}
                    onChange={(e) => setForm({ ...form, vehicle_model: e.target.value })}
                    className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    placeholder="e.g., Corolla"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-surface-400 mb-2">Year</label>
                  <input
                    type="number"
                    value={form.vehicle_year}
                    onChange={(e) => setForm({ ...form, vehicle_year: e.target.value })}
                    className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    placeholder="2023"
                  />
                </div>

                <div>
                  <label className="block text-sm text-surface-400 mb-2">Colour</label>
                  <input
                    type="text"
                    value={form.vehicle_colour}
                    onChange={(e) => setForm({ ...form, vehicle_colour: e.target.value })}
                    className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    placeholder="e.g., Black"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-surface-400 mb-2">Passenger Seats (1-8)</label>
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={form.vehicle_seats}
                  onChange={(e) => setForm({ ...form, vehicle_seats: e.target.value })}
                  required
                  className="w-full bg-surface-800 border border-surface-700 rounded-xl px-4 py-3 text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="4"
                />
              </div>

              <label className="flex items-center gap-3 p-4 bg-surface-800 rounded-xl cursor-pointer border border-surface-700">
                <input
                  type="checkbox"
                  checked={form.wheelchair_accessible}
                  onChange={(e) => setForm({ ...form, wheelchair_accessible: e.target.checked })}
                  className="w-5 h-5 rounded bg-surface-700 border-surface-600 text-brand-500 focus:ring-brand-500"
                />
                <div>
                  <p className="text-white font-medium">Wheelchair Accessible</p>
                  <p className="text-surface-400 text-sm">Vehicle can accommodate wheelchair passengers</p>
                </div>
              </label>

              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>
          )}

          {/* Step 4: Success */}
          {currentStep === 4 && (
            <div className="text-center space-y-6 py-8">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-brand-600 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-semibold text-white mb-2">Application Submitted</h2>
                <p className="text-surface-400">Your licence is being reviewed</p>
              </div>

              <div className="bg-surface-800 rounded-xl p-4 text-left space-y-2">
                <p className="text-surface-300">
                  <span className="font-medium">We will notify you within 24 hours</span> once your taxi licence has been verified.
                </p>
                <p className="text-surface-400 text-sm">
                  Check your email for updates on your application status. You will not have access to the marketplace until your licence is approved.
                </p>
              </div>

              <Link
                href="/"
                className="inline-block bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 px-8 rounded-xl transition-colors mt-4"
              >
                Back to Home
              </Link>
            </div>
          )}

          {/* Navigation Buttons */}
          {currentStep !== 4 && (
            <div className="flex gap-4 mt-8 pt-6 border-t border-surface-800">
              <button
                onClick={handlePreviousStep}
                disabled={currentStep === 1 || loading}
                className="flex-1 px-6 py-3 border border-surface-700 rounded-xl text-white font-medium hover:bg-surface-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Back
              </button>
              <button
                onClick={handleNextStep}
                disabled={loading}
                className="flex-1 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : currentStep === 3 ? 'Submit' : 'Next'}
              </button>
            </div>
          )}
        </div>

        {/* Sign In Link */}
        {currentStep !== 4 && (
          <p className="text-center text-surface-400 text-sm mt-6">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-brand-400 hover:text-brand-300">
              Sign In
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
