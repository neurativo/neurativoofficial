import React, { useEffect } from 'react';
import { useUser } from '@clerk/react';
import { useSEO } from '../lib/useSEO';
import { useStructuredData } from '../lib/useStructuredData';
import LandingPage from './LandingPage';

const FEATURES_SCHEMA = [
    {
        '@type': 'WebPage',
        '@id': 'https://www.neurativo.com/features#webpage',
        'url': 'https://www.neurativo.com/features',
        'name': 'Features — Neurativo AI Lecture Assistant',
        'description': 'Complete feature list for Neurativo — live lecture capture, real-time AI summaries, flashcards, quiz, concept maps, exam prep, Smart Explain, semantic search, and PDF export.',
        'isPartOf': { '@id': 'https://www.neurativo.com/#website' },
        'breadcrumb': {
            '@type': 'BreadcrumbList',
            'itemListElement': [
                { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': 'https://www.neurativo.com' },
                { '@type': 'ListItem', 'position': 2, 'name': 'Features', 'item': 'https://www.neurativo.com/features' }
            ]
        }
    },
    {
        '@type': 'ItemList',
        '@id': 'https://www.neurativo.com/features#featurelist',
        'name': 'Neurativo Features',
        'description': 'AI-powered lecture tools built for students',
        'itemListElement': [
            {
                '@type': 'ListItem',
                'position': 1,
                'name': 'Live Lecture Recording',
                'description': 'Record any live or online lecture in real time through your microphone or browser tab. AI processes audio every 12 seconds so summaries appear as you learn.'
            },
            {
                '@type': 'ListItem',
                'position': 2,
                'name': 'Real-Time AI Summaries',
                'description': 'Three-phase hierarchical summarisation — micro-summaries per chunk, section summaries, and a full master summary — all built automatically during recording.'
            },
            {
                '@type': 'ListItem',
                'position': 3,
                'name': 'AI Flashcards',
                'description': 'Automatically generated flashcard decks from every lecture, ready to review immediately after class.'
            },
            {
                '@type': 'ListItem',
                'position': 4,
                'name': 'AI Quiz',
                'description': 'Multiple-choice and short-answer quiz questions generated from lecture content, with score tracking and attempt history.'
            },
            {
                '@type': 'ListItem',
                'position': 5,
                'name': 'Concept Map',
                'description': 'Visual node-edge graph of all key concepts and their relationships, auto-generated from the lecture transcript.'
            },
            {
                '@type': 'ListItem',
                'position': 6,
                'name': 'Exam Prep Mode',
                'description': 'Open-ended exam-style questions with model answers, generated from your lecture content to help you prepare for assessments.'
            },
            {
                '@type': 'ListItem',
                'position': 7,
                'name': 'AI Q&A (Ask Your Lecture)',
                'description': 'Ask any question about a specific lecture and get a cited, precise answer grounded in your own notes — powered by retrieval-augmented generation.'
            },
            {
                '@type': 'ListItem',
                'position': 8,
                'name': 'Smart Explain',
                'description': 'Highlight any term or concept in your notes for an instant AI explanation. Choose from Simple, Technical, Step-by-step, or Analogy modes.'
            },
            {
                '@type': 'ListItem',
                'position': 9,
                'name': 'Semantic Search',
                'description': 'Search across your entire lecture library by meaning — not just keywords. Find any concept you learned, even if you can\'t remember the exact words.'
            },
            {
                '@type': 'ListItem',
                'position': 10,
                'name': 'PDF Export',
                'description': 'Export full lecture notes as a formatted PDF including transcript, summaries, flashcards, quiz, and glossary.'
            },
            {
                '@type': 'ListItem',
                'position': 11,
                'name': 'Audio & Video Import',
                'description': 'Upload existing lecture recordings in MP3, M4A, WAV, MP4, or WebM. Neurativo transcribes and generates complete study materials automatically.'
            },
            {
                '@type': 'ListItem',
                'position': 12,
                'name': '20+ Languages',
                'description': 'Multilingual transcription support — Neurativo understands lectures in English, Spanish, French, German, Arabic, Hindi, Chinese, Japanese, and 15+ more languages.'
            }
        ]
    },
    {
        '@type': 'SoftwareApplication',
        '@id': 'https://www.neurativo.com/#app',
        'name': 'Neurativo',
        'applicationCategory': 'EducationApplication',
        'operatingSystem': 'Web, iOS, Android',
        'url': 'https://www.neurativo.com',
        'creator': { '@id': 'https://www.neurativo.com/#organization' }
    }
];

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

    useStructuredData(FEATURES_SCHEMA);

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
