import React, { useEffect } from 'react';
import { useUser } from '@clerk/react';
import { useSEO } from '../lib/useSEO';
import LandingPage from './LandingPage';

export default function FAQPage() {
    const { isLoaded, user: clerkUser } = useUser();
    const user = isLoaded && clerkUser
        ? { id: clerkUser.id, email: clerkUser.primaryEmailAddress?.emailAddress }
        : null;

    useSEO({
        title: 'FAQ — How Neurativo Works',
        description: 'Frequently asked questions about Neurativo — how the AI works, pricing, supported languages, audio privacy, file import, mobile support, and more.',
        canonicalPath: '/faq',
        keywords: 'Neurativo FAQ, AI education platform questions, how does Neurativo work, lecture transcription privacy, supported languages, AI learning platform help',
    });

    useEffect(() => {
        const scroll = () => {
            const el = document.getElementById('faq');
            if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
        };
        scroll();
        const t = setTimeout(scroll, 350);
        return () => clearTimeout(t);
    }, []);

    return <LandingPage user={user} />;
}
