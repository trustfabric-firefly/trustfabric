/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  devIndicators: false,
  experimental: {
    optimizePackageImports: ["@iconify/react"],
  },
  webpack: (config) => {
    config.parallelism = 2;
    return config;
  },
};

module.exports = nextConfig;
