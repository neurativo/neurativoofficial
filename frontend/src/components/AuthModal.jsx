import { createContext, useContext, useCallback } from 'react';
import { useClerk } from '@clerk/react';

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthModalCtx = createContext(null);
export function useAuthModal() { return useContext(AuthModalCtx); }

// ─── Provider ─────────────────────────────────────────────────────────────────
// No custom modal — delegates entirely to Clerk's hosted auth pages
// (accounts.neurativo.com). Clerk handles email OTP + magic link.
export function AuthModalProvider({ children }) {
    const clerk = useClerk();

    const openSignIn = useCallback(() => {
        clerk.redirectToSignIn({ afterSignInUrl: '/app' });
    }, [clerk]);

    const openSignUp = useCallback(() => {
        clerk.redirectToSignUp({ afterSignUpUrl: '/app' });
    }, [clerk]);

    const closeModal = useCallback(() => {}, []);

    return (
        <AuthModalCtx.Provider value={{ openSignIn, openSignUp, closeModal }}>
            {children}
        </AuthModalCtx.Provider>
    );
}
