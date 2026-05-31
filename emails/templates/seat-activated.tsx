import React from 'react';
import { Text, Heading } from '@react-email/components';
import { EmailLayout, CtaButton } from './_components/email-layout';

interface SeatActivatedEmailProps {
  orgName: string;
}

export default function SeatActivatedEmail({ orgName }: SeatActivatedEmailProps) {
  return (
    <EmailLayout preview={`Your ${orgName} seat is active`} subtitle="Seat Activated">
      <Heading style={h2}>Welcome to {orgName}</Heading>
      <Text style={body}>
        Your seat is now active. You have full access to Neurativo through your team — start recording and studying right away.
      </Text>
      <CtaButton text="Open Neurativo" href="https://www.neurativo.com/app" />
    </EmailLayout>
  );
}

SeatActivatedEmail.PreviewProps = {
  orgName: 'MIT Engineering',
} satisfies SeatActivatedEmailProps;

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const h2 = { margin: '0 0 10px', fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.4px', lineHeight: '1.25', fontFamily: FONT };
const body = { margin: '0 0 14px', fontSize: '14px', color: '#4b5563', lineHeight: '1.7', fontFamily: FONT };
