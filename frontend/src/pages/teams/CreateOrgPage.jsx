import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser, SignIn } from '@clerk/react';
import { createOrg } from '../../lib/teamsApi.js';
import TeamsNav from '../../components/teams/TeamsNav.jsx';

const CSS = `
  .co *, .co *::before, .co *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .co { font-family: 'Inter', sans-serif; background: #fafaf9; color: #1a1a1a; min-height: 100vh; display: flex; flex-direction: column; -webkit-font-smoothing: antialiased; }
  .co-nav { height: 60px; display: flex; align-items: center; padding: 0 32px; border-bottom: 1px solid #f0ede8; }
  .co-logo { font-size: 15px; font-weight: 600; text-decoration: none; color: #1a1a1a; display: flex; align-items: center; gap: 8px; }
  .co-logo-icon { width: 26px; height: 26px; background: #1a1a1a; border-radius: 7px; display: flex; align-items: center; justify-content: center; }
  .co-logo-icon svg { width: 14px; height: 14px; }
  .co-logo-badge { font-size: 11px; font-weight: 500; color: #6b6b6b; background: #f0ede8; border-radius: 6px; padding: 2px 7px; }

  .co-body { flex: 1; display: flex; align-items: center; justify-content: center; padding: 48px 24px; }
  .co-card { width: 100%; max-width: 440px; }
  .co-title { font-size: 24px; font-weight: 700; letter-spacing: -.5px; margin-bottom: 6px; }
  .co-sub { font-size: 14px; color: #6b6b6b; margin-bottom: 32px; }
  .co-field { margin-bottom: 18px; }
  .co-label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; }
  .co-label-hint { font-weight: 400; color: #a3a3a3; font-size: 12px; margin-left: 4px; }
  .co-input { width: 100%; padding: 10px 13px; border: 1.5px solid #e5e2dd; border-radius: 10px; font-size: 14px; font-family: inherit; background: #fff; color: #1a1a1a; transition: border-color .15s; outline: none; }
  .co-input:focus { border-color: #1a1a1a; }
  .co-slug-row { display: flex; align-items: center; border: 1.5px solid #e5e2dd; border-radius: 10px; background: #fff; overflow: hidden; transition: border-color .15s; }
  .co-slug-row:focus-within { border-color: #1a1a1a; }
  .co-slug-prefix { padding: 10px 0 10px 13px; font-size: 14px; color: #a3a3a3; white-space: nowrap; }
  .co-slug-input { flex: 1; border: none; outline: none; padding: 10px 13px 10px 0; font-size: 14px; font-family: inherit; background: transparent; color: #1a1a1a; }
  .co-error { font-size: 12px; color: #ef4444; margin-top: 6px; }
  .co-btn { width: 100%; padding: 12px; background: #1a1a1a; color: #fafaf9; border: none; border-radius: 10px; font-size: 14px; font-weight: 500; cursor: pointer; transition: opacity .15s; margin-top: 8px; }
  .co-btn:hover:not(:disabled) { opacity: .8; }
  .co-btn:disabled { opacity: .5; cursor: not-allowed; }
  .co-signin { text-align: center; padding: 48px 24px; }
  .co-signin h2 { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
  .co-signin p { font-size: 14px; color: #6b6b6b; margin-bottom: 24px; }
`;

function slugify(val) {
    return val.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export default function CreateOrgPage() {
    const { isLoaded, isSignedIn, user } = useUser();
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [slugManual, setSlugManual] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    function handleNameChange(e) {
        const v = e.target.value;
        setName(v);
        if (!slugManual) setSlug(slugify(v));
    }

    function handleSlugChange(e) {
        setSlugManual(true);
        setSlug(slugify(e.target.value));
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!name.trim() || !slug) return;
        setError('');
        setLoading(true);
        try {
            await createOrg({ slug, name: name.trim() });
            navigate(`/${slug}/dashboard`);
        } catch (err) {
            setError(err.response?.data?.detail || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    if (!isLoaded) return null;

    if (!isSignedIn) {
        return (
            <div className="co">
                <style>{CSS}</style>
                <TeamsNav />
                <div className="co-signin">
                    <h2>Sign in to create an organization</h2>
                    <p>You need a Neurativo account to create and manage a team.</p>
                    <SignIn routing="hash" afterSignInUrl={window.location.href} />
                </div>
            </div>
        );
    }

    return (
        <div className="co">
            <style>{CSS}</style>
            <nav className="co-nav">
                <a href="/" className="co-logo">
                    <div className="co-logo-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                        </svg>
                    </div>
                    Neurativo <span className="co-logo-badge">Teams</span>
                </a>
            </nav>
            <div className="co-body">
                <div className="co-card">
                    <h1 className="co-title">Create your organization</h1>
                    <p className="co-sub">Set up your team's workspace. You can invite members after.</p>
                    <form onSubmit={handleSubmit}>
                        <div className="co-field">
                            <label className="co-label">Organization name</label>
                            <input
                                className="co-input"
                                placeholder="Acme Corp"
                                value={name}
                                onChange={handleNameChange}
                                maxLength={60}
                                required
                            />
                        </div>
                        <div className="co-field">
                            <label className="co-label">
                                URL slug
                                <span className="co-label-hint">teams.neurativo.com/your-slug</span>
                            </label>
                            <div className="co-slug-row">
                                <span className="co-slug-prefix">teams.neurativo.com/</span>
                                <input
                                    className="co-slug-input"
                                    placeholder="acme-corp"
                                    value={slug}
                                    onChange={handleSlugChange}
                                    maxLength={40}
                                    required
                                />
                            </div>
                        </div>
                        {error && <div className="co-error">{error}</div>}
                        <button className="co-btn" type="submit" disabled={loading || !name.trim() || !slug}>
                            {loading ? 'Creating…' : 'Create organization'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
