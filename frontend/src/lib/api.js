/**
 * Axios instance pre-configured with:
 * - Auth interceptor: attaches Bearer token from active Supabase session
 * - 401 handler: signs out + redirects to /auth on expired/invalid token
 */
import axios from 'axios';
import { supabase } from './supabase';

const api = axios.create();

// Request: attach access token from active session
api.interceptors.request.use(async (config) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
        config.headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return config;
}, (error) => Promise.reject(error));

// Response: sign out + redirect on 401
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error.response?.status === 401) {
            await supabase.auth.signOut();
            window.location.href = '/auth';
        }
        return Promise.reject(error);
    }
);

export default api;
