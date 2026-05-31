import React from 'react';
import {
  Html, Head, Body, Container, Preview, Section, Row, Column,
  Img, Text, Link,
} from '@react-email/components';
import { Tailwind, pixelBasedPreset } from '@react-email/tailwind';

// ─── Mobile + font styles injected into <Head> ───────────────────────────────
const HEAD_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  * { box-sizing: border-box; }

  body {
    margin: 0; padding: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;
    background-color: #f5f4f1;
  }

  @media only screen and (max-width: 500px) {
    .em-wrap  { padding: 20px 12px 32px !important; }
    .em-card  { border-radius: 14px !important; }
    .em-hdr   { padding: 20px 22px !important; }
    .em-body  { padding: 24px 22px 20px !important; }
    .em-foot  { padding: 16px 22px 20px !important; border-radius: 0 0 14px 14px !important; }
    .em-h2    { font-size: 20px !important; letter-spacing: -0.3px !important; }
    .em-btn   { display: block !important; width: 100% !important; text-align: center !important; }
    .em-btn-td { display: block !important; width: 100% !important; border-radius: 10px !important; }
    .em-stripe { height: 5px !important; line-height: 5px !important; }
  }
`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailLayoutProps {
  preview: string;
  subtitle: string;
  children: React.ReactNode;
}

// ─── Main layout ─────────────────────────────────────────────────────────────

export function EmailLayout({ preview, subtitle, children }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Head>
          <style dangerouslySetInnerHTML={{ __html: HEAD_STYLES }} />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </Head>

        {/* Preview text hidden in inbox list */}
        <Preview>{preview}</Preview>

        {/* Outer background — warm off-white with ambient orb gradients */}
        <Body style={s.body}>
          <div style={s.outerGradient}>

            {/* Center wrapper */}
            <table width="100%" cellPadding={0} cellSpacing={0} style={{ minWidth: '100%' }}>
              <tbody>
                <tr>
                  <td align="center" className="em-wrap" style={s.wrap}>
                    <table
                      cellPadding={0}
                      cellSpacing={0}
                      className="em-card"
                      style={s.card}
                      width="580"
                    >

                      {/* ── Gradient stripe ── */}
                      <tr>
                        <td
                          className="em-stripe"
                          style={s.stripe}
                          height="6"
                        >&nbsp;</td>
                      </tr>

                      {/* ── Card header (dark gradient, logo) ── */}
                      <tr>
                        <td className="em-hdr" style={s.header}>
                          <table cellPadding={0} cellSpacing={0}>
                            <tbody>
                              <tr>
                                {/* Logo icon box */}
                                <td style={s.logoBox}>
                                  <Img
                                    src="https://www.neurativo.com/logo.png"
                                    width={22}
                                    height={22}
                                    alt=""
                                    style={{ display: 'block', border: 0 }}
                                  />
                                </td>
                                {/* Wordmark + subtitle */}
                                <td style={{ paddingLeft: '10px', verticalAlign: 'middle' }}>
                                  <Text style={s.wordmark}>Neurativo</Text>
                                  <Text style={s.wordmarkSub}>{subtitle}</Text>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>

                      {/* ── Body content ── */}
                      <tr>
                        <td className="em-body" style={s.bodyCell}>
                          {children}
                        </td>
                      </tr>

                      {/* ── Footer ── */}
                      <tr>
                        <td className="em-foot" style={s.footer}>
                          <Text style={s.footerText}>
                            You're receiving this because you have a Neurativo account.
                            Questions? Just reply to this email.{' '}
                            <Link href="https://www.neurativo.com" style={s.footerLink}>
                              neurativo.com
                            </Link>
                          </Text>
                        </td>
                      </tr>

                    </table>
                  </td>
                </tr>
              </tbody>
            </table>

          </div>
        </Body>
      </Tailwind>
    </Html>
  );
}

// ─── Shared sub-components ───────────────────────────────────────────────────

interface InfoTableProps { rows: { label: string; value: string }[] }

export function InfoTable({ rows }: InfoTableProps) {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0} style={s.infoTable}>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={i < rows.length - 1 ? s.infoRowBorder : undefined}>
            <td style={s.infoLabel}>{r.label}</td>
            <td style={s.infoValue}>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface FeatureListProps { items: string[] }

export function FeatureList({ items }: FeatureListProps) {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0} style={s.infoTable}>
      <tbody>
        {items.map((item, i) => (
          <tr key={i} style={i < items.length - 1 ? s.infoRowBorder : undefined}>
            <td style={{ ...s.infoLabel, color: '#374151', paddingLeft: '14px' }}>
              <span style={{ color: '#6366f1', marginRight: '9px', fontWeight: 600, fontSize: '13px' }}>✓</span>
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
  const bg = danger ? '#dc2626' : '#1a1a1a';
  return (
    <table cellPadding={0} cellSpacing={0} style={{ marginTop: '24px' }}>
      <tbody>
        <tr>
          <td className="em-btn-td" style={{ background: bg, borderRadius: '10px' }}>
            <a
              href={href}
              className="em-btn"
              style={{
                display: 'inline-block',
                padding: '13px 28px',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 500,
                textDecoration: 'none',
                letterSpacing: '-0.1px',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                borderRadius: '10px',
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

// ─── Typography helpers (exported for templates) ──────────────────────────────

export const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

export const t = {
  h2: {
    margin: '0 0 12px',
    fontSize: '22px',
    fontWeight: 700,
    color: '#1a1a1a',
    letterSpacing: '-0.5px',
    lineHeight: '1.25',
    fontFamily: FONT,
  },
  body: {
    margin: '0 0 14px',
    fontSize: '14px',
    color: '#6b6b6b',
    lineHeight: '1.75',
    fontFamily: FONT,
  },
  muted: {
    margin: '0 0 14px',
    fontSize: '13px',
    color: '#a3a3a3',
    lineHeight: '1.7',
    fontFamily: FONT,
  },
} as const;

// ─── Style tokens ─────────────────────────────────────────────────────────────

const s = {
  body: {
    margin: 0,
    padding: 0,
    backgroundColor: '#f5f4f1',
    fontFamily: FONT,
    WebkitTextSizeAdjust: '100%' as const,
  },

  // Ambient orb gradient layer — references app's indigo/teal/violet orbs
  outerGradient: {
    background: [
      'radial-gradient(ellipse 60% 40% at 15% 0%, rgba(99,102,241,0.07) 0%, transparent 70%)',
      'radial-gradient(ellipse 50% 35% at 85% 100%, rgba(20,184,166,0.05) 0%, transparent 70%)',
      '#f5f4f1',
    ].join(', '),
  } as React.CSSProperties,

  wrap: {
    padding: '48px 16px 56px',
    backgroundColor: 'transparent',
  },

  card: {
    backgroundColor: '#ffffff',
    border: '1px solid #f0ede8',
    borderRadius: '16px',
    maxWidth: '580px',
    borderCollapse: 'separate' as const,
    borderSpacing: 0,
    boxShadow: '0 2px 8px rgba(0,0,0,0.04), 0 16px 40px rgba(0,0,0,0.05)',
    overflow: 'hidden' as const,
  },

  // Multi-stop gradient stripe matching app orbs
  stripe: {
    background: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)',
    height: '6px',
    lineHeight: '6px',
    fontSize: '1px',
    msoLineHeightRule: 'exactly' as const,
  },

  // Dark gradient header — matches WhatsNewModal
  header: {
    background: 'linear-gradient(135deg, #0f0f0f 0%, #1e1a2e 55%, #0f1929 100%)',
    padding: '22px 32px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },

  logoBox: {
    width: '32px',
    height: '32px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    verticalAlign: 'middle',
    textAlign: 'center' as const,
    padding: '5px',
  },

  wordmark: {
    margin: 0,
    fontSize: '15px',
    fontWeight: 600,
    color: '#ffffff',
    letterSpacing: '-0.3px',
    lineHeight: '1.1',
    fontFamily: FONT,
  },

  wordmarkSub: {
    margin: 0,
    marginTop: '2px',
    fontSize: '11px',
    color: 'rgba(255,255,255,0.42)',
    letterSpacing: '0.02em',
    fontFamily: FONT,
  },

  bodyCell: {
    padding: '30px 32px 28px',
    backgroundColor: '#ffffff',
    fontFamily: FONT,
    wordBreak: 'break-word' as const,
  },

  footer: {
    padding: '18px 32px 22px',
    backgroundColor: '#fafaf9',
    borderTop: '1px solid #f0ede8',
    borderRadius: '0 0 16px 16px',
  },

  footerText: {
    margin: 0,
    fontSize: '11px',
    color: '#c8c4be',
    lineHeight: '1.7',
    fontFamily: FONT,
  },

  footerLink: {
    color: '#c8c4be',
    textDecoration: 'underline' as const,
  },

  infoTable: {
    backgroundColor: '#fafaf9',
    border: '1px solid #f0ede8',
    borderRadius: '10px',
    borderCollapse: 'separate' as const,
    borderSpacing: 0,
    margin: '20px 0',
    overflow: 'hidden' as const,
  },

  infoRowBorder: {
    borderBottom: '1px solid #f5f3f0',
  },

  infoLabel: {
    padding: '11px 16px',
    fontSize: '13px',
    color: '#6b7280',
    fontFamily: FONT,
    wordBreak: 'break-word' as const,
    lineHeight: '1.5',
  },

  infoValue: {
    padding: '11px 16px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#1a1a1a',
    textAlign: 'right' as const,
    whiteSpace: 'nowrap' as const,
    fontFamily: FONT,
  },
} as const;
