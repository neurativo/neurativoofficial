import React from 'react';
import { Text, Heading, Link } from '@react-email/components';
import { EmailLayout, FeatureList, CtaButton, t, FONT } from './_components/email-layout';

const PLAN_LABELS: Record<string, string> = { student: 'Student', pro: 'Pro' };
const PLAN_FEATURES: Record<string, string[]> = {
  student: [
    'Unlimited live recordings (up to 3 hrs each)',
    'AI summaries, flashcards, quiz & glossary',
    'Unlimited Q&A over your lectures',
    'Exam prep & concept maps',
    'Shareable lecture links',
    '15 credits added to your balance each month',
  ],
  pro: [
    'Everything in Student',
    'Lectures up to 4 hours',
    'Visual capture (screen & board)',
    'High-quality PDF export (no watermark)',
    'Advanced analytics',
    '30 credits added to your balance each month',
  ],
};

interface PlanUpgradedEmailProps {
  plan: 'student' | 'pro';
}

export default function PlanUpgradedEmail({ plan }: PlanUpgradedEmailProps) {
  const label = PLAN_LABELS[plan] ?? plan;
  const features = PLAN_FEATURES[plan] ?? [];
  return (
    <EmailLayout preview={`You're now on Neurativo ${label} — welcome!`} subtitle={`${label} Plan — Active`}>
      <Heading style={t.h2}>You're now on {label}</Heading>
      <Text style={t.body}>
        Your subscription is active. Here's everything included in your{' '}
        <strong style={{ color: '#1a1a1a', fontWeight: 600 }}>{label}</strong> plan:
      </Text>
      <FeatureList items={features} />
      <Text style={t.muted}>Your monthly credits have been added to your balance.</Text>
      <CtaButton text="Go to your dashboard" href="https://www.neurativo.com/app" />
      <Text style={{ ...t.muted, marginTop: '14px' }}>
        Manage your subscription from{' '}
        <Link href="https://www.neurativo.com/profile" style={{ color: '#a3a3a3', textDecoration: 'underline' }}>
          your profile
        </Link>.
      </Text>
    </EmailLayout>
  );
}

PlanUpgradedEmail.PreviewProps = {
  plan: 'pro',
} satisfies PlanUpgradedEmailProps;
