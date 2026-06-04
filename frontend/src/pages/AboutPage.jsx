import React, { useEffect } from 'react';
import { useUser } from '@clerk/react';
import { useSEO } from '../lib/useSEO';
import { useStructuredData } from '../lib/useStructuredData';
import LandingPage from './LandingPage';

const ABOUT_SCHEMA = [
    {
        '@type': 'AboutPage',
        '@id': 'https://www.neurativo.com/about#webpage',
        'url': 'https://www.neurativo.com/about',
        'name': 'About Neurativo — Mission to Transform Education with AI',
        'description': 'Neurativo is an AI education platform founded in Sri Lanka, on a mission to transform how students learn by automating the most time-consuming parts of studying.',
        'isPartOf': { '@id': 'https://www.neurativo.com/#website' },
        'about': { '@id': 'https://www.neurativo.com/#organization' },
        'breadcrumb': {
            '@type': 'BreadcrumbList',
            'itemListElement': [
                { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': 'https://www.neurativo.com' },
                { '@type': 'ListItem', 'position': 2, 'name': 'About', 'item': 'https://www.neurativo.com/about' }
            ]
        }
    },
    {
        '@type': 'Organization',
        '@id': 'https://www.neurativo.com/#organization',
        'name': 'Neurativo',
        'url': 'https://www.neurativo.com',
        'logo': {
            '@type': 'ImageObject',
            'url': 'https://www.neurativo.com/logo.png',
            'width': 500,
            'height': 500
        },
        'description': 'Neurativo is an AI education platform that captures live lectures and transforms them into structured summaries, flashcards, quizzes, concept maps, and instant Q&A — helping students learn smarter.',
        'slogan': 'Transforming Education with Intelligence',
        'email': 'hello@neurativo.com',
        'foundingDate': '2025',
        'foundingLocation': {
            '@type': 'Place',
            'addressCountry': 'LK',
            'name': 'Sri Lanka'
        },
        'founder': [
            {
                '@type': 'Person',
                '@id': 'https://www.neurativo.com/about#shazad',
                'name': 'Shazad Arshad',
                'jobTitle': 'Co-Founder',
                'worksFor': { '@id': 'https://www.neurativo.com/#organization' },
                'sameAs': ['https://www.linkedin.com/in/shazadarshad']
            },
            {
                '@type': 'Person',
                '@id': 'https://www.neurativo.com/about#shariff',
                'name': 'Shariff Ahamed',
                'jobTitle': 'Co-Founder',
                'worksFor': { '@id': 'https://www.neurativo.com/#organization' },
                'sameAs': ['https://www.linkedin.com/in/shariffahamed']
            }
        ],
        'sameAs': ['https://www.linkedin.com/company/neurativo']
    }
];

export default function AboutPage() {
    const { isLoaded, user: clerkUser } = useUser();
    const user = isLoaded && clerkUser
        ? { id: clerkUser.id, email: clerkUser.primaryEmailAddress?.emailAddress }
        : null;

    useSEO({
        title: 'About — Our Mission to Transform Education with AI',
        description: 'Neurativo is an AI education platform on a mission to transform how students learn. Founded by Shazad Arshad and Shariff Ahamed. Transforming education with intelligence.',
        canonicalPath: '/about',
        keywords: 'about Neurativo, Neurativo founders, AI education platform mission, student AI learning tool, Shazad Arshad, Shariff Ahamed',
    });

    useStructuredData(ABOUT_SCHEMA);

    useEffect(() => {
        const scroll = () => {
            const el = document.getElementById('about');
            if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
        };
        scroll();
        const t = setTimeout(scroll, 350);
        return () => clearTimeout(t);
    }, []);

    return <LandingPage user={user} />;
}
