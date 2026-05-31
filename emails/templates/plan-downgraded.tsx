import React from 'react';
import { Text, Heading } from '@react-email/components';
import { EmailLayout, InfoTable, CtaButton, t } from './_components/email-layout';

export default function PlanDowngradedEmail() {
  return (
    <EmailLayout preview="Your Neurativo subscription has ended" subtitle="Subscription Ended">
      <Heading style={t.h2}>Your subscription has ended</Heading>
      <Text style={t.body}>
        Your Neurativo subscription has been cancelled or expired. Your account is now on the{' '}
        <strong style={{ color: '#1a1a1a', fontWeight: 600 }}>Free plan</strong>.
      </Text>
      <InfoTable rows={[
        { label: 'Your lecture library', value: 'Kept forever' },
        { label: 'Read-only access', value: 'Always available' },
        { label: 'Existing credits', value: 'Still in your account' },
        { label: 'Live recording & imports', value: 'Requires active plan' },
      ]} />
      <Text style={t.muted}>Resubscribe at any time to restore full access instantly.</Text>
      <CtaButton text="Resubscribe" href="https://www.neurativo.com/app?upgrade=1" />
    </EmailLayout>
  );
}

PlanDowngradedEmail.PreviewProps = {};
