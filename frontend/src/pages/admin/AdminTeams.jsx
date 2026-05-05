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

    if (loading) return <div className="adm-section"><p style={{ color: '#6b6b6b', fontSize: 14 }}>Loading…</p></div>;
    if (error) return <div className="adm-section"><p style={{ color: '#ef4444', fontSize: 14 }}>{error}</p></div>;

    return (
        <div>
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.4px', marginBottom: 4 }}>Organizations</h1>
                <p style={{ fontSize: 14, color: '#6b6b6b' }}>{orgs.length} organization{orgs.length !== 1 ? 's' : ''}</p>
            </div>

            <div style={{ background: '#fff', border: '1.5px solid #f0ede8', borderRadius: 12, overflow: 'hidden' }}>
                {orgs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: '#a3a3a3', fontSize: 14 }}>No organizations yet</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr>
                                {['Name', 'Slug', 'Status', 'Seats used', 'Seat limit', 'Created'].map(h => (
                                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 500, color: '#6b6b6b', borderBottom: '1px solid #f0ede8', fontSize: 12 }}>{h}</th>
                                ))}
                                <th style={{ padding: '10px 14px', borderBottom: '1px solid #f0ede8' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {orgs.map(org => (
                                <tr key={org.id}>
                                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{org.name}</td>
                                    <td style={{ padding: '10px 14px', color: '#6b6b6b', fontFamily: 'monospace', fontSize: 12 }}>{org.slug}</td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <span style={{
                                            fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 6,
                                            background: org.status === 'active' ? '#f0fdf4' : '#fef2f2',
                                            color: org.status === 'active' ? '#16a34a' : '#dc2626',
                                            border: `1px solid ${org.status === 'active' ? '#bbf7d0' : '#fecaca'}`,
                                        }}>{org.status}</span>
                                    </td>
                                    <td style={{ padding: '10px 14px' }}>{org.seat_counts?.total ?? 0}</td>
                                    <td style={{ padding: '10px 14px' }}>{org.seat_limit}</td>
                                    <td style={{ padding: '10px 14px', color: '#a3a3a3', fontSize: 12 }}>
                                        {org.created_at ? new Date(org.created_at).toLocaleDateString() : '—'}
                                    </td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <Link to={`/admin/teams/${org.slug}`} style={{ fontSize: 12, color: '#6b6b6b', textDecoration: 'none', border: '1px solid #e5e2dd', borderRadius: 6, padding: '3px 10px' }}>
                                            Manage
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
