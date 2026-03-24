import React from 'react';
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
    margin-bottom: 12px; padding-top: 32px; margin-top: 8px;
    border-top: 1px solid var(--color-border,#f0ede8);
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
  .legal-table {
    width: 100%; border-collapse: collapse; font-size: 13px;
    margin-bottom: 14px; border-radius: 10px; overflow: hidden;
    border: 1px solid var(--color-border,#f0ede8);
  }
  .legal-table th {
    background: var(--color-card,#fff); font-weight: 600; text-align: left;
    padding: 10px 14px; color: var(--color-text,#1a1a1a);
    border-bottom: 1px solid var(--color-border,#f0ede8);
  }
  .legal-table td {
    padding: 10px 14px; color: var(--color-sec,#3d3d3d);
    border-bottom: 1px solid var(--color-border,#f0ede8); vertical-align: top;
  }
  .legal-table tr:last-child td { border-bottom: none; }
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
    .legal-table { font-size: 12px; }
    .legal-table th, .legal-table td { padding: 8px 10px; }
  }
`;

const SECTIONS = [
    { id: 'overview', title: 'Overview' },
    { id: 'what-we-collect', title: 'What We Collect' },
    { id: 'how-we-use', title: 'How We Use Your Data' },
    { id: 'legal-basis', title: 'Legal Basis for Processing' },
    { id: 'sharing', title: 'How We Share Your Data' },
    { id: 'third-parties', title: 'Service Providers' },
    { id: 'audio', title: 'Audio & Transcript Data' },
    { id: 'retention', title: 'Data Retention' },
    { id: 'security', title: 'Security' },
    { id: 'your-rights', title: 'Your Rights' },
    { id: 'children', title: "Children's Privacy" },
    { id: 'cookies', title: 'Cookies & Local Storage' },
    { id: 'international', title: 'International Transfers' },
    { id: 'changes', title: 'Changes to This Policy' },
    { id: 'contact', title: 'Contact & Data Requests' },
];

export default function PrivacyPolicy() {
    useSEO({ title: 'Privacy Policy', description: "Neurativo's Privacy Policy — how we collect, use, and protect your data when you use our AI lecture transcription service.", canonicalPath: '/privacy' });
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
                    <span className="legal-nav-title">Privacy Policy</span>
                </nav>

                <div className="legal-body">
                    <div className="legal-eyebrow">Legal</div>
                    <h1 className="legal-h1">Privacy Policy</h1>
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
                    <div className="legal-section" id="overview">
                        <h2 className="legal-h2">1. Overview</h2>
                        <p className="legal-p">
                            Neurativo ("we", "us", "our") is committed to protecting your privacy. This Privacy Policy explains what data we collect when you use Neurativo, how we use it, with whom we share it, and what rights you have over it.
                        </p>
                        <p className="legal-p">
                            By using the Service you agree to the collection and use of information as described in this Policy. If you disagree, please discontinue use of the Service.
                        </p>
                    </div>

                    {/* 2 */}
                    <div className="legal-section" id="what-we-collect">
                        <h2 className="legal-h2">2. What We Collect</h2>
                        <table className="legal-table">
                            <thead>
                                <tr>
                                    <th>Category</th>
                                    <th>Examples</th>
                                    <th>Source</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td><strong>Account data</strong></td>
                                    <td>Email address, display name, avatar URL</td>
                                    <td>Provided by you on registration</td>
                                </tr>
                                <tr>
                                    <td><strong>Audio content</strong></td>
                                    <td>Audio recordings you upload or record live</td>
                                    <td>Provided by you</td>
                                </tr>
                                <tr>
                                    <td><strong>Derived content</strong></td>
                                    <td>Transcriptions, summaries, Q&amp;A history, embeddings</td>
                                    <td>Generated from your audio by the Service</td>
                                </tr>
                                <tr>
                                    <td><strong>Usage data</strong></td>
                                    <td>Pages visited, features used, timestamps, error logs</td>
                                    <td>Automatically collected</td>
                                </tr>
                                <tr>
                                    <td><strong>Device &amp; technical data</strong></td>
                                    <td>Browser type, OS, IP address, timezone</td>
                                    <td>Automatically collected</td>
                                </tr>
                                <tr>
                                    <td><strong>Preference data</strong></td>
                                    <td>Theme, language, notification settings</td>
                                    <td>Provided by you in profile settings</td>
                                </tr>
                            </tbody>
                        </table>
                        <p className="legal-p">
                            We do <strong>not</strong> collect payment card numbers directly — payments, if any, are handled by third-party processors who are independently responsible for that data.
                        </p>
                    </div>

                    {/* 3 */}
                    <div className="legal-section" id="how-we-use">
                        <h2 className="legal-h2">3. How We Use Your Data</h2>
                        <p className="legal-p">We use the data we collect to:</p>
                        <ul className="legal-ul">
                            <li>Provide, maintain, and improve the Service and its features.</li>
                            <li>Authenticate you and keep your account secure.</li>
                            <li>Process and store your recordings, transcriptions, and summaries.</li>
                            <li>Generate AI-powered Q&amp;A answers and explanations using your submitted content.</li>
                            <li>Send you transactional emails (e.g., magic links, account notifications).</li>
                            <li>Monitor for and respond to abuse, fraud, and security incidents.</li>
                            <li>Comply with legal obligations.</li>
                            <li>Analyze aggregate, anonymized usage patterns to improve the product.</li>
                        </ul>
                        <p className="legal-p">
                            We do <strong>not</strong> sell your personal data to any third party, ever.
                        </p>
                        <p className="legal-p">
                            We do <strong>not</strong> use your personal data or audio content to train AI/ML models without your explicit, separate consent.
                        </p>
                    </div>

                    {/* 4 */}
                    <div className="legal-section" id="legal-basis">
                        <h2 className="legal-h2">4. Legal Basis for Processing</h2>
                        <p className="legal-p">Where applicable law (such as the GDPR) requires a legal basis for processing, we rely on the following:</p>
                        <ul className="legal-ul">
                            <li><strong>Performance of a contract</strong> — processing necessary to provide the Service you requested (account, transcription, storage).</li>
                            <li><strong>Legitimate interests</strong> — security monitoring, fraud prevention, and aggregate analytics, where those interests are not overridden by your rights.</li>
                            <li><strong>Legal obligation</strong> — where we are required to process data to comply with law.</li>
                            <li><strong>Consent</strong> — for any processing that requires it (e.g., marketing communications, if we send any).</li>
                        </ul>
                    </div>

                    {/* 5 */}
                    <div className="legal-section" id="sharing">
                        <h2 className="legal-h2">5. How We Share Your Data</h2>
                        <p className="legal-p">We share your data only in these circumstances:</p>
                        <ul className="legal-ul">
                            <li><strong>Service providers</strong> — trusted processors who help us operate the Service (see Section 6). They are contractually prohibited from using your data for any other purpose.</li>
                            <li><strong>Legal requirements</strong> — if required by law, court order, or government authority, or to protect the rights, property, or safety of Neurativo, our users, or others.</li>
                            <li><strong>Business transfers</strong> — if Neurativo is acquired, merged, or undergoes a change of control, your data may be transferred as part of that transaction. We will notify you via email or prominent notice on the Service before your data becomes subject to a different privacy policy.</li>
                            <li><strong>With your consent</strong> — for any sharing not described here, we will ask for your explicit consent first.</li>
                        </ul>
                        <p className="legal-p">We do <strong>not</strong> share your data with advertisers or data brokers.</p>
                    </div>

                    {/* 6 */}
                    <div className="legal-section" id="third-parties">
                        <h2 className="legal-h2">6. Service Providers</h2>
                        <p className="legal-p">
                            We engage carefully selected third-party service providers to help us operate and deliver the Service. These providers assist with functions including cloud infrastructure, data storage, user authentication, and AI-powered content processing.
                        </p>
                        <p className="legal-p">
                            Each provider is contractually bound to process your data only as instructed by us and in accordance with applicable data protection law. They are prohibited from using your data for their own purposes beyond what is necessary to perform the services we have engaged them for.
                        </p>
                        <p className="legal-p">
                            We periodically review our providers to ensure they maintain appropriate privacy and security standards. If we add or change providers in a way that materially affects how your data is processed, we will update this Policy accordingly.
                        </p>
                    </div>

                    {/* 7 */}
                    <div className="legal-section" id="audio">
                        <h2 className="legal-h2">7. Audio & Transcript Data</h2>
                        <p className="legal-p">
                            When you record or upload audio through the Service, that audio is processed to generate a transcript. The resulting transcript, along with any summaries or AI-generated content derived from it, is stored securely and associated with your account.
                        </p>
                        <p className="legal-p">
                            Raw audio is used solely for transcription purposes and is not retained as a permanent record once processing is complete. You can delete individual lectures and all associated data from your dashboard at any time.
                        </p>
                        <p className="legal-p">
                            <strong>You are solely responsible</strong> for ensuring you have the legal right to record any audio you submit — including obtaining the consent of any other speakers where required by applicable law.
                        </p>
                    </div>

                    {/* 8 */}
                    <div className="legal-section" id="retention">
                        <h2 className="legal-h2">8. Data Retention</h2>
                        <p className="legal-p">
                            We retain your data for as long as your account is active or as needed to provide the Service. Specifically:
                        </p>
                        <ul className="legal-ul">
                            <li><strong>Account data</strong> — retained until you delete your account.</li>
                            <li><strong>Lecture data</strong> (transcripts, summaries, Q&amp;A history) — retained until you delete individual lectures or your account.</li>
                            <li><strong>Raw audio files</strong> — not stored persistently; audio is processed in-memory and discarded after transcription.</li>
                            <li><strong>Usage/log data</strong> — retained for up to 12 months for security and debugging purposes.</li>
                        </ul>
                        <p className="legal-p">
                            When you delete your account, we will delete or anonymize your personal data within 30 days, except where we are required to retain it by law or for legitimate legal defence purposes.
                        </p>
                    </div>

                    {/* 9 */}
                    <div className="legal-section" id="security">
                        <h2 className="legal-h2">9. Security</h2>
                        <p className="legal-p">
                            We implement industry-standard technical and organisational measures to protect your data, including:
                        </p>
                        <ul className="legal-ul">
                            <li>Encrypted data transmission via HTTPS/TLS for all communications.</li>
                            <li>Access controls ensuring users can only access their own data.</li>
                            <li>Passwordless authentication reducing the risk of credential-based attacks.</li>
                            <li>Secure storage and handling of all credentials and sensitive configuration.</li>
                        </ul>
                        <p className="legal-p">
                            No method of transmission over the internet or electronic storage is 100% secure. While we strive to protect your data, we cannot guarantee its absolute security. If you believe your account has been compromised, contact us immediately.
                        </p>
                    </div>

                    {/* 10 */}
                    <div className="legal-section" id="your-rights">
                        <h2 className="legal-h2">10. Your Rights</h2>
                        <p className="legal-p">
                            Depending on where you are located, you may have the following rights regarding your personal data:
                        </p>
                        <ul className="legal-ul">
                            <li><strong>Access</strong> — request a copy of the personal data we hold about you.</li>
                            <li><strong>Rectification</strong> — request correction of inaccurate or incomplete data.</li>
                            <li><strong>Erasure ("right to be forgotten")</strong> — request deletion of your personal data. You can delete lectures directly in the app; for full account deletion, contact us.</li>
                            <li><strong>Portability</strong> — request your data in a structured, machine-readable format.</li>
                            <li><strong>Restriction</strong> — request that we restrict processing of your data in certain circumstances.</li>
                            <li><strong>Objection</strong> — object to processing based on legitimate interests.</li>
                            <li><strong>Withdraw consent</strong> — where processing is based on consent, you may withdraw it at any time without affecting the lawfulness of prior processing.</li>
                        </ul>
                        <p className="legal-p">
                            To exercise any of these rights, contact us at <a href="mailto:privacy@neurativo.app" style={{color:'inherit'}}>privacy@neurativo.app</a>. We will respond within 30 days. We may need to verify your identity before fulfilling a request.
                        </p>
                        <p className="legal-p">
                            If you are in the EU/EEA and believe we are processing your data unlawfully, you have the right to lodge a complaint with your local data protection authority.
                        </p>
                    </div>

                    {/* 11 */}
                    <div className="legal-section" id="children">
                        <h2 className="legal-h2">11. Children's Privacy</h2>
                        <p className="legal-p">
                            The Service is not directed to children under 13. We do not knowingly collect personal data from children under 13. If you believe we have inadvertently collected such data, contact us immediately and we will delete it promptly. Users between 13 and 18 should use the Service only with parental or guardian consent and supervision.
                        </p>
                    </div>

                    {/* 12 */}
                    <div className="legal-section" id="cookies">
                        <h2 className="legal-h2">12. Cookies & Local Storage</h2>
                        <p className="legal-p">
                            Neurativo uses browser <strong>localStorage</strong> (not traditional cookies) to store:
                        </p>
                        <ul className="legal-ul">
                            <li>Your display preferences (e.g., light or dark mode).</li>
                            <li>Onboarding state, so we know whether to show introductory guidance.</li>
                            <li>Authentication session tokens, so you stay signed in between visits.</li>
                        </ul>
                        <p className="legal-p">
                            These are functional items necessary for the Service to work correctly. We do not use third-party tracking cookies or advertising pixels.
                        </p>
                    </div>

                    {/* 13 */}
                    <div className="legal-section" id="international">
                        <h2 className="legal-h2">13. International Transfers</h2>
                        <p className="legal-p">
                            Your data may be transferred to and processed in countries outside your country of residence, including the United States, where our service providers operate. These countries may have data protection laws that differ from those in your country.
                        </p>
                        <p className="legal-p">
                            Where required, we rely on appropriate transfer mechanisms (such as Standard Contractual Clauses for EU data transfers) to ensure adequate protection for your data. By using the Service, you consent to such transfers.
                        </p>
                    </div>

                    {/* 14 */}
                    <div className="legal-section" id="changes">
                        <h2 className="legal-h2">14. Changes to This Policy</h2>
                        <p className="legal-p">
                            We may update this Privacy Policy periodically. We will notify you of material changes by updating the "Last updated" date above and, where we have your email, by sending a notification. Your continued use of the Service after changes take effect constitutes acceptance of the updated Policy.
                        </p>
                    </div>

                    {/* 15 */}
                    <div className="legal-section" id="contact">
                        <h2 className="legal-h2">15. Contact & Data Requests</h2>
                        <p className="legal-p">For privacy questions, data access requests, or to report a concern:</p>
                        <div className="legal-contact">
                            <strong>Neurativo — Privacy</strong><br />
                            Email: <a href="mailto:privacy@neurativo.app">privacy@neurativo.app</a><br />
                            Legal: <a href="mailto:legal@neurativo.app">legal@neurativo.app</a><br />
                            Website: <Link to="/" style={{color:'inherit'}}>neurativo.app</Link>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
