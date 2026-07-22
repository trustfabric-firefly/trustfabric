/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === "development";

const staticSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]),
];

const nextConfig = {
  reactCompiler: true,
  devIndicators: false,
  experimental: {
    optimizePackageImports: ["@iconify/react"],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Cover static assets and routes that skip middleware matchers.
        source: "/:path*",
        headers: staticSecurityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
