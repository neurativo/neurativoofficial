import React from 'react';
import { Text, Heading } from '@react-email/components';
import { EmailLayout, CtaButton } from './_components/email-layout';

interface TeamPaymentFailedEmailProps {
  orgName: string;
  billingUrl: string;
}

export default function TeamPaymentFailedEmail({ orgName, billingUrl }: TeamPaymentFailedEmailProps) {
  return (
    <EmailLayout preview={`Action required: payment failed for ${orgName}`} subtitle="Payment Issue">
      <Heading style={h2}>Payment failed — {orgName}</Heading>
      <Text style={body}>
        We couldn't process your Neurativo Teams payment for <strong>{orgName}</strong>.
      </Text>
      <Text style={body}>
        Please update your payment method to keep your team's access. If payment is not resolved, team seats will be suspended.
      </Text>
      <CtaButton text="Update billing" href={billingUrl} danger />
      <Text style={muted}>If you believe this is an error, just reply to this email.</Text>
    </EmailLayout>
  );
}

TeamPaymentFailedEmail.PreviewProps = {
  orgName: 'MIT Engineering',
  billingUrl: 'https://teams.neurativo.com/mit-engineering/dashboard',
} satisfies TeamPaymentFailedEmailProps;

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const h2 = { margin: '0 0 10px', fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.4px', lineHeight: '1.25', fontFamily: FONT };
const body = { margin: '0 0 14px', fontSize: '14px', color: '#4b5563', lineHeight: '1.7', fontFamily: FONT };
const muted = { margin: '0 0 14px', fontSize: '13px', color: '#9ca3af', lineHeight: '1.7', fontFamily: FONT };
