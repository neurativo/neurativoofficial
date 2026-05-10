// frontend/src/lib/jobsApi.js
import api from './api';

export function useJobsApi() {
    return {
        getStatus: async (lectureId) => {
            const res = await api.get(`/api/v1/jobs/${lectureId}`);
            return res.data;
        },
    };
}
