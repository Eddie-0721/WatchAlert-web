import http from '../utils/http';
import {HandleApiError} from "../utils/lib";

async function getSilenceList(params) {
    try {
        const res = await http('get', '/api/w8t/silence/silenceList', params);
        return res;
    } catch (error) {
        HandleApiError(error)
        throw error
    }
}

const checked = res => {if(res?.code !== 200 && res?.code !== 0) throw new Error(typeof res?.data === 'string' ? res.data : res?.msg || '操作失败'); return res;};
async function previewSilence(params) { return checked(await http('post','/api/w8t/silence/silencePreview',params)); }

async function createSilence(params) { return checked(await http('post','/api/w8t/silence/silenceCreate',params)); }
async function updateSilence(params) { return checked(await http('post','/api/w8t/silence/silenceUpdate',params)); }

async function deleteSilence(params) {
    return checked(await http('post', '/api/w8t/silence/silenceDelete', params));
}

export {
    getSilenceList,
    previewSilence,
    createSilence,
    updateSilence,
    deleteSilence
}
