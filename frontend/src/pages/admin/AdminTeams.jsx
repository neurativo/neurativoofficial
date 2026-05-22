import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminListOrgs } from '../../lib/teamsApi.js';

export default function AdminTeams() {
    const [orgs, setOrgs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        adminListOrgs()
            .then(r => setOrgs(r.data))
            .catch(() => setError('Failed to load organizations'))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div>
            <div className="adm-page-title">Organizations</div>

            {error && <div className="adm-error">{error}</div>}

            <div className="adm-toolbar">
                <span className="adm-total">
                    {loading ? '…' : `${orgs.length} organization${orgs.length !== 1 ? 's' : ''}`}
                </span>
            </div>

            <div className="adm-table-wrap">
                <table className="adm-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Slug</th>
                            <th>Status</th>
                            <th>Seats Used</th>
                            <th>Seat Limit</th>
                            <th>Created</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={7} className="adm-empty">Loading…</td></tr>
                        )}
                        {!loading && orgs.length === 0 && (
                            <tr><td colSpan={7} className="adm-empty">No organizations yet.</td></tr>
                        )}
                        {orgs.map(org => (
                            <tr key={org.id} className="adm-tr-hover">
                                <td style={{ fontWeight: 500 }}>{org.name}</td>
                                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--adm-text-sec)' }}>{org.slug}</td>
                                <td>
                                    <span className={org.status === 'active' ? 'adm-badge-active' : 'adm-badge-ended'}>
                                        {org.status}
                                    </span>
                                </td>
                                <td>{org.seat_counts?.total ?? 0}</td>
                                <td>{org.seat_limit}</td>
                                <td style={{ fontSize: 12, color: 'var(--adm-text-muted)' }}>
                                    {org.created_at ? new Date(org.created_at).toLocaleDateString() : '—'}
                                </td>
                                <td>
                                    <Link to={`/admin/teams/${org.slug}`} className="adm-btn-ghost" style={{ fontSize: 12, padding: '3px 10px' }}>
                                        Manage →
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
