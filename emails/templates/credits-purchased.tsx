import React from 'react';
import { Text, Heading } from '@react-email/components';
import { EmailLayout, InfoTable, CtaButton, t } from './_components/email-layout';

interface CreditsPurchasedEmailProps {
  packLabel: string;
  credits: number;
  priceUsd: number;
}

export default function CreditsPurchasedEmail({ packLabel, credits, priceUsd }: CreditsPurchasedEmailProps) {
  return (
    <EmailLayout preview={`Neurativo — ${credits} credits added to your account`} subtitle="Purchase Confirmed">
      <Heading style={t.h2}>Payment confirmed — {credits} credits added</Heading>
      <Text style={t.body}>
        Your <strong style={{ color: '#1a1a1a', fontWeight: 600 }}>{packLabel}</strong> purchase was successful.
        Credits have been added to your account.
      </Text>
      <InfoTable rows={[
        { label: 'Credits added', value: `+${credits}` },
        { label: 'Amount charged', value: `$${priceUsd.toFixed(2)} USD` },
        { label: 'Pack', value: packLabel },
      ]} />
      <Text style={t.muted}>1 credit = 30 minutes of audio. Credits never expire.</Text>
      <CtaButton text="Start a new lecture" href="https://www.neurativo.com/app" />
    </EmailLayout>
  );
}

CreditsPurchasedEmail.PreviewProps = {
  packLabel: '30-Credit Pack',
  credits: 30,
  priceUsd: 11.99,
} satisfies CreditsPurchasedEmailProps;
