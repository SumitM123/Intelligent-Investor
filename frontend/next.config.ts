import type { NextConfig } from 'next'
 
const nextConfig: NextConfig = {
  cacheComponents: false, // Your existing setting
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/a/**',
      },
    ],
  },
}
 
export default nextConfig
