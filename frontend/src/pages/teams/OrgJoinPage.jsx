import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useUser, SignIn } from '@clerk/react';
import { joinOrg } from '../../lib/teamsApi.js';
import TeamsNav from '../../components/teams/TeamsNav.jsx';

const CSS = `
  .oj *, .oj *::before, .oj *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .oj { font-family: 'Inter', sans-serif; background: #fafaf9; color: #1a1a1a; min-height: 100vh; display: flex; flex-direction: column; -webkit-font-smoothing: antialiased; }
  .oj-nav { height: 60px; display: flex; align-items: center; padding: 0 32px; border-bottom: 1px solid #f0ede8; }
  .oj-logo { font-size: 15px; font-weight: 600; text-decoration: none; color: #1a1a1a; display: flex; align-items: center; gap: 8px; }
  .oj-logo-icon { width: 26px; height: 26px; background: #1a1a1a; border-radius: 7px; display: flex; align-items: center; justify-content: center; }
  .oj-logo-icon svg { width: 14px; height: 14px; }
  .oj-logo-badge { font-size: 11px; font-weight: 500; color: #6b6b6b; background: #f0ede8; border-radius: 6px; padding: 2px 7px; }
  .oj-body { flex: 1; display: flex; align-items: center; justify-content: center; padding: 48px 24px; }
  .oj-card { width: 100%; max-width: 400px; text-align: center; }
  .oj-icon { font-size: 40px; margin-bottom: 16px; }
  .oj-title { font-size: 22px; font-weight: 700; letter-spacing: -.5px; margin-bottom: 8px; }
  .oj-sub { font-size: 14px; color: #6b6b6b; margin-bottom: 28px; line-height: 1.5; }
  .oj-btn { display: block; width: 100%; padding: 12px; background: #1a1a1a; color: #fafaf9; border: none; border-radius: 10px; font-size: 14px; font-weight: 500; cursor: pointer; transition: opacity .15s; text-decoration: none; }
  .oj-btn:hover:not(:disabled) { opacity: .8; }
  .oj-btn:disabled { opacity: .5; cursor: not-allowed; }
  .oj-error { background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 12px 16px; font-size: 13px; color: #dc2626; margin-bottom: 16px; }
  .oj-success { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 16px; font-size: 14px; color: #16a34a; margin-bottom: 20px; }
`;

export default function OrgJoinPage() {
    const { slug } = useParams();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const { isLoaded, isSignedIn } = useUser();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState('');
    const [success, setSuccess] = useState(null);

    async function handleJoin() {
        if (!token) { setError('No invite token found in this link.'); return; }
        setError('');
        setLoading(true);
        try {
            const r = await joinOrg(token);
            setSuccess(r.data);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to join. The link may be invalid or expired.');
        } finally {
            setLoading(false);
        }
    }

    if (!isLoaded) return null;

    if (!isSignedIn) {
        return (
            <div className="oj">
                <style>{CSS}</style>
                <TeamsNav />
                <div className="oj-body">
                    <div className="oj-card">
                        <div className="oj-icon">👋</div>
                        <h1 className="oj-title">You've been invited</h1>
                        <p className="oj-sub">Sign in to your Neurativo account to accept this invitation.</p>
                        <SignIn routing="hash" afterSignInUrl={window.location.href} />
                    </div>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="oj">
                <style>{CSS}</style>
                <TeamsNav />
                <div className="oj-body">
                    <div className="oj-card">
                        <div className="oj-icon">🎉</div>
                        <h1 className="oj-title">Welcome to {success.org_name}!</h1>
                        <div className="oj-success">
                            Your {success.seat_tier === 'pro' ? 'Pro' : 'Student'} seat is now active.
                        </div>
                        <a href="https://neurativo.com/app" className="oj-btn">Open Neurativo</a>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="oj">
            <style>{CSS}</style>
            <nav className="oj-nav">
                <a href="/" className="oj-logo">
                    <div className="oj-logo-icon"><svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
                    Neurativo <span className="oj-logo-badge">Teams</span>
                </a>
            </nav>
            <div className="oj-body">
                <div className="oj-card">
                    <div className="oj-icon">🔗</div>
                    <h1 className="oj-title">Join organization</h1>
                    <p className="oj-sub">
                        {token ? 'Click below to accept your invitation and activate your seat.' : 'No invite token found. Make sure you opened the full invite link.'}
                    </p>
                    {error && <div className="oj-error">{error}</div>}
                    {token && (
                        <button className="oj-btn" onClick={handleJoin} disabled={loading}>
                            {loading ? 'Joining…' : 'Accept invitation'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
