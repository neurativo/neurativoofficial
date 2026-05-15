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
        title: 'FAQ — Neurativo Lecture Intelligence',
        description: 'Common questions about Neurativo — how it works, supported languages, audio privacy, file import, mobile support, and more.',
        canonicalPath: '/faq',
        keywords: 'Neurativo FAQ, AI lecture app questions, how does Neurativo work, lecture transcription privacy, supported languages',
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
