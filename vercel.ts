const renderBackendUrl = process.env.RENDER_BACKEND_URL;

if (!renderBackendUrl) {
  throw new Error("RENDER_BACKEND_URL is required for Vercel deployments.");
}

const normalizedBackendUrl = renderBackendUrl.replace(/\/$/, "");

export const config = {
  cleanUrls: true,
  outputDirectory: "public",
  rewrites: [
    {
      source: "/api/:path*",
      destination: `${normalizedBackendUrl}/api/:path*`
    }
  ]
};
