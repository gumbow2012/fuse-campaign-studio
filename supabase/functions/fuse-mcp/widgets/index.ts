/**
 * ChatGPT App UI resources (MCP Apps: mimeType text/html;profile=mcp-app,
 * ui:// URIs). Each widget is self-contained HTML that reads the tool result
 * from window.openai.toolOutput and can call tools through window.openai.callTool.
 * Minimal, structured data only — nothing sensitive is rendered.
 */
const BASE_CSS = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0b0f16;color:#e6edf3;font:14px/1.45 -apple-system,Inter,system-ui,sans-serif;padding:14px}
h1,h2,.orb{font-family:Orbitron,"Segoe UI",sans-serif;letter-spacing:.06em;text-transform:uppercase}
h1{font-size:15px;margin:0 0 10px;color:#fff}
h2{font-size:11px;margin:12px 0 6px;color:#8fd3ff;opacity:.9}
.grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
.card{background:#111827;border:1px solid #1f2a3a;border-radius:14px;overflow:hidden;display:flex;flex-direction:column}
.card .media{aspect-ratio:4/5;background:#0f172a;display:flex;align-items:center;justify-content:center;overflow:hidden}
.card .media img,.card .media video{width:100%;height:100%;object-fit:cover;display:block}
.card .body{padding:10px 12px 12px;display:flex;flex-direction:column;gap:4px}
.name{font-weight:600;color:#fff}
.muted{color:#9fb0c3;font-size:12px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:#67e8f9;color:#06202a;border:0;border-radius:999px;padding:9px 14px;font:600 13px Orbitron,system-ui,sans-serif;letter-spacing:.04em;cursor:pointer;margin-top:6px}
.btn.secondary{background:transparent;color:#67e8f9;border:1px solid #2b4b57}
.btn:disabled{opacity:.5;cursor:default}
.pill{display:inline-block;border:1px solid #2b4b57;color:#8fd3ff;border-radius:999px;padding:2px 8px;font-size:11px;letter-spacing:.06em;text-transform:uppercase}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.bar{height:8px;background:#1f2a3a;border-radius:999px;overflow:hidden}
.bar>i{display:block;height:100%;background:linear-gradient(90deg,#22d3ee,#67e8f9)}
.list{display:flex;flex-direction:column;gap:8px}
.slot{background:#111827;border:1px dashed #2b4b57;border-radius:12px;padding:10px 12px}
.ok{color:#86efac}.warn{color:#fbbf24}.bad{color:#fca5a5}
.empty{padding:22px;text-align:center;color:#9fb0c3;border:1px dashed #2b4b57;border-radius:14px}
input[type=file]{color:#9fb0c3;font-size:12px}
`;

const BRIDGE = `
const O = window.openai || {};
const out = () => (O.toolOutput ?? {});
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const call = (name, args) => (O.callTool ? O.callTool(name, args) : Promise.reject(new Error("callTool unavailable")));
const say = (text) => (O.sendFollowUpMessage ? O.sendFollowUpMessage({ prompt: text }) : null);
const $ = (id) => document.getElementById(id);
`;

function page(title: string, body: string, script: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${BASE_CSS}</style></head><body>${body}<script>${BRIDGE}${script}</script></body></html>`;
}

const TEMPLATE_SEARCH = page("FUSE campaigns", `<h1>Campaigns for your product</h1><div id="root" class="grid"></div><p id="note" class="muted"></p>`, `
function render(){
  const d = out(); const root = $("root"); root.innerHTML = "";
  const list = d.templates || [];
  if (!list.length) { root.innerHTML = '<div class="empty">No matching campaigns yet. Try describing the product differently.</div>'; return; }
  for (const t of list) {
    const media = t.preview_video_url ? '<video src="'+esc(t.preview_video_url)+'" muted loop autoplay playsinline></video>' : (t.preview_image_url ? '<img src="'+esc(t.preview_image_url)+'" alt="">' : '<span class="muted">Preview coming soon</span>');
    const el = document.createElement("div"); el.className = "card";
    el.innerHTML = '<div class="media">'+media+'</div><div class="body"><div class="name">'+esc(t.name)+'</div><div class="muted">'+esc(t.short_description)+'</div><div class="muted">'+t.outputs.images_count+' images + '+t.outputs.clips_count+' clips</div><span class="pill">'+(t.included_in_starter?'Included in Starter':esc(t.plan_required))+'</span><button class="btn">Use this campaign</button></div>';
    el.querySelector("button").onclick = () => say("Use the "+t.name+" campaign ("+t.slug+"). Show me what I need to upload.");
    root.appendChild(el);
  }
  $("note").textContent = d.exact_match ? "" : "Closest real matches — nothing matched your words exactly.";
}
render(); window.addEventListener("openai:set_globals", render);`);

const TEMPLATE_DETAIL = page("FUSE campaign", `<div id="root"></div>`, `
function render(){
  const t = (out().template) || {}; const root = $("root");
  const media = (t.sample_outputs||[])[0];
  const hero = media && media.url ? (media.type==="video" ? '<video src="'+esc(media.url)+'" '+(media.poster_url?'poster="'+esc(media.poster_url)+'"':'')+' controls muted playsinline style="width:100%;border-radius:14px;max-height:360px;object-fit:cover"></video>' : '<img src="'+esc(media.url)+'" style="width:100%;border-radius:14px;max-height:360px;object-fit:cover" alt="">') : '';
  root.innerHTML = '<h1>'+esc(t.name||"Campaign")+'</h1>'+hero+
    '<p class="muted">'+esc(t.short_description||"")+'</p>'+
    '<h2>What you upload</h2><div class="list">'+(t.what_user_uploads||[]).map(u=>'<div class="slot">'+esc(u)+'</div>').join("")+'</div>'+
    '<h2>What you get</h2><div class="list">'+(t.what_user_gets||[]).map(u=>'<div class="slot">'+esc(u)+'</div>').join("")+'</div>'+
    '<div class="row" style="margin-top:12px"><span class="pill">'+(t.included_in_starter?'Included in Starter':esc(t.plan_required||''))+'</span><span class="muted">About '+(t.estimated_credits>=945?'one campaign':'part of a campaign')+' worth of credits</span></div>'+
    '<button class="btn" id="go">Prepare campaign</button> <a class="btn secondary" href="'+esc(t.public_url||'#')+'" target="_blank" rel="noopener">Open in FUSE</a>';
  $("go").onclick = () => say("Prepare the "+t.name+" campaign ("+t.slug+"). Tell me what to upload.");
}
render(); window.addEventListener("openai:set_globals", render);`);

const UPLOAD = page("Upload your product", `<h1>Upload your product</h1><p class="muted">A phone photo on a plain background is fine.</p><div id="root" class="list"></div><p id="msg" class="muted"></p>`, `
async function putFile(slot, file){
  const res = await fetch(slot.upload_url, { method: "PUT", headers: slot.upload_headers || {"Content-Type": file.type}, body: file });
  if (!res.ok) throw new Error("Upload failed ("+res.status+")");
}
function render(){
  const d = out(); const root = $("root"); root.innerHTML = "";
  const slots = d.upload_slots || [];
  if (!slots.length) { root.innerHTML = '<div class="empty">No upload slots in this session.</div>'; return; }
  for (const s of slots) {
    const el = document.createElement("div"); el.className = "slot";
    el.innerHTML = '<div class="row"><span class="name">'+esc(s.label||s.input_key)+'</span><span class="'+(s.attached?'ok':'warn')+'">'+(s.attached?'Attached':'Needed')+'</span></div><div class="muted">PNG, JPG or WEBP · up to '+Math.round((s.max_size_bytes||0)/1048576)+' MB</div><input type="file" accept="'+esc((s.accepted_mime_types||[]).join(","))+'">';
    const input = el.querySelector("input");
    input.onchange = async () => {
      const file = input.files && input.files[0]; if (!file) return;
      $("msg").textContent = "Uploading "+file.name+"…";
      try {
        await putFile(s, file);
        await call("fuse_attach_uploaded_assets", { upload_session_id: d.upload_session_id, uploaded_files: [{ input_key: s.input_key, storage_key: s.storage_key, original_file_name: file.name, mime_type: file.type }] });
        $("msg").textContent = file.name+" attached.";
      } catch (e) { $("msg").textContent = "Couldn't upload: "+e.message; }
    };
    root.appendChild(el);
  }
  const missing = d.required_inputs_remaining || [];
  $("msg").textContent = missing.length ? "Still needed: "+missing.join(", ") : (d.ready_to_prepare ? "All set — ready to prepare the campaign." : "");
}
render(); window.addEventListener("openai:set_globals", render);`);

const CONFIRM_RUN = page("Confirm campaign", `<div id="root"></div>`, `
function render(){
  const d = out(); const root = $("root");
  const t = d.template || {}; const o = d.estimated_outputs || {};
  root.innerHTML = '<h1>Ready to run?</h1><div class="list">'+
    '<div class="slot"><span class="muted">Campaign</span><br><span class="name">'+esc(d.campaign_name||t.name||"")+'</span> <span class="muted">· '+esc(t.name||"")+'</span></div>'+
    '<div class="slot"><span class="muted">Uploads</span><br>'+(d.required_inputs_status||[]).map(i=>'<span class="'+(i.attached?'ok':'bad')+'">'+esc(i.label)+(i.attached?' ✓':' — missing')+'</span>').join("<br>")+'</div>'+
    '<div class="slot"><span class="muted">You get</span><br><span class="name">'+(o.images_count||0)+' images + '+(o.clips_count||0)+' clips</span></div>'+
    '<div class="slot"><span class="muted">Credits</span><br><span class="name">'+(d.estimated_credits||0)+'</span> <span class="muted">· balance '+(d.credit_balance||0)+'</span></div>'+
    (d.issues&&d.issues.length?'<div class="slot bad">'+d.issues.map(i=>esc(i.message)).join("<br>")+'</div>':'')+
    '</div>'+(d.confirmation_token?'<button class="btn" id="go" '+(d.ready?'':'disabled')+'>Run this campaign</button>':'<p class="muted">Ask me to prepare the campaign again.</p>')+'<p class="muted" id="msg"></p>';
  const go = $("go"); if (go) go.onclick = () => startRun(d, go);
}
function errText(r, e){ const c = r && r.content; if (Array.isArray(c) && c.length) return c.map(x => x && x.text || "").join(" ").trim(); return (e && e.message) || "Couldn't start the campaign."; }
async function startRun(d, btn){
  btn.disabled = true; btn.textContent = "Starting…"; $("msg").textContent = "";
  let r = null;
  try {
    r = await call("fuse_start_campaign_run", { confirmation_token: d.confirmation_token, idempotency_key: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) });
    if (!r || r.isError) throw null;
    const s = r.structuredContent || r;
    $("root").innerHTML = '<h1>Started</h1><p class="name">Run '+esc(s.run_id||"")+'</p><p class="muted">Check status in ~20s.</p>';
    say("The campaign started. Check its status.");
  } catch (e) {
    btn.disabled = false; btn.textContent = "Run this campaign"; $("msg").textContent = errText(r, e);
  }
}
render(); window.addEventListener("openai:set_globals", render);`);

const RUN_STATUS = page("Campaign status", `<div id="root"></div>`, `
function render(){
  const d = out(); const root = $("root");
  const pct = Math.max(0, Math.min(100, Number(d.progress_percent||0)));
  const previews = (d.outputs_preview||[]).filter(p=>p.preview_url);
  root.innerHTML = '<h1>'+esc(d.campaign_name||"Campaign")+'</h1><div class="row"><span class="pill">'+esc(d.status||"queued")+'</span><span class="muted">'+esc(d.current_stage||"")+'</span></div>'+
    '<div class="bar" style="margin:10px 0"><i style="width:'+pct+'%"></i></div>'+
    '<div class="muted">'+(d.outputs_ready_count||0)+' of '+(d.outputs_expected_count||0)+' outputs ready'+(d.failed_outputs_count?' · <span class="warn">'+d.failed_outputs_count+' failed</span>':'')+'</div>'+
    (previews.length?'<div class="grid" style="margin-top:10px">'+previews.map(p=>'<div class="card"><div class="media">'+(p.type==="video"?'<video src="'+esc(p.preview_url)+'" muted loop autoplay playsinline></video>':'<img src="'+esc(p.preview_url)+'" alt="">')+'</div></div>').join("")+'</div>':'')+
    '<div class="row" style="margin-top:10px">'+(d.next_poll_after_seconds?'<button class="btn secondary" id="refresh">Refresh</button>':'<button class="btn" id="outputs">See all outputs</button>')+'</div>';
  const r = $("refresh"); if (r) r.onclick = async () => { try { await call("fuse_get_run_status", { run_id: d.run_id }); } catch(e){} };
  const o = $("outputs"); if (o) o.onclick = () => say("Show me all outputs for run "+d.run_id+".");
}
render(); window.addEventListener("openai:set_globals", render);`);

const OUTPUT_GALLERY = page("Campaign outputs", `<div id="root"></div>`, `
function render(){
  const d = out(); const root = $("root");
  if (d.campaigns) {
    root.innerHTML = '<h1>Your campaigns</h1><div class="grid">'+d.campaigns.map(c=>'<div class="card"><div class="media">'+(c.thumbnail_url?'<img src="'+esc(c.thumbnail_url)+'" alt="">':'<span class="muted">No preview yet</span>')+'</div><div class="body"><div class="name">'+esc(c.campaign_name)+'</div><div class="muted">'+esc(c.status)+' · '+(c.outputs_count||0)+' outputs</div><button class="btn secondary" data-run="'+esc(c.run_id)+'">Open</button></div></div>').join("")+'</div>';
    root.querySelectorAll("button[data-run]").forEach(b => b.onclick = () => say("Show me the outputs for run "+b.dataset.run+"."));
    return;
  }
  const list = d.outputs || [];
  root.innerHTML = '<h1>'+esc(d.campaign_name||"Outputs")+'</h1>'+(list.length?'<div class="grid">'+list.map(o=>'<div class="card"><div class="media">'+(o.type==="video"?'<video src="'+esc(o.preview_url||"")+'" '+(o.poster_url?'poster="'+esc(o.poster_url)+'"':'')+' controls muted playsinline></video>':'<img src="'+esc(o.preview_url||"")+'" alt="">')+'</div><div class="body"><div class="muted">'+esc(o.file_name)+'</div>'+(o.download_url?'<a class="btn secondary" href="'+esc(o.download_url)+'" target="_blank" rel="noopener">Download</a>':'')+'</div></div>').join("")+'</div>':'<div class="empty">No outputs yet.</div>')+
    (d.counts&&d.counts.failed?'<p class="warn">'+d.counts.failed+' output(s) failed — you were not charged for them.</p>':'')+
    '<div class="row" style="margin-top:10px"><button class="btn" id="edit">Edit clips</button><a class="btn secondary" href="'+esc(d.editor_url||'#')+'" target="_blank" rel="noopener">Open editor</a></div>';
  const e = $("edit"); if (e) e.onclick = () => say("Open the clip timeline for run "+d.run_id+" so I can reorder and trim.");
}
render(); window.addEventListener("openai:set_globals", render);`);

const EDITOR = page("Campaign editor", `<div id="root"></div>`, `
let state = null;
function render(){
  const d = out(); state = { order: (d.clips||[]).map(c=>c.output_id) };
  const root = $("root");
  root.innerHTML = '<h1>'+esc(d.name||"Campaign")+' · '+(d.total_duration_seconds||0)+'s</h1><div class="list" id="clips"></div><div class="row" style="margin-top:12px"><button class="btn" id="save">Save order</button><button class="btn secondary" id="export">Export final video</button></div><p id="msg" class="muted"></p>';
  const wrap = $("clips");
  (d.clips||[]).forEach((c, i) => {
    const el = document.createElement("div"); el.className = "slot";
    el.innerHTML = '<div class="row"><span class="name">'+(i+1)+'. '+esc(c.label)+'</span><span class="muted">'+(c.source_duration_seconds!=null?c.source_duration_seconds+'s':'')+'</span>'+(c.enabled?'':'<span class="warn">removed</span>')+(c.muted?'<span class="muted">muted</span>':'')+'</div><div class="row"><button class="btn secondary" data-up="'+i+'">↑</button><button class="btn secondary" data-down="'+i+'">↓</button><button class="btn secondary" data-toggle="'+esc(c.output_id)+'">'+(c.enabled?'Remove':'Restore')+'</button></div>';
    wrap.appendChild(el);
  });
  wrap.querySelectorAll("button[data-up]").forEach(b => b.onclick = () => move(+b.dataset.up, -1));
  wrap.querySelectorAll("button[data-down]").forEach(b => b.onclick = () => move(+b.dataset.down, 1));
  wrap.querySelectorAll("button[data-toggle]").forEach(b => b.onclick = async () => { const c = (d.clips||[]).find(x=>x.output_id===b.dataset.toggle); await call("fuse_save_campaign_edit", { run_id: d.run_id, clips: [{ output_id: c.output_id, enabled: !c.enabled }] }); });
  $("save").onclick = async () => { $("msg").textContent = "Saving…"; try { await call("fuse_save_campaign_edit", { run_id: d.run_id, clips: state.order.map((id, order) => ({ output_id: id, order })) }); $("msg").textContent = "Saved."; } catch (e) { $("msg").textContent = "Couldn't save: "+e.message; } };
  $("export").onclick = () => say("Export the final video for run "+d.run_id+".");
}
function move(i, dir){ const j = i + dir; if (j < 0 || j >= state.order.length) return; const o = state.order; [o[i], o[j]] = [o[j], o[i]]; const d = out(); const map = new Map((d.clips||[]).map(c=>[c.output_id,c])); d.clips = o.map(id=>map.get(id)); render(); }
render(); window.addEventListener("openai:set_globals", render);`);

const PRICING = page("FUSE pricing", `<div id="root"></div>`, `
function render(){
  const d = out(); const root = $("root");
  const noOffers=!(d.plans||[]).length&&!(d.packs||[]).length&&!(d.credit_packs||[]).length;
  if(d.checkout_url&&d.pack&&!("plans" in d)&&!("packs" in d)){ showCheckout(d); return; }
  if(noOffers||!(d.plans||[]).length&&!(d.packs||[]).length&&!(d.credit_packs||[]).length){ root.innerHTML='<h1>Your account</h1>'+(d.credit_balance!=null?'<p class="name">'+d.credit_balance+' credits</p>':'')+'<p class="muted">'+esc(d.message||"FUSE runs on your existing account credits.")+'</p><a class="btn" href="'+esc(d.account_url||'https://fuse-us.com/account')+'" target="_blank" rel="noopener">Manage account</a>'; return; }
  root.innerHTML = '<h1>Plans</h1><div class="grid">'+(d.plans||[]).map(p=>'<div class="card"><div class="body"><div class="name">'+esc(p.name)+'</div><div class="orb" style="font-size:20px;color:#fff">$'+p.monthly_price_usd+'<span class="muted" style="font-size:12px">/mo</span></div><div class="muted">About '+p.approximate_campaigns_per_month+' campaigns a month</div>'+(p.key==="starter"&&d.promo_note?'<span class="pill">20% off first month</span>':'')+'</div></div>').join("")+'</div>'+
    (d.selected_template?'<p class="muted" style="margin-top:10px">'+esc(d.selected_template.slug)+': '+esc(d.selected_template.approximate_campaign_fraction)+' · '+(d.selected_template.included_in_starter?'included in Starter':'needs a bigger plan')+'</p>':'')+
    ((d.credit_packs||[]).length?'<h1 style="margin-top:16px">Credit packs</h1><div class="grid">'+d.credit_packs.map(p=>'<div class="card"><div class="body"><div class="name">'+esc(p.key.charAt(0).toUpperCase()+p.key.slice(1))+'</div><div class="orb" style="font-size:20px;color:#fff">$'+p.price_usd+'</div><div class="muted">'+Number(p.credits).toLocaleString()+' credits</div><button class="btn" data-pack="'+esc(p.key)+'">Buy</button></div></div>').join("")+'</div><p class="muted" id="buymsg"></p>':'')+
    '<p class="muted">'+esc(d.billing_note||"")+'</p><a class="btn" href="'+esc(d.pricing_url||'https://fuse-us.com/pricing')+'" target="_blank" rel="noopener">See pricing</a>';
  root.querySelectorAll("[data-pack]").forEach(b=>b.onclick=()=>buy(b.getAttribute("data-pack"), b));
}
function openUrl(href){ if(O.openExternal){ try{ O.openExternal({ href }); return; }catch(e){} } window.open(href, "_blank", "noopener"); }
function showCheckout(d){ $("root").innerHTML='<h1>'+esc(d.pack.name)+' credit pack</h1><p class="name">'+Number(d.pack.credits).toLocaleString()+' credits · $'+d.pack.price_usd+'</p><p class="muted">'+esc(d.message||"")+'</p><a class="btn" href="'+esc(d.checkout_url)+'" target="_blank" rel="noopener" id="pay">Open secure checkout</a> <a class="btn" href="'+esc(d.account_url||'https://fuse-us.com/account')+'" target="_blank" rel="noopener">Your account</a>'; }
async function buy(key, btn){
  btn.disabled = true; const m = $("buymsg"); if(m) m.textContent = "Opening checkout…";
  try { const r = await call("fuse_buy_credit_pack", { pack_key: key }); const d = (r && (r.structuredContent || r)) || {}; if(d.checkout_url){ showCheckout(d); openUrl(d.checkout_url); } else throw new Error("No checkout link returned"); }
  catch(e){ btn.disabled = false; if(m) m.textContent = "Could not open checkout. Ask: buy the "+key+" credit pack."; }
}
render(); window.addEventListener("openai:set_globals", render);`);

const CREDITS = page("FUSE credits", `<div id="root"></div>`, `
function render(){
  const d = out(); const root = $("root");
  root.innerHTML = '<h1>Your plan</h1><div class="list"><div class="slot"><span class="muted">Plan</span><br><span class="name">'+esc(d.plan||"free")+'</span></div><div class="slot"><span class="muted">Credits</span><br><span class="name">'+(d.credit_balance||0)+'</span>'+(d.approximate_campaigns_per_month?'<span class="muted"> · about '+d.approximate_campaigns_per_month+' campaigns a month</span>':'')+'</div>'+
    (d.template_slug?'<div class="slot"><span class="muted">'+esc(d.template_slug)+'</span><br><span class="'+(d.can_run?'ok':'bad')+'">'+(d.can_run?'You can run this campaign':'Short by '+d.missing_credits+' credits')+'</span></div>':'')+'</div>'+
    (d.upgrade_required&&((d.plans||[]).length||(d.packs||[]).length)?'<a class="btn" href="https://fuse-us.com/pricing" target="_blank" rel="noopener">See plans</a>':'<a class="btn" href="https://fuse-us.com/account" target="_blank" rel="noopener">Manage account</a>');
}
render(); window.addEventListener("openai:set_globals", render);`);

const GENERATION = page("FUSE generation", `<div id="root"></div>`, `
let timer = null; let current = null;
function stop(){ if (timer) { clearTimeout(timer); timer = null; } }
function modelLine(d){ return esc(d.model_label || d.model || d.provider_model || ""); }
function renderModels(d){
  const card = (m, kind) => '<div class="card"><div class="body"><div class="name">'+esc(m.label)+(m.is_default?' <span class="pill">default</span>':'')+'</div><div class="muted">'+esc(m.key)+'</div>'+
    (kind==="image" ? '<div class="muted">'+esc(m.param_kind)+': '+esc((m.options||[]).join(", "))+' · default '+esc(m.default_option)+'</div><div class="muted">≈ '+m.approx_credits_per_image+' credits / image</div>'
      : '<div class="muted">'+(m.durations&&m.durations.length?m.durations[0]+'–'+m.durations[m.durations.length-1]+'s':'')+(m.resolutions?' · '+esc(m.resolutions.join("/")):'')+(m.fixed_aspect?' · '+esc(m.fixed_aspect):(m.aspect_ratios?' · '+esc(m.aspect_ratios.join(" ")):''))+(m.supports_audio?' · audio':'')+'</div><div class="muted">≈ '+m.approx_credits_per_5s+' credits / 5s</div>')+
    '<button class="btn" data-label="'+esc(m.label)+'">Use this model</button></div></div>';
  $("root").innerHTML = '<h1>Image models</h1><div class="grid">'+(d.image_models||[]).map(m=>card(m,"image")).join("")+'</div><h1 style="margin-top:14px">Video models</h1><div class="grid">'+(d.video_models||[]).map(m=>card(m,"video")).join("")+'</div>';
  $("root").querySelectorAll("button[data-label]").forEach(b => b.onclick = () => say("Generate with "+b.dataset.label));
}
function renderPrepare(d){
  $("root").innerHTML = '<h1>Ready to generate?</h1><div class="list">'+
    '<div class="slot"><span class="muted">Prompt</span><br><span class="name">'+esc(d.prompt)+'</span></div>'+
    '<div class="slot"><span class="muted">Model</span><br><span class="name">'+modelLine(d)+'</span> <span class="muted">· '+esc(d.kind)+'</span></div>'+
    '<div class="slot"><span class="muted">Credits</span><br><span class="name">≈ '+(d.estimated_credits||0)+'</span> <span class="'+(d.can_run?'muted':'bad')+'">· balance '+(d.credit_balance||0)+'</span></div>'+
    '</div><button class="btn" id="go" '+(d.can_run?'':'disabled')+'>Generate</button>'
    + '<p class="muted" id="msg"></p>';
  const go = $("go"); go.onclick = () => startGen(d, go);
}
async function startGen(d, btn){
  btn.disabled = true; btn.textContent = "Starting…"; $("msg").textContent = "";
  let r = null;
  try {
    r = await call(d.kind === "video" ? "fuse_generate_video" : "fuse_generate_image", { prompt: d.prompt, model: d.model || undefined, confirmation_token: d.confirmation_token });
    if (!r || r.isError) throw null;
    const g = r.structuredContent || r;
    current = Object.assign({}, g, { prompt: g.prompt || d.prompt, kind: g.kind || d.kind, model_label: d.model_label || g.model_label });
    renderGen(current);
  } catch (e) {
    const c = r && r.content; btn.disabled = false; btn.textContent = "Generate";
    $("msg").textContent = (Array.isArray(c) && c.length) ? c.map(x => x && x.text || "").join(" ").trim() : ((e && e.message) || "Couldn't start the generation.");
  }
}
function renderGen(d){
  const st = String(d.status||"queued"); const pending = st==="queued"||st==="running";
  const isVideo = d.output_type==="video" || d.kind==="video";
  let media = "";
  if (st==="complete" || st==="completed" || st==="succeeded") {
    const url = d.output_url || d.preview_url;
    if (url) media = isVideo ? '<video src="'+esc(url)+'" '+(d.poster_url?'poster="'+esc(d.poster_url)+'"':'')+' controls autoplay muted loop playsinline style="width:100%;border-radius:14px;max-height:520px;background:#000"></video>' : '<img src="'+esc(url)+'" alt="" style="width:100%;border-radius:14px">';
    media += '<div class="row" style="margin-top:10px">'+(url?'<a class="btn secondary" href="'+esc(url)+'" target="_blank" rel="noopener" download>Download</a>':'')+'<button class="btn" id="again">Generate another</button></div>';
  } else if (st==="failed") {
    media = '<p class="bad">'+esc(d.public_failure||"This generation failed. You were not charged.")+'</p>';
  } else {
    media = '<div class="empty">'+(isVideo?'Rendering your clip…':'Creating your image…')+'</div>';
  }
  $("root").innerHTML = '<h1>'+(isVideo?'Video':'Image')+'</h1>'+(d.prompt?'<p class="muted">'+esc(d.prompt)+'</p>':'')+
    '<div class="row" style="margin-bottom:10px">'+(modelLine(d)?'<span class="muted">'+modelLine(d)+'</span>':'')+'<span class="pill">'+esc(st)+'</span></div>'+media;
  const a = $("again"); if (a) a.onclick = () => say("Generate another "+(isVideo?"video":"image")+" like this");
  stop();
  if (pending && d.generation_id) timer = setTimeout(async () => {
    try {
      const r = await call("fuse_get_generation_status", { generation_id: d.generation_id });
      const next = (r && (r.structuredContent || r)) || {};
      current = Object.assign({}, current, next, { prompt: next.prompt || current.prompt, model_label: current.model_label });
      renderGen(current);
    } catch (e) { renderGen(current); }
  }, 8000);
}
function render(){
  const d = out(); current = Object.assign({}, d);
  if (d.image_models || d.video_models) return renderModels(d);
  if (d.confirmation_token && !d.generation_id) return renderPrepare(d);
  if (d.generation_id) return renderGen(current);
  $("root").innerHTML = '<div class="empty">Nothing to show yet.</div>';
}
render(); window.addEventListener("openai:set_globals", render);`);

export const WIDGET_VERSION = "v3";
export const widgetUri = (name: string) => `ui://fuse/${name}.${WIDGET_VERSION}.html`;
/** Old unversioned URI (ui://fuse/<name>.html) -> current versioned URI, so old chats still resolve. */
export const legacyWidgetUri = (uri: string): string | null => {
  const m = uri.match(/^ui:\/\/fuse\/([a-z0-9-]+)\.html$/);
  return m ? widgetUri(m[1]) : null;
};
export const WIDGETS: Record<string, { name: string; description: string; html: string }> = {
  [widgetUri("template-search")]: { name: "Template search", description: "Campaign template cards with previews and a Use this campaign action.", html: TEMPLATE_SEARCH },
  [widgetUri("template-detail")]: { name: "Template detail", description: "What you upload, what you get, plan inclusion, prepare action.", html: TEMPLATE_DETAIL },
  [widgetUri("upload")]: { name: "Upload", description: "Upload slots with file pickers that attach directly to the campaign draft.", html: UPLOAD },
  [widgetUri("confirm-run")]: { name: "Run confirmation", description: "Campaign, uploads, outputs, credits and the confirm action.", html: CONFIRM_RUN },
  [widgetUri("run-status")]: { name: "Run status", description: "Progress, stage, output counts and previews.", html: RUN_STATUS },
  [widgetUri("output-gallery")]: { name: "Output gallery", description: "Generated images and clips with download links; campaign history.", html: OUTPUT_GALLERY },
  [widgetUri("editor")]: { name: "Campaign editor", description: "Clip order, remove/restore, save and export.", html: EDITOR },
  [widgetUri("pricing")]: { name: "Pricing", description: "Plans, credit packs and pack checkout.", html: PRICING },
  [widgetUri("credits")]: { name: "Credits", description: "Plan, balance and affordability.", html: CREDITS },
  [widgetUri("generation")]: { name: "Generation", description: "Image/video generation: confirm, live status, inline result and model picker.", html: GENERATION },
};

export const WIDGET_CSP = {
  connectDomains: ["https://ykrrwgkxgidoavtzcumk.supabase.co", "https://fuse-us.com"],
  resourceDomains: ["https://ykrrwgkxgidoavtzcumk.supabase.co", "https://fuse-us.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
};
