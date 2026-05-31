import React from 'react';
import { Text, Heading } from '@react-email/components';
import { EmailLayout, CtaButton } from './_components/email-layout';

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
      <Heading style={h2}>You're invited to join {orgName}</Heading>
      <Text style={body}>
        <strong>{inviterName}</strong> has invited you to join their team on Neurativo with a{' '}
        <strong>{tierLabel}</strong> seat.
      </Text>
      <Text style={body}>
        As a team member you'll get full access to Neurativo's AI lecture tools — live recording, AI notes,
        flashcards, Q&A, and more.
      </Text>
      <CtaButton text="Accept invitation" href={joinUrl} />
      <Text style={muted}>If you didn't expect this invite, you can safely ignore this email.</Text>
    </EmailLayout>
  );
}

TeamInviteEmail.PreviewProps = {
  orgName: 'MIT Engineering',
  inviterName: 'Dr. Sarah Chen',
  joinUrl: 'https://teams.neurativo.com/join/abc123',
  seatTier: 'pro',
} satisfies TeamInviteEmailProps;

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const h2 = { margin: '0 0 10px', fontSize: '22px', fontWeight: 700, color: '#111827', letterSpacing: '-0.4px', lineHeight: '1.25', fontFamily: FONT };
const body = { margin: '0 0 14px', fontSize: '14px', color: '#4b5563', lineHeight: '1.7', fontFamily: FONT };
const muted = { margin: '0 0 14px', fontSize: '13px', color: '#9ca3af', lineHeight: '1.7', fontFamily: FONT };
