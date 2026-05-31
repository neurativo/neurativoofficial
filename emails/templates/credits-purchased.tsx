import React from 'react';
import { Text, Heading } from '@react-email/components';
import { EmailLayout, InfoTable, CtaButton } from './_components/email-layout';

interface CreditsPurchasedEmailProps {
  packLabel: string;
  credits: number;
  priceUsd: number;
}

export default function CreditsPurchasedEmail({ packLabel, credits, priceUsd }: CreditsPurchasedEmailProps) {
  return (
    <EmailLayout preview={`Neurativo — ${credits} credits added to your account`} subtitle="Purchase Confirmed">
      <Heading style={h2}>Payment confirmed — {credits} credits added</Heading>
      <Text style={body}>
        Your <strong>{packLabel}</strong> purchase was successful. Credits have been added to your account.
      </Text>
      <InfoTable rows={[
        { label: 'Credits added', value: `+${credits}` },
        { label: 'Amount charged', value: `$${priceUsd.toFixed(2)} USD` },
        { label: 'Pack', value: packLabel },
      ]} />
      <Text style={muted}>1 credit = 30 minutes of audio. Credits never expire.</Text>
      <CtaButton text="Start a new lecture" href="https://www.neurativo.com/app" />
    </EmailLayout>
  );
}

CreditsPurchasedEmail.PreviewProps = {
  packLabel: '30-Credit Pack',
  credits: 30,
  priceUsd: 11.99,
} satisfies CreditsPurchasedEmailProps;

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const h2 = { margin: '0 0 10px', fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.4px', lineHeight: '1.25', fontFamily: FONT };
const body = { margin: '0 0 14px', fontSize: '14px', color: '#4b5563', lineHeight: '1.7', fontFamily: FONT };
const muted = { margin: '0 0 14px', fontSize: '13px', color: '#9ca3af', lineHeight: '1.7', fontFamily: FONT };
