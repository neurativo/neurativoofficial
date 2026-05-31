import React from 'react';
import { Text, Heading } from '@react-email/components';
import { EmailLayout, CtaButton, t } from './_components/email-layout';

interface SeatRemovedEmailProps {
  orgName: string;
}

export default function SeatRemovedEmail({ orgName }: SeatRemovedEmailProps) {
  return (
    <EmailLayout preview={`Your ${orgName} seat has been removed`} subtitle="Seat Removed">
      <Heading style={t.h2}>Seat removed</Heading>
      <Text style={t.body}>
        Your <strong style={{ color: '#1a1a1a', fontWeight: 600 }}>{orgName}</strong> team seat on Neurativo has
        been removed.
      </Text>
      <Text style={t.body}>
        You can still use Neurativo on the free plan — your lecture library is kept and all your existing notes
        remain accessible.
      </Text>
      <CtaButton text="Go to Neurativo" href="https://www.neurativo.com/app" />
    </EmailLayout>
  );
}

SeatRemovedEmail.PreviewProps = {
  orgName: 'MIT Engineering',
} satisfies SeatRemovedEmailProps;
