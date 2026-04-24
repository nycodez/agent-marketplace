/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@agent-marketplace/contracts",
    "@agent-marketplace/integrations",
    "@agent-marketplace/ui",
  ],
};

export default nextConfig;
