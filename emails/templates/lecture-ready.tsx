import React from 'react';
import { Text, Heading } from '@react-email/components';
import { EmailLayout, InfoTable, CtaButton } from './_components/email-layout';

interface LectureReadyEmailProps {
  title: string;
  lectureUrl: string;
}

export default function LectureReadyEmail({ title, lectureUrl }: LectureReadyEmailProps) {
  const display = title || 'Your lecture';
  return (
    <EmailLayout preview={`Neurativo — "${display}" is ready`} subtitle="Lecture Processed">
      <Heading style={h2}>Your lecture is ready</Heading>
      <Text style={body}>
        We've finished processing <strong>{display}</strong>. Your study materials are all ready to go.
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

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const h2 = { margin: '0 0 10px', fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.4px', lineHeight: '1.25', fontFamily: FONT };
const body = { margin: '0 0 14px', fontSize: '14px', color: '#4b5563', lineHeight: '1.7', fontFamily: FONT };
