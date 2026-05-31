import React from 'react';
import { Text, Heading } from '@react-email/components';
import { EmailLayout, CtaButton } from './_components/email-layout';

interface SeatRemovedEmailProps {
  orgName: string;
}

export default function SeatRemovedEmail({ orgName }: SeatRemovedEmailProps) {
  return (
    <EmailLayout preview={`Your ${orgName} seat has been removed`} subtitle="Seat Removed">
      <Heading style={h2}>Seat removed</Heading>
      <Text style={body}>
        Your <strong>{orgName}</strong> team seat on Neurativo has been removed.
      </Text>
      <Text style={body}>
        You can still use Neurativo on the free plan — your lecture library is kept and all your existing notes remain accessible.
      </Text>
      <CtaButton text="Go to Neurativo" href="https://www.neurativo.com/app" />
    </EmailLayout>
  );
}

SeatRemovedEmail.PreviewProps = {
  orgName: 'MIT Engineering',
} satisfies SeatRemovedEmailProps;

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const h2 = { margin: '0 0 10px', fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.4px', lineHeight: '1.25', fontFamily: FONT };
const body = { margin: '0 0 14px', fontSize: '14px', color: '#4b5563', lineHeight: '1.7', fontFamily: FONT };
