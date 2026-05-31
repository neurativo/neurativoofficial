import React from 'react';
import { Text, Heading } from '@react-email/components';
import { EmailLayout, CtaButton, t } from './_components/email-layout';

interface TeamPaymentFailedEmailProps {
  orgName: string;
  billingUrl: string;
}

export default function TeamPaymentFailedEmail({ orgName, billingUrl }: TeamPaymentFailedEmailProps) {
  return (
    <EmailLayout preview={`Action required: payment failed for ${orgName}`} subtitle="Payment Issue">
      <Heading style={t.h2}>Payment failed — {orgName}</Heading>
      <Text style={t.body}>
        We couldn't process your Neurativo Teams payment for{' '}
        <strong style={{ color: '#1a1a1a', fontWeight: 600 }}>{orgName}</strong>.
      </Text>
      <Text style={t.body}>
        Please update your payment method to keep your team's access. If payment is not resolved, team seats will
        be suspended.
      </Text>
      <CtaButton text="Update billing" href={billingUrl} danger />
      <Text style={{ ...t.muted, marginTop: '14px' }}>
        If you believe this is an error, just reply to this email.
      </Text>
    </EmailLayout>
  );
}

TeamPaymentFailedEmail.PreviewProps = {
  orgName: 'MIT Engineering',
  billingUrl: 'https://teams.neurativo.com/mit-engineering/dashboard',
} satisfies TeamPaymentFailedEmailProps;
