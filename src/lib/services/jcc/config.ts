// JCC configuration resolver.
//
// Single place that reads env + produces a typed config object the rest of
// the integration depends on. Keeps "is the feature enabled?" and "what's
// the URL / merchant id?" in one audit-able surface.
//
// Sandbox-dark posture (same pattern as S11 WhatsApp and S13 flight-match):
//   JCC_ENABLED=false   -> /api/payments/jcc/* returns {skipped:true} and
//                          writes no rows. Migration + service code ships
//                          unconditionally.
//   JCC_ENABLED=true    -> reads the rest of the vars; a missing one is a
//                          503 from the route handlers.
//
// Why not a provider factory like S13: JCC has exactly one live gateway
// (with a sandbox endpoint for testing), not a family of providers. A
// typed env-reader is the right shape.

export interface JccConfig {
  enabled: boolean;
  merchantId: string;
  acquirerId: string;
  secret: string;
  gatewayUrl: string;    // hosted-redirect form endpoint
  returnUrl: string;     // where JCC calls back — our /callback route
}

export class JccConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JccConfigError';
  }
}

/**
 * Reads the JCC environment variables and returns a config object. Throws
 * JccConfigError when enabled but a required var is missing; route
 * handlers map that to a 503.
 */
export function readJccConfig(env: NodeJS.ProcessEnv = process.env): JccConfig {
  const enabled = env.JCC_ENABLED === 'true';

  const merchantId = env.JCC_MER_ID ?? '';
  const acquirerId = env.JCC_ACQ_ID ?? '';
  const secret = env.JCC_SECRET ?? '';
  const gatewayUrl = env.JCC_GATEWAY_URL ?? 'https://gateway-test.jcc.com.cy/payment/Payment';
  const returnUrl = env.JCC_RETURN_URL ?? '';

  if (enabled) {
    const missing: string[] = [];
    if (!merchantId) missing.push('JCC_MER_ID');
    if (!acquirerId) missing.push('JCC_ACQ_ID');
    if (!secret) missing.push('JCC_SECRET');
    if (!returnUrl) missing.push('JCC_RETURN_URL');
    if (missing.length > 0) {
      throw new JccConfigError(`JCC enabled but missing env vars: ${missing.join(', ')}`);
    }
  }

  return { enabled, merchantId, acquirerId, secret, gatewayUrl, returnUrl };
}
