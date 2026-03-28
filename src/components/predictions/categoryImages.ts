/**
 * Category hero images — high-quality 3D render assets for the featured hero section.
 *
 * USAGE: Replace these Unsplash placeholder URLs with actual 3D renders (PNG/WebP).
 * Place renders in /public/predictions/categories/ and reference as:
 *   "/predictions/categories/sports.png"
 *
 * Ideal specs for renders:
 * - 800x800px or larger, transparent background (PNG) or black bg (WebP)
 * - Dramatic studio lighting from upper-left
 * - Object fills ~70% of the frame
 * - Slight 3/4 angle rotation for depth
 */

// Placeholder Unsplash images — replace with actual 3D renders
const CATEGORY_IMAGES: Record<string, { left: string; right: string }> = {
  sports: {
    left: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=600&h=600&fit=crop&auto=format&q=90',
    right: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=600&h=600&fit=crop&auto=format&q=90',
  },
  politics: {
    left: 'https://images.unsplash.com/photo-1523995462485-3d171b5c8fa9?w=600&h=600&fit=crop&auto=format&q=90',
    right: 'https://images.unsplash.com/photo-1523995462485-3d171b5c8fa9?w=600&h=600&fit=crop&auto=format&q=90',
  },
  crypto: {
    left: 'https://images.unsplash.com/photo-1622630998477-20aa696ecb05?w=600&h=600&fit=crop&auto=format&q=90',
    right: 'https://images.unsplash.com/photo-1622630998477-20aa696ecb05?w=600&h=600&fit=crop&auto=format&q=90',
  },
  economics: {
    left: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&h=600&fit=crop&auto=format&q=90',
    right: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&h=600&fit=crop&auto=format&q=90',
  },
  finance: {
    left: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&h=600&fit=crop&auto=format&q=90',
    right: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&h=600&fit=crop&auto=format&q=90',
  },
  economy: {
    left: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&h=600&fit=crop&auto=format&q=90',
    right: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&h=600&fit=crop&auto=format&q=90',
  },
  tech: {
    left: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600&h=600&fit=crop&auto=format&q=90',
    right: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600&h=600&fit=crop&auto=format&q=90',
  },
  entertainment: {
    left: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=600&h=600&fit=crop&auto=format&q=90',
    right: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=600&h=600&fit=crop&auto=format&q=90',
  },
  culture: {
    left: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=600&h=600&fit=crop&auto=format&q=90',
    right: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=600&h=600&fit=crop&auto=format&q=90',
  },
  science: {
    left: 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=600&h=600&fit=crop&auto=format&q=90',
    right: 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=600&h=600&fit=crop&auto=format&q=90',
  },
  weather: {
    left: 'https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=600&h=600&fit=crop&auto=format&q=90',
    right: 'https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=600&h=600&fit=crop&auto=format&q=90',
  },
  geopolitics: {
    left: 'https://images.unsplash.com/photo-1589519160732-57fc498494f8?w=600&h=600&fit=crop&auto=format&q=90',
    right: 'https://images.unsplash.com/photo-1589519160732-57fc498494f8?w=600&h=600&fit=crop&auto=format&q=90',
  },
  esports: {
    left: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&h=600&fit=crop&auto=format&q=90',
    right: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&h=600&fit=crop&auto=format&q=90',
  },
};

const DEFAULT_IMAGES = {
  left: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=600&h=600&fit=crop&auto=format&q=90',
  right: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=600&h=600&fit=crop&auto=format&q=90',
};

export function getCategoryImages(category: string): { left: string; right: string } {
  return CATEGORY_IMAGES[category.toLowerCase()] || DEFAULT_IMAGES;
}
