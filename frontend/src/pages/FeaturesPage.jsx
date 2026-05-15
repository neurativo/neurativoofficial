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
        title: 'Features — Neurativo Lecture Intelligence',
        description: 'AI-generated exam traps, cheat sheets, self-test questions, flashcards, quiz, glossary and full PDF report from any lecture recording. Works in any language.',
        canonicalPath: '/features',
        keywords: 'AI lecture features, exam trap detection, lecture flashcards, lecture quiz, AI cheat sheet, lecture PDF export, lecture glossary',
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
