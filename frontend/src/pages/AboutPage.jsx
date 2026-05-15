import React, { useEffect } from 'react';
import { useUser } from '@clerk/react';
import { useSEO } from '../lib/useSEO';
import LandingPage from './LandingPage';

export default function AboutPage() {
    const { isLoaded, user: clerkUser } = useUser();
    const user = isLoaded && clerkUser
        ? { id: clerkUser.id, email: clerkUser.primaryEmailAddress?.emailAddress }
        : null;

    useSEO({
        title: 'About — Neurativo',
        description: 'Neurativo is an AI lecture intelligence platform built to help students get more from every lecture. Founded by Shazad Arshad and Shariff Ahamed.',
        canonicalPath: '/about',
        keywords: 'about Neurativo, Neurativo founders, AI lecture platform, student AI tool',
    });

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
