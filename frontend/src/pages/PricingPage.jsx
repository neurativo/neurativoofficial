import React, { useEffect } from 'react';
import { useUser } from '@clerk/react';
import { useSEO } from '../lib/useSEO';
import LandingPage from './LandingPage';

export default function PricingPage() {
    const { isLoaded, user: clerkUser } = useUser();
    const user = isLoaded && clerkUser
        ? { id: clerkUser.id, email: clerkUser.primaryEmailAddress?.emailAddress }
        : null;

    useSEO({
        title: 'Pricing — Neurativo',
        description: 'Simple, affordable plans for students. Start free — no credit card required. Upgrade when you need unlimited lectures, longer recordings, and full PDF exports.',
        canonicalPath: '/pricing',
        keywords: 'Neurativo pricing, AI lecture app free plan, student AI tool pricing, lecture notes app cost',
    });

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
