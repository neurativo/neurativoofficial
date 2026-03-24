import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSEO } from '../lib/useSEO';

const CSS = `
  .legal *, .legal *::before, .legal *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .legal {
    font-family: 'Inter', sans-serif;
    background: var(--color-bg, #fafaf9);
    color: var(--color-text, #1a1a1a);
    -webkit-font-smoothing: antialiased;
    min-height: 100vh;
  }

  .legal-nav {
    position: sticky; top: 0; z-index: 50; height: 56px;
    background: rgba(250,250,249,0.92); backdrop-filter: blur(16px);
    border-bottom: 1px solid var(--color-border, #f0ede8);
    display: flex; align-items: center; padding: 0 40px; gap: 16px;
  }
  .legal-nav a {
    font-size: 13px; font-weight: 500; color: var(--color-text, #1a1a1a);
    text-decoration: none; display: flex; align-items: center; gap: 6px;
  }
  .legal-nav a:hover { opacity: 0.6; }
  .legal-nav-sep { color: var(--color-muted, #a3a3a3); font-size: 13px; }
  .legal-nav-title { font-size: 13px; color: var(--color-muted, #a3a3a3); }

  .legal-body {
    max-width: 720px; margin: 0 auto; padding: 56px 40px 120px;
  }

  .legal-eyebrow {
    font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--color-muted, #a3a3a3); margin-bottom: 12px;
  }
  .legal-h1 {
    font-size: 32px; font-weight: 700; letter-spacing: -0.8px;
    color: var(--color-text, #1a1a1a); margin-bottom: 8px; line-height: 1.15;
  }
  .legal-meta {
    font-size: 13px; color: var(--color-muted, #a3a3a3); margin-bottom: 48px;
    padding-bottom: 32px; border-bottom: 1px solid var(--color-border, #f0ede8);
  }

  .legal-toc {
    background: var(--color-card, #fff); border: 1px solid var(--color-border, #f0ede8);
    border-radius: 12px; padding: 20px 24px; margin-bottom: 40px;
  }
  .legal-toc-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-muted,#a3a3a3); margin-bottom: 12px; }
  .legal-toc ol { padding-left: 16px; display: flex; flex-direction: column; gap: 4px; }
  .legal-toc li { font-size: 13px; }
  .legal-toc a { color: var(--color-text,#1a1a1a); text-decoration: none; }
  .legal-toc a:hover { text-decoration: underline; }

  .legal-section { margin-bottom: 40px; }
  .legal-section:last-child { margin-bottom: 0; }
  .legal-h2 {
    font-size: 16px; font-weight: 650; color: var(--color-text,#1a1a1a);
    margin-bottom: 12px; padding-top: 8px;
    border-top: 1px solid var(--color-border,#f0ede8);
    padding-top: 32px; margin-top: 8px;
    scroll-margin-top: 80px;
  }
  .legal-p {
    font-size: 14px; line-height: 1.75; color: var(--color-sec,#3d3d3d);
    margin-bottom: 14px;
  }
  .legal-p:last-child { margin-bottom: 0; }
  .legal-ul {
    font-size: 14px; line-height: 1.75; color: var(--color-sec,#3d3d3d);
    padding-left: 20px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 4px;
  }
  .legal-ul li { list-style: disc; }
  .legal-warning {
    background: #fff8ed; border: 1px solid #f5d78a; border-radius: 10px;
    padding: 14px 18px; font-size: 13px; line-height: 1.65; color: #7a5400;
    margin-bottom: 14px;
  }
  .legal-strong { font-weight: 650; }
  .legal-contact {
    background: var(--color-card,#fff); border: 1px solid var(--color-border,#f0ede8);
    border-radius: 12px; padding: 20px 24px; margin-top: 16px;
    font-size: 14px; line-height: 1.7; color: var(--color-sec,#3d3d3d);
  }
  .legal-contact a { color: var(--color-text,#1a1a1a); }

  @media (max-width: 600px) {
    .legal-nav { padding: 0 20px; }
    .legal-body { padding: 40px 20px 80px; }
    .legal-h1 { font-size: 26px; }
  }
`;

