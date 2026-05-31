import React from 'react';
import { Text, Link } from '@react-email/components';
import { EmailLayout, CtaButton, t, A1, A2, INK, INK_SOFT, MUTED, GRAD, GRAD_SOFT, LINE, FONT } from './_components/email-layout';

interface WelcomeEmailProps {
  name?: string;
  appUrl?: string;
}

// ─── Inline SVG icons (email-safe, no external fetch) ─────────────────────
const MicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="7" y="2" width="6" height="10" rx="3" fill="white" fillOpacity="0.9"/>
    <path d="M4 9.5C4 12.538 6.686 15 10 15C13.314 15 16 12.538 16 9.5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="10" y1="15" x2="10" y2="18" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="7.5" y1="18" x2="12.5" y2="18" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);

const UploadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 13V4M10 4L6.5 7.5M10 4L13.5 7.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M3 13.5V15.5C3 16.328 3.672 17 4.5 17H15.5C16.328 17 17 16.328 17 15.5V13.5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);

const SparkleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 2L11.3 7.2L16.5 8L11.3 8.8L10 14L8.7 8.8L3.5 8L8.7 7.2L10 2Z" fill="white" fillOpacity="0.9"/>
    <path d="M16 13L16.7 15.3L19 16L16.7 16.7L16 19L15.3 16.7L13 16L15.3 15.3L16 13Z" fill="white" fillOpacity="0.7"/>
    <path d="M5 2L5.5 3.8L7.3 4.3L5.5 4.8L5 6.6L4.5 4.8L2.7 4.3L4.5 3.8L5 2Z" fill="white" fillOpacity="0.7"/>
  </svg>
);

const ChatIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 4.5C3 3.672 3.672 3 4.5 3H15.5C16.328 3 17 3.672 17 4.5V12.5C17 13.328 16.328 14 15.5 14H12L9 17.5L6 14H4.5C3.672 14 3 13.328 3 12.5V4.5Z" fill="white" fillOpacity="0.9"/>
  </svg>
);

const FEATURES = [
  {
    icon: <MicIcon />,
    title: 'Live recording',
    desc: 'Capture any lecture in real-time with AI summaries as you go',
  },
  {
    icon: <UploadIcon />,
    title: 'Import audio & video',
    desc: 'Upload files you already have — Neurativo handles the rest',
  },
  {
    icon: <SparkleIcon />,
    title: 'AI notes & flashcards',
    desc: 'Auto-generated from every lecture, ready to review instantly',
  },
  {
    icon: <ChatIcon />,
    title: 'Ask & answer',
    desc: 'Ask your lectures anything — get cited, precise answers',
  },
];

