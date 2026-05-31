import React from 'react';
import { Text, Heading } from '@react-email/components';
import { EmailLayout, InfoTable, CtaButton, t } from './_components/email-layout';

interface LowCreditsEmailProps {
  balance: number;
}

export default function LowCreditsEmail({ balance }: LowCreditsEmailProps) {
  const creditWord = balance === 1 ? 'credit' : 'credits';
  return (
    <EmailLayout preview={`Neurativo — only ${balance} ${creditWord} left`} subtitle="Low Credits">
      <Heading style={t.h2}>You're running low on credits</Heading>
      <Text style={t.body}>
        You have <strong style={{ color: '#1a1a1a', fontWeight: 600 }}>{balance} {creditWord} remaining</strong>.
        Each credit covers 30 minutes of recording or import.
      </Text>
      <InfoTable rows={[
        { label: 'Credits remaining', value: String(balance) },
        { label: 'Recording time left', value: `~${balance * 30} min` },
      ]} />
      <Text style={t.muted}>Top up now to keep recording without interruption. Packs start at $4.99.</Text>
      <CtaButton text="Get more credits" href="https://www.neurativo.com/credits" />
    </EmailLayout>
  );
}

LowCreditsEmail.PreviewProps = {
  balance: 2,
} satisfies LowCreditsEmailProps;
