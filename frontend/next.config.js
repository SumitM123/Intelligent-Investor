/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  experimental: {
    turbopack: {
      root: __dirname,
    },
  },
};

module.exports = nextConfig;