export default function WelcomeEmail({ name, appUrl = 'https://www.neurativo.com/app' }: WelcomeEmailProps) {
  const firstName = name || 'there';

  // Credits hero card
  const creditsCard = (
    <table
      cellPadding={0} cellSpacing={0} width="100%"
      style={{
        background: [
          'radial-gradient(360px 200px at 0% 0%, rgba(176,160,232,0.45), transparent 55%)',
          'radial-gradient(300px 200px at 100% 100%, rgba(168,202,236,0.4), transparent 55%)',
          'rgba(255,255,255,0.78)',
        ].join(', '),
        border: '1px solid rgba(255,255,255,0.9)',
        borderRadius: '20px',
        borderCollapse: 'separate' as const,
        borderSpacing: 0,
        overflow: 'hidden' as const,
        boxShadow: '0 6px 20px -8px rgba(100,90,180,0.2)',
        marginBottom: '24px',
      }}
    >
      <tbody>
        <tr>
          <td style={{ padding: '22px 24px' }}>
            {/* flex-ish layout via table */}
            <table cellPadding={0} cellSpacing={0} width="100%">
              <tbody>
                <tr>
                  {/* Giant "5" */}
                  <td style={{ width: '80px', verticalAlign: 'middle' }}>
                    <div style={{
                      fontSize: '64px', fontWeight: 800,
                      lineHeight: '1',
                      background: GRAD,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      color: A1,      // fallback
                      fontFamily: FONT,
                      letterSpacing: '-0.04em',
                      display: 'inline-block',
                    }}>5</div>
                  </td>
                  {/* Right side */}
                  <td style={{ paddingLeft: '16px', verticalAlign: 'middle' }}>
                    <div style={{
                      fontSize: '15px', fontWeight: 700,
                      color: INK, fontFamily: FONT,
                      marginBottom: '4px',
                    }}>Free credits, ready to use</div>
                    <div style={{
                      fontSize: '13px', fontWeight: 500,
                      color: INK_SOFT, fontFamily: FONT,
                      lineHeight: '1.5',
                    }}>
                      1 credit = 30 minutes of audio.<br />Credits never expire.
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  );

  // Feature rows
  const featuresSection = (
    <table cellPadding={0} cellSpacing={0} width="100%" style={{ marginBottom: '28px' }}>
      <tbody>
        {/* Section label */}
        <tr>
          <td style={{
            paddingBottom: '12px',
            fontSize: '11px', fontWeight: 700,
            color: MUTED, letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            fontFamily: FONT,
          }}>
            What you can do right now
          </td>
        </tr>
        {/* Feature rows */}
        <tr>
          <td>
            <table
              cellPadding={0} cellSpacing={0} width="100%"
              style={{
                background: 'rgba(255,255,255,0.62)',
                border: '1px solid rgba(255,255,255,0.9)',
                borderRadius: '16px',
                borderCollapse: 'separate' as const,
                borderSpacing: 0,
                overflow: 'hidden' as const,
              }}
            >
              <tbody>
                {FEATURES.map((f, i) => (
                  <tr key={i} style={i < FEATURES.length - 1 ? { borderBottom: `1px solid ${LINE}` } : undefined}>
                    <td style={{ padding: '14px 16px' }}>
                      <table cellPadding={0} cellSpacing={0}>
                        <tbody>
                          <tr>
                            {/* Icon tile */}
                            <td style={{
                              width: '40px', height: '40px',
                              background: GRAD,
                              borderRadius: '12px',
                              verticalAlign: 'middle',
                              textAlign: 'center' as const,
                              boxShadow: '0 4px 10px -4px rgba(95,110,205,0.45)',
                            }}>
                              {f.icon}
                            </td>
                            {/* Text */}
                            <td style={{ paddingLeft: '14px', verticalAlign: 'middle' }}>
                              <div style={{
                                fontSize: '14px', fontWeight: 700,
                                color: INK, fontFamily: FONT,
                                marginBottom: '2px',
                              }}>{f.title}</div>
                              <div style={{
                                fontSize: '12.5px', fontWeight: 400,
                                color: INK_SOFT, fontFamily: FONT,
                                lineHeight: '1.5',
                              }}>{f.desc}</div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  );

  return (
    <EmailLayout preview={`Welcome to Neurativo, ${firstName} — your 5 free credits are waiting`}>
      {/* Eyebrow badge */}
      <table cellPadding={0} cellSpacing={0} style={{ marginBottom: '16px' }}>
        <tbody>
          <tr>
            <td style={{
              background: 'rgba(113,100,207,0.1)',
              borderRadius: '999px',
              padding: '5px 12px',
              border: '1px solid rgba(113,100,207,0.18)',
            }}>
              <span style={{
                fontSize: '12px', fontWeight: 700,
                color: A1, fontFamily: FONT,
                letterSpacing: '0.02em',
              }}>
                <span style={{
                  display: 'inline-block',
                  width: '7px', height: '7px',
                  background: GRAD,
                  borderRadius: '50%',
                  marginRight: '7px',
                  verticalAlign: 'middle',
                }} />
                Welcome aboard
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* H1 */}
      <div style={{
        fontSize: '34px', fontWeight: 800,
        color: INK, fontFamily: FONT,
        letterSpacing: '-0.032em', lineHeight: '1.18',
        marginBottom: '14px',
      }}>
        Welcome to<br />Neurativo, {firstName}.
      </div>

      {/* Lede */}
      <div style={{
        fontSize: '15.5px', fontWeight: 400,
        color: INK_SOFT, fontFamily: FONT,
        lineHeight: '1.65',
        marginBottom: '26px',
      }}>
        Your account is ready. We've dropped <strong style={{ color: INK, fontWeight: 600 }}>5 free credits</strong> into
        it so you can jump straight in — no card needed.
      </div>

      {/* Credits hero */}
      {creditsCard}

      {/* Features */}
      {featuresSection}

      {/* CTA */}
      <CtaButton text="Open Neurativo →" href={appUrl} />

      {/* Note */}
      <Text style={{
        ...t.muted,
        marginTop: '16px',
        textAlign: 'center' as const,
      }}>
        Takes about a minute to set up your first lecture.{' '}
        <Link
          href="https://www.neurativo.com/how-it-works"
          style={{ color: A1, fontWeight: 600, textDecoration: 'none', fontFamily: FONT }}
        >
          Watch the 60-sec tour →
        </Link>
      </Text>
    </EmailLayout>
  );
}

WelcomeEmail.PreviewProps = {
  name: 'Alex',
  appUrl: 'https://www.neurativo.com/app',
} satisfies WelcomeEmailProps;
