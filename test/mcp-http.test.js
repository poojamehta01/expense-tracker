const test=require('node:test');
const assert=require('node:assert/strict');
const { setup,register,authorize,exchange }=require('./helpers/oauth-fixture');
const { lists }=require('./helpers/mcp-fixture');
const { createMcpFinance }=require('../mcp/finance');
async function ready(t) {
  const x=await setup(t);
  const { registerMcpEndpoint }=await import('../mcp/server.mjs');
  const handler=registerMcpEndpoint(x.app,{finance:createMcpFinance({db:x.db,lists}),oauth:x.oauth,config:x.config});
  t.after(()=>handler.close());
  async function token(scope='expenses:read expenses:write') {
    const {body:client}=await register(x);const callback=await authorize(x,client,{scope});return (await exchange(x,client,callback.searchParams.get('code'))).body.access_token;
  }
  async function client(token) {
    const { Client,StreamableHTTPClientTransport }=await import('@modelcontextprotocol/client');
    const value=new Client({name:'integration-test',version:'1.0.0'});
    await value.connect(new StreamableHTTPClientTransport(new URL(x.config.resourceUrl),{requestInit:{headers:{authorization:`Bearer ${token}`}}}));
    t.after(()=>value.close());return value;
  }
  return {...x,token,client};
}
const expense={date:'2026-10-02',amount:50,description:'Lunch',paid_by:'Pooja',expense_type:'Pooja_Personal',category:'Outside Food',payment_method:'Cash',idempotencyKey:'http-lunch'};

test('SDK initializes, discovers twelve tools, reads finances and writes with revision and replay protection',async t=>{
  const x=await ready(t);const client=await x.client(await x.token());
  const tools=(await client.listTools()).tools;assert.equal(tools.length,12);
  assert.equal(tools.find(x=>x.name==='search_transactions').annotations.readOnlyHint,true);
  assert.equal(tools.find(x=>x.name==='update_expense').annotations.destructiveHint,true);
  assert.ok(tools.find(x=>x.name==='add_expense')._meta.securitySchemes[0].scopes.includes('expenses:write'));
  const first=await client.callTool({name:'add_expense',arguments:expense});assert.equal(first.isError,undefined,JSON.stringify(first));
  assert.equal(first.structuredContent.transaction.amount,50);assert.ok(first.content.some(x=>x.type==='text'));
  const record=first.structuredContent.transaction;
  const update=await client.callTool({name:'update_expense',arguments:{id:record.id,revision:record.revision,idempotencyKey:'http-edit',patch:{amount:55}}});
  assert.equal(update.structuredContent.transaction.amount,55);
  const summary=await client.callTool({name:'summarize_spending',arguments:{month:'October_2026'}});assert.equal(summary.structuredContent.totalSpend,55);
  const invalid=await client.callTool({name:'search_transactions',arguments:{limit:1000}});assert.equal(invalid.isError,true);
  const context=await client.callTool({name:'get_tracker_context',arguments:{}});assert.equal(context.structuredContent.currency,'INR');
  for(const [name,args] of [['list_months',{}],['get_transaction',{id:record.id}],['get_budget',{month:'October_2026'}],['get_budget_transactions',{month:'September_2026',section:'Household Expenses',budgetCategory:'House Rent',kind:'expense'}],['get_settlement',{month:'October_2026'}],['get_salary',{month:'October_2026'}],['get_investments',{}]]) {
    const value=await client.callTool({name,arguments:args});assert.notEqual(value.isError,true,`${name}: ${JSON.stringify(value)}`);
  }
});

test('missing tokens get a JSON OAuth challenge and read-only grants cannot mutate',async t=>{
  const x=await ready(t);
  const anonymous=await x.request('/mcp',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(anonymous.status,401);assert.match(anonymous.headers.get('www-authenticate'),/resource_metadata=/);assert.equal(anonymous.headers.get('location'),null);
  const token=await x.token('expenses:read');const client=await x.client(token);
  await assert.rejects(client.callTool({name:'add_expense',arguments:expense}), /403|scope|Forbidden/i);
  assert.equal(x.db.prepare('SELECT COUNT(*) n FROM transactions').get().n,0);
  x.disallow();
  assert.equal((await x.request('/mcp',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:'{}'})).status,401);
});

test('transport bounds bodies, rejects hostile origin, malformed JSON and unsupported methods',async t=>{
  const x=await ready(t);const token=await x.token();const headers={authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json, text/event-stream'};
  assert.equal((await x.request('/mcp',{method:'POST',headers:{...headers,origin:'https://evil.example'},body:'{}'})).status,403);
  assert.equal((await x.request('/mcp',{method:'POST',headers,body:'{bad'})).status,400);
  assert.equal((await x.request('/mcp',{method:'POST',headers,body:JSON.stringify({big:'x'.repeat(70000)})})).status,413);
  assert.equal((await x.request('/mcp',{method:'PUT',headers,body:'{}'})).status,405);
});

test('two client connections retain separate actors and idempotency keys',async t=>{
  const x=await ready(t);const first=await x.client(await x.token());const second=await x.client(await x.token());
  const [a,b]=await Promise.all([first.callTool({name:'add_expense',arguments:expense}),second.callTool({name:'add_expense',arguments:{...expense,description:'Other client'}})]);
  assert.notEqual(a.structuredContent.transaction.id,b.structuredContent.transaction.id);
  const rows=x.db.prepare('SELECT DISTINCT client_id FROM mcp_write_audit').all();assert.equal(rows.length,2);
});
