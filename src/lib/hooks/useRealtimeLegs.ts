'use client';

import { useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import type { EmptyLeg } from '@/lib/types/empty-leg';

type RealtimeCallback = (
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  leg: EmptyLeg
) => void;

/**
 * Subscribe to real-time changes on the empty_legs table.
 * Use this on the marketplace/rides page to get instant updates.
 */
export function useRealtimeLegs(callback: RealtimeCallback) {
  const supabase = createClient();

  const stableCallback = useCallback(callback, [callback]);

  useEffect(() => {
    const channel = supabase
      .channel('realtime-legs')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'empty_legs',
        },
        (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
          const leg = (payload.new || payload.old) as unknown as EmptyLeg;
          stableCallback(eventType, leg);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, stableCallback]);
}

/**
 * Subscribe to real-time notifications for the current user.
 */
export function useRealtimeNotifications(
  userId: string,
  onNewNotification: (notification: Record<string, unknown>) => void
) {
  const supabase = createClient();

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          onNewNotification(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, onNewNotification]);
}
