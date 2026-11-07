/** @type {import('next').NextConfig} */
const embedAncestors = process.env.EMBED_ANCESTORS || "'self' https://*.squarespace.com https://deadline.no https://www.deadline.no";
const nextConfig = {
  async headers() {
    return [
      // Utleiesiden kan bygges inn (iframe) på Squarespace
      { source: '/leie', headers: [{ key: 'Content-Security-Policy', value: `frame-ancestors ${embedAncestors}` }] },
      { source: '/((?!leie).*)', headers: [{ key: 'X-Frame-Options', value: 'DENY' }] }
    ];
  }
};
export default nextConfig;
