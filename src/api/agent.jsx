import http from '../utils/http';

export const getAgentCapabilities = () => http('get', '/api/w8t/agent/capabilities');
export const createAgentSession = (params) => http('post', '/api/w8t/agent/sessionCreate', params);
export const sendAgentMessage = (params) => http('post', '/api/w8t/agent/sessionMessage', params);
export const confirmAgentAction = (params) => http('post', '/api/w8t/agent/actionConfirm', params);
