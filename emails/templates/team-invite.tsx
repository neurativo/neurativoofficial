import React from 'react';
import { Text, Heading } from '@react-email/components';
import { EmailLayout, CtaButton, t } from './_components/email-layout';

interface TeamInviteEmailProps {
  orgName: string;
  inviterName: string;
  joinUrl: string;
  seatTier: 'student' | 'pro';
}

export default function TeamInviteEmail({ orgName, inviterName, joinUrl, seatTier }: TeamInviteEmailProps) {
  const tierLabel = seatTier === 'pro' ? 'Pro' : 'Student';
  return (
    <EmailLayout preview={`You're invited to join ${orgName} on Neurativo`} subtitle="Team Invitation">
      <Heading style={t.h2}>You're invited to join {orgName}</Heading>
      <Text style={t.body}>
        <strong style={{ color: '#1a1a1a', fontWeight: 600 }}>{inviterName}</strong> has invited you to join their
        team on Neurativo with a <strong style={{ color: '#1a1a1a', fontWeight: 600 }}>{tierLabel}</strong> seat.
      </Text>
      <Text style={t.body}>
        As a team member you'll get full access to Neurativo's AI lecture tools — live recording, AI notes,
        flashcards, Q&A, and more.
      </Text>
      <CtaButton text="Accept invitation" href={joinUrl} />
      <Text style={{ ...t.muted, marginTop: '14px' }}>
        If you didn't expect this invite, you can safely ignore this email.
      </Text>
    </EmailLayout>
  );
}

TeamInviteEmail.PreviewProps = {
  orgName: 'MIT Engineering',
  inviterName: 'Dr. Sarah Chen',
  joinUrl: 'https://teams.neurativo.com/join/abc123',
  seatTier: 'pro',
} satisfies TeamInviteEmailProps;
