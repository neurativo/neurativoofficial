import React from 'react';
import { Html, Head, Body, Preview, Section, Row, Column, Img, Text, Link } from '@react-email/components';
import { Tailwind, pixelBasedPreset } from '@react-email/tailwind';

// ─── Design tokens (from claude.ai/design — logo orb palette) ─────────────────
export const A1       = '#7164CF';   // periwinkle
export const A2       = '#5179CE';   // soft blue
export const GRAD     = `linear-gradient(120deg, ${A1} 0%, ${A2} 100%)`;
export const GRAD_SOFT = 'linear-gradient(128deg, #CBC1EF 0%, #F1ECFB 48%, #BBD7F0 100%)';
export const INK      = '#15131F';
export const INK_SOFT = '#4E4B60';
export const MUTED    = '#8F8BA0';
export const LINE     = 'rgba(120,110,190,0.14)';
export const FONT     = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// Pastel orb gradient that fills the card (pulled from logo background)
const CARD_BG = [
  'radial-gradient(560px 320px at 12% -6%, rgba(176,160,232,0.55), transparent 60%)',
  'radial-gradient(560px 360px at 96% 6%,  rgba(168,202,236,0.55), transparent 58%)',
  'linear-gradient(165deg, #EFEBFA 0%, #F6F4FC 46%, #E7F0FA 100%)',
].join(', ');

// Outer page background
const PAGE_BG = [
  'radial-gradient(900px 540px at 16% -8%, rgba(180,165,235,0.45), transparent 62%)',
  'radial-gradient(820px 560px at 94%  4%, rgba(165,200,235,0.42), transparent 58%)',
  '#EBE9F7',
].join(', ');

// ─── Head styles ──────────────────────────────────────────────────────────────
const HEAD_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; font-family: ${FONT}; -webkit-text-size-adjust: 100%; }
  @media only screen and (max-width: 500px) {
    .em-wrap  { padding: 20px 12px 36px !important; }
    .em-card  { border-radius: 20px !important; width: 100% !important; }
    .em-hdr   { padding: 22px 24px !important; }
    .em-body  { padding: 28px 24px 20px !important; }
    .em-foot  { padding: 20px 24px 24px !important; }
    .em-h1    { font-size: 30px !important; letter-spacing: -0.02em !important; }
    .em-h2    { font-size: 20px !important; }
    .em-btn-td { display: block !important; width: 100% !important; border-radius: 999px !important; }
    .em-btn    { display: block !important; width: 100% !important; text-align: center !important; }
    .em-credits { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }
    .em-credits-num { font-size: 52px !important; }
  }
