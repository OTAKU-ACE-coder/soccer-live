import {readFile,writeFile} from "node:fs/promises";
import {wikipediaPortrait} from "../football-media.js";
const root=new URL("../",import.meta.url);
const manifest=JSON.parse(await readFile(new URL("player-local-portraits.json",root),"utf8"));
const ids=["103173","11001","17566","20128","45931","101390","77653","84775","88228","186309","329033","256627","292141"];
const found=[], missing=[];
for(const id of ids) {
 try{
  const a=(await(await fetch("https://site.web.api.espn.com/apis/common/v3/sports/soccer/all/athletes/"+id,{signal:AbortSignal.timeout(6000)})).json()).athlete;
  const src=await wikipediaPortrait(a);
  if(!src){missing.push(a.displayName);continue;}
  const r=await fetch(src,{signal:AbortSignal.timeout(6000)});
  if(!r.ok||!r.headers.get("content-type")?.startsWith("image/")){missing.push(a.displayName);continue;}
  const ext=r.headers.get("content-type").includes("png")?"png":"jpg";
  const file="assets/players/"+id+"-portrait."+ext;
  await writeFile(new URL(file,root),Buffer.from(await r.arrayBuffer()));
  manifest[id]=file;
  found.push({id,name:a.displayName,source:src});
 }catch{}
}
await writeFile(new URL("player-local-portraits.json",root),JSON.stringify(manifest,null,2)+"\n");
await writeFile(new URL("assets/players/photo-sources.json",root),JSON.stringify(found,null,2)+"\n");
console.log(JSON.stringify({found,missing}));
