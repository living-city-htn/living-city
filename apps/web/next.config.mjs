/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: [{ key: 'Permissions-Policy', value: 'geolocation=(self)' }] }]
  },
  transpilePackages: [
    '@living-city/contracts',
    '@living-city/fixtures',
    '@living-city/map',
    '@living-city/pipeline',
    '@living-city/modeling',
    '@living-city/game',
    '@living-city/civic',
    '@living-city/signal',
  ],
}

export default nextConfig
