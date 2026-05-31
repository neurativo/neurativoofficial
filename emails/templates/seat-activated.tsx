import React from 'react';
import { Text, Heading } from '@react-email/components';
import { EmailLayout, CtaButton, t } from './_components/email-layout';

interface SeatActivatedEmailProps {
  orgName: string;
}

export default function SeatActivatedEmail({ orgName }: SeatActivatedEmailProps) {
  return (
    <EmailLayout preview={`Your ${orgName} seat is active`} subtitle="Seat Activated">
      <Heading style={t.h2}>Welcome to {orgName}</Heading>
      <Text style={t.body}>
        Your seat is now active. You have full access to Neurativo through your team — start recording and studying
        right away.
      </Text>
      <CtaButton text="Open Neurativo" href="https://www.neurativo.com/app" />
    </EmailLayout>
  );
}

SeatActivatedEmail.PreviewProps = {
  orgName: 'MIT Engineering',
} satisfies SeatActivatedEmailProps;
