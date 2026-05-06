import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ['*.dev.coze.site'],
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
