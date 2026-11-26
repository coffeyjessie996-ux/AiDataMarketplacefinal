import type { MetadataRoute } from 'next';

const siteUrl = 'https://aidatamarketplacefinal.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    { path: '', priority: 1, changeFrequency: 'daily' as const },
    { path: '/for-businesses', priority: 0.95, changeFrequency: 'weekly' as const },
    { path: '/suppliers', priority: 0.9, changeFrequency: 'weekly' as const },
    { path: '/pricing', priority: 0.75, changeFrequency: 'monthly' as const },
    { path: '/auctions', priority: 0.7, changeFrequency: 'daily' as const },
    { path: '/weather-pilot', priority: 0.55, changeFrequency: 'weekly' as const },
    { path: '/privacy', priority: 0.2, changeFrequency: 'yearly' as const },
    { path: '/terms', priority: 0.2, changeFrequency: 'yearly' as const },
  ];

  return routes.map((route) => ({
    url: `${siteUrl}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
