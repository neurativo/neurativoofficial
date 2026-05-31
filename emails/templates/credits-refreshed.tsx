import React from 'react';
import { Text, Heading } from '@react-email/components';
import { EmailLayout, InfoTable, CtaButton } from './_components/email-layout';

const PLAN_LABELS: Record<string, string> = { student: 'Student', pro: 'Pro' };

interface CreditsRefreshedEmailProps {
  plan: 'student' | 'pro';
  credits: number;
}

export default function CreditsRefreshedEmail({ plan, credits }: CreditsRefreshedEmailProps) {
  const label = PLAN_LABELS[plan] ?? plan;
  return (
    <EmailLayout preview={`Neurativo ${label} renewed — ${credits} credits added`} subtitle={`${label} Plan — Renewed`}>
      <Heading style={h2}>Your {credits} monthly credits are ready</Heading>
      <Text style={body}>
        Your <strong>{label}</strong> subscription has renewed and your monthly credits have been added to your balance.
      </Text>
      <InfoTable rows={[
        { label: 'Credits added', value: `+${credits}` },
        { label: 'Plan', value: label },
        { label: 'Next refresh', value: 'Next billing cycle' },
      ]} />
      <CtaButton text="Open Neurativo" href="https://www.neurativo.com/app" />
    </EmailLayout>
  );
}

CreditsRefreshedEmail.PreviewProps = {
  plan: 'pro',
  credits: 30,
} satisfies CreditsRefreshedEmailProps;

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const h2 = { margin: '0 0 10px', fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.4px', lineHeight: '1.25', fontFamily: FONT };
const body = { margin: '0 0 14px', fontSize: '14px', color: '#4b5563', lineHeight: '1.7', fontFamily: FONT };
