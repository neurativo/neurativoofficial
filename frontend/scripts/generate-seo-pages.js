import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, '..', 'dist');

const ROUTES = [
  {
    path: '/features',
    title: 'Features \u2014 Live Lecture AI, Study Tools & Smart Learning',
    description:
      'Live lecture capture, real-time AI summaries, flashcards, quiz, concept maps, exam prep, semantic search, Smart Explain, and PDF export \u2014 everything you need to learn smarter.',
  },
  {
    path: '/pricing',
    title: 'Pricing \u2014 Plans for Every Student',
    description:
      'Free plan available \u2014 no credit card required. Student plan from $9.99/month. Pro plan from $19.99/month. Affordable AI education for every learner.',
  },
  {
    path: '/faq',
    title: 'FAQ \u2014 How Neurativo Works',
    description:
      'Frequently asked questions about Neurativo \u2014 how the AI works, pricing, supported languages, audio privacy, file import, mobile support, and more.',
  },
  {
    path: '/about',
    title: 'About \u2014 Our Mission to Transform Education with AI',
    description:
      'Neurativo is an AI education platform on a mission to transform how students learn. Founded by Shazad Arshad and Shariff Ahamed. Transforming education with intelligence.',
  },
  {
    path: '/terms',
    title: 'Terms of Service',
    description:
      'Read the Neurativo Terms of Service \u2014 the rules, rights, and responsibilities for using our AI education platform.',
  },
  {
    path: '/privacy',
    title: 'Privacy Policy',
    description:
      "Neurativo's Privacy Policy \u2014 how we collect, use, and protect your data when you use our AI education platform.",
  },
];

const BASE_URL = 'https://www.neurativo.com';

const template = readFileSync(join(distDir, 'index.html'), 'utf8');

for (const route of ROUTES) {
  const fullTitle = `${route.title} | Neurativo`;
  const canonicalUrl = `${BASE_URL}${route.path}`;

  let out = template
    .replace(/<title>[^<]*<\/title>/, `<title>${fullTitle}</title>`)
    .replace(/(<meta name="description" content=")[^"]*"/, `$1${route.description}"`)
    .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${fullTitle}"`)
    .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${route.description}"`)
    .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${canonicalUrl}"`)
    .replace(/(<link rel="canonical" href=")[^"]*"/, `$1${canonicalUrl}"`);

  const outDir = join(distDir, route.path);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), out);
  console.log(`Generated: dist${route.path}/index.html — ${fullTitle}`);
}

console.log(`\nSEO pages generated for ${ROUTES.length} routes.`);
