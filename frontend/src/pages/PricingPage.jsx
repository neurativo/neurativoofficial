import React, { useEffect } from 'react';
import { useUser } from '@clerk/react';
import { useSEO } from '../lib/useSEO';
import { useStructuredData } from '../lib/useStructuredData';
import LandingPage from './LandingPage';

const PRICING_SCHEMA = [
    {
        '@type': 'WebPage',
        '@id': 'https://www.neurativo.com/pricing#webpage',
        'url': 'https://www.neurativo.com/pricing',
        'name': 'Pricing — Neurativo Plans for Every Student',
        'description': 'Neurativo pricing — AI-powered educational platform plans. Free plan with no credit card required. Student plan $9.99/month. Pro plan $19.99/month.',
        'isPartOf': { '@id': 'https://www.neurativo.com/#website' },
        'breadcrumb': {
            '@type': 'BreadcrumbList',
            'itemListElement': [
                { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': 'https://www.neurativo.com' },
                { '@type': 'ListItem', 'position': 2, 'name': 'Pricing', 'item': 'https://www.neurativo.com/pricing' }
            ]
        }
    },
    {
        '@type': 'SoftwareApplication',
        '@id': 'https://www.neurativo.com/pricing#app-offers',
        'name': 'Neurativo',
        'applicationCategory': 'EducationApplication',
        'url': 'https://www.neurativo.com',
        'offers': [
            {
                '@type': 'Offer',
                'name': 'Free Plan',
                'price': '0',
                'priceCurrency': 'USD',
                'description': '5 starter credits (no credit card required). Live recording up to 30 min/session. Audio import up to 60 min. AI summaries, flashcards, quiz, and glossary. Watermarked PDF export.',
                'eligibleCustomerType': 'Individual',
                'availability': 'https://schema.org/InStock'
            },
            {
                '@type': 'Offer',
                'name': 'Student Plan',
                'price': '9.99',
                'priceCurrency': 'USD',
                'priceSpecification': {
                    '@type': 'UnitPriceSpecification',
                    'price': '9.99',
                    'priceCurrency': 'USD',
                    'billingDuration': 1,
                    'billingIncrement': 'month',
                    'unitText': 'month'
                },
                'description': '15 credits/month. Unlimited live lectures up to 3 hours each. 25 hrs/month total. AI summaries, flashcards, quiz, glossary, concept maps, exam prep, Q&A, Smart Explain, semantic search, PDF export (no watermark), shareable links.',
                'eligibleCustomerType': 'Individual',
                'availability': 'https://schema.org/InStock'
            },
            {
                '@type': 'Offer',
                'name': 'Pro Plan',
                'price': '19.99',
                'priceCurrency': 'USD',
                'priceSpecification': {
                    '@type': 'UnitPriceSpecification',
                    'price': '19.99',
                    'priceCurrency': 'USD',
                    'billingDuration': 1,
                    'billingIncrement': 'month',
                    'unitText': 'month'
                },
                'description': '30 credits/month. Unlimited live lectures up to 4 hours each. 40 hrs/month total. All Student features plus visual capture (screen and whiteboard), advanced analytics, and priority support.',
                'eligibleCustomerType': 'Individual',
                'availability': 'https://schema.org/InStock'
            }
        ]
    }
];

export default function PricingPage() {
    const { isLoaded, user: clerkUser } = useUser();
    const user = isLoaded && clerkUser
        ? { id: clerkUser.id, email: clerkUser.primaryEmailAddress?.emailAddress }
        : null;

    useSEO({
        title: 'Pricing — Plans for Every Student',
        description: 'Free plan available — no credit card required. Student plan from $9.99/month. Pro plan from $19.99/month. Affordable AI education for every learner.',
        canonicalPath: '/pricing',
        keywords: 'Neurativo pricing, AI educational platform pricing, AI education platform cost, student AI platform plans, free AI learning platform, AI lecture platform pricing',
    });

    useStructuredData(PRICING_SCHEMA);

    useEffect(() => {
        const scroll = () => {
            const el = document.getElementById('pricing');
            if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
        };
        scroll();
        const t = setTimeout(scroll, 350);
        return () => clearTimeout(t);
    }, []);

    return <LandingPage user={user} />;
}
