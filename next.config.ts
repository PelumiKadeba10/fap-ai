import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Linting isn't set up yet; don't let it block deploys before Convocation.
  eslint: { ignoreDuringBuilds: true },
  // Collection links can include a photo (compressed in the browser, 4 MB hard limit on the server).
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

export default nextConfig;
