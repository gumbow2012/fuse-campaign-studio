import asyncio, base64, json, sys
from pathlib import Path
from playwright.async_api import async_playwright
FX = Path(__file__).parent / "fx"
CUTS=[0,43,72,109,147,189,223,265,340,370,414,493,645]
SHORT = len(sys.argv) > 1 and sys.argv[1] == "short"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, executable_path="/bin/chromium")
        page = await (await b.new_context(viewport={"width":1280,"height":1800})).new_page()
        async def fx(route):
            name = route.request.url.split("/__fx/")[1]
            await route.fulfill(body=(FX/name).read_bytes(), headers={"access-control-allow-origin":"*"})
        await page.route("**/__fx/**", fx)
        await page.goto("http://localhost:8080/__fx/still.png")
        segs=[]
        for i in range(12):
            sid=f"shot_{i+1:02d}"
            kind = "logo_hold" if i==11 else ("logo_composite" if i==5 else "generated")
            src = "still.png" if i==11 else ("short.mp4" if SHORT and i==7 else f"clip{i+1}.mp4")
            segs.append({"shot_id":sid,"kind":kind,"frames":CUTS[i+1]-CUTS[i],"start_frame":CUTS[i],"source_url":f"http://localhost:8080/__fx/{src}","source_type":"image" if i==11 else "video","logo_overlay":kind!="generated"})
        res = await page.evaluate("""async (segs) => {
          const caps = {ve: typeof VideoEncoder, ae: typeof AudioEncoder,
            h264: (await VideoEncoder.isConfigSupported({codec:'avc1.640028',width:1080,height:1920,framerate:30,bitrate:1e7})).supported,
            aac: typeof AudioEncoder!=='undefined' && (await AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:48000,numberOfChannels:2,bitrate:192000})).supported};
          const w = new Worker('/src/workers/hatFilm.worker.ts', {type:'module'});
          const out = await new Promise((res) => { w.onmessage = (e) => { if (e.data.type!=='progress') res(e.data); }; w.onerror=(e)=>res({type:'error',message:e.message});
            w.postMessage({type:'assemble',jobId:'t',segments:segs,logoUrl:'http://localhost:8080/__fx/logo.png',soundtrackUrl:'http://localhost:8080/__fx/soundtrack.m4a'}); });
          if (out.type!=='done') return {caps, error: out.message};
          const u8 = new Uint8Array(out.buffer); let s=''; for (let i=0;i<u8.length;i+=32768) s+=String.fromCharCode(...u8.subarray(i,i+32768));
          return {caps, probe: out.probe, b64: btoa(s)};
        }""", segs)
        if "b64" in res:
            (FX/"out.mp4").write_bytes(base64.b64decode(res.pop("b64")))
        print(json.dumps(res))
        await b.close()
asyncio.run(main())
