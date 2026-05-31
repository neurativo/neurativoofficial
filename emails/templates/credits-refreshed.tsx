import React from 'react';
import { Text, Heading } from '@react-email/components';
import { EmailLayout, InfoTable, CtaButton, t } from './_components/email-layout';

const PLAN_LABELS: Record<string, string> = { student: 'Student', pro: 'Pro' };

interface CreditsRefreshedEmailProps {
  plan: 'student' | 'pro';
  credits: number;
}

export default function CreditsRefreshedEmail({ plan, credits }: CreditsRefreshedEmailProps) {
  const label = PLAN_LABELS[plan] ?? plan;
  return (
    <EmailLayout preview={`Neurativo ${label} renewed — ${credits} credits added`} subtitle={`${label} Plan — Renewed`}>
      <Heading style={t.h2}>Your {credits} monthly credits are ready</Heading>
      <Text style={t.body}>
        Your <strong style={{ color: '#1a1a1a', fontWeight: 600 }}>{label}</strong> subscription has renewed and
        your monthly credits have been added to your balance.
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
