'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { Car, Plus, Star, Trash2, Check, Edit3, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Vehicle {
  id: string;
  owner_id: string;
  make: string;
  model: string;
  year: number | null;
  color: string | null;
  plate: string;
  vehicle_type: string;
  seats: number;
  wheelchair_accessible: boolean;
  photo_url: string | null;
  is_active: boolean;
  created_at: string;
}

interface Props {
  vehicles: Vehicle[];
  userId: string;
}

const VEHICLE_TYPES = [
  { value: 'sedan', label: 'Sedan' },
  { value: 'minivan', label: 'Minivan' },
  { value: 'van', label: 'Van' },
  { value: 'luxury', label: 'Luxury' },
];

export default function FleetClient({ vehicles: initialVehicles, userId }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [plate, setPlate] = useState('');
  const [vehicleType, setVehicleType] = useState('sedan');
  const [seats, setSeats] = useState('4');
  const [wheelchair, setWheelchair] = useState(false);

  function resetForm() {
    setMake(''); setModel(''); setYear(''); setColor('');
    setPlate(''); setVehicleType('sedan'); setSeats('4'); setWheelchair(false);
    setShowForm(false); setEditingId(null); setError('');
  }

  function startEdit(v: Vehicle) {
    setMake(v.make); setModel(v.model);
    setYear(v.year?.toString() || ''); setColor(v.color || '');
    setPlate(v.plate); setVehicleType(v.vehicle_type);
    setSeats(v.seats.toString()); setWheelchair(v.wheelchair_accessible);
    setEditingId(v.id); setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');

    const payload = {
      owner_id: userId,
      make: make.trim(),
      model: model.trim(),
      year: year ? parseInt(year) : null,
      color: color.trim() || null,
      plate: plate.trim().toUpperCase(),
      vehicle_type: vehicleType,
      seats: parseInt(seats),
      wheelchair_accessible: wheelchair,
      is_active: vehicles.length === 0 && !editingId, // First vehicle auto-active
    };

    if (editingId) {
      const { error: err } = await supabase
        .from('vehicles')
        .update(payload)
        .eq('id', editingId);

      if (err) { setError(err.message); setLoading(false); return; }
      setVehicles(vehicles.map(v => v.id === editingId ? { ...v, ...payload } : v));
    } else {
      const { data, error: err } = await supabase
        .from('vehicles')
        .insert(payload)
        .select()
        .single();

      if (err) { setError(err.message); setLoading(false); return; }
      if (data) setVehicles([data, ...vehicles]);
    }

    resetForm();
    setLoading(false);
    router.refresh();
  }

  async function handleSetActive(vehicleId: string) {
    setLoading(true);
    const { error: err } = await supabase
      .from('vehicles')
      .update({ is_active: true })
      .eq('id', vehicleId);

    if (!err) {
      setVehicles(vehicles.map(v => ({
        ...v,
        is_active: v.id === vehicleId,
      })));
      router.refresh();
    }
    setLoading(false);
  }

  async function handleDelete(vehicleId: string) {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (vehicle?.is_active) {
      setError('Cannot delete active vehicle. Switch to another first.');
      return;
    }

    const { error: err } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', vehicleId);

    if (!err) {
      setVehicles(vehicles.filter(v => v.id !== vehicleId));
    }
  }

  const activeVehicle = vehicles.find(v => v.is_active);

  return (
    <>
      <header className="sticky top-0 bg-surface-950/80 backdrop-blur-xl border-b border-surface-800 px-4 py-3 z-40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Car className="w-5 h-5 text-brand-400" />
          <h1 className="text-xl font-bold text-white">My Fleet</h1>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm); }}
          className="p-2 rounded-xl bg-brand-600 text-white hover:bg-brand-700 transition-colors"
        >
          {showForm ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
        </button>
      </header>

      {error && (
        <div className="mx-4 mt-3 text-xs text-red-400 bg-red-400/10 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {/* Active vehicle banner */}
      {activeVehicle && !showForm && (
        <div className="mx-4 mt-4 bg-brand-600/10 border border-brand-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-4 h-4 text-brand-400 fill-brand-400" />
            <span className="text-xs font-medium text-brand-400">Active Vehicle</span>
          </div>
          <p className="text-white font-semibold">
            {activeVehicle.make} {activeVehicle.model} {activeVehicle.year && `(${activeVehicle.year})`}
          </p>
          <p className="text-sm text-surface-400">
            {activeVehicle.plate} &middot; {activeVehicle.color} &middot; {activeVehicle.seats} seats &middot; {activeVehicle.vehicle_type}
          </p>
        </div>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="p-4 border-b border-surface-800 space-y-3">
          <h3 className="text-sm font-medium text-surface-400">
            {editingId ? 'Edit Vehicle' : 'Add Vehicle'}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Make (e.g. Mercedes)"
              value={make}
              onChange={e => setMake(e.target.value)}
              required
              className="bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <input
              type="text"
              placeholder="Model (e.g. E-Class)"
              value={model}
              onChange={e => setModel(e.target.value)}
              required
              className="bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input
              type="number"
              placeholder="Year"
              value={year}
              onChange={e => setYear(e.target.value)}
              min="1990"
              max="2030"
              className="bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <input
              type="text"
              placeholder="Color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <input
              type="text"
              placeholder="Plate"
              value={plate}
              onChange={e => setPlate(e.target.value)}
              required
              className="bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={vehicleType}
              onChange={e => setVehicleType(e.target.value)}
              className="bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {VEHICLE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <select
              value={seats}
              onChange={e => setSeats(e.target.value)}
              className="bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {[1,2,3,4,5,6,7,8].map(n => (
                <option key={n} value={n}>{n} seats</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-surface-400">
            <input
              type="checkbox"
              checked={wheelchair}
              onChange={e => setWheelchair(e.target.checked)}
              className="rounded border-surface-600 bg-surface-800 text-brand-600 focus:ring-brand-500"
            />
            Wheelchair accessible
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50 text-sm"
          >
            {loading ? 'Saving...' : editingId ? 'Update Vehicle' : 'Add Vehicle'}
          </button>
        </form>
      )}

      {/* Vehicle list */}
      <div className="divide-y divide-surface-800">
        {vehicles.map(v => (
          <div key={v.id} className="p-4 flex items-start gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
              v.is_active ? 'bg-brand-500/10' : 'bg-surface-800'
            }`}>
              <Car className={`w-5 h-5 ${v.is_active ? 'text-brand-400' : 'text-surface-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-white font-medium text-sm">
                  {v.make} {v.model}
                </span>
                {v.is_active && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-500/10 text-brand-400 font-medium">
                    ACTIVE
                  </span>
                )}
              </div>
              <p className="text-xs text-surface-400 mt-0.5">
                {v.plate} {v.year && `\u00B7 ${v.year}`} {v.color && `\u00B7 ${v.color}`}
              </p>
              <p className="text-xs text-surface-500">
                {v.vehicle_type} &middot; {v.seats} seats
                {v.wheelchair_accessible && ' \u00B7 \u267F'}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!v.is_active && (
                <button
                  onClick={() => handleSetActive(v.id)}
                  disabled={loading}
                  className="p-2 text-surface-500 hover:text-brand-400 transition-colors"
                  title="Set as active"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => startEdit(v)}
                className="p-2 text-surface-500 hover:text-white transition-colors"
                title="Edit"
              >
                <Edit3 className="w-4 h-4" />
              </button>
              {!v.is_active && (
                <button
                  onClick={() => handleDelete(v.id)}
                  className="p-2 text-surface-500 hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}

        {vehicles.length === 0 && !showForm && (
          <div className="p-8 text-center text-surface-500">
            <Car className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg mb-1">No vehicles yet</p>
            <p className="text-sm">Add your first vehicle to start driving</p>
          </div>
        )}
      </div>
    </>
  );
}
