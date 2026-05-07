import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCreditsApi } from '../lib/creditsApi.js';

// ─── Design tokens (matches Dashboard palette) ────────────────────────────────
const C = {
    bg: 'var(--color-bg)', text: 'var(--color-text)', sec: 'var(--color-sec)', muted: 'var(--color-muted)',
    border: 'var(--color-border)', card: 'var(--color-card)', dark: 'var(--color-dark)', darkFg: 'var(--color-dark-fg)',
};

const CSS = `
  .cr * { box-sizing: border-box; }
  .cr { font-family: 'Inter', sans-serif; background: ${C.bg}; color: ${C.text}; min-height: 100vh; -webkit-font-smoothing: antialiased; }

  .cr-header { height: 56px; background: ${C.card}; border-bottom: 1px solid ${C.border}; display: flex; align-items: center; padding: 0 24px; gap: 12px; position: sticky; top: 0; z-index: 20; }
  .cr-logo { display: flex; align-items: center; gap: 8px; text-decoration: none; }
  .cr-logo-icon { width: 24px; height: 24px; background: ${C.dark}; border-radius: 7px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .cr-wordmark { font-size: 14px; font-weight: 600; color: ${C.text}; letter-spacing: -0.3px; }
  .cr-back { margin-left: auto; font-size: 13px; color: ${C.sec}; text-decoration: none; padding: 6px 12px; border: 1px solid ${C.border}; border-radius: 8px; transition: border-color .15s; }
  .cr-back:hover { border-color: ${C.dark}; color: ${C.text}; }

  .cr-body { max-width: 760px; margin: 0 auto; padding: 40px 24px 80px; }
  .cr-title { font-size: 22px; font-weight: 600; letter-spacing: -0.5px; margin-bottom: 4px; }
  .cr-sub { font-size: 13px; color: ${C.sec}; margin-bottom: 32px; }

  /* Balance card */
  .cr-balance-card { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 16px; padding: 28px 32px; margin-bottom: 32px; display: flex; align-items: flex-start; gap: 24px; flex-wrap: wrap; }
  .cr-balance-num { font-size: 48px; font-weight: 700; letter-spacing: -2px; line-height: 1; }
  .cr-balance-label { font-size: 13px; color: ${C.sec}; margin-top: 4px; }
  .cr-balance-info { flex: 1; min-width: 180px; }
  .cr-low-warn { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; color: #b45309; background: #fef3c7; border: 1px solid #fde68a; border-radius: 6px; padding: 4px 10px; margin-top: 8px; }
  /* Subscription status */
  .cr-sub-card { border-left: 3px solid #16a34a; background: rgba(22,163,74,0.06); border-radius: 10px; padding: 14px 18px; min-width: 200px; flex-shrink: 0; }
  .cr-sub-card.inactive { border-left-color: ${C.border}; background: ${C.bg}; }
  .cr-sub-status { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #16a34a; margin-bottom: 4px; }
  .cr-sub-status.inactive { color: ${C.muted}; }
  .cr-sub-detail { font-size: 13px; color: ${C.text}; font-weight: 500; }
  .cr-sub-meta { font-size: 11px; color: ${C.muted}; margin-top: 3px; }

  /* Section heading */
  .cr-section-title { font-size: 15px; font-weight: 600; letter-spacing: -0.3px; margin-bottom: 16px; }

  /* Product cards */
  .cr-pack-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 36px; }
  .cr-pack { border: 1.5px solid ${C.border}; border-radius: 14px; padding: 22px 20px; background: ${C.card}; display: flex; flex-direction: column; gap: 4px; transition: border-color .15s; }
  .cr-pack:hover { border-color: ${C.dark}; }
  .cr-pack-featured { border-color: ${C.dark}; }
  .cr-pack-tag { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: .06em; color: ${C.muted}; margin-bottom: 6px; }
  .cr-pack-tag-best { color: #7c3aed; }
  .cr-pack-credits { font-size: 28px; font-weight: 700; letter-spacing: -1px; }
  .cr-pack-credits span { font-size: 13px; font-weight: 400; color: ${C.sec}; }
  .cr-pack-price { font-size: 14px; color: ${C.sec}; margin-bottom: 12px; }
  .cr-pack-desc { font-size: 12px; color: ${C.muted}; flex: 1; margin-bottom: 16px; line-height: 1.5; }
  .cr-pack-btn { display: block; text-align: center; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; transition: opacity .15s; text-decoration: none; }
  .cr-pack-btn-dark { background: ${C.dark}; color: ${C.darkFg}; }
  .cr-pack-btn-dark:hover { opacity: .8; }
  .cr-pack-btn-dark:disabled { opacity: .5; cursor: not-allowed; }
  .cr-pack-btn-outline { background: transparent; color: ${C.text}; border: 1.5px solid ${C.border}; }
  .cr-pack-btn-outline:hover { border-color: ${C.dark}; }

  /* Intent confirmation */
  .cr-intent-modal { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.35); backdrop-filter: blur(6px); }
  .cr-intent-box { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 18px; padding: 32px; max-width: 400px; width: 90%; text-align: center; }
  .cr-intent-icon { font-size: 40px; margin-bottom: 12px; }
  .cr-intent-title { font-size: 18px; font-weight: 600; letter-spacing: -.4px; margin-bottom: 8px; }
  .cr-intent-sub { font-size: 14px; color: ${C.sec}; line-height: 1.6; margin-bottom: 24px; }
  .cr-intent-btn { display: block; width: 100%; padding: 11px; background: ${C.dark}; color: ${C.darkFg}; border: none; border-radius: 10px; font-size: 14px; font-weight: 500; cursor: pointer; transition: opacity .15s; margin-bottom: 10px; }
  .cr-intent-btn:hover { opacity: .8; }
  .cr-intent-close { background: none; border: none; font-size: 13px; color: ${C.sec}; cursor: pointer; text-decoration: underline; }

  /* How credits work */
  .cr-how { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 14px; padding: 22px 24px; margin-bottom: 32px; }
  .cr-how-intro { font-size: 13px; color: ${C.sec}; margin-bottom: 16px; line-height: 1.6; }
  .cr-how-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .cr-how-table th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: ${C.muted}; padding: 0 10px 8px; border-bottom: 1px solid ${C.border}; }
  .cr-how-table td { padding: 9px 10px; border-bottom: 1px solid ${C.border}; color: ${C.text}; }
  .cr-how-table tr:last-child td { border-bottom: none; }
  .cr-how-table td:first-child { color: ${C.sec}; }
  .cr-how-table td.cr-how-credits { font-weight: 600; }
  .cr-how-note { font-size: 11px; color: ${C.muted}; margin-top: 12px; line-height: 1.5; }

  /* History */
  .cr-history { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 14px; overflow: hidden; margin-bottom: 32px; }
  .cr-history-row { display: flex; align-items: center; padding: 12px 18px; border-bottom: 1px solid ${C.border}; font-size: 13px; gap: 12px; }
  .cr-history-row:last-child { border-bottom: none; }
  .cr-history-reason { flex: 1; color: ${C.text}; }
  .cr-history-date { font-size: 11px; color: ${C.muted}; }
  .cr-history-amount { font-size: 13px; font-weight: 600; width: 48px; text-align: right; }
  .cr-history-pos { color: #16a34a; }
  .cr-history-neg { color: #dc2626; }
  .cr-history-bal { font-size: 11px; color: ${C.muted}; width: 56px; text-align: right; }
  .cr-history-empty { padding: 32px; text-align: center; font-size: 13px; color: ${C.muted}; }

  .cr-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 12px 16px; font-size: 13px; color: #dc2626; margin-bottom: 20px; }
  .cr-loading { text-align: center; padding: 80px; color: ${C.muted}; font-size: 14px; }
`;

