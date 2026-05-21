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
        title: 'Pricing — Plans for Every Student',
        description: 'Free plan available — no credit card required. Student plan from $9.99/month. Pro plan from $19.99/month. Affordable AI education for every learner.',
        canonicalPath: '/pricing',
        keywords: 'Neurativo pricing, AI education platform pricing, AI lecture app cost, student AI tool plans, free AI learning platform, lecture notes app pricing',
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
