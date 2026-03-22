import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback(({ type = 'info', message }) => {
        const id = Date.now() + Math.random();
        setToasts(t => [...t, { id, type, message }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
    }, []);

    return (
        <ToastContext.Provider value={addToast}>
            {children}
            <ToastStack toasts={toasts} />
        </ToastContext.Provider>
    );
}

export function useToast() {
    return useContext(ToastContext);
}

const borderByType = { success: '#22c55e', error: '#ef4444', info: '#a3a3a3' };

function ToastStack({ toasts }) {
    if (!toasts.length) return null;
    return (
        <div style={{
            position: 'fixed', top: 16, right: 16, zIndex: 9999,
            display: 'flex', flexDirection: 'column', gap: 8,
            pointerEvents: 'none',
        }}>
            {toasts.map(t => (
                <div key={t.id} style={{
                    background: '#ffffff',
                    border: '1px solid #f0ede8',
                    borderLeft: `3px solid ${borderByType[t.type] || borderByType.info}`,
                    borderRadius: 10,
                    padding: '10px 14px',
                    fontSize: 13,
                    color: '#1a1a1a',
                    fontFamily: 'Inter, sans-serif',
                    minWidth: 200,
                    maxWidth: 300,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                    animation: 'toast-in 0.18s ease',
                }}>
                    {t.message}
                </div>
            ))}
            <style>{`@keyframes toast-in { from { opacity:0; transform:translateX(12px); } to { opacity:1; transform:translateX(0); } }`}</style>
        </div>
    );
}
