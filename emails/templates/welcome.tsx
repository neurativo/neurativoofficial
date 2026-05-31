import React from 'react';
import { Text, Heading } from '@react-email/components';
import { EmailLayout, InfoTable, CtaButton } from './_components/email-layout';

interface WelcomeEmailProps {
  name?: string;
}

export default function WelcomeEmail({ name }: WelcomeEmailProps) {
  const greeting = name ? `Hey ${name},` : 'Hey there,';
  return (
    <EmailLayout preview="Welcome to Neurativo — you have 5 free credits" subtitle="AI Lecture Assistant">
      <Heading style={h2}>Welcome to Neurativo</Heading>
      <Text style={body}>{greeting} your account is ready.</Text>
      <Text style={body}>
        You've been given <strong>5 free credits</strong> to get started — enough to record or import your first lectures.
      </Text>
      <InfoTable rows={[
        { label: 'Live recording', value: 'Real-time' },
        { label: 'Import audio / video', value: 'Upload files' },
        { label: 'AI notes & flashcards', value: 'Auto-generated' },
        { label: 'Q&A', value: 'Ask your lecture anything' },
      ]} />
      <Text style={muted}>1 credit = 30 minutes of audio. Credits never expire.</Text>
      <CtaButton text="Open Neurativo" href="https://www.neurativo.com/app" />
    </EmailLayout>
  );
}

WelcomeEmail.PreviewProps = {
  name: 'Alex',
} satisfies WelcomeEmailProps;

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const h2 = { margin: '0 0 10px', fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.4px', lineHeight: '1.25', fontFamily: FONT };
const body = { margin: '0 0 14px', fontSize: '14px', color: '#4b5563', lineHeight: '1.7', fontFamily: FONT };
const muted = { margin: '0 0 14px', fontSize: '13px', color: '#9ca3af', lineHeight: '1.7', fontFamily: FONT };
