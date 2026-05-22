/**
 * featureFlags.js
 * ----------------
 * Provides a React context + hooks for feature flag access.
 *
 * Usage:
 *   const isEnabled = useFeatureFlag('my_flag_key');
 *   const allFlags  = useFeatureFlags();
 *
 * Wrap your app (or auth-protected tree) with <FeatureFlagsProvider />.
 * It fetches /api/v1/feature-flags once when the user is authenticated
 * and caches the result in context. No re-fetches per component.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import api from './api';

const FeatureFlagsContext = createContext({});

export function FeatureFlagsProvider({ children, enabled = true }) {
    const [flags, setFlags] = useState({});

    useEffect(() => {
        if (!enabled) return;
        api.get('/api/v1/feature-flags')
            .then(r => setFlags(r.data?.flags || {}))
            .catch(() => {}); // silent — flags default to false
    }, [enabled]);

    return (
        <FeatureFlagsContext.Provider value={flags}>
            {children}
        </FeatureFlagsContext.Provider>
    );
}

/** Returns true if the named flag is enabled for the current user. */
export function useFeatureFlag(key) {
    const flags = useContext(FeatureFlagsContext);
    return Boolean(flags[key]);
}

/** Returns the full {key: bool} map. */
export function useFeatureFlags() {
    return useContext(FeatureFlagsContext);
}
