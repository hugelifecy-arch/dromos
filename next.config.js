/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    return [
      {
        // Concierge embed widget is designed to be iframed by tenant
        // hotels. Explicitly allow any origin to frame it and drop
        // X-Frame-Options so platforms (Vercel, middleware) that default
        // to DENY don't block embedding. Every other route keeps the
        // default posture.
        source: '/concierge/embed/:slug*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors *;" },
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
