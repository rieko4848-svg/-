const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');

function hash(s){ return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function resp(statusCode, obj){
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}
const emptyState = { clients: [], invoices: [], tasks: [] };

function getBlobStore(){
  return getStore({
    name: 'osa-store',
    siteID: process.env.OSA_SITE_ID,
    token: process.env.OSA_BLOBS_TOKEN
  });
}

exports.handler = async (event) => {
  const store = getBlobStore();

  if (event.httpMethod === 'GET') {
    const code = event.queryStringParameters && event.queryStringParameters.code;
    if (!code) return resp(400, { error: 'code_required' });

    const config = await store.get('config', { type: 'json' });
    if (!config) return resp(404, { error: 'not_initialized' });
    if (config.codeHash !== hash(code)) return resp(401, { error: 'invalid_code' });

    const state = await store.get('state', { type: 'json' });
    return resp(200, state || emptyState);
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return resp(400, { error: 'bad_json' }); }
    const { code, action, state } = body;
    if (!code) return resp(400, { error: 'code_required' });

    const config = await store.get('config', { type: 'json' });

    if (action === 'init') {
      if (config) {
        if (config.codeHash !== hash(code)) return resp(401, { error: 'invalid_code' });
        const existing = await store.get('state', { type: 'json' });
        return resp(200, existing || emptyState);
      }
      await store.setJSON('config', { codeHash: hash(code), createdAt: new Date().toISOString() });
      await store.setJSON('state', emptyState);
      return resp(200, emptyState);
    }

    if (action === 'save') {
      if (!config) return resp(404, { error: 'not_initialized' });
      if (config.codeHash !== hash(code)) return resp(401, { error: 'invalid_code' });
      await store.setJSON('state', state || emptyState);
      return resp(200, { ok: true });
    }

    return resp(400, { error: 'unknown_action' });
  }

  return resp(405, { error: 'method_not_allowed' });
};
