const withPWA = require('next-pwa')({
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
    domains: ['localhost'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ikbmdbgxdprtcgasdijz.supabase.co', // Add Supabase hostname
        port: '', // Keep empty unless specific port needed
        pathname: '/storage/v1/object/sign/**', // Be specific if possible, or use wildcard
      },
      // Add other patterns if necessary
      // {
      //   protocol: 'https',
      //   hostname: 'other-domain.com',
      // },
    ],
  },
  reactStrictMode: false, // Temporarily disabled to debug multiple editor instances
  swcMinify: true,
  // Other configurations...
};

module.exports = withPWA(nextConfig); 