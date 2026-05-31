import React from 'react';
import { Text, Heading, Link } from '@react-email/components';
import { EmailLayout, FeatureList, CtaButton } from './_components/email-layout';

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
      <Heading style={h2}>You're now on {label}</Heading>
      <Text style={body}>
        Your subscription is active. Here's everything included in your <strong>{label}</strong> plan:
      </Text>
      <FeatureList items={features} />
      <Text style={muted}>Your monthly credits have been added to your balance.</Text>
      <CtaButton text="Go to your dashboard" href="https://www.neurativo.com/app" />
      <Text style={{ ...muted, marginTop: '14px' }}>
        Manage your subscription from{' '}
        <Link href="https://www.neurativo.com/profile" style={{ color: '#9ca3af' }}>your profile</Link>.
      </Text>
    </EmailLayout>
  );
}

PlanUpgradedEmail.PreviewProps = {
  plan: 'pro',
} satisfies PlanUpgradedEmailProps;

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const h2 = { margin: '0 0 10px', fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.4px', lineHeight: '1.25', fontFamily: FONT };
const body = { margin: '0 0 14px', fontSize: '14px', color: '#4b5563', lineHeight: '1.7', fontFamily: FONT };
const muted = { margin: '0 0 14px', fontSize: '13px', color: '#9ca3af', lineHeight: '1.7', fontFamily: FONT };
