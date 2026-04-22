import axios from 'axios';

export const apiProxy = axios.create({
    // Usa o hostname dinâmico do navegador, apontando para a porta segura 6779
    baseURL: `https://${window.location.hostname}:6779/api/proxy`,
    timeout: 10000,
    headers: { 'Content-Type': 'application/json' }
});
