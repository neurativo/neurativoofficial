import React from 'react';
import { Text, Heading } from '@react-email/components';
import { EmailLayout, InfoTable, CtaButton } from './_components/email-layout';

interface LowCreditsEmailProps {
  balance: number;
}

export default function LowCreditsEmail({ balance }: LowCreditsEmailProps) {
  const creditWord = balance === 1 ? 'credit' : 'credits';
  return (
    <EmailLayout preview={`Neurativo — only ${balance} ${creditWord} left`} subtitle="Low Credits">
      <Heading style={h2}>You're running low on credits</Heading>
      <Text style={body}>
        You have <strong>{balance} {creditWord} remaining</strong>. Each credit covers 30 minutes of recording or import.
      </Text>
      <InfoTable rows={[
        { label: 'Credits remaining', value: String(balance) },
        { label: 'Recording time left', value: `~${balance * 30} min` },
      ]} />
      <Text style={muted}>Top up now to keep recording without interruption. Packs start at $4.99.</Text>
      <CtaButton text="Get more credits" href="https://www.neurativo.com/credits" />
    </EmailLayout>
  );
}

LowCreditsEmail.PreviewProps = {
  balance: 2,
} satisfies LowCreditsEmailProps;

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const h2 = { margin: '0 0 10px', fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.4px', lineHeight: '1.25', fontFamily: FONT };
const body = { margin: '0 0 14px', fontSize: '14px', color: '#4b5563', lineHeight: '1.7', fontFamily: FONT };
const muted = { margin: '0 0 14px', fontSize: '13px', color: '#9ca3af', lineHeight: '1.7', fontFamily: FONT };
