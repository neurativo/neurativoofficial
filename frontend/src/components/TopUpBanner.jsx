import React, { useEffect, useRef, useState } from 'react';

/**
 * TopUpBanner — shown during a live recording when credits are running low.
 *
 * Props:
 *   recordingSeconds  {number}   elapsed session seconds
 *   creditBalance     {number}   credit balance AFTER the initial 1-credit reservation
 *   onTopUp           {function} called when user taps Top Up — opens credits page in new tab
 *   onAutoEnd         {function} called when countdown reaches 0 — triggers graceful session end
 */
export default function TopUpBanner({ recordingSeconds, creditBalance, onTopUp, onAutoEnd }) {
    const [countdown, setCountdown] = useState(60);
    const urgentSinceRef = useRef(null);
    const countdownRef   = useRef(null);

    // ── Credit boundary math ─────────────────────────────────────────────
    const additionalNeeded     = Math.max(0, Math.ceil(recordingSeconds / 1800) - 1);
    const additionalNeededSoon = Math.max(0, Math.ceil((recordingSeconds + 300) / 1800) - 1);

    const isUrgent  = additionalNeeded > creditBalance;
    const isWarning = !isUrgent && additionalNeededSoon > creditBalance;
    const isVisible = isWarning || isUrgent;

    // ── Countdown logic: start 60s countdown after 5 min of urgent state ─
    useEffect(() => {
        if (!isUrgent) {
            urgentSinceRef.current = null;
            clearInterval(countdownRef.current);
            countdownRef.current = null;
            setCountdown(60);
            return;
        }
        if (!urgentSinceRef.current) {
            urgentSinceRef.current = Date.now();
        }
        const elapsed = (Date.now() - urgentSinceRef.current) / 1000;
        if (elapsed >= 300 && !countdownRef.current) {
            countdownRef.current = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(countdownRef.current);
                        countdownRef.current = null;
                        onAutoEnd();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
    }, [isUrgent, recordingSeconds]);

    useEffect(() => () => clearInterval(countdownRef.current), []);

    if (!isVisible) return null;

    const isCountdown = isUrgent && urgentSinceRef.current &&
        (Date.now() - urgentSinceRef.current) / 1000 >= 300;

    const bgColor  = isUrgent ? '#fef2f2' : '#fffbeb';
    const border   = isUrgent ? '1px solid #fca5a5' : '1px solid #fde68a';
    const dot      = isUrgent ? '#ef4444' : '#f59e0b';
    const textMain = isUrgent ? '#991b1b' : '#92400e';
    const textSub  = isUrgent ? '#b91c1c' : '#b45309';

    const message = isCountdown
        ? `Auto-saving in ${countdown}s — top up to keep recording.`
        : isUrgent
        ? "You're past your credit limit. Top up now to ensure this session saves."
        : `Running low — you'll need another credit in ~5 min. Top up to keep recording.`;

    return (
        <>
            <style>{`
                @keyframes slideUpBanner {
                    from { transform: translateY(100%); opacity: 0; }
                    to   { transform: translateY(0);    opacity: 1; }
                }
                @keyframes slideDownBanner {
                    from { transform: translateY(-100%); opacity: 0; }
                    to   { transform: translateY(0);     opacity: 1; }
                }
                .topup-banner {
                    position: fixed;
                    z-index: 200;
                    left: 0; right: 0;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                    background: ${bgColor};
                    border-top: ${border};
                    box-shadow: 0 -2px 12px rgba(0,0,0,0.06);
                }
                @media (max-width: 639px) {
                    .topup-banner {
                        bottom: 0;
                        border-radius: 16px 16px 0 0;
                        padding-bottom: max(12px, env(safe-area-inset-bottom, 12px));
                        flex-wrap: wrap;
                        animation: slideUpBanner 0.25s ease;
                    }
                }
                @media (min-width: 640px) {
                    .topup-banner {
                        top: 64px;
                        border-top: none;
                        border-bottom: ${border};
                        animation: slideDownBanner 0.25s ease;
                        box-shadow: 0 2px 12px rgba(0,0,0,0.06);
                    }
                }
                .topup-dot {
                    width: 8px; height: 8px;
                    border-radius: 50%;
                    background: ${dot};
                    flex-shrink: 0;
                    animation: topupPulse 1.5s infinite;
                }
                @keyframes topupPulse {
                    0%, 100% { opacity: 1; }
                    50%       { opacity: 0.4; }
                }
                .topup-msg {
                    flex: 1;
                    font-size: 13px;
                    font-weight: 500;
                    color: ${textMain};
                    line-height: 1.4;
                    min-width: 0;
                }
                .topup-sub {
                    font-size: 11px;
                    color: ${textSub};
                    margin-top: 2px;
                }
                .topup-btn {
                    flex-shrink: 0;
                    padding: 7px 14px;
                    background: #1a1a1a;
                    color: #fafaf9;
                    border: none;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    white-space: nowrap;
                    transition: opacity 0.15s;
                }
                .topup-btn:hover { opacity: 0.8; }
            `}</style>

            <div className="topup-banner" role="alert" aria-live="assertive">
                <div className="topup-dot" />
                <div className="topup-msg">
                    {message}
                    <div className="topup-sub">
                        {isUrgent
                            ? `${additionalNeeded} credit(s) needed beyond reservation — top up to finalize correctly.`
                            : `Balance: ${creditBalance} credit(s) · next block costs 1 more.`
                        }
                    </div>
                </div>
                <button className="topup-btn" onClick={onTopUp}>
                    Top Up →
                </button>
            </div>
        </>
    );
}
