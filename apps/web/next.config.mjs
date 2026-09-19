/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@living-city/contracts',
    '@living-city/fixtures',
    '@living-city/map',
    '@living-city/pipeline',
    '@living-city/modeling',
    '@living-city/game',
    '@living-city/civic',
  ],
}

export default nextConfig
