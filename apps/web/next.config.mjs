/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  // On Vercel, vercel.json routes /api to the api service before Next sees it.
  // Locally (without `vercel dev`), proxy /api to the Express server instead.
  async rewrites() {
    if (process.env.VERCEL) return [];
    const apiOrigin = process.env.API_ORIGIN || 'http://localhost:4000';
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
