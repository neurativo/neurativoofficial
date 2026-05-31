import React from 'react';
import {
  Html, Head, Body, Container, Preview, Section, Row, Column,
  Img, Text, Link,
} from '@react-email/components';
import { Tailwind, pixelBasedPreset } from '@react-email/tailwind';

interface EmailLayoutProps {
  preview: string;
  subtitle: string;
  children: React.ReactNode;
}

export function EmailLayout({ preview, subtitle, children }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Head />
        <Body style={styles.body}>
          <Preview>{preview}</Preview>
          <Container style={styles.container}>

            {/* Card */}
            <Section style={styles.card}>

              {/* Indigo accent stripe */}
              <Row>
                <Column style={styles.stripe}>&nbsp;</Column>
              </Row>

              {/* Logo header */}
              <Row>
                <Column style={styles.header}>
                  <table cellPadding={0} cellSpacing={0} border={0}>
                    <tbody>
                      <tr>
                        <td style={{ verticalAlign: 'middle' }}>
                          <Img
                            src="https://www.neurativo.com/logo.png"
                            width={34}
                            height={34}
                            alt="Neurativo"
                            style={{ display: 'block', border: 0 }}
                          />
                        </td>
                        <td style={{ paddingLeft: '10px', verticalAlign: 'middle' }}>
                          <Text style={styles.wordmark}>Neurativo</Text>
                          <Text style={styles.wordmarkSub}>{subtitle}</Text>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </Column>
              </Row>

              {/* Content */}
              <Row>
                <Column style={styles.body_cell}>
                  {children}
                </Column>
              </Row>

              {/* Footer */}
              <Row>
                <Column style={styles.footer}>
                  <Text style={styles.footerText}>
                    You're receiving this because you have a Neurativo account.
                    Questions? Just reply to this email.{' '}
                    <Link href="https://www.neurativo.com" style={styles.footerLink}>
                      neurativo.com
                    </Link>
                  </Text>
                </Column>
              </Row>

            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

// ─── Shared sub-components ───────────────────────────────────────────────────

interface InfoRowProps { label: string; value: string; last?: boolean; }

export function InfoRow({ label, value, last }: InfoRowProps) {
  return (
    <tr style={last ? undefined : { borderBottom: '1px solid #f3f4f6' }}>
      <td style={styles.infoLabel}>{label}</td>
      <td style={styles.infoValue}>{value}</td>
    </tr>
  );
}

interface InfoTableProps { rows: { label: string; value: string }[] }

export function InfoTable({ rows }: InfoTableProps) {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0} style={styles.infoTable}>
      <tbody>
        {rows.map((r, i) => (
          <InfoRow key={i} label={r.label} value={r.value} last={i === rows.length - 1} />
        ))}
      </tbody>
    </table>
  );
}

interface FeatureListProps { items: string[] }

export function FeatureList({ items }: FeatureListProps) {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0} style={styles.infoTable}>
      <tbody>
        {items.map((item, i) => (
          <tr key={i} style={i < items.length - 1 ? { borderBottom: '1px solid #f3f4f6' } : undefined}>
            <td style={{ ...styles.infoLabel, color: '#374151', paddingLeft: '14px' }}>
              <span style={{ color: '#6366f1', marginRight: '8px', fontWeight: 600 }}>✓</span>
              {item}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface CtaButtonProps { text: string; href: string; danger?: boolean }

export function CtaButton({ text, href, danger }: CtaButtonProps) {
  const bg = danger ? '#dc2626' : '#111827';
  return (
    <table cellPadding={0} cellSpacing={0} border={0} style={{ marginTop: '22px' }}>
      <tbody>
        <tr>
          <td style={{ background: bg, borderRadius: '8px' }}>
            <a
              href={href}
              style={{
                display: 'block', padding: '12px 24px',
                color: '#ffffff', fontSize: '14px', fontWeight: 600,
                textDecoration: 'none', letterSpacing: '-0.1px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              }}
            >
              {text}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';

const styles = {
  body: {
    margin: 0, padding: 0,
    backgroundColor: '#f3f4f6',
    fontFamily: FONT,
    WebkitTextSizeAdjust: '100%' as const,
    msTextSizeAdjust: '100%' as const,
  },
  container: {
    maxWidth: '580px',
    margin: '0 auto',
    padding: '44px 16px',
  },
  card: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '14px',
    overflow: 'hidden' as const,
  },
  stripe: {
    backgroundColor: '#6366f1',
    height: '4px',
    lineHeight: '4px',
    fontSize: '1px',
    msoLineHeightRule: 'exactly' as const,
  },
  header: {
    padding: '22px 32px 20px',
    borderBottom: '1px solid #f3f4f6',
  },
  wordmark: {
    margin: 0,
    fontSize: '17px',
    fontWeight: 700,
    color: '#111827',
    letterSpacing: '-0.4px',
    lineHeight: '1.1',
    fontFamily: FONT,
  },
  wordmarkSub: {
    margin: 0,
    fontSize: '11px',
    color: '#9ca3af',
    letterSpacing: '0.01em',
    marginTop: '3px',
    fontFamily: FONT,
  },
  body_cell: {
    padding: '30px 32px 26px',
    fontFamily: FONT,
    wordBreak: 'break-word' as const,
  },
  footer: {
    padding: '18px 32px 22px',
    backgroundColor: '#f9fafb',
    borderTop: '1px solid #f3f4f6',
    borderRadius: '0 0 14px 14px',
  },
  footerText: {
    margin: 0,
    fontSize: '11px',
    color: '#9ca3af',
    lineHeight: '1.7',
    fontFamily: FONT,
  },
  footerLink: {
    color: '#9ca3af',
    textDecoration: 'underline' as const,
  },
  infoTable: {
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    borderCollapse: 'separate' as const,
    borderSpacing: 0,
    margin: '20px 0',
    overflow: 'hidden' as const,
  },
  infoLabel: {
    padding: '10px 14px',
    fontSize: '13px',
    color: '#6b7280',
    fontFamily: FONT,
    wordBreak: 'break-word' as const,
  },
  infoValue: {
    padding: '10px 14px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#111827',
    textAlign: 'right' as const,
    whiteSpace: 'nowrap' as const,
    fontFamily: FONT,
  },
} as const;
