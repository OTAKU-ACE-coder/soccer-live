import { readFile, writeFile } from "node:fs/promises";
import { additionalPortraits } from "../football-media.js";
const root = new URL("../",import.meta.url);
const manifest=JSON.parse(await readFile(new URL("player-local-portraits.json",root),"utf8"));
const search=await(await fetch("https://site.web.api.espn.com/apis/search/v2?query=Ronaldo&type=player&limit=100")).json();
const ids=[...new Set([...Object.keys(manifest),...search.results.flatMap(g=>g.contents).filter(p=>p.sport==="soccer").map(p=>/~a:(\d+)$/.exec(p.uid)?.[1]).filter(Boolean),"103173","11001","17566","20128","45931","101390","77653","84775"])];
let at=0,recovered=0;
const remaining=[];
async function run(){
 while(at<ids.length){
  const id=ids[at++];
  if(id==="22774"||id==="45843")continue;
  try{
   const response=await fetch("https://site.web.api.espn.com/apis/common/v3/sports/soccer/all/athletes/"+id,{signal:AbortSignal.timeout(6000)});
   const player=(await response.json()).athlete;
   if(!player)continue;
   const sources=await additionalPortraits(player);
   let saved=false;
   for(const source of sources){
    const image=await fetch(source,{signal:AbortSignal.timeout(6000)});
    const type=image.headers.get("content-type")||"";
    if(!image.ok||!/^image\/(?:png|jpeg|webp)/.test(type))continue;
    const data=Buffer.from(await image.arrayBuffer());
    const extension=type.includes("png")?"png":type.includes("webp")?"webp":"jpg";
    const file="assets/players/"+id+"-portrait."+extension;
    await writeFile(new URL(file,root),data);
    manifest[id]=file;saved=true;recovered++;break;
   }
   if(!saved&&!manifest[id])remaining.push({id,name:player.displayName});
  }catch{}
 }
}
await Promise.all(Array.from({length:4},run));
await writeFile(new URL("player-local-portraits.json",root),JSON.stringify(manifest,null,2)+"\n");
console.log(JSON.stringify({checked:ids.length,recovered,missing:remaining}));
