'use client';

import { useState, FormEvent } from 'react';

interface DriverVerification {
  id: string;
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

export default function SettingsClient({ verification }: { verification: DriverVerification }) {
  const [isEditingVehicle, setIsEditingVehicle] = useState(false);
  const [isEditingPreferences, setIsEditingPreferences] = useState(false);
  const [isEditingLanguage, setIsEditingLanguage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [vehicleForm, setVehicleForm] = useState({
    plate: verification.vehicle_plate || '',
    make: verification.vehicle_make || '',
    model: verification.vehicle_model || '',
    year: verification.vehicle_year?.toString() || '',
    colour: verification.vehicle_colour || '',
    seats: verification.vehicle_seats?.toString() || '4',
    wheelchairAccessible: verification.wheelchair_accessible || false,
  });

  const [preferredDistricts, setPreferredDistricts] = useState<string[]>(
    verification.preferred_districts || []
  );

  const [languagePreference, setLanguagePreference] = useState(verification.language_preference);

  const handleVehicleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const response = await fetch('/api/settings/vehicle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vehicleForm),
      });
      if (response.ok) {
        setIsEditingVehicle(false);
        // Optionally trigger a page refresh or show a success message
      }
    } catch (error) {
      console.error('Error saving vehicle details:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDistrictToggle = (districtId: string) => {
    setPreferredDistricts((prev) =>
      prev.includes(districtId)
        ? prev.filter((d) => d !== districtId)
        : [...prev, districtId]
    );
  };

  const handlePreferencesSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const response = await fetch('/api/settings/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferred_districts: preferredDistricts,
          language_preference: languagePreference,
        }),
      });
      if (response.ok) {
        setIsEditingPreferences(false);
        setIsEditingLanguage(false);
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Vehicle Details */}
      <div>
        {!isEditingVehicle ? (
          <div className="space-y-3">
            {verification.vehicle_plate && (
              <div>
                <p className="text-sm text-surface-500 mb-1">Plate</p>
                <p className="text-white font-medium">{verification.vehicle_plate}</p>
              </div>
            )}
            {verification.vehicle_make && (
              <div>
                <p className="text-sm text-surface-500 mb-1">Make</p>
                <p className="text-white font-medium">{verification.vehicle_make}</p>
              </div>
            )}
            {verification.vehicle_model && (
              <div>
                <p className="text-sm text-surface-500 mb-1">Model</p>
                <p className="text-white font-medium">{verification.vehicle_model}</p>
              </div>
            )}
            {verification.vehicle_year && (
              <div>
                <p className="text-sm text-surface-500 mb-1">Year</p>
                <p className="text-white font-medium">{verification.vehicle_year}</p>
              </div>
            )}
            {verification.vehicle_colour && (
              <div>
                <p className="text-sm text-surface-500 mb-1">Colour</p>
                <p className="text-white font-medium">{verification.vehicle_colour}</p>
              </div>
            )}
            {verification.vehicle_seats && (
              <div>
                <p className="text-sm text-surface-500 mb-1">Seats</p>
                <p className="text-white font-medium">{verification.vehicle_seats}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-surface-500 mb-1">Wheelchair Accessible</p>
              <p className="text-white font-medium">
                {verification.wheelchair_accessible ? 'Yes' : 'No'}
              </p>
            </div>
            <button
              onClick={() => setIsEditingVehicle(true)}
              className="mt-4 text-sm text-brand-400 hover:text-brand-300 transition-colors font-medium"
            >
              Edit →
            </button>
          </div>
        ) : (
          <form onSubmit={handleVehicleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm text-surface-500 mb-1">Plate</label>
              <input
                type="text"
                value={vehicleForm.plate}
                onChange={(e) => setVehicleForm({ ...vehicleForm, plate: e.target.value })}
                className="w-full px-3 py-2 bg-surface-900 border border-surface-800 rounded-lg text-white placeholder-surface-500 focus:outline-none focus:border-brand-600"
                placeholder="ABC 123"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-surface-500 mb-1">Make</label>
                <input
                  type="text"
                  value={vehicleForm.make}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, make: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-900 border border-surface-800 rounded-lg text-white placeholder-surface-500 focus:outline-none focus:border-brand-600"
                  placeholder="Toyota"
                />
              </div>
              <div>
                <label className="block text-sm text-surface-500 mb-1">Model</label>
                <input
                  type="text"
                  value={vehicleForm.model}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-900 border border-surface-800 rounded-lg text-white placeholder-surface-500 focus:outline-none focus:border-brand-600"
                  placeholder="Corolla"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-surface-500 mb-1">Year</label>
                <input
                  type="number"
                  value={vehicleForm.year}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, year: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-900 border border-surface-800 rounded-lg text-white placeholder-surface-500 focus:outline-none focus:border-brand-600"
                  placeholder="2022"
                />
              </div>
              <div>
                <label className="block text-sm text-surface-500 mb-1">Colour</label>
                <input
                  type="text"
                  value={vehicleForm.colour}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, colour: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-900 border border-surface-800 rounded-lg text-white placeholder-surface-500 focus:outline-none focus:border-brand-600"
                  placeholder="White"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-surface-500 mb-1">Seats</label>
              <select
                value={vehicleForm.seats}
                onChange={(e) => setVehicleForm({ ...vehicleForm, seats: e.target.value })}
                className="w-full px-3 py-2 bg-surface-900 border border-surface-800 rounded-lg text-white focus:outline-none focus:border-brand-600"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={vehicleForm.wheelchairAccessible}
                onChange={(e) =>
                  setVehicleForm({
                    ...vehicleForm,
                    wheelchairAccessible: e.target.checked,
                  })
                }
                className="w-5 h-5 rounded border-surface-700 bg-surface-900 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-surface-300">Wheelchair Accessible</span>
            </label>
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
              >
                {isSaving ? 'Saving...' : 'Save Vehicle'}
              </button>
              <button
                type="button"
                onClick={() => setIsEditingVehicle(false)}
                className="flex-1 px-4 py-2 bg-surface-800 hover:bg-surface-700 text-surface-300 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
