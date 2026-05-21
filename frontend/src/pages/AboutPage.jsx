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
        title: 'About — Our Mission to Transform Education with AI',
        description: 'Neurativo is an AI education platform on a mission to transform how students learn. Founded by Shazad Arshad and Shariff Ahamed. Transforming education with intelligence.',
        canonicalPath: '/about',
        keywords: 'about Neurativo, Neurativo founders, AI education platform mission, student AI learning tool, Shazad Arshad, Shariff Ahamed',
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
