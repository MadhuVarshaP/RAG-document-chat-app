import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (via pdfjs-dist) needs to run as real Node code with its worker
  // files intact, not get bundled/rewritten by Turbopack.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
