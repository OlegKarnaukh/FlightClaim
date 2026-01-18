/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@flightclaim/ui', '@flightclaim/eu261'],
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

module.exports = nextConfig;
