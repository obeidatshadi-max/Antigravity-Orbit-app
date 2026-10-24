const {test}=require('node:test');
const assert=require('node:assert/strict');
const {handler}=require('../netlify/functions/claude.js');
test('AI proxy verifies account sessions and bounds provider requests',async()=>{
  const previousFetch=global.fetch,previousEnv={...process.env};let providerCalls=0,lastPayload;
  process.env.ANTHROPIC_API_KEY='test-provider-key';process.env.SUPABASE_URL='https://auth.example.invalid';process.env.SUPABASE_ANON_KEY='public-\r\ntest-key';
  let anonymous=false,sessionOK=true;
  global.fetch=async(url,options)=>{
    if(url.includes('/auth/v1/user')){assert.equal(options.headers.apikey,'public-test-key');return {ok:sessionOK,json:async()=>({id:'fixture-user',is_anonymous:anonymous})};}
    providerCalls++;lastPayload=JSON.parse(options.body);return {ok:true,status:200,json:async()=>({content:[{text:'A possible reflection.'}]})};
  };
  const base={httpMethod:'POST',headers:{origin:'https://antigravitycoach.netlify.app',authorization:'Bearer test-token'},body:JSON.stringify({model:'claude-haiku-4-5',max_tokens:99999,messages:[{role:'user',content:'A synthetic test reflection.'}]})};
  try{
    assert.equal((await handler({...base,httpMethod:'GET'})).statusCode,405);
    assert.equal((await handler({...base,headers:{}})).statusCode,401);
    assert.equal((await handler({...base,headers:{...base.headers,origin:'https://other.example.invalid'}})).statusCode,403);
    anonymous=true;assert.equal((await handler(base)).statusCode,403);anonymous=false;
    sessionOK=false;assert.equal((await handler(base)).statusCode,401);sessionOK=true;
    assert.equal(providerCalls,0);
    assert.equal((await handler({...base,body:'{'})).statusCode,400);
    assert.equal((await handler({...base,body:'x'.repeat(24001)})).statusCode,413);
    assert.equal((await handler({...base,body:JSON.stringify({messages:[{role:'system',content:'Not allowed'}]})})).statusCode,400);
    assert.equal((await handler(base)).statusCode,200);assert.equal(providerCalls,1);assert.equal(lastPayload.max_tokens,800);
    delete process.env.ANTHROPIC_API_KEY;assert.equal((await handler(base)).statusCode,503);
  }finally{global.fetch=previousFetch;for(const key of ['ANTHROPIC_API_KEY','SUPABASE_URL','SUPABASE_ANON_KEY']){if(previousEnv[key]===undefined)delete process.env[key];else process.env[key]=previousEnv[key];}}
});
