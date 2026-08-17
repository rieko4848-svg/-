const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');

function hash(s){ return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function resp(statusCode, obj){
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

function getBlobStore(){
  return getStore({
    name: 'osa-store',
    siteID: process.env.OSA_SITE_ID,
    token: process.env.OSA_BLOBS_TOKEN
  });
}

const GRAPH_VERSION = 'v21.0';
const CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchInsights(){
  const token = process.env.IG_ACCESS_TOKEN;
  const igUserId = process.env.IG_BUSINESS_ID;
  if (!token || !igUserId) return { connected: false };

  const profileRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}?fields=username,followers_count,media_count&access_token=${encodeURIComponent(token)}`
  );
  const profile = await profileRes.json();
  if (profile.error) throw new Error(profile.error.message || 'instagram_api_error');

  let reach = null, profileViews = null;
  try {
    const insightsRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/insights?metric=reach,profile_views&period=day&access_token=${encodeURIComponent(token)}`
    );
    const insights = await insightsRes.json();
    if (Array.isArray(insights.data)) {
      insights.data.forEach(m => {
        const latest = m.values && m.values.length ? m.values[m.values.length - 1].value : null;
        if (m.name === 'reach') reach = latest;
        if (m.name === 'profile_views') profileViews = latest;
      });
    }
  } catch (e) {
    // インサイトが取得できなくてもプロフィール情報だけは表示する
  }

  return {
    connected: true,
    username: profile.username || null,
    followersCount: profile.followers_count ?? null,
    mediaCount: profile.media_count ?? null,
    reach,
    profileViews,
    fetchedAt: new Date().toISOString()
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return resp(405, { error: 'method_not_allowed' });

  const code = event.queryStringParameters && event.queryStringParameters.code;
  if (!code) return resp(400, { error: 'code_required' });

  const store = getBlobStore();
  const config = await store.get('config', { type: 'json' });
  if (!config) return resp(404, { error: 'not_initialized' });
  if (config.codeHash !== hash(code)) return resp(401, { error: 'invalid_code' });

  const forceRefresh = event.queryStringParameters && event.queryStringParameters.refresh === '1';
  const cached = await store.get('ig-insights', { type: 'json' });
  if (!forceRefresh && cached && cached.fetchedAt && (Date.now() - new Date(cached.fetchedAt).getTime()) < CACHE_TTL_MS) {
    return resp(200, cached);
  }

  try {
    const fresh = await fetchInsights();
    if (fresh.connected) await store.setJSON('ig-insights', fresh);
    return resp(200, fresh);
  } catch (e) {
    if (cached) return resp(200, cached);
    return resp(200, { connected: false, error: e.message });
  }
};
