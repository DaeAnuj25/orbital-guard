import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // onnxruntime-node ships native binaries; keep it out of the server bundle.
  serverExternalPackages: ["onnxruntime-node"],
};

export default nextConfig;
