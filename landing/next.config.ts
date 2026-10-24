import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,

  // Hebergement mutualise (o2switch) : processus et memoire limites par
  // compte. `NEXT_BUILD_CPUS=1` (pose par deploy/o2switch/mettre_a_jour.sh)
  // construit dans un seul processus ; sans la variable, rien ne change.
  ...(process.env.NEXT_BUILD_CPUS
    ? {
        experimental: {
          cpus: Number(process.env.NEXT_BUILD_CPUS) || 1,
          webpackBuildWorker: false,
          workerThreads: false,
        },
      }
    : {}),

  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 480, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
      {
        // APK Android : type reconnu par Android, telecharge (pas ouvert), et
        // jamais garde en cache longtemps (une nouvelle version garde le meme nom).
        source: "/android/:file*",
        headers: [
          { key: "Content-Type", value: "application/vnd.android.package-archive" },
          { key: "Content-Disposition", value: 'attachment; filename="sur-mezur.apk"' },
          { key: "Cache-Control", value: "public, max-age=300, must-revalidate" },
        ],
      },
      {
        source: "/brand/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;