// Beta Configuration
// Master switch controlling the entire monetisation layer.
// When BETA_MODE is true: all payment gating disabled, commission = 0%, all features unlocked.
// When beta ends: flip BETA_MODE to false to activate Stripe, commissions, and subscription tiers.

export const BETA_MODE = true;

export const BETA_CONFIG = {
  // Master switch
  isBeta: BETA_MODE,

  // Commission rate during beta (0 = no commission)
  commissionRate: 0,

  // Subscription system active?
  subscriptionActive: false,

  // Stripe payment processing active?
  stripeActive: false,

  // Fleet features visible? (built but gated)
  fleetFeaturesVisible: false,

  // Beta messaging
  betaBannerText: 'Free during beta — zero commission, full access for all verified drivers.',
  betaPricingNote: 'Dromos is free during the beta period. All verified Cyprus taxi drivers have full access — zero commission, zero subscription.',

  // Payment disclaimer shown during beta
  paymentDisclaimer: 'During the free beta, payments between drivers are handled off-platform (cash, Revolut, bank transfer). Dromos records the trade for your analytics only.',
} as const;

// Helper to check if a feature should be gated
export function isBetaGated(feature: 'stripe' | 'subscription' | 'fleet' | 'commission'): boolean {
  if (!BETA_MODE) return false;
  switch (feature) {
    case 'stripe': return !BETA_CONFIG.stripeActive;
    case 'subscription': return !BETA_CONFIG.subscriptionActive;
    case 'fleet': return !BETA_CONFIG.fleetFeaturesVisible;
    case 'commission': return BETA_CONFIG.commissionRate === 0;
    default: return false;
  }
}
