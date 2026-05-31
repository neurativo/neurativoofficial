import React from 'react';
import { Text, Heading } from '@react-email/components';
import { EmailLayout, InfoTable, CtaButton, t } from './_components/email-layout';

export default function PaymentFailedEmail() {
  return (
    <EmailLayout preview="Action needed — Neurativo payment failed" subtitle="Payment Issue">
      <Heading style={t.h2}>Payment failed — action needed</Heading>
      <Text style={t.body}>
        We couldn't process your latest subscription payment. Your account has been temporarily moved to the{' '}
        <strong style={{ color: '#1a1a1a', fontWeight: 600 }}>Free plan</strong> until payment is resolved.
      </Text>
      <InfoTable rows={[
        { label: 'Account status', value: 'On hold' },
        { label: 'Your lecture library', value: 'Still accessible' },
        { label: 'Recording & imports', value: 'Paused until resolved' },
      ]} />
      <Text style={t.muted}>Update your payment method to restore your plan instantly.</Text>
      <CtaButton text="Update payment method" href="https://www.neurativo.com/profile?billing=1" danger />
      <Text style={{ ...t.muted, marginTop: '14px' }}>
        If you believe this is an error, just reply to this email.
      </Text>
    </EmailLayout>
  );
}

PaymentFailedEmail.PreviewProps = {};
