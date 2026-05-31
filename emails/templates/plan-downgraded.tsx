import React from 'react';
import { Text, Heading } from '@react-email/components';
import { EmailLayout, InfoTable, CtaButton } from './_components/email-layout';

export default function PlanDowngradedEmail() {
  return (
    <EmailLayout preview="Your Neurativo subscription has ended" subtitle="Subscription Ended">
      <Heading style={h2}>Your subscription has ended</Heading>
      <Text style={body}>
        Your Neurativo subscription has been cancelled or expired. Your account is now on the <strong>Free plan</strong>.
      </Text>
      <InfoTable rows={[
        { label: 'Your lecture library', value: 'Kept forever' },
        { label: 'Read-only access', value: 'Always available' },
        { label: 'Existing credits', value: 'Still in your account' },
        { label: 'Live recording & imports', value: 'Requires active plan' },
      ]} />
      <Text style={muted}>Resubscribe at any time to restore full access instantly.</Text>
      <CtaButton text="Resubscribe" href="https://www.neurativo.com/app?upgrade=1" />
    </EmailLayout>
  );
}

PlanDowngradedEmail.PreviewProps = {};

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const h2 = { margin: '0 0 10px', fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.4px', lineHeight: '1.25', fontFamily: FONT };
const body = { margin: '0 0 14px', fontSize: '14px', color: '#4b5563', lineHeight: '1.7', fontFamily: FONT };
const muted = { margin: '0 0 14px', fontSize: '13px', color: '#9ca3af', lineHeight: '1.7', fontFamily: FONT };