const REASON_LABELS = {
    starter_grant:     'Starter credits',
    pack_purchase:     'Pack purchase',
    monthly_refresh:   'Monthly refresh',
    plan_grant:        'Plan grant',
    lecture_processed: 'Lecture processed',
    refund:            'Refund',
    admin_grant:       'Admin grant',
    admin_deduct:      'Admin deduction',
    manual:            'Manual adjustment',
};

function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CreditsPage() {
    const api = useCreditsApi();

    const [balance, setBalance]     = useState(null);
    const [history, setHistory]     = useState([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState('');
    const [pending, setPending]     = useState(null);   // product key being purchased
    const [intent, setIntent]       = useState(null);   // confirmed intent response

    useEffect(() => {
        Promise.all([api.getBalance(), api.getHistory()])
            .then(([balRes, histRes]) => {
                setBalance(balRes.data);
                setHistory(histRes.data.transactions || []);
            })
            .catch(() => setError('Failed to load credit data.'))
            .finally(() => setLoading(false));
    }, []);

    async function handleBuy(product) {
        setPending(product);
        setError('');
        try {
            const res = await api.purchaseIntent(product);
            setIntent(res.data);
        } catch (err) {
            setError(err.response?.data?.detail || 'Something went wrong.');
        } finally {
            setPending(null);
        }
    }

    function closeIntent() {
        setIntent(null);
    }

    if (loading) return <div className="cr"><style>{CSS}</style><div className="cr-loading">Loading…</div></div>;

    const products   = balance?.products || {};
    const credits    = balance?.credits ?? 0;
    const lowWarn    = balance?.low_credits;
    const subStatus  = balance?.credits_sub_status || 'none';
    const subExpires = balance?.credits_sub_expires;
    const subActive  = subStatus === 'monthly' && subExpires && new Date(subExpires) > new Date();
    const subStarted = balance?.credits_sub_started;

    return (
        <div className="cr">
            <style>{CSS}</style>

            {/* Header */}
            <header className="cr-header">
                <a href="/app" className="cr-logo">
                    <div className="cr-logo-icon">
                        <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
                            <path d="M18 4L8 18h7v10l9-12h-7L18 4z" fill="#fafaf9"/>
                        </svg>
                    </div>
                    <span className="cr-wordmark">Neurativo</span>
                </a>
                <Link to="/app" className="cr-back">← Dashboard</Link>
            </header>

            <div className="cr-body">
                <h1 className="cr-title">Credits</h1>
                <p className="cr-sub">Credits scale with lecture duration: 1 credit per 30-min block, rounded up. So ≤30 min = 1 cr · 31–60 min = 2 cr · 61–90 min = 3 cr · 91–120 min = 4 cr · 4-hr lecture = 8 cr. Pack credits never expire.</p>

                {error && <div className="cr-error">{error}</div>}

                {/* Balance */}
                <div className="cr-balance-card">
                    <div className="cr-balance-info">
                        <div className="cr-balance-num">{credits}</div>
                        <div className="cr-balance-label">credits remaining</div>
                        {lowWarn && !subActive && (
                            <div className="cr-low-warn">
                                ⚠ Running low — buy more to keep processing lectures
                            </div>
                        )}
                    </div>
                    {/* Subscription status tile */}
                    <div className={`cr-sub-card${subActive ? '' : ' inactive'}`}>
                        <div className={`cr-sub-status${subActive ? '' : ' inactive'}`}>
                            {subActive ? '● Monthly subscription' : '○ No subscription'}
                        </div>
                        {subActive ? (
                            <>
                                <div className="cr-sub-detail">Active</div>
                                <div className="cr-sub-meta">Renews / expires {fmtDate(subExpires)}</div>
                                {subStarted && <div className="cr-sub-meta">Started {fmtDate(subStarted)}</div>}
                            </>
                        ) : (
                            <>
                                <div className="cr-sub-detail">One-time credits only</div>
                                <div className="cr-sub-meta">Subscribe below for monthly credits</div>
                            </>
                        )}
                    </div>
                </div>

                {/* How credits work */}
                <div className="cr-section-title">How credits work</div>
                <div className="cr-how">
                    <p className="cr-how-intro">
                        Each lecture costs <strong>1 credit per 30-minute block</strong> (rounded up).
                        Credits are deducted after processing completes — never before.
                        Subscription plans include credits every month; extra packs never expire.
                    </p>
                    <table className="cr-how-table">
                        <thead>
                            <tr>
                                <th>Lecture duration</th>
                                <th>Credits used</th>
                                <th>Plan included</th>
                                <th>Equivalent lectures</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Up to 30 min</td>
                                <td className="cr-how-credits">1 cr</td>
                                <td>Free — 5 cr starter</td>
                                <td>5 lectures</td>
                            </tr>
                            <tr>
                                <td>31 – 60 min</td>
                                <td className="cr-how-credits">2 cr</td>
                                <td>Student — 15 cr / mo</td>
                                <td>7–15 lectures</td>
                            </tr>
                            <tr>
                                <td>61 – 90 min</td>
                                <td className="cr-how-credits">3 cr</td>
                                <td>Pro — 30 cr / mo</td>
                                <td>10–30 lectures</td>
                            </tr>
                            <tr>
                                <td>91 – 120 min</td>
                                <td className="cr-how-credits">4 cr</td>
                                <td></td>
                                <td></td>
                            </tr>
                            <tr>
                                <td>2 hrs 1 min – 2.5 hrs</td>
                                <td className="cr-how-credits">5 cr</td>
                                <td></td>
                                <td></td>
                            </tr>
                            <tr>
                                <td>3 hrs (Student max)</td>
                                <td className="cr-how-credits">6 cr</td>
                                <td></td>
                                <td></td>
                            </tr>
                            <tr>
                                <td>4 hrs (Pro max)</td>
                                <td className="cr-how-credits">8 cr</td>
                                <td></td>
                                <td></td>
                            </tr>
                        </tbody>
                    </table>
                    <p className="cr-how-note">
                        Session limits: Free = 30 min · Student = 3 hrs · Pro = 4 hrs.
                        Monthly time ceiling: Free = 2.5 hrs · Student = 25 hrs · Pro = 40 hrs.
                        Credits are the primary gate — without credits, no lecture is processed.
                        If processing fails after credit deduction, the full amount is refunded automatically.
                    </p>
                </div>

                {/* Packs */}
                <div className="cr-section-title">Buy credits</div>
                <div className="cr-pack-grid">
                    {/* Small pack */}
                    <div className="cr-pack">
                        <div className="cr-pack-tag">Starter</div>
                        <div className="cr-pack-credits">{products.small_pack?.credits ?? 10} <span>credits</span></div>
                        <div className="cr-pack-price">${products.small_pack?.price_usd?.toFixed(2) ?? '4.99'}</div>
                        <div className="cr-pack-desc">Rs. 1,520 &middot; $0.50 each &middot; never expire.</div>
                        <button
                            className="cr-pack-btn cr-pack-btn-outline"
                            onClick={() => handleBuy('small_pack')}
                            disabled={!!pending}
                        >
                            {pending === 'small_pack' ? 'Processing…' : 'Buy pack'}
                        </button>
                    </div>

                    {/* Large pack */}
                    <div className="cr-pack cr-pack-featured">
                        <div className="cr-pack-tag cr-pack-tag-best">Best value</div>
                        <div className="cr-pack-credits">{products.large_pack?.credits ?? 30} <span>credits</span></div>
                        <div className="cr-pack-price">${products.large_pack?.price_usd?.toFixed(2) ?? '11.99'}</div>
                        <div className="cr-pack-desc">Rs. 3,660 &middot; $0.40 each &middot; never expire.</div>
                        <button
                            className="cr-pack-btn cr-pack-btn-dark"
                            onClick={() => handleBuy('large_pack')}
                            disabled={!!pending}
                        >
                            {pending === 'large_pack' ? 'Processing…' : 'Buy pack'}
                        </button>
                    </div>

                    {/* Pro pack */}
                    <div className="cr-pack">
                        <div className="cr-pack-tag">Power pack</div>
                        <div className="cr-pack-credits">{products.pro_pack?.credits ?? 60} <span>credits</span></div>
                        <div className="cr-pack-price">${products.pro_pack?.price_usd?.toFixed(2) ?? '19.99'}</div>
                        <div className="cr-pack-desc">Rs. 6,100 &middot; $0.33 each &middot; best rate.</div>
                        <button
                            className="cr-pack-btn cr-pack-btn-outline"
                            onClick={() => handleBuy('pro_pack')}
                            disabled={!!pending}
                        >
                            {pending === 'pro_pack' ? 'Processing…' : 'Buy pack'}
                        </button>
                    </div>
                </div>

                {/* History */}
                <div className="cr-section-title">Transaction history</div>
                <div className="cr-history">
                    {history.length === 0 ? (
                        <div className="cr-history-empty">No transactions yet</div>
                    ) : history.map(tx => (
                        <div key={tx.id} className="cr-history-row">
                            <span className="cr-history-reason">
                                {REASON_LABELS[tx.reason] || tx.reason}
                                {tx.product ? <span style={{color:'var(--color-muted)',fontSize:11,marginLeft:6}}>({tx.product})</span> : null}
                            </span>
                            <span className="cr-history-date">{fmtDate(tx.created_at)}</span>
                            <span className={`cr-history-amount ${tx.amount > 0 ? 'cr-history-pos' : 'cr-history-neg'}`}>
                                {tx.amount > 0 ? '+' : ''}{tx.amount}
                            </span>
                            <span className="cr-history-bal">{tx.balance_after} left</span>
                        </div>
                    ))}
                </div>

                <p style={{fontSize:12,color:'var(--color-muted)',lineHeight:1.6}}>
                    Payment processing coming soon. Purchase intents are logged and credits will be applied manually until the payment system is live. Contact <a href="mailto:support@neurativo.com" style={{color:'var(--color-sec)'}}>support@neurativo.com</a> if you need credits urgently.
                </p>
            </div>

            {/* Purchase intent modal */}
            {intent && (
                <div className="cr-intent-modal" onClick={closeIntent}>
                    <div className="cr-intent-box" onClick={e => e.stopPropagation()}>
                        <div className="cr-intent-icon">✓</div>
                        <h2 className="cr-intent-title">Request received!</h2>
                        <p className="cr-intent-sub">
                            Your purchase of <strong>{intent.credits} credits</strong> for <strong>${intent.price_usd?.toFixed(2)}</strong> has been logged.
                            We'll add the credits to your account as soon as payments go live.
                        </p>
                        <button className="cr-intent-btn" onClick={closeIntent}>Got it</button>
                        <button className="cr-intent-close" onClick={closeIntent}>Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}
