// frontend/src/lib/jobsApi.js
import axios from 'axios';
import { useAuth } from '@clerk/react';

const BASE = import.meta.env.VITE_API_URL || 'https://api.neurativo.com';

export function useJobsApi() {
    const { getToken } = useAuth();
    return {
        getStatus: async (lectureId) => {
            const token = await getToken();
            const res = await axios.get(`${BASE}/api/v1/jobs/${lectureId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return res.data;
        },
    };
}
