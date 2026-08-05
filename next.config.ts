import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json one directory up (D:\Projects\SnackBoxPlatform)
  // was making Next.js/Turbopack infer that as the workspace root instead of
  // this project - writing .next to the wrong location entirely (which is
  // why tsc couldn't find .next/dev/types) and causing lockfile permission
  // errors against that unrelated parent directory. Pinned explicitly so
  // this never depends on what else happens to live alongside this repo.
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "dszbfvhpfnmpbhqgmzst.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
