import React, { useEffect } from 'react';
import { useUser } from '@clerk/react';
import { useSEO } from '../lib/useSEO';
import { useStructuredData } from '../lib/useStructuredData';
import LandingPage from './LandingPage';

const FAQ_SCHEMA = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': 'https://www.neurativo.com/faq#faqpage',
    'url': 'https://www.neurativo.com/faq',
    'name': 'Neurativo FAQ — AI Lecture Assistant Help',
    'description': 'Frequently asked questions about Neurativo — the AI-powered educational platform for students. Learn how live lecture recording, AI summaries, flashcards, and Q&A work.',
    'mainEntity': [
        {
            '@type': 'Question',
            'name': 'What is Neurativo?',
            'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Neurativo is an AI-powered educational platform for students. Its flagship feature is live lecture recording — it records your lecture, transcribes it in real time using OpenAI Whisper, and automatically generates structured AI notes, flashcards, quiz questions, a concept map, exam prep content, and an AI Q&A system grounded in your own lecture content.'
            }
        },
        {
            '@type': 'Question',
            'name': 'Is Neurativo free to use?',
            'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Yes. Neurativo is free to start with no credit card required. The free plan includes 5 starter credits (1 credit = 30 minutes of audio). The Student plan is $9.99/month and includes 15 credits/month, unlimited live lectures up to 3 hours, PDF export, Q&A, flashcards, quizzes, and exam prep. The Pro plan is $19.99/month with 30 credits/month and lectures up to 4 hours.'
            }
        },
        {
            '@type': 'Question',
            'name': 'How does Neurativo work?',
            'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Neurativo records your lecture audio in 12-second chunks via your microphone or any browser tab. Each chunk is transcribed using OpenAI Whisper, then a three-phase AI pipeline builds micro-summaries, section summaries, and a master summary in real time. After the lecture, it generates flashcards, quiz questions, a glossary, a concept map, and an exam prep set from the full transcript.'
            }
        },
        {
            '@type': 'Question',
            'name': 'What AI models does Neurativo use?',
            'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Neurativo uses OpenAI Whisper for real-time speech transcription, and GPT-4o-mini for summarisation, flashcard and quiz generation, Smart Explain, and Q&A. GPT-4o Vision is used for visual capture (screen and whiteboard analysis).'
            }
        },
        {
            '@type': 'Question',
            'name': 'Can Neurativo replace taking notes in class?',
            'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Yes. Neurativo is designed to be a complete note-taking replacement. It listens throughout your lecture, builds structured section-by-section summaries as you go, and produces a full study package — notes, flashcards, quiz, glossary, concept map, and exam questions — so you can focus on understanding rather than writing.'
            }
        },
        {
            '@type': 'Question',
            'name': 'How accurate is the AI transcription?',
            'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Neurativo uses OpenAI Whisper, one of the most accurate publicly available speech recognition models. It handles diverse accents, technical and academic vocabulary, and 20+ languages with high accuracy. Performance depends on audio quality — using a headset or being close to the lecturer significantly improves results.'
            }
        },
        {
            '@type': 'Question',
            'name': 'Does Neurativo work on mobile?',
            'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Yes. Neurativo is fully mobile-responsive and works in any modern mobile browser including Safari and Chrome on iOS and Android. No app install is required — just open neurativo.com on your phone.'
            }
        },
        {
            '@type': 'Question',
            'name': 'Do I need to install anything to use Neurativo?',
            'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'No. Neurativo runs entirely in your browser. Just open neurativo.com, sign in for free, and start recording. No downloads, extensions, or app installs are required.'
            }
        },
        {
            '@type': 'Question',
            'name': 'Can I upload existing audio or video files?',
            'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Yes. Use the Import feature on your dashboard to upload audio or video files in MP3, M4A, WAV, MP4, or WebM format. Neurativo transcribes and generates full study materials automatically in the background.'
            }
        },
        {
            '@type': 'Question',
            'name': 'What languages does Neurativo support?',
            'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Neurativo supports 20+ languages for transcription, including English, Spanish, French, German, Arabic, Hindi, Chinese, Japanese, Korean, Portuguese, Italian, Russian, Turkish, Dutch, Polish, Swedish, and more.'
            }
        },
        {
            '@type': 'Question',
            'name': 'Is my audio and lecture data private?',
            'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Yes. Audio chunks are sent to OpenAI Whisper for transcription only and are not stored permanently by Neurativo. Your transcripts and summaries are stored securely and are only accessible by you. Neurativo never sells or shares your personal data.'
            }
        },
        {
            '@type': 'Question',
            'name': 'Can I export my lecture notes as a PDF?',
            'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Yes. Every lecture can be exported as a formatted PDF containing the full transcript, section summaries, flashcards, quiz, and glossary. PDF export (without watermark) is available on the Student and Pro plans.'
            }
        },
        {
            '@type': 'Question',
            'name': 'What is the AI Q&A feature in Neurativo?',
            'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Neurativo\'s Q&A lets you ask any question about a specific lecture and get a cited, precise answer grounded in the lecture content — not a generic AI answer. It uses retrieval-augmented generation (RAG) with query expansion and confidence scoring to find the most relevant passages from your own notes.'
            }
        },
        {
            '@type': 'Question',
            'name': 'What is Smart Explain in Neurativo?',
            'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Smart Explain lets you highlight any term or passage in your lecture notes and get an instant AI breakdown. You can choose from four explanation modes: Simple, Technical, Step-by-step, and Analogy — making complex concepts immediately understandable.'
            }
        },
        {
            '@type': 'Question',
            'name': 'How does Neurativo compare to Otter.ai or Notion AI?',
            'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Otter.ai focuses on transcription and basic summaries. Notion AI is a general writing assistant. Neurativo is purpose-built for academic lectures — it goes beyond transcription to generate structured study materials (flashcards, quizzes, concept maps, exam prep) and offers lecture-specific Q&A grounded in your own notes.'
            }
        },
        {
            '@type': 'Question',
            'name': 'What is a credit in Neurativo?',
            'acceptedAnswer': {
                '@type': 'Answer',
                'text': '1 Neurativo credit covers 30 minutes of audio (live recording or file import). Free accounts get 5 starter credits. Student plan users receive 15 credits/month; Pro plan users receive 30 credits/month. Additional credit packs can be purchased: 10 credits for $4.99, 30 for $11.99, 60 for $21.99. Credits never expire.'
            }
        },
        {
            '@type': 'Question',
            'name': 'Does Neurativo work for online lectures and video calls?',
            'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Yes. Neurativo can capture audio from any browser tab, including Zoom, Google Meet, Microsoft Teams, YouTube lectures, or any online class. Use the tab audio capture option when starting a recording session.'
            }
        },
        {
            '@type': 'Question',
            'name': 'Who built Neurativo?',
            'acceptedAnswer': {
                '@type': 'Answer',
                'text': 'Neurativo was founded by Shazad Arshad and Shariff Ahamed, based in Sri Lanka. The platform was built to help students learn smarter by automating the most time-consuming parts of studying. Contact us at hello@neurativo.com.'
            }
        }
    ]
};

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

    useStructuredData(FAQ_SCHEMA);

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
