/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Anthropic API key is read only inside server code (app/api/**).
  // Nothing in this config exposes it to the browser.
};
export default nextConfig;
