import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // نفس الأصل منطقيًا عبر rewrite بدل CORS معقد بين الواجهة والـ API (القسم 5 من الخطة التقنية).
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env.API_INTERNAL_URL ?? 'http://localhost:4000'}/api/v1/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
