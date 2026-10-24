// Provider credentials stay server-side. A registered account is required.
const allowedOrigin = origin => !origin || /^https:\/\/(?:[a-z0-9-]+--)?antigravitycoach\.netlify\.app$/.test(origin);
const ALLOWED_MODELS = ['claude-sonnet-4-20250514', 'claude-haiku-4-5'];
const MAX_TOKENS_CAP = 800;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const headers=event.headers||{};
  if(!allowedOrigin(headers.origin||headers.Origin||''))return {statusCode:403,body:JSON.stringify({error:'Origin not allowed'})};
  const authorization=headers.authorization||headers.Authorization||'';
  if(!/^Bearer \S+$/.test(authorization))return {statusCode:401,body:JSON.stringify({error:'Sign in to use AI reflections. The example report is still available.'})};
  if(!process.env.ANTHROPIC_API_KEY||!process.env.SUPABASE_URL||!process.env.SUPABASE_ANON_KEY)return {statusCode:503,body:JSON.stringify({error:'AI reflections are not configured yet.'})};
  if(Buffer.byteLength(event.body||'','utf8')>24000)return {statusCode:413,body:JSON.stringify({error:'Please shorten your reflection.'})};
  try{
    const response=await fetch(process.env.SUPABASE_URL+'/auth/v1/user',{headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:authorization},signal:AbortSignal.timeout(10000)});
    if(!response.ok)return {statusCode:401,body:JSON.stringify({error:'Your session expired. Please sign in again.'})};
    const user=await response.json();
    if(!user.id||user.is_anonymous)return {statusCode:403,body:JSON.stringify({error:'Sign in with a registered account to use AI reflections.'})};
  }catch(error){console.error('ORBIT session verification failed',error.name,error.cause?.code||error.code||error.message);return {statusCode:503,body:JSON.stringify({error:'Could not verify your session. Please try again.'})};}

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { system, messages } = payload;
  if (!Array.isArray(messages) || !messages.length || messages.length>6 || messages.some(m=>!['user','assistant'].includes(m.role)||typeof m.content!=='string'||!m.content.trim()) || (system!==undefined && typeof system!=='string')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'messages required' }) };
  }

  const model = ALLOWED_MODELS.includes(payload.model) ? payload.model : 'claude-haiku-4-5';
  const max_tokens = Math.max(1,Math.min(Math.floor(Number(payload.max_tokens)) || 500, MAX_TOKENS_CAP));

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens, system: system || undefined, messages }),
      signal: AbortSignal.timeout(40000),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return { statusCode: resp.status, body: JSON.stringify({ error: data.error?.message || 'Anthropic error' }) };
    }
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
  } catch {
    return { statusCode: 502, body: JSON.stringify({ error: 'Upstream request failed' }) };
  }
};
