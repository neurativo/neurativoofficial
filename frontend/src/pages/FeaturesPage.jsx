import React, { useEffect } from 'react';
import { useUser } from '@clerk/react';
import { useSEO } from '../lib/useSEO';
import LandingPage from './LandingPage';

export default function FeaturesPage() {
    const { isLoaded, user: clerkUser } = useUser();
    const user = isLoaded && clerkUser
        ? { id: clerkUser.id, email: clerkUser.primaryEmailAddress?.emailAddress }
        : null;

    useSEO({
        title: 'Features — Live Lecture AI, Study Tools & Smart Learning',
        description: 'Live lecture capture, real-time AI summaries, flashcards, quiz, concept maps, exam prep, semantic search, Smart Explain, and PDF export — everything you need to learn smarter.',
        canonicalPath: '/features',
        keywords: 'AI education features, live lecture AI, lecture flashcards, AI quiz generator, concept map, exam prep AI, lecture summary, Smart Explain, AI study tools, lecture PDF export',
    });

    useEffect(() => {
        const scroll = () => {
            const el = document.getElementById('features');
            if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
        };
        scroll();
        const t = setTimeout(scroll, 350);
        return () => clearTimeout(t);
    }, []);

    return <LandingPage user={user} />;
}
