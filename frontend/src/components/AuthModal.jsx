import { createContext, useContext, useCallback } from 'react';

const SIGN_IN_URL = 'https://accounts.neurativo.com/sign-in';
const SIGN_UP_URL = 'https://accounts.neurativo.com/sign-up';
const AFTER_AUTH  = 'https://neurativo.com/app';

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthModalCtx = createContext(null);
export function useAuthModal() { return useContext(AuthModalCtx); }

// ─── Provider ─────────────────────────────────────────────────────────────────
// Redirects to Clerk's hosted Account Portal on accounts.neurativo.com.
// redirect_url tells Clerk where to send the user after successful auth.
export function AuthModalProvider({ children }) {
    const openSignIn = useCallback(() => {
        window.location.href = `${SIGN_IN_URL}?redirect_url=${encodeURIComponent(AFTER_AUTH)}`;
    }, []);

    const openSignUp = useCallback(() => {
        window.location.href = `${SIGN_UP_URL}?redirect_url=${encodeURIComponent(AFTER_AUTH)}`;
    }, []);

    const closeModal = useCallback(() => {}, []);

    return (
        <AuthModalCtx.Provider value={{ openSignIn, openSignUp, closeModal }}>
            {children}
        </AuthModalCtx.Provider>
    );
}