`;

// ─── Layout ───────────────────────────────────────────────────────────────────
interface EmailLayoutProps {
  preview: string;
  children: React.ReactNode;
  subtitle?: string;
}

export function EmailLayout({ preview, children, subtitle }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Head>
          <style dangerouslySetInnerHTML={{ __html: HEAD_STYLES }} />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </Head>
        <Preview>{preview}</Preview>

        <Body style={{ margin: 0, padding: 0, background: PAGE_BG, backgroundColor: '#EBE9F7' }}>
          <table width="100%" cellPadding={0} cellSpacing={0} style={{ minWidth: '100%' }}>
            <tbody>
              <tr>
                <td align="center" className="em-wrap" style={{ padding: '48px 16px 64px' }}>

                  {/* Card */}
                  <table
                    cellPadding={0} cellSpacing={0} width="600"
                    className="em-card"
                    style={{
                      maxWidth: '600px', width: '100%',
                      background: CARD_BG, backgroundColor: '#F0ECFA',
                      borderRadius: '28px', overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.7)',
                      boxShadow: '0 1px 0 rgba(255,255,255,0.7) inset, 0 30px 70px -28px rgba(46,28,112,0.35), 0 8px 22px -14px rgba(46,28,112,0.30)',
                      borderCollapse: 'separate' as const,
                      borderSpacing: 0,
                    }}
                  >
                    {/* Soft gradient hairline */}
                    <tr>
                      <td style={{
                        background: GRAD_SOFT,
                        height: '5px', lineHeight: '5px', fontSize: '1px',
                        msoLineHeightRule: 'exactly' as const,
                      }}>&nbsp;</td>
                    </tr>

                    {/* Header */}
                    <tr>
                      <td className="em-hdr" style={{
                        padding: '28px 40px 26px',
                        background: 'transparent',
                        borderBottom: `1px solid ${LINE}`,
                      }}>
                        <table cellPadding={0} cellSpacing={0}>
                          <tbody>
                            <tr>
                              {/* Logo orb box */}
                              <td style={{
                                width: '46px', height: '46px',
                                background: GRAD_SOFT,
                                borderRadius: '14px',
                                border: '1px solid rgba(255,255,255,0.85)',
                                boxShadow: '0 6px 16px -8px rgba(120,110,190,0.55)',
                                verticalAlign: 'middle',
                                textAlign: 'center' as const,
                              }}>
                                <Img
                                  src="https://www.neurativo.com/logo.png"
                                  width={26} height={26}
                                  alt="Neurativo"
                                  style={{ display: 'block', margin: '10px auto', border: 0 }}
                                />
                              </td>
                              {/* Wordmark */}
                              <td style={{ paddingLeft: '13px', verticalAlign: 'middle' }}>
                                <Text style={{
                                  margin: 0, fontSize: '18px', fontWeight: 800,
                                  color: INK, letterSpacing: '-0.02em', lineHeight: '1.1',
                                  fontFamily: FONT,
                                }}>Neurativo</Text>
                                <Text style={{
                                  margin: 0, marginTop: '2px',
                                  fontSize: '12.5px', fontWeight: 500,
                                  color: MUTED, letterSpacing: '0.01em',
                                  fontFamily: FONT,
                                }}>Transforming education with intelligence</Text>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>

                    {/* Body */}
                    <tr>
                      <td className="em-body" style={{
                        padding: '36px 40px 8px',
                        background: 'transparent',
                        fontFamily: FONT,
                        wordBreak: 'break-word' as const,
                      }}>
                        {subtitle && (
                          <table cellPadding={0} cellSpacing={0} style={{ marginBottom: '16px' }}>
                            <tbody>
                              <tr>
                                <td style={{
                                  background: 'rgba(113,100,207,0.1)',
                                  borderRadius: '999px',
                                  padding: '4px 12px',
                                  border: '1px solid rgba(113,100,207,0.18)',
                                }}>
                                  <Text style={{
                                    margin: 0,
                                    fontSize: '11.5px', fontWeight: 700,
                                    color: A1, fontFamily: FONT,
                                    letterSpacing: '0.04em',
                                    textTransform: 'uppercase',
                                  }}>{subtitle}</Text>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        )}
                        {children}
                      </td>
                    </tr>

                    {/* Footer */}
                    <tr>
                      <td className="em-foot" style={{
                        padding: '24px 40px 28px',
                        background: 'rgba(255,255,255,0.55)',
                        borderTop: '1px solid rgba(255,255,255,0.85)',
                        borderRadius: '0 0 28px 28px',
                      }}>
                        {/* Foot brand */}
                        <table cellPadding={0} cellSpacing={0} style={{ marginBottom: '12px' }}>
                          <tbody>
                            <tr>
                              <td style={{
                                width: '24px', height: '24px',
                                background: GRAD_SOFT,
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.85)',
                                verticalAlign: 'middle',
                              }}>&nbsp;</td>
                              <td style={{ paddingLeft: '9px', verticalAlign: 'middle' }}>
                                <Text style={{
                                  margin: 0, fontSize: '14px', fontWeight: 700,
                                  color: INK, letterSpacing: '-0.01em', fontFamily: FONT,
                                }}>Neurativo</Text>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <Text style={{
                          margin: 0, fontSize: '12.5px', lineHeight: '1.6', fontWeight: 500,
                          color: MUTED, fontFamily: FONT,
                        }}>
                          You're receiving this because you created a Neurativo account.
                          Questions? Just reply to this email — a real person reads every one.{' '}
                          <Link href="https://www.neurativo.com" style={{ color: A1, fontWeight: 600, textDecoration: 'none' }}>
                            neurativo.com
                          </Link>
                        </Text>
                        {/* Footer links */}
                        <table cellPadding={0} cellSpacing={0} style={{ marginTop: '14px' }}>
                          <tbody>
                            <tr>
                              <td style={{ paddingRight: '16px' }}>
                                <Link href="https://www.neurativo.com/help" style={footLinkStyle}>Help center</Link>
                              </td>
                              <td style={{ paddingRight: '16px' }}>
                                <Link href="https://www.neurativo.com/privacy" style={footLinkStyle}>Privacy</Link>
                              </td>
                              <td>
                                <Link href="https://www.neurativo.com/unsubscribe" style={footLinkStyle}>Unsubscribe</Link>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>

                  </table>
                </td>
              </tr>
            </tbody>
          </table>
        </Body>
      </Tailwind>
    </Html>
  );
}

const footLinkStyle: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, color: INK_SOFT,
  textDecoration: 'none', fontFamily: FONT,
};

// ─── Shared sub-components ────────────────────────────────────────────────────

// Info table (used by non-welcome templates)
interface InfoTableProps { rows: { label: string; value: string }[] }
export function InfoTable({ rows }: InfoTableProps) {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0} style={{
      background: 'rgba(255,255,255,0.62)',
      border: '1px solid rgba(255,255,255,0.85)',
      borderRadius: '14px',
      borderCollapse: 'separate' as const, borderSpacing: 0,
      margin: '20px 0', overflow: 'hidden' as const,
      boxShadow: '0 4px 12px -8px rgba(100,90,180,0.18)',
    }}>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={i < rows.length - 1 ? { borderBottom: `1px solid ${LINE}` } : undefined}>
            <td style={{ padding: '11px 16px', fontSize: '13.5px', color: INK_SOFT, fontFamily: FONT, lineHeight: '1.5' }}>
              {r.label}
            </td>
            <td style={{ padding: '11px 16px', fontSize: '13.5px', fontWeight: 700, color: INK, textAlign: 'right' as const, whiteSpace: 'nowrap' as const, fontFamily: FONT }}>
              {r.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Feature list (used by plan-upgraded)
interface FeatureListProps { items: string[] }
export function FeatureList({ items }: FeatureListProps) {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0} style={{
      background: 'rgba(255,255,255,0.62)',
      border: '1px solid rgba(255,255,255,0.85)',
      borderRadius: '14px',
      borderCollapse: 'separate' as const, borderSpacing: 0,
      margin: '20px 0', overflow: 'hidden' as const,
    }}>
      <tbody>
        {items.map((item, i) => (
          <tr key={i} style={i < items.length - 1 ? { borderBottom: `1px solid ${LINE}` } : undefined}>
            <td style={{ padding: '11px 16px', fontSize: '13.5px', color: INK_SOFT, fontFamily: FONT }}>
              <span style={{ color: A1, marginRight: '9px', fontWeight: 700 }}>✓</span>
              {item}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// CTA button — gradient pill
interface CtaButtonProps { text: string; href: string; danger?: boolean }
export function CtaButton({ text, href, danger }: CtaButtonProps) {
  const bg = danger ? '#dc2626' : GRAD;
  const shadow = danger
    ? '0 8px 20px -8px rgba(220,38,38,0.5)'
    : '0 14px 26px -10px rgba(95,110,205,0.55), 0 2px 6px -2px rgba(120,140,205,0.4)';
  return (
    <table cellPadding={0} cellSpacing={0} style={{ marginTop: '26px' }}>
      <tbody>
        <tr>
          <td className="em-btn-td" style={{
            background: bg,
            borderRadius: '999px',
            boxShadow: shadow,
          }}>
            <a href={href} className="em-btn" style={{
              display: 'inline-block',
              padding: '15px 30px',
              color: '#ffffff',
              fontSize: '16px', fontWeight: 700,
              letterSpacing: '-0.01em',
              textDecoration: 'none',
              borderRadius: '999px',
              fontFamily: FONT,
            }}>
              {text}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// ─── Typography helpers ───────────────────────────────────────────────────────
export const FONT_EXPORT = FONT;

export const t = {
  h2: {
    margin: '0 0 12px',
    fontSize: '24px', fontWeight: 800,
    color: INK, letterSpacing: '-0.025em', lineHeight: '1.2',
    fontFamily: FONT,
  },
  body: {
    margin: '0 0 14px',
    fontSize: '15px', fontWeight: 400,
    color: INK_SOFT, lineHeight: '1.65',
    fontFamily: FONT,
  },
  muted: {
    margin: '0 0 14px',
    fontSize: '13.5px', fontWeight: 500,
    color: MUTED, lineHeight: '1.6',
    fontFamily: FONT,
  },
} as const;
