import axios from 'axios';

export const apiProxy = axios.create({
    // Usa o mesmo origin do console para funcionar também pelos nomes internos/offline.
    baseURL: '/api/proxy',
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' }
});
