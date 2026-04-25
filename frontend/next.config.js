/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  devIndicators: false,
  // Tree-shake large icon/material entrypoints so route JS loads faster after prefetch.
  experimental: {
    optimizePackageImports: [
      "@mui/icons-material",
      "@mui/material",
    ],
  },
};

module.exports = nextConfig;
