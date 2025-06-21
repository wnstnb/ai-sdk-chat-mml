import nextPWA from 'next-pwa';

const withPWA = nextPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['sharp', 'onnxruntime-node'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ikbmdbgxdprtcgasdijz.supabase.co',
        port: '',
        pathname: '/storage/v1/object/sign/**',
      },
    ],
    domains: ['localhost'],
  },
  reactStrictMode: false,
  swcMinify: true,
  // Other configurations...
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:3000');
if (process.env.NODE_ENV === 'production' && !APP_URL) {
  console.warn(
    'WARNING: NEXT_PUBLIC_APP_URL is not set for production. CORS and some security headers might not be configured optimally.'
  );
  // In a strict production setup, you might want to throw an error here or have a default secure origin.
}

// Define a basic Content Security Policy (CSP)
// IMPORTANT: This is a basic policy and will likely need to be extensively customized
// based on all the resources your application loads (scripts, styles, fonts, images, APIs, iframes, etc.).
// Start with a restrictive policy and gradually open it up as needed.
// Consider using a nonce or hash-based approach for scripts/styles to avoid 'unsafe-inline' and 'unsafe-eval'.
const cspDirectives = {
  'default-src': "'self'",
  'script-src': [
    "'self'",
    "'unsafe-inline'", // Required for Next.js inline scripts, consider nonce or strict-dynamic
    "'unsafe-eval'",   // Often needed for dev tools or some libraries, try to remove for production
    'https://assets.vercel.com', // For Vercel analytics, etc.
    'https://vercel.live',       // For Vercel live comments
    'https://js.stripe.com',     // For Stripe.js
    // Add other script sources your application uses
  ],
  'style-src': [
    "'self'",
    "'unsafe-inline'", // Often needed for dynamically injected styles, try to remove
    // Add other style sources
  ],
  'img-src': [
    "'self'",
    'data:',
    'https://ikbmdbgxdprtcgasdijz.supabase.co', // Your Supabase storage
    // Add other image sources
  ],
  'font-src': [
    "'self'",
    // Add font CDNs if used
  ],
  'connect-src': [
    "'self'",
    APP_URL ? new URL(APP_URL).origin : null, // Allow connections back to the app itself
    'https://*.supabase.co', // Supabase general API and Realtime
    'wss://*.supabase.co',   // Supabase Realtime WebSocket
    'https://*.upstash.io',  // Upstash Redis/Rate Limiting
    'https://api.exa.ai',    // EXA.AI API
    'wss://*.pusher.com',    // Pusher for WebSockets (if used, example)
    'https://*.google.com',  // For Google Sign In or other Google APIs
    'https://*.googleapis.com',
    // Add other API endpoints your application connects to
  ].filter(Boolean).join(' '),
  'frame-src': [
    "'self'",
    'https://js.stripe.com', // For Stripe Elements (iframes)
    // Add other iframe sources
  ],
  'object-src': "'none'",
  'base-uri': "'self'",
  'form-action': "'self'",
  'frame-ancestors': "'self'", // Similar to X-Frame-Options: SAMEORIGIN
  'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? '' : null, // In Next.js, HTTPS is usually handled by the hosting platform
};

const formatCsp = (directives) => {
  return Object.entries(directives)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => {
      const valueString = Array.isArray(value) ? value.join(' ') : value;
      return `${key} ${valueString}`;
    })
    .join('; ');
};

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: formatCsp(cspDirectives),
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    key: 'Strict-Transport-Security',
    // Enforce HTTPS for 2 years. Only add 'preload' if you understand the consequences and intend to submit to HSTS preload list.
    // Ensure your site is fully HTTPS capable before enabling HSTS extensively.
    value: process.env.NODE_ENV === 'production' ? 'max-age=63072000; includeSubDomains; preload' : 'max-age=0',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    // Example: disable camera, microphone, geolocation by default.
    // Customize based on what your application actually needs.
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
];

const nextConfigWithHeaders = {
  ...nextConfig,
  async headers() {
    const baseHeaders = [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];

    if (APP_URL) {
      baseHeaders.push({
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: APP_URL,
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            // Common headers, adjust as needed
            value: 'X-Requested-With, Content-Type, Authorization, X-CSRF-Token, Sentry-Trace, Baggage',
          },
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          }
        ],
      });
    }
    return baseHeaders;
  },
};

export default withPWA(nextConfigWithHeaders);
