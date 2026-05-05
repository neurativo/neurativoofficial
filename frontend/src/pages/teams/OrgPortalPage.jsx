import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/react';
import { getOrgPublic, getMyOrg } from '../../lib/teamsApi.js';

const CSS = `
  .op *, .op *::before, .op *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .op { font-family: 'Inter', sans-serif; background: #fafaf9; color: #1a1a1a; min-height: 100vh; -webkit-font-smoothing: antialiased; }
  .op-nav { height: 60px; display: flex; align-items: center; padding: 0 32px; border-bottom: 1px solid #f0ede8; }
  .op-logo { font-size: 15px; font-weight: 600; text-decoration: none; color: #1a1a1a; display: flex; align-items: center; gap: 8px; }
  .op-logo-icon { width: 26px; height: 26px; background: #1a1a1a; border-radius: 7px; display: flex; align-items: center; justify-content: center; }
  .op-logo-icon svg { width: 14px; height: 14px; }
  .op-logo-badge { font-size: 11px; font-weight: 500; color: #6b6b6b; background: #f0ede8; border-radius: 6px; padding: 2px 7px; }
  .op-body { max-width: 480px; margin: 80px auto; padding: 0 24px; text-align: center; }
  .op-avatar { width: 64px; height: 64px; background: #1a1a1a; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 28px; color: #fafaf9; font-weight: 700; }
  .op-name { font-size: 26px; font-weight: 700; letter-spacing: -.5px; margin-bottom: 8px; }
  .op-sub { font-size: 14px; color: #6b6b6b; margin-bottom: 32px; }
  .op-badge { display: inline-flex; align-items: center; gap: 6px; background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; border-radius: 8px; padding: 6px 12px; font-size: 13px; font-weight: 500; margin-bottom: 24px; }
  .op-actions { display: flex; flex-direction: column; gap: 10px; }
  .op-btn { display: block; padding: 12px 20px; border-radius: 10px; font-size: 14px; font-weight: 500; text-decoration: none; text-align: center; cursor: pointer; border: none; transition: opacity .15s; }
  .op-btn-dark { background: #1a1a1a; color: #fafaf9; }
  .op-btn-dark:hover { opacity: .8; }
  .op-btn-outline { background: transparent; color: #1a1a1a; border: 1.5px solid #e5e2dd; }
  .op-btn-outline:hover { border-color: #1a1a1a; }
  .op-loading { text-align: center; padding: 80px 24px; color: #6b6b6b; font-size: 14px; }
  .op-notfound { text-align: center; padding: 80px 24px; }
  .op-notfound h2 { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
  .op-notfound p { color: #6b6b6b; font-size: 14px; }
`;

export default function OrgPortalPage() {
    const { slug } = useParams();
    const { isLoaded, isSignedIn } = useUser();
    const navigate = useNavigate();
    const [org, setOrg] = useState(null);
    const [myOrg, setMyOrg] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getOrgPublic(slug)
            .then(r => setOrg(r.data))
            .catch(() => setOrg(null))
            .finally(() => setLoading(false));
    }, [slug]);

    useEffect(() => {
        if (isLoaded && isSignedIn) {
            getMyOrg().then(r => setMyOrg(r.data?.org)).catch(() => {});
        }
    }, [isLoaded, isSignedIn]);

    if (loading) return <div className="op"><style>{CSS}</style><div className="op-loading">Loading…</div></div>;

    if (!org) return (
        <div className="op">
            <style>{CSS}</style>
            <nav className="op-nav">
                <a href="/" className="op-logo">
                    <div className="op-logo-icon"><svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
                    Neurativo <span className="op-logo-badge">Teams</span>
                </a>
            </nav>
            <div className="op-notfound">
                <h2>Organization not found</h2>
                <p>This link may be invalid or the organization no longer exists.</p>
            </div>
        </div>
    );

    const isMember = myOrg && myOrg.id === org.id;
    const isAdmin  = isMember && (myOrg.role === 'admin' || myOrg.owner_id === myOrg.id);

    return (
        <div className="op">
            <style>{CSS}</style>
            <nav className="op-nav">
                <a href="/" className="op-logo">
                    <div className="op-logo-icon"><svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
                    Neurativo <span className="op-logo-badge">Teams</span>
                </a>
            </nav>
            <div className="op-body">
                <div className="op-avatar">{org.name.charAt(0).toUpperCase()}</div>
                <h1 className="op-name">{org.name}</h1>

                {isMember ? (
                    <>
                        <div className="op-badge">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                            You're a member · {myOrg.seat_tier === 'pro' ? 'Pro' : 'Student'} seat
                        </div>
                        <div className="op-actions">
                            <a href="https://neurativo.com/app" className="op-btn op-btn-dark">Open Neurativo</a>
                            {isAdmin && (
                                <Link to={`/${slug}/dashboard`} className="op-btn op-btn-outline">Manage team</Link>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <p className="op-sub">You've been invited to join this organization on Neurativo.</p>
                        <div className="op-actions">
                            {isSignedIn ? (
                                <Link to={`/${slug}/join`} className="op-btn op-btn-dark">Join organization</Link>
                            ) : (
                                <Link to={`/${slug}/join`} className="op-btn op-btn-dark">Sign in to join</Link>
                            )}
                            <a href="/" className="op-btn op-btn-outline">Learn about Teams</a>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