const SECTIONS = [
    { id: 'acceptance', title: 'Acceptance of Terms' },
    { id: 'description', title: 'Description of Service' },
    { id: 'eligibility', title: 'Eligibility' },
    { id: 'account', title: 'Account Registration & Security' },
    { id: 'content', title: 'User Content & Recordings' },
    { id: 'ai-disclaimer', title: 'AI-Generated Content Disclaimer' },
    { id: 'acceptable-use', title: 'Acceptable Use Policy' },
    { id: 'ip', title: 'Intellectual Property' },
    { id: 'third-party', title: 'Third-Party Services' },
    { id: 'disclaimer', title: 'Disclaimer of Warranties' },
    { id: 'liability', title: 'Limitation of Liability' },
    { id: 'indemnification', title: 'Indemnification' },
    { id: 'termination', title: 'Termination' },
    { id: 'dispute', title: 'Dispute Resolution & Arbitration' },
    { id: 'changes', title: 'Changes to Terms' },
    { id: 'contact', title: 'Contact' },
];

export default function TermsOfService() {
    useSEO({ title: 'Terms of Service', description: 'Read the Neurativo Terms of Service — the rules, rights, and responsibilities for using our AI lecture transcription platform.', canonicalPath: '/terms' });
    return (
        <>
            <style>{CSS}</style>
            <div className="legal">
                <nav className="legal-nav">
                    <Link to="/">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6"/>
                        </svg>
                        Neurativo
                    </Link>
                    <span className="legal-nav-sep">/</span>
                    <span className="legal-nav-title">Terms of Service</span>
                </nav>

                <div className="legal-body">
                    <div className="legal-eyebrow">Legal</div>
                    <h1 className="legal-h1">Terms of Service</h1>
                    <p className="legal-meta">Effective date: March 23, 2026 &nbsp;·&nbsp; Last updated: March 23, 2026</p>

                    <div className="legal-toc">
                        <div className="legal-toc-title">Contents</div>
                        <ol>
                            {SECTIONS.map((s, i) => (
                                <li key={s.id}><a href={`#${s.id}`}>{i + 1}. {s.title}</a></li>
                            ))}
                        </ol>
                    </div>

                    {/* 1 */}
                    <div className="legal-section" id="acceptance">
                        <h2 className="legal-h2">1. Acceptance of Terms</h2>
                        <p className="legal-p">
                            By accessing or using Neurativo ("Service", "we", "us", "our"), you ("User", "you") agree to be legally bound by these Terms of Service ("Terms") and our <Link to="/privacy" style={{ color: 'inherit' }}>Privacy Policy</Link>, which is incorporated herein by reference. If you do not agree to all of these Terms, you must immediately stop using the Service.
                        </p>
                        <p className="legal-p">
                            These Terms constitute the entire and exclusive agreement between you and Neurativo regarding the Service and supersede any prior agreements, representations, or understandings between you and Neurativo.
                        </p>
                    </div>

                    {/* 2 */}
                    <div className="legal-section" id="description">
                        <h2 className="legal-h2">2. Description of Service</h2>
                        <p className="legal-p">
                            Neurativo is an AI-powered lecture assistant that provides real-time audio transcription, automated summarization, question-and-answer functionality, text explanation, and related tools intended to help users capture and review spoken content. The Service is provided on an "as-is" and "as-available" basis.
                        </p>
                        <p className="legal-p">
                            We reserve the right at any time and from time to time to modify, suspend, or discontinue the Service (or any part thereof) with or without notice. We shall not be liable to you or any third party for any modification, suspension, or discontinuation of the Service.
                        </p>
                    </div>

                    {/* 3 */}
                    <div className="legal-section" id="eligibility">
                        <h2 className="legal-h2">3. Eligibility</h2>
                        <p className="legal-p">
                            You must be at least 13 years of age to use the Service. If you are under 18, you represent that your parent or legal guardian has reviewed and agreed to these Terms. By using the Service, you represent and warrant that you meet all eligibility requirements. We may, in our sole discretion, refuse to offer the Service to any person or entity and change eligibility criteria at any time.
                        </p>
                    </div>

                    {/* 4 */}
                    <div className="legal-section" id="account">
                        <h2 className="legal-h2">4. Account Registration & Security</h2>
                        <p className="legal-p">
                            To access certain features, you must register for an account using a valid email address. You agree to:
                        </p>
                        <ul className="legal-ul">
                            <li>Provide accurate, current, and complete registration information.</li>
                            <li>Maintain the security of your account credentials and not share them with others.</li>
                            <li>Promptly notify us of any unauthorized use of your account.</li>
                            <li>Accept responsibility for all activities that occur under your account.</li>
                        </ul>
                        <p className="legal-p">
                            We are not liable for any loss or damage arising from your failure to comply with these security obligations. We reserve the right to terminate accounts that violate these Terms.
                        </p>
                    </div>

                    {/* 5 */}
                    <div className="legal-section" id="content">
                        <h2 className="legal-h2">5. User Content & Recordings</h2>
                        <p className="legal-p">
                            You retain all ownership rights in the audio recordings, transcripts, and other content you submit to the Service ("User Content"). By submitting User Content, you grant Neurativo a worldwide, non-exclusive, royalty-free license to process, store, and transmit your User Content solely to provide and improve the Service.
                        </p>
                        <div className="legal-warning">
                            <span className="legal-strong">Recording consent laws:</span> Many jurisdictions require the consent of one or all parties before recording a conversation or lecture. It is <span className="legal-strong">your sole responsibility</span> to comply with all applicable wiretapping, recording-consent, and privacy laws in your jurisdiction before recording any audio through the Service. Neurativo assumes no liability for your failure to obtain required consents or comply with applicable laws.
                        </div>
                        <p className="legal-p">
                            You represent and warrant that: (a) you own or have the necessary rights to submit User Content; (b) your User Content does not violate the privacy, intellectual property, or other rights of any third party; and (c) you have obtained all required consents for any recordings.
                        </p>
                        <p className="legal-p">
                            We reserve the right to remove any User Content that we determine, in our sole discretion, violates these Terms or applicable law.
                        </p>
                    </div>

                    {/* 6 */}
                    <div className="legal-section" id="ai-disclaimer">
                        <h2 className="legal-h2">6. AI-Generated Content Disclaimer</h2>
                        <div className="legal-warning">
                            <span className="legal-strong">Important — please read carefully.</span> Transcriptions, summaries, Q&A answers, and explanations generated by the Service are produced by artificial intelligence and may contain errors, omissions, misrepresentations, or inaccuracies.
                        </div>
                        <p className="legal-p">
                            AI-generated content provided by the Service:
                        </p>
                        <ul className="legal-ul">
                            <li>Does <strong>not</strong> constitute professional, medical, legal, financial, academic, or any other expert advice.</li>
                            <li>May not accurately reflect the content of the original audio, particularly in noisy environments, with accented speech, or with domain-specific terminology.</li>
                            <li>Should be independently verified before being relied upon for any important purpose.</li>
                            <li>Is not suitable as a substitute for your own notes, professional consultation, or primary source materials.</li>
                        </ul>
                        <p className="legal-p">
                            Neurativo expressly disclaims all liability for any decisions made, actions taken, or failures to act in reliance on AI-generated content. You use all AI-generated outputs entirely at your own risk.
                        </p>
                    </div>

                    {/* 7 */}
                    <div className="legal-section" id="acceptable-use">
                        <h2 className="legal-h2">7. Acceptable Use Policy</h2>
                        <p className="legal-p">You agree not to use the Service to:</p>
                        <ul className="legal-ul">
                            <li>Record or transcribe any person without their legally required consent.</li>
                            <li>Upload, transmit, or store content that is unlawful, defamatory, harassing, abusive, fraudulent, infringing, obscene, or otherwise objectionable.</li>
                            <li>Violate any applicable local, national, or international law or regulation.</li>
                            <li>Circumvent, disable, or interfere with security-related features of the Service.</li>
                            <li>Attempt to reverse-engineer, decompile, or extract source code from any part of the Service.</li>
                            <li>Use automated means (bots, scrapers, crawlers) to access the Service without our express written permission.</li>
                            <li>Attempt to gain unauthorized access to any portion of the Service or its related systems.</li>
                            <li>Use the Service for any commercial purpose other than as expressly permitted by us in writing.</li>
                            <li>Impersonate any person or entity or misrepresent your affiliation with any person or entity.</li>
                        </ul>
                        <p className="legal-p">
                            Violation of this Acceptable Use Policy may result in immediate termination of your account without refund and, where appropriate, reporting to law enforcement.
                        </p>
                    </div>

                    {/* 8 */}
                    <div className="legal-section" id="ip">
                        <h2 className="legal-h2">8. Intellectual Property</h2>
                        <p className="legal-p">
                            The Service, including all software, design, text, graphics, interfaces, and the selection and arrangement thereof, is owned by Neurativo and protected by applicable intellectual property laws. Nothing in these Terms grants you any right, title, or interest in the Service beyond the limited right to use it as expressly set forth herein.
                        </p>
                        <p className="legal-p">
                            "Neurativo" and related logos and marks are trademarks of Neurativo. You may not use our trademarks without our prior written consent.
                        </p>
                    </div>

                    {/* 9 */}
                    <div className="legal-section" id="third-party">
                        <h2 className="legal-h2">9. Third-Party Services</h2>
                        <p className="legal-p">
                            The Service relies on third-party infrastructure and technology providers to deliver its functionality, including cloud hosting, data storage, authentication, and AI processing. Your use of the Service is subject to those providers' terms of service and privacy policies. We are not responsible for the acts, omissions, or policies of third-party service providers, and their terms may change independently of ours.
                        </p>
                        <p className="legal-p">
                            By using the Service, you acknowledge that content you submit — including audio recordings — may be processed by our technology partners solely for the purpose of delivering the features you have requested. We take reasonable steps to ensure our providers handle your data in accordance with applicable law.
                        </p>
                    </div>

                    {/* 10 */}
                    <div className="legal-section" id="disclaimer">
                        <h2 className="legal-h2">10. Disclaimer of Warranties</h2>
                        <p className="legal-p">
                            <span className="legal-strong">THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED.</span> To the fullest extent permitted by applicable law, Neurativo expressly disclaims all warranties, including but not limited to:
                        </p>
                        <ul className="legal-ul">
                            <li>Implied warranties of merchantability, fitness for a particular purpose, and non-infringement.</li>
                            <li>Any warranty that the Service will be uninterrupted, error-free, or free of viruses or other harmful components.</li>
                            <li>Any warranty regarding the accuracy, completeness, reliability, or timeliness of AI-generated transcriptions, summaries, or answers.</li>
                            <li>Any warranty that data stored through the Service will not be lost, corrupted, or disclosed.</li>
                        </ul>
                        <p className="legal-p">
                            Some jurisdictions do not allow the exclusion of implied warranties, so the above exclusion may not apply to you in full.
                        </p>
                    </div>

                    {/* 11 */}
                    <div className="legal-section" id="liability">
                        <h2 className="legal-h2">11. Limitation of Liability</h2>
                        <p className="legal-p">
                            <span className="legal-strong">TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, NEURATIVO AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, LICENSORS, AND SERVICE PROVIDERS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES</span>, including but not limited to damages for loss of profits, revenue, data, goodwill, or other intangible losses, arising out of or related to your use of or inability to use the Service, even if we have been advised of the possibility of such damages.
                        </p>
                        <p className="legal-p">
                            In no event shall Neurativo's aggregate liability to you for all claims arising out of or related to these Terms or the Service exceed the greater of: (a) the total amount paid by you to Neurativo in the twelve (12) months immediately preceding the event giving rise to the claim, or (b) one hundred US dollars (USD $100).
                        </p>
                        <p className="legal-p">
                            The limitations above are fundamental elements of the basis of the bargain between Neurativo and you. Some jurisdictions do not allow certain limitations of liability, so some of the above may not apply to you.
                        </p>
                    </div>

                    {/* 12 */}
                    <div className="legal-section" id="indemnification">
                        <h2 className="legal-h2">12. Indemnification</h2>
                        <p className="legal-p">
                            You agree to defend, indemnify, and hold harmless Neurativo and its officers, directors, employees, contractors, agents, licensors, and service providers from and against any claims, liabilities, damages, judgments, awards, losses, costs, expenses, or fees (including reasonable attorneys' fees) arising out of or relating to:
                        </p>
                        <ul className="legal-ul">
                            <li>Your violation of these Terms.</li>
                            <li>Your User Content, including any claim that your recordings violate any applicable consent or wiretapping law.</li>
                            <li>Your violation of any third party's rights, including intellectual property, privacy, or publicity rights.</li>
                            <li>Your use of the Service in violation of any applicable law or regulation.</li>
                        </ul>
                    </div>

                    {/* 13 */}
                    <div className="legal-section" id="termination">
                        <h2 className="legal-h2">13. Termination</h2>
                        <p className="legal-p">
                            We may suspend or terminate your access to the Service at any time, with or without cause, with or without notice, effective immediately. Reasons for termination include, but are not limited to, violation of these Terms or conduct that we determine is harmful to other users, us, or third parties.
                        </p>
                        <p className="legal-p">
                            You may terminate your account at any time by contacting us or using the account deletion feature in your profile settings. Upon termination, your right to use the Service ceases immediately. Provisions of these Terms that by their nature should survive termination will survive, including sections on intellectual property, disclaimers, indemnification, limitation of liability, and dispute resolution.
                        </p>
                    </div>

                    {/* 14 */}
                    <div className="legal-section" id="dispute">
                        <h2 className="legal-h2">14. Dispute Resolution & Arbitration</h2>
                        <p className="legal-p">
                            <span className="legal-strong">Informal Resolution.</span> Before initiating any formal proceeding, you agree to first contact us at the address below and attempt to resolve any dispute informally for at least 30 days. We will attempt to resolve the dispute through good faith negotiations.
                        </p>
                        <p className="legal-p">
                            <span className="legal-strong">Binding Arbitration.</span> If informal resolution fails, any dispute, claim, or controversy arising out of or relating to these Terms or the Service shall be finally resolved by binding individual arbitration. You waive any right to a jury trial and any right to participate in a class action, class arbitration, or representative action. This arbitration clause is governed by the laws of the jurisdiction in which Neurativo is incorporated.
                        </p>
                        <p className="legal-p">
                            <span className="legal-strong">Governing Law.</span> These Terms are governed by and construed in accordance with applicable law, without regard to conflict-of-law principles. Nothing in this section limits either party's right to seek injunctive or other equitable relief from a court of competent jurisdiction for matters involving intellectual property rights or unauthorized access to the Service.
                        </p>
                        <p className="legal-p">
                            <span className="legal-strong">Time Limitation.</span> Any claim arising out of or related to these Terms must be filed within one (1) year after the cause of action arose; otherwise, the claim is permanently barred.
                        </p>
                    </div>

                    {/* 15 */}
                    <div className="legal-section" id="changes">
                        <h2 className="legal-h2">15. Changes to Terms</h2>
                        <p className="legal-p">
                            We reserve the right to modify these Terms at any time. We will notify you of material changes by updating the "Last updated" date at the top of this page and, where we have your contact information, by sending you an email. Your continued use of the Service after any change constitutes your acceptance of the new Terms. If you do not agree to any modified Terms, you must stop using the Service.
                        </p>
                    </div>

                    {/* 16 */}
                    <div className="legal-section" id="contact">
                        <h2 className="legal-h2">16. Contact</h2>
                        <p className="legal-p">If you have questions about these Terms, please contact us:</p>
                        <div className="legal-contact">
                            <strong>Neurativo</strong><br />
                            Email: <a href="mailto:legal@neurativo.app">legal@neurativo.app</a><br />
                            Website: <Link to="/" style={{color:'inherit'}}>neurativo.app</Link>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
