/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  devIndicators: false,
  experimental: {
    optimizePackageImports: ["@iconify/react"],
  },
};

module.exports = nextConfig;
