const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    // Add other allowed domains/patterns here if needed
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
  // Other configurations...
};

module.exports = withPWA(nextConfig); 