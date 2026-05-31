import React from 'react';
import { Text, Heading } from '@react-email/components';
import { EmailLayout, InfoTable, CtaButton } from './_components/email-layout';

export default function PaymentFailedEmail() {
  return (
    <EmailLayout preview="Action needed — Neurativo payment failed" subtitle="Payment Issue">
      <Heading style={h2}>Payment failed — action needed</Heading>
      <Text style={body}>
        We couldn't process your latest subscription payment. Your account has been temporarily moved to the{' '}
        <strong>Free plan</strong> until payment is resolved.
      </Text>
      <InfoTable rows={[
        { label: 'Account status', value: 'On hold' },
        { label: 'Your lecture library', value: 'Still accessible' },
        { label: 'Recording & imports', value: 'Paused until resolved' },
      ]} />
      <Text style={muted}>Update your payment method to restore your plan instantly.</Text>
      <CtaButton text="Update payment method" href="https://www.neurativo.com/profile?billing=1" danger />
      <Text style={{ ...muted, marginTop: '14px' }}>If you believe this is an error, just reply to this email.</Text>
    </EmailLayout>
  );
}

PaymentFailedEmail.PreviewProps = {};

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const h2 = { margin: '0 0 10px', fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.4px', lineHeight: '1.25', fontFamily: FONT };
const body = { margin: '0 0 14px', fontSize: '14px', color: '#4b5563', lineHeight: '1.7', fontFamily: FONT };
const muted = { margin: '0 0 14px', fontSize: '13px', color: '#9ca3af', lineHeight: '1.7', fontFamily: FONT };
