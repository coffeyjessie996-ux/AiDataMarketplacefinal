import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard/', '/login/', '/register/', '/checkout/'],
    },
    sitemap: 'https://aidatamarketplacefinal.vercel.app/sitemap.xml',
  };
}
