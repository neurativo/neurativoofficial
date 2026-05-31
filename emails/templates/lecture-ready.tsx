import React from 'react';
import { Text, Heading } from '@react-email/components';
import { EmailLayout, InfoTable, CtaButton, t } from './_components/email-layout';

interface LectureReadyEmailProps {
  title: string;
  lectureUrl: string;
}

export default function LectureReadyEmail({ title, lectureUrl }: LectureReadyEmailProps) {
  const display = title || 'Your lecture';
  return (
    <EmailLayout preview={`Neurativo — "${display}" is ready`} subtitle="Lecture Processed">
      <Heading style={t.h2}>Your lecture is ready</Heading>
      <Text style={t.body}>
        We've finished processing{' '}
        <strong style={{ color: '#1a1a1a', fontWeight: 600 }}>{display}</strong>.
        Your study materials are all ready to go.
      </Text>
      <InfoTable rows={[
        { label: 'AI summary', value: 'Ready' },
        { label: 'Flashcards', value: 'Generated' },
        { label: 'Quiz', value: 'Ready' },
        { label: 'Glossary', value: 'Generated' },
      ]} />
      <CtaButton text="View lecture" href={lectureUrl} />
    </EmailLayout>
  );
}

LectureReadyEmail.PreviewProps = {
  title: 'Introduction to Quantum Mechanics',
  lectureUrl: 'https://www.neurativo.com/lecture/abc123',
} satisfies LectureReadyEmailProps;
