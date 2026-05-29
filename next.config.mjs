/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [{ source: "/credits", destination: "/", permanent: true }];
  },
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
  // App Router route handlers do not honor pages/api.bodyParser or api.responseLimit.
  // Request and response caps are enforced in app/api/query/route.ts and lib/multipartRequest.ts.
};

export default nextConfig;
