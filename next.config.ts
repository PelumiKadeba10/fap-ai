import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Linting isn't set up yet; don't let it block deploys before Convocation.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
