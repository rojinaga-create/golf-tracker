import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

// ------------------------------------------------------------
// STORAGE ADAPTER (works on mobile + desktop)
// ------------------------------------------------------------
const storage = {
 async get(key, shared) {
 // Try window.storage first (Claude desktop)
 if (typeof window.storage !== 'undefined') {
 try {
 const result = await window.storage.get(key, shared);
 return result;
 } catch (e) {
 console.log("window.storage.get failed, falling back to localStorage:", e.message);
 }
 }
 // Fallback to localStorage (mobile, browsers)
 try {
 const value = localStorage.getItem(key);
 return value ? { key, value, shared } : null;
 } catch (e) {
 console.error("localStorage.get failed:", e);
 return null;
 }
 },

 async set(key, value, shared) {
 // Try window.storage first (Claude desktop)
 if (typeof window.storage !== 'undefined') {
 try {
 await window.storage.set(key, value, shared);
 return true;
 } catch (e) {
 console.log("window.storage.set failed, falling back to localStorage:", e.message);
 }
 }
 // Fallback to localStorage (mobile, browsers)
 try {
 localStorage.setItem(key, value);
 return true;
 } catch (e) {
 console.error("localStorage.set failed:", e);
 return false;
 }
 }
};

// ------------------------------------------------------------
// CONSTANTS
// ------------------------------------------------------------
const G = {
 deep:"#0D2B1F", dark:"#1A3C2E", mid:"#2D6A4F", bright:"#52B788",
 gold:"#C9A84C", goldPale:"#FEF9E7", red:"#C0392B",
 cream:"#FAFAF7", muted:"#6B7280", border:"#E0E8E0", lite:"#F4F9F5",
};
const HOLES = Array.from({length:18},(_,i)=>i);
const H9 = HOLES.slice(0,9), B9 = HOLES.slice(9);
const LIB_KEY = "golf_library_v14";
const ROUND_KEY = "golf_round_v14";
const ARCHIVE_KEY = "golf_archive_v14";
const TEE_COLORS = ["#1565C0","#F9A825","#CCCCCC","#C62828","#2E7D32","#212121","#8D6E63","#7B1FA2"];

// ------------------------------------------------------------
// GAME FORMATS
// ------------------------------------------------------------
const GAME_FORMATS = [
 { id:"stroke_net", name:"Stroke Play Net", icon:" ", desc:"Lowest net score wins (gross minus course handicap)" },
 { id:"stroke_gross", name:"Stroke Play Gross", icon:" ", desc:"Lowest gross score wins no handicap applied" },
 { id:"stableford", name:"Stableford", icon:" ", desc:"Points per hole: Eagle=4, Birdie=3, Par=2, Bogey=1, Dbl+=0" },
 { id:"match", name:"Round Robin Match Play", icon:"vs", desc:"Head-to-head match play; all player pairs compete" },
 { id:"skins", name:"Skins", icon:" deg", desc:"Win a skin on each hole; ties carry over to next hole" },
 { id:"nassau", name:"Nassau", icon:" ", desc:"Three separate bets: Front 9, Back 9, and Overall 18" },
 { id:"bingo_bango_bongo", name:"Bingo Bango Bongo", icon:" ", desc:"3 points per hole: first on green, closest to pin, first in hole" },
 { id:"wolf", name:"Wolf", icon:" ", desc:"Rotating selector picks partner (or goes alone) each hole" },
 { id:"scramble", name:"Scramble", icon:" ", desc:"Team format all play from best shot each stroke" },
 { id:"chapman", name:"Chapman / Pinehurst", icon:" ", desc:"Partners swap after drive, choose best 2nd, then alternate" },
 { id:"four_ball", name:"Four-Ball Better Ball", icon:" ", desc:"Partners play own ball; team score = best ball each hole" },
 { id:"greenies", name:"Greenies + Sandies", icon:" ", desc:"Bonus points: hit green in regulation (greenie) or save par from sand (sandie)" },
];

// ------------------------------------------------------------
// DEFAULT LIBRARY DATA
// ------------------------------------------------------------
const DEF_LIBRARY = {
 roster: [
 {id:1, name:"Robert", hcpIdx:5.5, active:true, defaultTee:"white"},
 {id:2, name:"Greg Siemer", hcpIdx:6.2, active:true, defaultTee:"white"},
 {id:3, name:"Dennis Kim", hcpIdx:6.9, active:true, defaultTee:"white"},
 {id:4, name:"Mike Leiby", hcpIdx:8.5, active:true, defaultTee:"white"},
 {id:5, name:"Julio", hcpIdx:6.0, active:false, defaultTee:"white"},
 {id:6, name:"Hector", hcpIdx:6.0, active:false, defaultTee:"white"},
 {id:7, name:"Hector Sr", hcpIdx:12.0, active:false, defaultTee:"white"},
 {id:8, name:"Carlos", hcpIdx:6.0, active:false, defaultTee:"white"},
 ],
 courses: [
 // San Diego Country Club
 {
 id:"san_diego_cc", name:"San Diego Country Club", active:false,
 tees:[
 { id:"black", name:"Black", color:"#212121", rating:74.5, slope:135, par:72,
 pars:[4,5,3,4,4,3,4,5,4, 4,3,4,3,5,4,5,4,4],
 si:[11,9,15,1,7,17,13,5,3, 12,18,8,16,10,12,6,14,4] },
 { id:"blue", name:"Blue", color:"#1565C0", rating:72.8, slope:131, par:72,
 pars:[4,5,3,4,4,3,4,5,4, 4,3,4,3,5,4,5,4,4],
 si:[11,9,15,1,7,17,13,5,3, 12,18,8,16,10,12,6,14,4] },
 { id:"white", name:"White", color:"#CCCCCC", rating:71.1, slope:128, par:72,
 pars:[4,5,3,4,4,3,4,5,4, 4,3,4,3,5,4,5,4,4],
 si:[11,9,15,1,7,17,13,5,3, 12,18,8,16,10,12,6,14,4] },
 ]
 },
 // Coronado Golf Course
 {
 id:"coronado_gc", name:"Coronado Golf Course", active:false,
 tees:[
 { id:"blue", name:"Blue", color:"#1565C0", rating:72.9, slope:142, par:72,
 pars:[4,5,4,5,3,4,4,3,4, 4,3,4,5,4,3,4,4,5],
 si:[5,15,9,1,17,7,11,13,3, 6,18,2,8,12,10,4,14,16] },
 { id:"white", name:"White", color:"#CCCCCC", rating:70.5, slope:118, par:72,
 pars:[4,5,4,5,3,4,4,3,4, 4,3,4,5,4,3,4,4,5],
 si:[5,15,9,1,17,7,11,13,3, 6,18,2,8,12,10,4,14,16] },
 { id:"gold", name:"Gold", color:"#FFD700", rating:67.5, slope:115, par:72,
 pars:[4,5,4,5,3,4,4,3,4, 4,3,4,5,4,3,4,4,5],
 si:[5,15,9,1,17,7,11,13,3, 6,18,2,8,12,10,4,14,16] },
 ]
 },
 // Fairbanks Ranch - Valley/Lakes
 {
 id:"fairbanks_vl", name:"Fairbanks Ranch - Valley/Lakes", active:true,
 tees:[
 { id:"black", name:"Black", color:"#212121", rating:74.6, slope:133, par:72,
 pars:[5,4,5,4,4,3,4,3,4, 4,4,3,5,5,4,3,4,4],
 si:[9,13,16,8,7,17,18,15,11, 11,1,13,5,15,3,2,6,4] },
 { id:"white", name:"White", color:"#CCCCCC", rating:71.4, slope:125, par:72,
 pars:[5,4,5,4,4,3,4,3,4, 4,4,3,5,5,4,3,4,4],
 si:[9,13,16,8,7,17,18,15,11, 11,1,13,5,15,3,2,6,4] },
 { id:"green", name:"Green", color:"#2E7D32", rating:66.6, slope:116, par:72,
 pars:[5,4,5,4,4,3,4,3,4, 4,4,3,5,5,4,3,4,4],
 si:[9,13,16,8,7,17,18,15,11, 11,1,13,5,15,3,2,6,4] },
 ]
 },
 // Fairbanks Ranch - Lakes/Ocean
 {
 id:"fairbanks_lo", name:"Fairbanks Ranch - Lakes/Ocean", active:false,
 tees:[
 { id:"black", name:"Black", color:"#212121", rating:74.2, slope:131, par:72,
 pars:[4,4,3,5,5,4,3,4,4, 4,5,4,4,3,4,5,3,4],
 si:[11,1,13,5,15,3,2,6,4, 7,15,9,11,17,5,13,18,3] },
 { id:"white", name:"White", color:"#CCCCCC", rating:71.0, slope:123, par:72,
 pars:[4,4,3,5,5,4,3,4,4, 4,5,4,4,3,4,5,3,4],
 si:[11,1,13,5,15,3,2,6,4, 7,15,9,11,17,5,13,18,3] },
 ]
 },
 // Fairbanks Ranch - Ocean/Valley
 {
 id:"fairbanks_ov", name:"Fairbanks Ranch - Ocean/Valley", active:false,
 tees:[
 { id:"black", name:"Black", color:"#212121", rating:74.4, slope:132, par:72,
 pars:[4,5,4,4,3,4,5,3,4, 5,4,5,4,4,3,4,3,4],
 si:[7,15,9,11,17,5,13,18,3, 9,13,16,8,7,17,18,15,11] },
 { id:"white", name:"White", color:"#CCCCCC", rating:71.2, slope:124, par:72,
 pars:[4,5,4,4,3,4,5,3,4, 5,4,5,4,4,3,4,3,4],
 si:[7,15,9,11,17,5,13,18,3, 9,13,16,8,7,17,18,15,11] },
 ]
 },
 // Torrey Pines - South
 {
 id:"torrey_south", name:"Torrey Pines - South Course", active:false,
 tees:[
 { id:"black", name:"Black", color:"#212121", rating:77.0, slope:147, par:72,
 pars:[4,4,3,4,4,3,5,4,4, 4,3,5,4,5,4,3,4,5],
 si:[11,7,15,5,9,17,1,13,3, 8,18,4,10,2,12,16,14,6] },
 { id:"blue", name:"Blue", color:"#1565C0", rating:74.5, slope:139, par:72,
 pars:[4,4,3,4,4,3,5,4,4, 4,3,5,4,5,4,3,4,5],
 si:[11,7,15,5,9,17,1,13,3, 8,18,4,10,2,12,16,14,6] },
 { id:"white", name:"White", color:"#CCCCCC", rating:72.1, slope:132, par:72,
 pars:[4,4,3,4,4,3,5,4,4, 4,3,5,4,5,4,3,4,5],
 si:[11,7,15,5,9,17,1,13,3, 8,18,4,10,2,12,16,14,6] },
 ]
 },
 // Torrey Pines - North
 {
 id:"torrey_north", name:"Torrey Pines - North Course", active:false,
 tees:[
 { id:"blue", name:"Blue", color:"#1565C0", rating:73.0, slope:130, par:72,
 pars:[4,5,3,4,4,4,5,3,4, 4,4,3,5,4,4,4,3,5],
 si:[7,3,15,9,5,11,1,17,13, 10,8,18,2,14,6,12,16,4] },
 { id:"white", name:"White", color:"#CCCCCC", rating:70.5, slope:124, par:72,
 pars:[4,5,3,4,4,4,5,3,4, 4,4,3,5,4,4,4,3,5],
 si:[7,3,15,9,5,11,1,17,13, 10,8,18,2,14,6,12,16,4] },
 ]
 },
 // Tijuana Country Club
 {
 id:"tijuana_cc", name:"Tijuana Country Club", active:false,
 tees:[
 { id:"blue", name:"Blue", color:"#1565C0", rating:72.1, slope:127, par:72,
 pars:[5,3,4,4,4,3,4,4,5, 4,4,3,4,4,4,5,5,3],
 si:[7,11,5,15,1,9,13,17,3, 8,2,18,10,6,14,4,16,12] },
 { id:"white", name:"White", color:"#CCCCCC", rating:70.5, slope:123, par:72,
 pars:[5,3,4,4,4,3,4,4,5, 4,4,3,4,4,4,5,5,3],
 si:[7,11,5,15,1,9,13,17,3, 8,2,18,10,6,14,4,16,12] },
 { id:"gold", name:"Gold", color:"#FFD700", rating:67.0, slope:118, par:72,
 pars:[5,3,4,4,4,3,4,4,5, 4,4,3,4,4,4,5,5,3],
 si:[7,11,5,15,1,9,13,17,3, 8,2,18,10,6,14,4,16,12] },
 ]
 },
 // Coronado Municipal Golf Course
 {
 id:"coronado_muni", name:"Coronado Municipal GC", active:false,
 tees:[
 { id:"blue", name:"Blue", color:"#1565C0", rating:71.9, slope:122, par:72,
 pars:[4,5,4,5,3,4,4,4,3, 4,3,4,5,4,3,4,4,5],
 si:[7,9,13,1,17,11,3,5,15, 12,18,14,2,8,16,4,6,10] },
 { id:"white", name:"White", color:"#CCCCCC", rating:70.5, slope:118, par:72,
 pars:[4,5,4,5,3,4,4,4,3, 4,3,4,5,4,3,4,4,5],
 si:[7,9,13,1,17,11,3,5,15, 12,18,14,2,8,16,4,6,10] },
 { id:"gold", name:"Gold", color:"#FFD700", rating:67.5, slope:112, par:72,
 pars:[4,5,4,5,3,4,4,4,3, 4,3,4,5,4,3,4,4,5],
 si:[7,9,13,1,17,11,3,5,15, 12,18,14,2,8,16,4,6,10] },
 ]
 },
 // Red Hawk Ridge Golf Course - Castle Rock, CO
 {
 id:"red_hawk_ridge", name:"Red Hawk Ridge Golf Course", active:false,
 tees:[
 { id:"black", name:"Black", color:"#212121", rating:71.8, slope:137, par:72,
 pars:[5,4,4,4,3,4,4,3,4, 4,4,3,4,5,3,4,5,5],
 si:[5,7,11,13,17,9,1,15,3, 12,8,18,4,2,16,10,6,14] },
 { id:"gold", name:"Gold", color:"#FFD700", rating:69.1, slope:129, par:72,
 pars:[5,4,4,4,3,4,4,3,4, 4,4,3,4,5,3,4,5,5],
 si:[5,7,11,13,17,9,1,15,3, 12,8,18,4,2,16,10,6,14] },
 { id:"blue", name:"Blue", color:"#1565C0", rating:66.9, slope:121, par:72,
 pars:[5,4,4,4,3,4,4,3,4, 4,4,3,4,5,3,4,5,5],
 si:[5,7,11,13,17,9,1,15,3, 12,8,18,4,2,16,10,6,14] },
 { id:"white", name:"White", color:"#CCCCCC", rating:64.9, slope:107, par:72,
 pars:[5,4,4,4,3,4,4,3,4, 4,4,3,4,5,3,4,5,5],
 si:[5,7,11,13,17,9,1,15,3, 12,8,18,4,2,16,10,6,14] },
 ]
 },
 ]
};

const DEF_ROUND = {
 name: "Saturday Round",
 date: new Date().toISOString().split("T")[0],
 gameFormat: "stroke_net", // legacy single (kept for compat)
 activeGames: ["stroke_net"], // multi-game array
 playerTees: {},
 scores: {},
};

// ------------------------------------------------------------
// MATH
// ------------------------------------------------------------
const getTee = (tees,id) => tees.find(t=>t.id===id) || tees[0];
const courseHcp = (idx,tee) => Math.round(idx*(tee.slope/113)+(tee.rating-tee.par));
const strokesOnHole = (ch,minCH,si) => { const x=ch-minCH; return Math.floor(x/18)+(si<=(x%18)?1:0); };
const holeGross = (gs,i) => (gs["h"+i]!=null&&gs["h"+i]!=="") ? +gs["h"+i] : null;
const holePutts = (gs,i) => (gs["p"+i]!=null&&gs["p"+i]!=="") ? +gs["p"+i] : null;
const calcGross = gs => { let t=0,c=0; HOLES.forEach(i=>{const v=holeGross(gs,i);if(v!=null){t+=v;c++;}}); return c===18?t:null; };
const calcGrossRunning = gs => { let t=0,c=0; HOLES.forEach(i=>{const v=holeGross(gs,i);if(v!=null){t+=v;c++;}}); return c>0?t:null; }; // Running total
const calcNetRunning = (gs,tee,ch) => { 
 let t=0,c=0; 
 HOLES.forEach(i=>{
  const g=holeGross(gs,i);
  if(g!=null){
   const strokes=Math.floor(ch/18)+(tee.si[i]<=(ch%18)?1:0);
   t+=(g-strokes);
   c++;
  }
 }); 
 return c>0?t:null; 
};
const calcSeg = (gs,r) => { let t=0,c=0; r.forEach(i=>{const v=holeGross(gs,i);if(v!=null){t+=v;c++;}}); return c===r.length?t:null; };
const calcPutts = gs => { let t=0,c=0; HOLES.forEach(i=>{const v=holePutts(gs,i);if(v!=null){t+=v;c++;}}); return c>0?t:null; };
const calcSbf = (gs,tee,ch) => {
 let p=0;
 HOLES.forEach(i=>{const g=holeGross(gs,i);if(g==null)return;const b=Math.floor(ch/18)+(tee.si[i]<=(ch%18)?1:0);const d=g-tee.pars[i]-b;p+=d<=-2?4:d===-1?3:d===0?2:d===1?1:0;});
 return p;
};
const scoreStyle = (val,par) => {
 if(val==null||val==="")return{background:"#F0F0F0",color:"#bbb"};
 const d=+val-par;
 if(d<=-2)return{background:"#1A3C2E",color:"#fff"};
 if(d===-1)return{background:"#2D6A4F",color:"#fff"};
 if(d===0) return{background:"#52B788",color:"#fff"};
 if(d===1) return{background:"#FFD166",color:"#333"};
 if(d===2) return{background:"#EF476F",color:"#fff"};
 return{background:"#9B1D35",color:"#fff"};
};
const isLight = hex => { const c=hex.replace("#",""); const r=parseInt(c.substr(0,2),16),g=parseInt(c.substr(2,2),16),b=parseInt(c.substr(4,2),16); return(r*299+g*587+b*114)/1000>155; };

// ------------------------------------------------------------
// TEXT SCORECARD FOR WHATSAPP
// ------------------------------------------------------------
function generateTextScorecard(round, library) {
 const course = library.courses.find(c=>c.active) || library.courses[0];
 const activePlayers = buildActivePlayers(library, round);
 
 if (activePlayers.length === 0) return "No active players in this round.";

 let text = `⛳ ${round.name}\n📅 ${round.date}\n🏌️ ${course.name}\n\n`;
 text += `━━━━ SCORECARD ━━━━\n\n`;
 
 // Player summaries
 activePlayers.forEach(pl => {
 const tee = getTee(course.tees, pl.teeId);
 const ch = courseHcp(pl.hcpIdx, tee);
 const gs = round.scores[pl.id] || {};
 const gross = calcGrossRunning(gs);
 const net = calcNetRunning(gs, tee, ch);
 const putts = calcPutts(gs);
 
 let parForHolesPlayed = 0;
 HOLES.forEach(i => { if (holeGross(gs, i) != null) parForHolesPlayed += tee.pars[i]; });
 const toPar = gross != null ? gross - parForHolesPlayed : null;
 const toParStr = toPar === null ? '' : toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `${toPar}`;
 
 text += `👤 ${pl.name} (${tee.name})\n`;
 text += `   Gross: ${gross ?? '-'} ${toParStr ? `(${toParStr})` : ''}\n`;
 text += `   Net: ${net ?? '-'}  Putts: ${putts ?? '-'}\n`;
 text += `   HCP: ${pl.hcpIdx} → CH: ${ch}\n\n`;
 });
 
 text += `━━━━ HOLE BY HOLE ━━━━\n\nOUT:`;
 for (let i = 1; i <= 9; i++) text += ` ${i}`.padStart(3);
 text += ` |Tot\nPar:`;
 const baseTee = course.tees[0];
 H9.forEach(i => text += ` ${baseTee.pars[i]}`.padStart(3));
 text += ` | ${H9.reduce((s, i) => s + baseTee.pars[i], 0)}\n`;
 
 activePlayers.forEach(pl => {
 const gs = round.scores[pl.id] || {};
 text += `${pl.name.substring(0,3).toUpperCase()}:`;
 H9.forEach(i => {
 const score = holeGross(gs, i);
 text += score != null ? ` ${score}`.padStart(3) : '  -';
 });
 text += ` | ${calcSeg(gs, H9) ?? '-'}\n`;
 });
 
 text += `\n IN:`;
 for (let i = 10; i <= 18; i++) text += ` ${i}`.padStart(3);
 text += ` |Tot\nPar:`;
 B9.forEach(i => text += ` ${baseTee.pars[i]}`.padStart(3));
 text += ` | ${B9.reduce((s, i) => s + baseTee.pars[i], 0)}\n`;
 
 activePlayers.forEach(pl => {
 const gs = round.scores[pl.id] || {};
 text += `${pl.name.substring(0,3).toUpperCase()}:`;
 B9.forEach(i => {
 const score = holeGross(gs, i);
 text += score != null ? ` ${score}`.padStart(3) : '  -';
 });
 text += ` | ${calcSeg(gs, B9) ?? '-'}\n`;
 });
 
 text += `\n━━━━━━━━━━━━━━━━\nGolf Tracker v19`;
 return text;
}

// Round Robin
function exportRoundToExcel(round, library) {
 const course = library.courses.find(c=>c.active) || library.courses[0];
 const activePlayers = library.roster.filter(p=>p.active).map(p=>({
 ...p, teeId: round.playerTees[p.id] || p.defaultTee
 }));
 const gameFmt = GAME_FORMATS.find(g=>g.id===round.gameFormat) || GAME_FORMATS[0];

 const wb = XLSX.utils.book_new();

 // ------------------------------------------------------------ Sheet 1: Round Summary ------------------------------------------------------------
 const summaryData = [];
 summaryData.push(["Golf Round Archive"]);
 summaryData.push(["Round Name", round.name]);
 summaryData.push(["Date", round.date]);
 summaryData.push(["Course", course.name]);
 summaryData.push(["Game Format", `${gameFmt.icon} ${gameFmt.name}`]);
 summaryData.push([]);
 summaryData.push(["Player","Tee","HCP Index","Course HCP","Front 9","Back 9","Gross","Net","Stableford Pts","Total Putts"]);

 activePlayers.forEach(pl=>{
 const tee = getTee(course.tees, pl.teeId);
 const ch = courseHcp(pl.hcpIdx, tee);
 const gs = round.scores[pl.id] || {};
 const gross = calcGross(gs);
 const net = gross != null ? gross - ch : null;
 summaryData.push([
 pl.name, tee.name, pl.hcpIdx, ch,
 calcSeg(gs,H9)??'', calcSeg(gs,B9)??'',
 gross??'', net??'', calcSbf(gs,tee,ch), calcPutts(gs)??''
 ]);
 });

 const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
 wsSummary['!cols'] = [{wch:22},{wch:10},{wch:12},{wch:13},{wch:10},{wch:10},{wch:8},{wch:8},{wch:15},{wch:12}];
 XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

 // ------------------------------------------------------------ Sheet 2: Hole-by-Hole Scores ------------------------------------------------------------
 const holeData = [];
 const holeHdr = ["Player","Tee","CHCP","OUT","IN","GROSS"];
 HOLES.forEach(i=> holeHdr.push(`H${i+1}`));
 holeData.push(holeHdr);

 // Par row
 const parRow = ["Par","","","","",""];
 const baseTee = course.tees[0];
 HOLES.forEach(i=>parRow.push(baseTee.pars[i]));
 holeData.push(parRow);

 activePlayers.forEach(pl=>{
 const tee = getTee(course.tees, pl.teeId);
 const ch = courseHcp(pl.hcpIdx, tee);
 const gs = round.scores[pl.id] || {};
 const row = [pl.name, tee.name, ch, calcSeg(gs,H9)??'', calcSeg(gs,B9)??'', calcGross(gs)??''];
 HOLES.forEach(i=>row.push(holeGross(gs,i)??''));
 holeData.push(row);
 });

 holeData.push([]);
 holeData.push(["--- PUTTS ---"]);
 const puttsHdr = ["Player","Tee","CHCP","","","","Total"];
 HOLES.forEach(i=>puttsHdr.push(`H${i+1}`));
 holeData.push(puttsHdr);

 activePlayers.forEach(pl=>{
 const tee = getTee(course.tees, pl.teeId);
 const ch = courseHcp(pl.hcpIdx, tee);
 const gs = round.scores[pl.id] || {};
 const row = [pl.name, tee.name, ch, '','','', calcPutts(gs)??''];
 HOLES.forEach(i=>row.push(holePutts(gs,i)??''));
 holeData.push(row);
 });

 const wsHoles = XLSX.utils.aoa_to_sheet(holeData);
 wsHoles['!cols'] = [{wch:22},{wch:8},{wch:8},{wch:6},{wch:6},{wch:8},...HOLES.map(()=>({wch:5}))];
 XLSX.utils.book_append_sheet(wb, wsHoles, "Hole Scores");

 // ------------------------------------------------------------ Sheet 3: Stableford / Game Results ------------------------------------------------------------
 const gameData = [];
 gameData.push([`Game Results ${gameFmt.name}`]);
 gameData.push([gameFmt.desc]);
 gameData.push([]);
 gameData.push(["Player","Course HCP","Total Stableford Pts","Net Score","Gross Score","Total Putts"]);
 const sbfRows = activePlayers.map(pl=>{
 const tee = getTee(course.tees, pl.teeId);
 const ch = courseHcp(pl.hcpIdx, tee);
 const gs = round.scores[pl.id] || {};
 const gross = calcGross(gs);
 return { name:pl.name, ch, sbf:calcSbf(gs,tee,ch), net:gross!=null?gross-ch:null, gross, putts:calcPutts(gs) };
 }).sort((a,b)=>b.sbf-a.sbf);
 sbfRows.forEach(r=>gameData.push([r.name,r.ch,r.sbf,r.net??'',r.gross??'',r.putts??'']));

 const wsGame = XLSX.utils.aoa_to_sheet(gameData);
 wsGame['!cols'] = [{wch:22},{wch:14},{wch:22},{wch:12},{wch:13},{wch:13}];
 XLSX.utils.book_append_sheet(wb, wsGame, "Game Results");

 // Write file
 const dateStr = round.date.replace(/-/g,'');
 const safeName = round.name.replace(/[^a-z0-9]/gi,'_');
 const fileName = `Golf_${safeName}_${dateStr}.xlsx`;
 
 // Always download the file first (this works reliably)
 XLSX.writeFile(wb, fileName);
}

// ------------------------------------------------------------
// UI ATOMS
// ------------------------------------------------------------
const TH = {background:G.dark,color:"#fff",padding:"8px 7px",border:"1px solid rgba(255,255,255,.12)",fontWeight:700,fontSize:11,whiteSpace:"nowrap"};
const TD = {padding:"6px 7px",border:"1px solid "+G.border,fontSize:13,whiteSpace:"nowrap"};

const TeeBadge = ({teeId,tees}) => {
 const t=getTee(tees,teeId);
 return <span style={{display:"inline-block",padding:"2px 8px",borderRadius:99,fontSize:11,fontWeight:700,background:t.color,color:isLight(t.color)?"#333":"#fff"}}>{t.name}</span>;
};
const Btn = ({children,onClick,bg=G.mid,style={}}) => (
 <button onClick={onClick} style={{padding:"7px 15px",background:bg,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"inherit",...style}}>{children}</button>
);
const FInput = ({value,onChange,style={},...rest}) => (
 <input value={value??""} onChange={onChange} {...rest} style={{padding:"7px 11px",border:"1.5px solid #C8E6C9",borderRadius:8,fontSize:13,outline:"none",fontFamily:"inherit",...style}}/>
);
const Pill = ({label,active,onClick}) => (
 <button onClick={onClick} style={{padding:"5px 13px",borderRadius:99,border:"none",cursor:"pointer",fontWeight:600,fontSize:12,fontFamily:"inherit",background:active?G.mid:"#E8F5E9",color:active?"#fff":G.mid}}>{label}</button>
);
const Toggle = ({on, onChange, label}) => (
 <div style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}} onClick={onChange}>
 <div style={{width:38,height:22,borderRadius:11,background:on?G.mid:G.border,transition:"background .2s",position:"relative",flexShrink:0}}>
 <div style={{position:"absolute",top:3,left:on?18:3,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
 </div>
 {label && <span style={{fontSize:13,color:on?G.dark:G.muted,fontWeight:on?600:400}}>{label}</span>}
 </div>
);
const StatusBadge = ({active}) => (
 <span style={{display:"inline-block",padding:"2px 10px",borderRadius:99,fontSize:11,fontWeight:700,
 background:active?"#D8F3DC":"#F3F4F6",color:active?G.dark:G.muted}}>
 {active?" Active":" Inactive"}
 </span>
);

function SyncBar({status,onSave,lastSaved}){
 const dot={idle:"#C9A84C",saving:"#F9A825",saved:"#52B788",error:G.red}[status];
 const msg={idle:"Unsaved changes",saving:"Saving ",saved:"Synced . "+lastSaved,error:"Save failed retry"}[status];
 return(
 <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 14px",background:"rgba(0,0,0,.3)",borderRadius:8}}>
 <div style={{width:8,height:8,borderRadius:"50%",background:dot,flexShrink:0,boxShadow:status==="saved"?"0 0 8px #52B788":"none"}}/>
 <span style={{color:"rgba(255,255,255,.7)",fontSize:12,flex:1}}>{msg}</span>
 {(status==="idle"||status==="error")&&(
 <button onClick={onSave} style={{background:G.gold,color:"#fff",border:"none",borderRadius:6,padding:"5px 14px",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}> Save</button>
 )}
 </div>
 );
}

// ------------------------------------------------------------
// HOLE-BY-HOLE INPUT SCREEN (mobile-first)
// ------------------------------------------------------------
function HoleEntry({ players, tees, scores, onChange, activeCourse, onFinalize }) {
 const [currentHole, setCurrentHole] = useState(0);
 const [activePlayer, setActivePlayer] = useState(players[0]?.id || null);
 const puttsInputRefs = useRef({});

 // Auto-jump to next incomplete hole when entering this screen
 useEffect(() => {
 // Find first hole where at least one player has no gross score
 const nextHole = HOLES.find(i => 
 players.some(p => holeGross(scores[p.id]||{}, i) === null)
 );
 if (nextHole !== undefined) {
 setCurrentHole(nextHole);
 }
 }, []); // Only run on mount

 if (!players.length) return (
 <div style={{textAlign:"center",padding:40,color:G.muted}}>No active players. Go to Setup Roster to activate players.</div>
 );

 const baseTee = tees[0];
 const par = baseTee.pars[currentHole];

 const allScoresFilled = players.every(p => holeGross(scores[p.id]||{}, currentHole) !== null);
 const completedHoles = HOLES.filter(i => players.every(p => holeGross(scores[p.id]||{}, i) !== null)).length;

 const goToHole = (h) => { if (h >= 0 && h < 18) setCurrentHole(h); };

 return (
 <div>
 {/* Compact hole nav strip */}
 <div style={{background:G.dark,borderRadius:12,padding:"10px 12px",marginBottom:12}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
 <button onClick={()=>goToHole(currentHole-1)} disabled={currentHole===0}
 style={{width:44,height:44,borderRadius:10,border:"none",background:currentHole===0?"rgba(255,255,255,.1)":"rgba(255,255,255,.2)",color:"#fff",fontSize:20,cursor:currentHole===0?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>

 </button>
 {/* Hole header inline */}
 <div style={{textAlign:"center",color:"#fff",flex:1}}>
 <div style={{fontSize:11,opacity:.6,letterSpacing:1,textTransform:"uppercase"}}>{currentHole<9?"Front":"Back"} . SI {getTee(tees,players[0]?.teeId||tees[0].id).si?.[currentHole]??currentHole+1}</div>
 <div style={{fontSize:32,fontWeight:900,lineHeight:1.1,fontFamily:"Georgia,serif"}}>Hole {currentHole+1}</div>
 <div style={{display:"flex",justifyContent:"center",gap:16,marginTop:2}}>
 <span style={{fontSize:13,fontWeight:700}}>Par {par}</span>
 <span style={{fontSize:12,opacity:.6}}>{completedHoles}/18 done</span>
 </div>
 </div>
 <button onClick={()=>goToHole(currentHole+1)} disabled={currentHole===17}
 style={{width:44,height:44,borderRadius:10,border:"none",background:currentHole===17?"rgba(255,255,255,.1)":"rgba(255,255,255,.2)",color:"#fff",fontSize:20,cursor:currentHole===17?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>

 </button>
 </div>
 {/* Hole dots */}
 <div style={{display:"flex",gap:3,justifyContent:"center",flexWrap:"wrap"}}>
 {HOLES.map(i=>{
 const filled = players.every(p=>holeGross(scores[p.id]||{},i)!==null);
 const partial = !filled && players.some(p=>holeGross(scores[p.id]||{},i)!==null);
 const active = i===currentHole;
 return (
 <button key={i} onClick={()=>setCurrentHole(i)}
 style={{width:26,height:26,borderRadius:"50%",border:"none",cursor:"pointer",fontWeight:700,fontSize:9,fontFamily:"inherit",
 background:active?"#C9A84C":filled?G.mid:partial?"#5A9E7A":"rgba(255,255,255,.15)",
 color:"#fff",boxShadow:active?"0 0 0 2px #fff":"none",transition:"all .15s"}}>
 {i+1}
 </button>
 );
 })}
 </div>
 </div>

 {/* Player score cards */}
 {players.map((pl) => {
 const gs = scores[pl.id] || {};
 const plTee = getTee(tees, pl.teeId);
 const ch = courseHcp(pl.hcpIdx, plTee);
 const minCH = Math.min(...players.map(p=>courseHcp(p.hcpIdx,getTee(tees,p.teeId))));
 const strokes = strokesOnHole(ch, minCH, plTee.si[currentHole]);
 const grossVal = gs["h"+currentHole] ?? "";
 const puttsVal = gs["p"+currentHole] ?? "";
 const ss = scoreStyle(grossVal, plTee.pars[currentHole]);
 const isActive = activePlayer === pl.id;

 return (
 <div key={pl.id}
 style={{background:"#fff",borderRadius:14,padding:"12px",marginBottom:10,
 border:"2px solid "+(isActive?G.mid:G.border),
 boxShadow:isActive?"0 3px 14px rgba(45,106,79,.14)":"0 1px 4px rgba(0,0,0,.04)"
 }}
 onClick={()=>setActivePlayer(pl.id)}>
 {/* Player header */}
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
 <div style={{display:"flex",alignItems:"center",gap:8}}>
 <TeeBadge teeId={pl.teeId} tees={tees}/>
 <span style={{fontWeight:700,fontSize:15,color:G.dark}}>{pl.name}</span>
 {strokes>0&&<span style={{width:8,height:8,borderRadius:"50%",background:G.gold,flexShrink:0}}/>}
 </div>
 <div style={{display:"flex",alignItems:"center",gap:6}}>
 {strokes>0&&<span style={{background:"#FEF9E7",color:G.gold,border:"1px solid "+G.gold,borderRadius:6,padding:"2px 7px",fontSize:11,fontWeight:700}}>STROKE</span>}
 <span style={{fontSize:11,color:G.muted}}>CHCP {ch}</span>
 </div>
 </div>

 {/* Score inputs row */}
 <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
 {/* Gross */}
 <div>
 <div style={{fontSize:10,color:G.muted,fontWeight:700,textAlign:"center",marginBottom:4}}>GROSS</div>
 <input type="number" inputMode="numeric" pattern="[0-9]*" min={1} max={15} value={grossVal} placeholder=" "
 onChange={e=>onChange(pl.id,"h"+currentHole,e.target.value===""?"":+e.target.value)}
 onFocus={()=>setActivePlayer(pl.id)}
 style={{width:"100%",height:58,textAlign:"center",border:"2px solid "+(isActive?G.mid:G.border),
 borderRadius:10,fontWeight:900,fontSize:28,outline:"none",fontFamily:"inherit",...ss,
 WebkitAppearance:"none",boxSizing:"border-box"}}
 />
 </div>
 {/* Putts */}
 <div>
 <div style={{fontSize:10,color:"#8B6914",fontWeight:700,textAlign:"center",marginBottom:4}}>PUTTS</div>
 <input 
 ref={el => puttsInputRefs.current[pl.id] = el}
 type="number" inputMode="numeric" pattern="[0-9]*" min={0} max={5} value={puttsVal} placeholder=" "
 onChange={e=>onChange(pl.id,"p"+currentHole,e.target.value===""?"":+e.target.value)}
 onFocus={()=>setActivePlayer(pl.id)}
 style={{width:"100%",height:58,textAlign:"center",border:"2px solid "+(isActive?"#C9A84C":G.border),
 borderRadius:10,fontWeight:900,fontSize:28,outline:"none",fontFamily:"inherit",
 background:"#FFF8E7",color:"#8B6914",WebkitAppearance:"none",boxSizing:"border-box"}}
 />
 </div>
 {/* Net */}
 <div>
 <div style={{fontSize:10,color:G.muted,fontWeight:700,textAlign:"center",marginBottom:4}}>NET</div>
 <div style={{height:58,display:"flex",alignItems:"center",justifyContent:"center",
 borderRadius:10,border:"1.5px solid "+G.border,background:G.lite,fontWeight:900,fontSize:26,color:G.mid}}>
 {grossVal!==""?(+grossVal-strokes):"-"}
 </div>
 </div>
 </div>

 {/* Quick score buttons - larger for mobile */}
 <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:5,marginBottom:8}}>
 {[par-2,par-1,par,par+1,par+2,par+3].filter(s=>s>=1&&s<=12).map(s=>{
 const label = s-par<=-2?"Eagle":s-par===-1?"Birdie":s-par===0?"Par":s-par===1?"Bogey":s-par===2?"Dbl":"+"+( s-par);
 return (
 <button key={s}
 onClick={e=>{
 e.stopPropagation();
 onChange(pl.id,"h"+currentHole,s);
 setActivePlayer(pl.id);
 }}
 style={{padding:"7px 2px",border:"none",borderRadius:8,cursor:"pointer",
 fontWeight:700,fontSize:11,fontFamily:"inherit",
 ...scoreStyle(s,plTee.pars[currentHole]),
 opacity:grossVal===s?1:0.55,
 boxShadow:grossVal===s?"0 0 0 2px "+G.dark+", 0 2px 8px rgba(0,0,0,.2)":"none",
 transform:grossVal===s?"scale(1.05)":"scale(1)",transition:"all .1s",
 display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
 <span style={{fontSize:9,fontWeight:600,opacity:.85}}>{label}</span>
 <span style={{fontSize:16,lineHeight:1}}>{s}</span>
 </button>
 );
 })}
 </div>

 {/* Quick putt buttons */}
 <div style={{display:"flex",alignItems:"center",gap:6}}>
 <span style={{fontSize:10,color:"#8B6914",fontWeight:700,flexShrink:0}}>Putts:</span>
 <div style={{display:"flex",gap:4,flex:1}}>
 {[0,1,2,3,4].map(p=>(
 <button key={p}
 onClick={e=>{
 e.stopPropagation();
 onChange(pl.id,"p"+currentHole,p);
 setActivePlayer(pl.id);
 }}
 style={{flex:1,padding:"10px 4px",border:"1px solid "+(puttsVal===p?"#C9A84C":"#E5D3A0"),
 borderRadius:8,cursor:"pointer",fontWeight:800,fontSize:16,fontFamily:"inherit",
 background:puttsVal===p?"#FFF8E7":"#FFFCF5",color:"#8B6914",
 boxShadow:puttsVal===p?"0 0 0 2px #C9A84C":"none",
 transform:puttsVal===p?"scale(1.05)":"scale(1)",transition:"all .1s"}}>
 {p}
 </button>
 ))}
 </div>
 </div>
 </div>
 );
 })}

 {/* Advance / Complete */}
 {allScoresFilled && currentHole<17 && (
 <button onClick={()=>goToHole(currentHole+1)}
 style={{width:"100%",padding:"16px",background:G.gold,color:"#fff",border:"none",borderRadius:12,fontWeight:700,fontSize:16,cursor:"pointer",fontFamily:"inherit",marginTop:4,letterSpacing:.3}}>
 All scored Hole {currentHole+2} 
 </button>
 )}
 {allScoresFilled && currentHole===17 && (
 <div style={{marginTop:4}}>
 <div style={{background:"#D8F3DC",borderRadius:12,padding:"16px",textAlign:"center",fontWeight:700,color:G.dark,fontSize:16,marginBottom:10}}>
 Round Complete! All players finished.
 </div>
 <button onClick={onFinalize}
 style={{width:"100%",padding:"16px",background:`linear-gradient(135deg,${G.mid},${G.dark})`,color:"#fff",border:"none",borderRadius:12,fontWeight:700,fontSize:16,cursor:"pointer",fontFamily:"inherit",letterSpacing:.3,boxShadow:"0 4px 12px rgba(45,106,79,.3)"}}>
 Finalize Round & View Summary
 </button>
 </div>
 )}
 </div>
 );
}

// ------------------------------------------------------------
// GAME FORMAT PICKER (multi-select)
// ------------------------------------------------------------
function GameFormatPicker({ activeGames, onChange }) {
 const toggle = (id) => {
 const already = activeGames.includes(id);
 if (already && activeGames.length === 1) return; // keep at least 1
 const next = already ? activeGames.filter(g=>g!==id) : [...activeGames, id];
 onChange(next);
 };
 return (
 <div>
 <div style={{marginBottom:14}}>
 <div style={{fontWeight:700,fontSize:15,color:G.dark,marginBottom:4}}> This Week's Games</div>
 <div style={{fontSize:12,color:G.muted}}>Tap to select one or more formats all active games will be tracked simultaneously.</div>
 </div>
 {/* Active games summary */}
 {activeGames.length > 0 && (
 <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16,padding:"10px 14px",background:"#EBF5EC",borderRadius:10,border:"1.5px solid "+G.mid}}>
 <span style={{fontSize:12,fontWeight:700,color:G.mid,alignSelf:"center"}}>Active:</span>
 {activeGames.map(id=>{
 const fmt = GAME_FORMATS.find(f=>f.id===id);
 return fmt ? (
 <span key={id} style={{background:G.mid,color:"#fff",borderRadius:99,padding:"3px 10px",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
 {fmt.icon} {fmt.name}
 {activeGames.length>1 && (
 <button onClick={()=>toggle(id)} style={{background:"rgba(255,255,255,.3)",border:"none",borderRadius:"50%",width:16,height:16,cursor:"pointer",color:"#fff",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}> *</button>
 )}
 </span>
 ) : null;
 })}
 </div>
 )}
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}}>
 {GAME_FORMATS.map(fmt=>{
 const active = activeGames.includes(fmt.id);
 return (
 <button key={fmt.id} onClick={()=>toggle(fmt.id)}
 style={{
 padding:"12px 14px",borderRadius:12,cursor:"pointer",fontFamily:"inherit",
 textAlign:"left",border:"2px solid "+(active?G.mid:G.border),
 background:active?"#EBF5EC":"#fff",
 boxShadow:active?"0 2px 10px rgba(45,106,79,.15)":"none",
 transition:"all .15s",minHeight:68
 }}>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
 <span style={{fontSize:20}}>{fmt.icon}</span>
 <span style={{fontWeight:700,fontSize:13,color:active?G.mid:G.dark,flex:1,textAlign:"left"}}>{fmt.name}</span>
 <span style={{
 width:22,height:22,borderRadius:"50%",border:"2px solid "+(active?G.mid:G.border),
 background:active?G.mid:"transparent",flexShrink:0,
 display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff"
 }}>{active?" ":""}</span>
 </div>
 <div style={{fontSize:11,color:G.muted,lineHeight:1.4,textAlign:"left"}}>{fmt.desc}</div>
 </button>
 );
 })}
 </div>
 </div>
 );
}

// ------------------------------------------------------------
// EXPORT & ARCHIVE TAB
// ------------------------------------------------------------
function ExportArchiveTab({ round, library, archive, onArchive }) {
 const course = library.courses.find(c=>c.active) || library.courses[0];
 const gameFmt = GAME_FORMATS.find(g=>g.id===round.gameFormat) || GAME_FORMATS[0];
 const activePlayers = library.roster.filter(p=>p.active).map(p=>({
 ...p, teeId: round.playerTees[p.id] || p.defaultTee
 }));

 const completedPlayers = activePlayers.filter(p=>calcGross(round.scores[p.id]||{})!=null).length;
 const roundComplete = completedPlayers === activePlayers.length && activePlayers.length > 0;

 const handleExport = () => {
 exportRoundToExcel(round, library);
 };

 const handleArchive = () => {
 if (!window.confirm("Archive this round? It will be saved to your archive history.")) return;
 onArchive();
 };

 return (
 <div>
 {/* Current Round Export */}
 <div style={{background:"#fff",borderRadius:14,padding:"20px",border:"1.5px solid "+G.border,marginBottom:20}}>
 <div style={{display:"flex",alignItems:"flex-start",gap:14,marginBottom:16,flexWrap:"wrap"}}>
 <div style={{fontSize:36}}> </div>
 <div style={{flex:1}}>
 <div style={{fontWeight:700,fontSize:16,color:G.dark,marginBottom:4}}>Export Current Round to Excel</div>
 <div style={{fontSize:13,color:G.muted}}>
 Downloads a formatted .xlsx file with three sheets: Summary, Hole-by-Hole scores, and Game Results.
 </div>
 </div>
 </div>
 <div style={{background:G.lite,borderRadius:10,padding:"12px 14px",marginBottom:14,border:"1px solid "+G.border}}>
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:8}}>
 {[
 [" ... Date",round.date],
 [" Round",round.name],
 [" Course",course.name],
 [" Format",gameFmt.icon+" "+gameFmt.name],
 [" Players",activePlayers.length+" active"],
 [" ... Complete",completedPlayers+"/"+activePlayers.length+" scored"],
 ].map(([label,val])=>(
 <div key={label}>
 <div style={{fontSize:10,color:G.muted,fontWeight:600}}>{label}</div>
 <div style={{fontSize:13,fontWeight:700,color:G.dark}}>{val}</div>
 </div>
 ))}
 </div>
 </div>
 {!roundComplete && (
 <div style={{background:"#FFF3CD",border:"1px solid #FFC107",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:"#856404",fontWeight:600}}>
 Round is not fully complete ({completedPlayers}/{activePlayers.length} players scored) you can still export partial data.
 </div>
 )}
 <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
 <Btn bg={G.mid} onClick={handleExport} style={{fontSize:14,padding:"10px 22px"}}>
 📊 Download Excel (.xlsx)
 </Btn>
 <Btn bg="#25D366" onClick={()=>{
 const text = generateTextScorecard(round, library);
 navigator.clipboard.writeText(text).then(() => {
 alert("✅ Scorecard copied to clipboard!\n\nNow:\n1. Open WhatsApp\n2. Select your group chat\n3. Paste (long-press in message box)\n4. Send!");
 }).catch(() => {
 // Fallback if clipboard doesn't work
 const textarea = document.createElement('textarea');
 textarea.value = text;
 document.body.appendChild(textarea);
 textarea.select();
 document.execCommand('copy');
 document.body.removeChild(textarea);
 alert("✅ Scorecard copied!\n\nPaste into WhatsApp to share.");
 });
 }} style={{fontSize:14,padding:"10px 22px"}}>
 💬 Copy for WhatsApp
 </Btn>
 <Btn bg={roundComplete?G.gold:G.muted} onClick={handleArchive} style={{fontSize:14,padding:"10px 22px"}}>
 📁 Archive This Round
 </Btn>
 </div>
 </div>

 {/* Archive list */}
 <div>
 <div style={{fontWeight:700,fontSize:15,color:G.dark,marginBottom:12}}> Round Archive ({archive.length})</div>
 {archive.length === 0 ? (
 <div style={{textAlign:"center",padding:"30px 20px",color:G.muted,background:G.lite,borderRadius:12,border:"1px solid "+G.border}}>
 No archived rounds yet. Complete a round and click "Archive This Round" to save it here.
 </div>
 ) : (
 <div style={{display:"flex",flexDirection:"column",gap:10}}>
 {[...archive].reverse().map((ar, idx)=>{
 const arGame = GAME_FORMATS.find(g=>g.id===ar.gameFormat) || GAME_FORMATS[0];
 const arPlayers = ar.players || [];
 return (
 <div key={idx} style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1px solid "+G.border,display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
 <div style={{fontSize:28}}>{arGame.icon}</div>
 <div style={{flex:1,minWidth:200}}>
 <div style={{fontWeight:700,fontSize:14,color:G.dark}}>{ar.name}</div>
 <div style={{fontSize:12,color:G.muted,marginTop:2}}>
 {ar.date} . {ar.courseName} . {arGame.name} . {arPlayers.length} players
 </div>
 {arPlayers.length > 0 && (
 <div style={{fontSize:11,color:G.muted,marginTop:4}}>
 {arPlayers.slice(0,3).map(p=>`${p.name}: ${p.gross??' '}`).join(' . ')}
 {arPlayers.length>3&&` . +${arPlayers.length-3} more`}
 </div>
 )}
 </div>
 <button onClick={()=>{
 // Re-export from archive
 const fakeRound = { name:ar.name, date:ar.date, gameFormat:ar.gameFormat, playerTees:ar.playerTees||{}, scores:ar.scores||{} };
 const fakeLib = { courses:[{...ar.courseData,active:true}], roster:ar.rosterData||[] };
 try { exportRoundToExcel(fakeRound, fakeLib); } catch(e){ alert("Unable to re-export this round."); }
 }}
 style={{background:G.lite,color:G.dark,border:"1px solid "+G.border,borderRadius:8,padding:"7px 14px",fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
 Re-export
 </button>
 </div>
 );
 })}
 </div>
 )}
 </div>
 </div>
 );
}

// ------------------------------------------------------------
// BINGO BANGO BONGO
// ------------------------------------------------------------
function BingoBangoBongo({players, tees, scores}) {
 const totals = {};
 players.forEach(p=>{ totals[p.id]={name:p.name, pts:0}; });

 const holes = HOLES.map(i=>{
 const baseTee = tees[0];
 const par = baseTee.pars[i];
 // In a simplified version: first to par (bingo), lowest gross (bango), first to finish (bongo)
 const pScores = players.map(p=>{
 const g = holeGross(scores[p.id]||{},i);
 return {id:p.id, name:p.name, gross:g};
 }).filter(s=>s.gross!=null);

 let bingo=null,bango=null,bongo=null;
 if(pScores.length===players.length){
 // Bingo: first on green = lowest gross ------------------------------------------------------------ par (simplified)
 const onGreen = pScores.filter(s=>s.gross<=par);
 if(onGreen.length>=1){ bingo=onGreen[0].id; totals[onGreen[0].id].pts++; }
 // Bango: closest to pin = lowest gross
 const minG = Math.min(...pScores.map(s=>s.gross));
 const closestArr = pScores.filter(s=>s.gross===minG);
 if(closestArr.length===1){ bango=closestArr[0].id; totals[closestArr[0].id].pts++; }
 // Bongo: first in hole = lowest gross (same as bango in simplified)
 if(closestArr.length===1){ bongo=closestArr[0].id; totals[closestArr[0].id].pts++; }
 }
 return {hole:i+1,par,bingo,bango,bongo,pScores};
 });

 const pName = id => players.find(p=>p.id===id)?.name || ' ';
 const sorted = Object.values(totals).sort((a,b)=>b.pts-a.pts);

 return (
 <div>
 <div style={{background:"#FFF8E7",borderRadius:10,padding:"10px 16px",marginBottom:16,border:"1px solid #F0E0A0",fontSize:12,color:"#7A5C00"}}>
 <b>Simplified scoring:</b> Bingo = first to par ( par); Bango = lowest gross (closest to pin); Bongo = lowest gross (first in hole). 1 point each.
 </div>
 <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:18}}>
 {sorted.map(({name,pts})=>(
 <div key={name} style={{background:`linear-gradient(135deg,${G.mid},${G.dark})`,color:"#fff",borderRadius:10,padding:"10px 20px",textAlign:"center",minWidth:90}}>
 <div style={{fontSize:24,fontWeight:800}}>{pts}</div>
 <div style={{fontSize:11,opacity:.8}}>{name}</div>
 </div>
 ))}
 {!sorted.some(s=>s.pts>0)&&<span style={{color:G.muted,fontSize:13}}>No scores yet.</span>}
 </div>
 <div style={{overflowX:"auto"}}>
 <table style={{borderCollapse:"collapse",width:"100%"}}>
 <thead><tr>
 {["Hole","Par","Bingo (1st on green)","Bango (closest)","Bongo (1st in hole)"].map(h=><th key={h} style={TH}>{h}</th>)}
 </tr></thead>
 <tbody>{holes.map((r,i)=>(
 <tr key={r.hole} style={{background:i%2===0?"#F4F9F5":"#fff"}}>
 <td style={{...TD,textAlign:"center",fontWeight:700}}>{r.hole}</td>
 <td style={{...TD,textAlign:"center"}}>P{r.par}</td>
 <td style={{...TD,fontWeight:700,color:r.bingo?G.mid:G.muted}}>{r.bingo?pName(r.bingo):" "}</td>
 <td style={{...TD,fontWeight:700,color:r.bango?G.gold:"#999"}}>{r.bango?pName(r.bango):" "}</td>
 <td style={{...TD,fontWeight:700,color:r.bongo?G.dark:G.muted}}>{r.bongo?pName(r.bongo):" "}</td>
 </tr>
 ))}</tbody>
 </table>
 </div>
 </div>
 );
}

// ------------------------------------------------------------
// SETUP TAB ------------------------------------------------------------ Master Roster + Course Library
// ------------------------------------------------------------
function SetupTab({library, setLibrary, onLibrarySave, libSaveStatus}) {
 const [sub, setSub] = useState("roster");
 const [editCourseId, setEditCourseId] = useState(null);

 const [newName, setNewName] = useState("");
 const [newHcp, setNewHcp] = useState("");
 const [newTeeRef,setNewTeeRef]= useState("blue");

 const addPlayer = () => {
 if (!newName.trim() || newHcp==="") return;
 setLibrary(lib=>({...lib, roster:[...lib.roster,{
 id: Date.now(), name:newName.trim(), hcpIdx:+newHcp, active:true, defaultTee:newTeeRef
 }]}));
 setNewName(""); setNewHcp("");
 };
 const togglePlayer = id => setLibrary(lib=>({...lib, roster:lib.roster.map(p=>p.id===id?{...p,active:!p.active}:p)}));
 const updatePlayer = (id,field,val) => setLibrary(lib=>({...lib, roster:lib.roster.map(p=>p.id===id?{...p,[field]:val}:p)}));
 const removePlayer = id => setLibrary(lib=>({...lib, roster:lib.roster.filter(p=>p.id!==id)}));

 const [newCourseName, setNewCourseName] = useState("");
 const activeCourse = library.courses.find(c=>c.active);

 const addCourse = () => {
 if (!newCourseName.trim()) return;
 const nc = {
 id:"course_"+Date.now(), name:newCourseName.trim(), active:false,
 tees:[{ id:"blue_"+Date.now(), name:"Blue", color:"#1565C0", rating:72.0, slope:130, par:72,
 pars:[4,4,4,4,3,5,3,4,5,4,4,3,4,4,5,3,4,5],
 si: [7,3,11,15,17,1,13,5,9,8,4,16,12,2,14,18,6,10] }]
 };
 setLibrary(lib=>({...lib, courses:[...lib.courses, nc]}));
 setEditCourseId(nc.id);
 setNewCourseName("");
 };
 const setActiveCourse = id => setLibrary(lib=>({...lib, courses:lib.courses.map(c=>({...c,active:c.id===id}))}));
 const removeCourse = id => {
 if(library.courses.length<=1){alert("Need at least one course.");return;}
 setLibrary(lib=>({...lib, courses:lib.courses.filter(c=>c.id!==id).map((c,i)=>i===0?{...c,active:true}:c)}));
 if(editCourseId===id) setEditCourseId(null);
 };
 const updateCourse = (id,field,val) => setLibrary(lib=>({...lib, courses:lib.courses.map(c=>c.id===id?{...c,[field]:val}:c)}));
 const updateTee = (cid,tid,field,val) => setLibrary(lib=>({...lib, courses:lib.courses.map(c=>c.id===cid?{...c,tees:c.tees.map(t=>t.id===tid?{...t,[field]:val}:t)}:c)}));
 const updateTeeArr = (cid,tid,arr,i,val) => setLibrary(lib=>({...lib, courses:lib.courses.map(c=>c.id===cid?{...c,tees:c.tees.map(t=>t.id===tid?{...t,[arr]:t[arr].map((v,j)=>j===i?val:v)}:t)}:c)}));
 const addTee = cid => {
 const course=library.courses.find(c=>c.id===cid);
 const used=course.tees.map(t=>t.color);
 const color=TEE_COLORS.find(c=>!used.includes(c))||"#888";
 const names=["Blue","Gold","White","Red","Green","Black","Brown","Purple"];
 const name=names.find(n=>!course.tees.map(t=>t.name).includes(n))||"Custom";
 const base=course.tees[0];
 setLibrary(lib=>({...lib, courses:lib.courses.map(c=>c.id===cid?{...c,tees:[...c.tees,{
 id:"tee_"+Date.now(),name,color,rating:+(base.rating-2).toFixed(1),slope:base.slope-8,par:base.par,
 pars:[...base.pars],si:[...base.si]
 }]}:c)}));
 };
 const removeTee = (cid,tid) => {
 const course=library.courses.find(c=>c.id===cid);
 if(course.tees.length<=1){alert("Need at least one tee set.");return;}
 setLibrary(lib=>({...lib, courses:lib.courses.map(c=>c.id===cid?{...c,tees:c.tees.filter(t=>t.id!==tid)}:c)}));
 };

 const activePlayers = library.roster.filter(p=>p.active).length;

 return (
 <div>
 <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"2px solid "+G.border,paddingBottom:0}}>
 {[["roster"," Roster"],["courses"," Courses"]].map(([id,label])=>(
 <button key={id} onClick={()=>setSub(id)}
 style={{padding:"8px 18px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",
 fontSize:13,fontWeight:600,color:sub===id?G.mid:G.muted,
 borderBottom:sub===id?"3px solid "+G.mid:"3px solid transparent",marginBottom:-2}}>
 {label}
 </button>
 ))}
 </div>

 {sub==="roster" && (
 <div>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:16}}>
 <div>
 <div style={{fontSize:14,fontWeight:700,color:G.dark,marginBottom:2}}>Master Player Roster</div>
 <div style={{fontSize:12,color:G.muted}}>
 {activePlayers} of {library.roster.length} players active this round.
 </div>
 </div>
 <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
 <Btn bg="#2563EB" style={{fontSize:12}} onClick={()=>{setLibrary(lib=>({...lib,roster:lib.roster.map(p=>({...p,active:true}))}));}}> All Active</Btn>
 <Btn bg={G.muted} style={{fontSize:12}} onClick={()=>{setLibrary(lib=>({...lib,roster:lib.roster.map(p=>({...p,active:false}))}));}}> All Inactive</Btn>
 <Btn bg={G.gold} style={{fontSize:12}} onClick={()=>{
 if(!window.confirm("Reset to default roster (Robert, Greg Siemer, Dennis Kim, Mike Leiby, Julio, Hector, Hector Sr, Carlos)?")) return;
 setLibrary(lib=>({...lib, roster:DEF_LIBRARY.roster}));
 }}> Reset Roster</Btn>
 </div>
 </div>
 <div style={{background:G.lite,borderRadius:10,padding:"14px 16px",marginBottom:16,border:"1px solid "+G.border}}>
 <div style={{fontSize:12,fontWeight:700,color:G.mid,marginBottom:10}}>Add New Player to Roster</div>
 <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
 <FInput placeholder="Full name" value={newName} style={{width:200}} onChange={e=>setNewName(e.target.value)}/>
 <FInput placeholder="HCP Index" value={newHcp} type="number" step="0.1" min="0" max="54" style={{width:120}} onChange={e=>setNewHcp(e.target.value)}/>
 <select value={newTeeRef} onChange={e=>setNewTeeRef(e.target.value)}
 style={{padding:"7px 11px",border:"1.5px solid #C8E6C9",borderRadius:8,fontSize:13,fontFamily:"inherit",background:"#fff"}}>
 <option value="blue">Blue Tees</option><option value="gold">Gold Tees</option><option value="white">White Tees</option><option value="red">Red Tees</option>
 </select>
 <Btn onClick={addPlayer}>+ Add Player</Btn>
 </div>
 </div>
 <div style={{overflowX:"auto"}}>
 <table style={{borderCollapse:"collapse",width:"100%"}}>
 <thead><tr>{["Active","Name","HCP Index","Default Tee","Actions"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
 <tbody>{library.roster.map((p,i)=>(
 <tr key={p.id} style={{background:i%2===0?"#F4F9F5":"#fff"}}>
 <td style={{...TD,textAlign:"center"}}><Toggle on={p.active} onChange={()=>togglePlayer(p.id)}/></td>
 <td style={TD}>
 <input value={p.name} onChange={e=>updatePlayer(p.id,"name",e.target.value)}
 style={{border:"none",background:"transparent",fontWeight:700,fontSize:13,width:160,fontFamily:"inherit",outline:"none",color:G.dark}}/>
 </td>
 <td style={{...TD,textAlign:"center"}}>
 <input type="number" step="0.1" min="0" max="54" value={p.hcpIdx}
 onChange={e=>updatePlayer(p.id,"hcpIdx",+e.target.value)}
 style={{width:60,textAlign:"center",border:"none",background:"transparent",fontWeight:600,fontSize:13,fontFamily:"inherit",outline:"none"}}/>
 </td>
 <td style={{...TD,textAlign:"center"}}>
 <input value={p.defaultTee} onChange={e=>updatePlayer(p.id,"defaultTee",e.target.value)}
 style={{width:70,textAlign:"center",border:"none",background:"transparent",fontSize:12,fontFamily:"inherit",outline:"none"}}/>
 </td>
 <td style={{...TD,textAlign:"center"}}>
 <button onClick={()=>removePlayer(p.id)}
 style={{background:"#FEE2E2",color:G.red,border:"none",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"inherit"}}>Remove</button>
 </td>
 </tr>
 ))}</tbody>
 </table>
 </div>
 <div style={{marginTop:16,display:"flex",justifyContent:"flex-end"}}>
 <Btn bg={libSaveStatus==="saved"?G.mid:G.gold} onClick={onLibrarySave}>
 {libSaveStatus==="saving"?"Saving ":libSaveStatus==="saved"?" Saved":" Save Roster & Courses"}
 </Btn>
 </div>
 </div>
 )}

 {sub==="courses" && (
 <div>
 <div style={{marginBottom:16}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:10}}>
 <div style={{fontSize:14,fontWeight:700,color:G.dark}}>Course Library</div>
 <button onClick={()=>{
 if(!window.confirm("Reset to default courses? This will replace all courses with: Fairbanks Ranch (3 layouts), Torrey Pines (North & South), and Tijuana CC. Your roster will not be affected.")) return;
 setLibrary(lib=>({...lib, courses:DEF_LIBRARY.courses}));
 }} style={{background:G.gold,color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
 Reset to Default Courses
 </button>
 </div>
 {library.courses.length < 6 && (
 <div style={{background:"#D8F3DC",border:"1px solid "+G.mid,borderRadius:10,padding:"12px 14px",marginBottom:12,fontSize:12,lineHeight:1.6}}>
 <strong> Pre-loaded Courses Available:</strong> Click "Reset to Default Courses" above to load Fairbanks Ranch (Valley/Lakes, Lakes/Ocean, Ocean/Valley), Torrey Pines (North & South), and Tijuana CC with accurate ratings, slopes, pars, and stroke index data.
 </div>
 )}
 <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
 {library.courses.map(c=>(
 <div key={c.id} style={{background:c.active?"#EBF5EC":"#fff",borderRadius:10,padding:"10px 14px",border:"2px solid "+(c.active?G.mid:G.border),display:"flex",alignItems:"center",gap:10}}>
 <div>
 <div style={{fontWeight:700,fontSize:13,color:G.dark}}>{c.name}</div>
 <div style={{fontSize:11,color:G.muted}}>{c.tees.length} tee set{c.tees.length!==1?"s":""}</div>
 </div>
 {c.active?<span style={{background:G.mid,color:"#fff",borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700}}>Active</span>:
 <button onClick={()=>{setActiveCourse(c.id);}} style={{background:"#E8F5E9",color:G.mid,border:"1px solid "+G.mid,borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>Set Active</button>
 }
 <button onClick={()=>setEditCourseId(editCourseId===c.id?null:c.id)} style={{background:G.lite,color:G.dark,border:"1px solid "+G.border,borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>
 {editCourseId===c.id?"Hide":"Edit"}
 </button>
 {!c.active&&<button onClick={()=>removeCourse(c.id)} style={{background:"#FEE2E2",color:G.red,border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:11,fontFamily:"inherit"}}> *</button>}
 </div>
 ))}
 </div>
 <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
 <FInput placeholder="New course name" value={newCourseName} style={{width:240}} onChange={e=>setNewCourseName(e.target.value)}/>
 <Btn onClick={addCourse}>+ Add Course</Btn>
 </div>
 </div>

 {editCourseId && (()=>{
 const course=library.courses.find(c=>c.id===editCourseId);if(!course)return null;
 return (
 <div style={{background:G.lite,borderRadius:12,padding:"16px",border:"1px solid "+G.border}}>
 <div style={{fontWeight:700,fontSize:14,color:G.dark,marginBottom:12}}>Editing: {course.name}</div>
 <div style={{marginBottom:10}}>
 <label style={{fontSize:12,color:G.muted,display:"block",marginBottom:4}}>Course Name</label>
 <FInput value={course.name} style={{width:300}} onChange={e=>updateCourse(course.id,"name",e.target.value)}/>
 </div>
 {course.tees.map(t=>(
 <div key={t.id} style={{background:"#fff",borderRadius:10,padding:"12px",marginBottom:10,border:"1px solid "+G.border}}>
 <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:8,alignItems:"center"}}>
 <input value={t.name} onChange={e=>updateTee(course.id,t.id,"name",e.target.value)}
 style={{padding:"5px 10px",border:"1.5px solid #C8E6C9",borderRadius:7,fontSize:13,fontFamily:"inherit",width:90,fontWeight:700,outline:"none"}}/>
 <input type="color" value={t.color} onChange={e=>updateTee(course.id,t.id,"color",e.target.value)}
 style={{width:36,height:32,border:"none",borderRadius:6,cursor:"pointer",padding:2}}/>
 {["Rating","Slope","Par"].map((lbl,li)=>(
 <div key={lbl} style={{display:"flex",alignItems:"center",gap:4}}>
 <span style={{fontSize:11,color:G.muted}}>{lbl}:</span>
 <input type="number" step={li===0?"0.1":"1"} value={t[["rating","slope","par"][li]]}
 onChange={e=>updateTee(course.id,t.id,["rating","slope","par"][li],+e.target.value)}
 style={{width:55,padding:"4px 6px",border:"1px solid "+G.border,borderRadius:6,fontSize:12,fontFamily:"inherit",outline:"none"}}/>
 </div>
 ))}
 {course.tees.length>1&&<button onClick={()=>removeTee(course.id,t.id)} style={{background:"#FEE2E2",color:G.red,border:"none",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Remove</button>}
 </div>
 <div style={{fontSize:10,fontWeight:700,color:G.mid,marginBottom:5}}>Hole Pars & Stroke Index:</div>
 <div style={{overflowX:"auto"}}>
 <table style={{borderCollapse:"collapse",fontSize:11}}>
 <thead><tr>
 <th style={{...TH,minWidth:60,fontSize:10}}>Field</th>
 {HOLES.map(i=><th key={i} style={{...TH,minWidth:32,fontSize:9}}>H{i+1}</th>)}
 <th style={{...TH,fontSize:10}}>Tot</th>
 </tr></thead>
 <tbody>
 {[["Par","pars",3,5,"#EEF7F0"],["SI","si",1,18,"#F5F5F5"]].map(([lbl,arr,mn,mx,bg])=>(
 <tr key={lbl}>
 <td style={{...TD,fontWeight:700,fontSize:11}}>{lbl}</td>
 {t[arr].map((v,i)=>(
 <td key={i} style={{padding:"1px",border:"1px solid "+G.border}}>
 <input type="number" min={mn} max={mx} value={v}
 onChange={e=>updateTeeArr(course.id,t.id,arr,i,+e.target.value)}
 style={{width:30,height:24,textAlign:"center",border:"none",borderRadius:4,background:bg,fontWeight:700,fontSize:11,outline:"none",fontFamily:"inherit"}}/>
 </td>
 ))}
 <td style={{...TD,textAlign:"center",fontWeight:700,color:G.mid,fontSize:11}}>
 {lbl==="Par"?t.pars.reduce((s,v)=>s+v,0):" "}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 ))}
 <Btn onClick={()=>addTee(course.id)} style={{marginTop:4}}>+ Add Tee Set</Btn>
 </div>
 );
 })()}

 <div style={{marginTop:16,display:"flex",justifyContent:"flex-end"}}>
 <Btn bg={libSaveStatus==="saved"?G.mid:G.gold} onClick={onLibrarySave}>
 {libSaveStatus==="saving"?"Saving ":libSaveStatus==="saved"?" Saved":" Save Roster & Courses"}
 </Btn>
 </div>
 </div>
 )}
 </div>
 );
}

// ------------------------------------------------------------
// ROUND SETUP BANNER (mobile-friendly)
// ------------------------------------------------------------
function RoundSetupBanner({library, round, setRound}) {
 const course = library.courses.find(c=>c.active) || library.courses[0];
 const activePlayers = library.roster.filter(p=>p.active);
 const activeGames = round.activeGames?.length ? round.activeGames : [round.gameFormat||"stroke_net"];

 const getTeeForPlayer = (pl) => round.playerTees[pl.id] || pl.defaultTee;
 const setPlayerTee = (pid, tid) => setRound(r=>({...r, playerTees:{...r.playerTees,[pid]:tid}}));

 return (
 <div style={{background:G.lite,borderRadius:12,padding:"12px 14px",marginBottom:14,border:"1px solid "+G.border}}>
 {/* Top row: round name + date */}
 <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
 <input value={round.name} onChange={e=>setRound(r=>({...r,name:e.target.value}))}
 style={{flex:1,minWidth:120,padding:"6px 10px",border:"1.5px solid #C8E6C9",borderRadius:8,fontSize:13,outline:"none",fontFamily:"inherit",fontWeight:700}}/>
 <input type="date" value={round.date} onChange={e=>setRound(r=>({...r,date:e.target.value}))}
 style={{padding:"6px 10px",border:"1.5px solid #C8E6C9",borderRadius:8,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
 </div>
 {/* Course + games info */}
 <div style={{fontSize:12,color:G.muted,marginBottom:10,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
 <span style={{fontWeight:700,color:G.dark}}> {course.name}</span>
 <span> .</span>
 {activeGames.slice(0,2).map(gid=>{
 const gf=GAME_FORMATS.find(f=>f.id===gid);
 return gf?<span key={gid} style={{background:"#FEF9E7",color:"#7A5C00",padding:"1px 7px",borderRadius:99,fontSize:11,fontWeight:600,border:"1px solid #E6C96A"}}>{gf.icon} {gf.name}</span>:null;
 })}
 {activeGames.length>2&&<span style={{fontSize:11,color:G.muted}}>+{activeGames.length-2} more</span>}
 </div>
 {/* Tee assignments - compact cards */}
 <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
 {activePlayers.map(pl=>{
 const teeId = getTeeForPlayer(pl);
 const tee = getTee(course.tees, teeId);
 return(
 <div key={pl.id} style={{background:"#fff",borderRadius:8,padding:"6px 10px",
 border:"1px solid "+G.border,display:"flex",alignItems:"center",gap:6,minWidth:0}}>
 <span style={{fontWeight:700,fontSize:12,color:G.dark,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:90}}>{pl.name.split(" ")[0]}</span>
 <select value={teeId} onChange={e=>setPlayerTee(pl.id,e.target.value)}
 style={{padding:"3px 6px",borderRadius:6,border:"1px solid "+G.border,
 fontSize:12,fontFamily:"inherit",background:tee.color,
 color:isLight(tee.color)?"#333":"#fff",fontWeight:700,maxWidth:70}}>
 {course.tees.map(t=><option key={t.id} value={t.id} style={{background:"#fff",color:"#333"}}>{t.name}</option>)}
 </select>
 </div>
 );
 })}
 </div>
 </div>
 );
}

// ------------------------------------------------------------
// Build active player list
// ------------------------------------------------------------
function buildActivePlayers(library, round) {
 return library.roster
 .filter(p=>p.active)
 .map(p=>({
 ...p,
 teeId: round.playerTees[p.id] || p.defaultTee,
 }));
}

// ------------------------------------------------------------
// SCORE GRID
// ------------------------------------------------------------
function ScoreGrid({players, tees, scores, onChange}) {
 const baseTee = tees[0];
 return (
 <div style={{overflowX:"auto"}}>
 <table style={{borderCollapse:"collapse",minWidth:1100}}>
 <thead>
 <tr>
 <th style={{...TH,minWidth:130,position:"sticky",left:0,background:"#fff",zIndex:10}} rowSpan={2}>Player</th>
 <th style={TH} rowSpan={2}>Tee</th>
 <th style={TH} rowSpan={2}>HCP</th>
 <th style={TH} rowSpan={2}>CHCP</th>
 {["OUT","IN","GRS","NET","SBF","PUTTS"].map(h=>(
 <th key={h} style={{...TH,background:G.gold}} rowSpan={2}>{h}</th>
 ))}
 <th style={{...TH,background:"#2D6A4F",textAlign:"center"}} colSpan={9}>FRONT 9</th>
 <th style={{...TH,background:"#1A6B40",textAlign:"center"}} colSpan={9}>BACK 9</th>
 </tr>
 <tr>
 {HOLES.map(i=>(
 <th key={i} style={{...TH,background:i<9?"#2D6A4F":"#1A6B40",minWidth:42,fontSize:10}}>
 <div>H{i+1}</div><div style={{opacity:.65,fontWeight:400}}>P{baseTee.pars[i]}</div>
 </th>
 ))}
 </tr>
 </thead>
 <tbody>
 {players.map((pl,pi)=>{
 const tee=getTee(tees,pl.teeId), ch=courseHcp(pl.hcpIdx,tee), gs=scores[pl.id]||{};
 const g=calcGross(gs); // Final gross (only if complete)
 const gRunning=calcGrossRunning(gs); // Running gross
 const net=g!=null?g-ch:null; // Final net
 const netRunning=calcNetRunning(gs,tee,ch); // Running net with proper stroke allocation
 return(
 <tr key={pl.id} style={{background:pi%2===0?"#F4F9F5":"#fff"}}>
 <td style={{...TD,fontWeight:700,color:G.dark,position:"sticky",left:0,background:pi%2===0?"#F4F9F5":"#fff",zIndex:5}}>{pl.name}</td>
 <td style={{...TD,textAlign:"center"}}><TeeBadge teeId={pl.teeId} tees={tees}/></td>
 <td style={{...TD,textAlign:"center",color:G.muted}}>{pl.hcpIdx}</td>
 <td style={{...TD,textAlign:"center",color:G.mid,fontWeight:800}}>{ch}</td>
 {[{v:calcSeg(gs,H9)??' ',bg:"#FFFBF0",c:G.dark},{v:calcSeg(gs,B9)??' ',bg:"#FFFBF0",c:G.dark},
 {v:gRunning??' ',bg:"#FFFBF0",c:G.dark},{v:netRunning??' ',bg:"#EEF7F0",c:G.mid},
 {v:calcSbf(gs,tee,ch)??' ',bg:G.goldPale,c:G.gold},{v:calcPutts(gs)??' ',bg:"#FFFBF0",c:G.dark}
 ].map(({v,bg,c},idx)=>(
 <td key={idx} style={{...TD,textAlign:"center",fontWeight:700,background:bg,color:c}}>{v}</td>
 ))}
 {HOLES.map(i=>{
 const val=gs["h"+i]??"", ss=scoreStyle(val,tee.pars[i]);
 const hasStroke = Math.floor(ch/18)+(tee.si[i]<=(ch%18)?1:0) > 0;
 return(
 <td key={i} style={{padding:"2px",border:"1px solid #ddd",position:"relative"}}>
 {hasStroke&&<div style={{position:"absolute",top:2,left:2,width:6,height:6,borderRadius:"50%",background:G.gold}}/>}
 <input type="number" min={1} max={15} value={val} placeholder=" "
 onChange={e=>onChange(pl.id,"h"+i,e.target.value===""?"":+e.target.value)}
 style={{width:38,height:30,textAlign:"center",border:"none",borderRadius:6,fontWeight:700,fontSize:13,outline:"none",fontFamily:"inherit",...ss}}/>
 </td>
 );
 })}
 </tr>
 );
 })}
 {players.map((pl)=>{
 const gs=scores[pl.id]||{};
 return(
 <tr key={"pt"+pl.id} style={{background:"#FFFBF0"}}>
 <td style={{...TD,color:G.gold,fontSize:11,fontWeight:700,position:"sticky",left:0,background:"#FFFBF0",zIndex:5}}>{pl.name} Putts</td>
 <td colSpan={9} style={TD}/>
 {HOLES.map(i=>(
 <td key={i} style={{padding:"2px",border:"1px solid #ddd"}}>
 <input type="number" min={0} max={5} value={gs["p"+i]??""} placeholder=" "
 onChange={e=>onChange(pl.id,"p"+i,e.target.value===""?"":+e.target.value)}
 style={{width:38,height:26,textAlign:"center",border:"none",borderRadius:5,background:"#FFF8E7",color:"#8B6914",fontWeight:600,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
 </td>
 ))}
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 );
}

// ------------------------------------------------------------
// LEADERBOARD (mobile cards)
// ------------------------------------------------------------
function Leaderboard({players,tees,scores,fmt,setFmt}){
 const rows=players.map(pl=>{
 const tee=getTee(tees,pl.teeId),ch=courseHcp(pl.hcpIdx,tee),gs=scores[pl.id]||{};
 const g=calcGross(gs); // Final gross (only if all 18 holes)
 const gRunning=calcGrossRunning(gs); // Running gross total
 const netRunning=calcNetRunning(gs,tee,ch); // Running net with proper stroke allocation
 // Calculate par for holes actually played
 let parForHolesPlayed=0;
 HOLES.forEach(i=>{
 if(holeGross(gs,i)!=null) parForHolesPlayed+=tee.pars[i];
 });
 const toPar=gRunning!=null?gRunning-parForHolesPlayed:null; // Over/under par
 return{id:pl.id,name:pl.name,teeId:pl.teeId,ch,gross:g,grossRunning:gRunning,net:g!=null?g-ch:null,netRunning,sbf:calcSbf(gs,tee,ch),putts:calcPutts(gs),done:g!=null,toPar};
 });
 const key={["Low Net"]:"netRunning",Stableford:"sbf",["Total Putts"]:"putts",Gross:"grossRunning"}[fmt];
 const asc=fmt!=="Stableford";
 const ranked=[...rows.filter(r=>r[key]!=null)].sort((a,b)=>asc?a[key]-b[key]:b[key]-a[key]);
 const rankOf=id=>{const i=ranked.findIndex(r=>r.id===id);return i>=0?i+1:null;};
 const medal=r=>`#${r}`;
 return(
 <div>
 {/* Rank-by pill filters */}
 <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14,alignItems:"center"}}>
 <span style={{color:G.muted,fontSize:12,alignSelf:"center"}}>Rank by:</span>
 {["Low Net","Stableford","Total Putts","Gross"].map(f=><Pill key={f} label={f} active={fmt===f} onClick={()=>setFmt(f)}/>)}
 </div>
 {/* Mobile-friendly leaderboard cards */}
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 {ranked.map((r,idx)=>{
 const rk=idx+1; // Rank is position in sorted array
 return(
 <div key={r.id} style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid "+G.border,
 boxShadow:rk===1?"0 2px 10px rgba(45,106,79,.12)":"none",
 borderLeft:rk===1?"4px solid "+G.gold:rk===2?"4px solid #9E9E9E":rk===3?"4px solid #CD7F32":"4px solid "+G.border}}>
 <div style={{display:"flex",alignItems:"center",gap:10}}>
 <div style={{fontSize:24,width:36,textAlign:"center",flexShrink:0}}>{medal(rk)}</div>
 <div style={{flex:1,minWidth:0}}>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
 <span style={{fontWeight:700,fontSize:15,color:G.dark}}>{r.name}</span>
 <TeeBadge teeId={r.teeId} tees={tees}/>
 <span style={{fontSize:11,color:G.muted}}>CHCP {r.ch}</span>
 <span style={{padding:"2px 8px",borderRadius:99,fontSize:11,fontWeight:700,background:r.done?"#D8F3DC":"#FFF3CD",color:r.done?G.dark:"#856404",marginLeft:"auto"}}>{r.done?" Done":"In Progress"}</span>
 </div>
 <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
 {[
 {label:"Gross",val:r.grossRunning??' ',highlight:false},
 {label:"To Par",val:r.toPar!=null?(r.toPar===0?"E":(r.toPar>0?"+"+r.toPar:r.toPar)):' ',highlight:true,color:r.toPar!=null?(r.toPar<0?G.mid:r.toPar===0?G.muted:G.red):G.dark},
 {label:"Net",val:r.netRunning??' ',highlight:true,color:G.mid},
 {label:"Stableford",val:r.sbf??' ',highlight:true,color:G.gold},
 {label:"Putts",val:r.putts??' ',highlight:false},
 ].map(({label,val,highlight,color})=>(
 <div key={label} style={{textAlign:"center",background:highlight?"#F0FAF4":"#F8F9FA",borderRadius:8,padding:"5px 2px"}}>
 <div style={{fontSize:9,color:G.muted,fontWeight:600,letterSpacing:.5}}>{label}</div>
 <div style={{fontSize:16,fontWeight:800,color:color||G.dark,lineHeight:1.2}}>{val}</div>
 </div>
 ))}
 </div>
 </div>
 </div>
 </div>
 );
 })}
 </div>
 </div>
 );
}

// ------------------------------------------------------------
// SKINS (mobile-friendly)
// ------------------------------------------------------------
function Skins({players,tees,scores}){
 const chs=players.map(pl=>courseHcp(pl.hcpIdx,getTee(tees,pl.teeId)));
 const minCH=Math.min(...chs);
 let carry=0; const rows=[],totals={};
 HOLES.forEach(i=>{
 const nets=players.map((pl,pi)=>{const g=holeGross(scores[pl.id]||{},i);if(g==null)return null;const tee=getTee(tees,pl.teeId);return{name:pl.name,net:g-strokesOnHole(chs[pi],minCH,tee.si[i])};}).filter(Boolean);
 const skin=1+carry;let winner,isCarry=false;
 if(nets.length===players.length){const mn=Math.min(...nets.map(s=>s.net));const w=nets.filter(s=>s.net===mn);if(w.length===1){winner=w[0].name;totals[winner]=(totals[winner]||0)+skin;carry=0;}else{winner="Carry ";isCarry=true;carry=skin;}}else{winner=" ";}
 const par=getTee(tees,players[0]?.teeId||tees[0].id).pars[i];
 rows.push({hole:i+1,par,winner,skin,isCarry});
 });
 return(
 <div>
 {/* Winner totals - big mobile cards */}
 <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
 {Object.entries(totals).sort((a,b)=>b[1]-a[1]).map(([name,s])=>(
 <div key={name} style={{background:`linear-gradient(135deg,${G.mid},${G.dark})`,color:"#fff",borderRadius:12,padding:"12px 18px",textAlign:"center",minWidth:80,flex:1}}>
 <div style={{fontSize:28,fontWeight:800,lineHeight:1}}>{s}</div>
 <div style={{fontSize:11,opacity:.8,marginTop:2}}>{name.split(" ")[0]}</div>
 <div style={{fontSize:10,opacity:.6}}>skin{s!==1?"s":""}</div>
 </div>
 ))}
 {!Object.keys(totals).length&&<span style={{color:G.muted,fontSize:13}}>No scores yet.</span>}
 </div>
 {/* Hole results as compact list */}
 <div style={{display:"flex",flexDirection:"column",gap:4}}>
 {rows.map((r,i)=>(
 <div key={r.hole} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:8,background:r.isCarry?"#FFF8F0":i%2===0?"#F4F9F5":"#fff",border:"1px solid "+G.border}}>
 <div style={{width:28,height:28,borderRadius:"50%",background:G.dark,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12,flexShrink:0}}>{r.hole}</div>
 <div style={{fontSize:12,color:G.muted,flexShrink:0}}>P{r.par}</div>
 <div style={{flex:1,fontWeight:700,fontSize:13,color:r.isCarry?G.gold:G.dark}}>{r.winner}</div>
 <div style={{display:"flex",alignItems:"center",gap:6}}>
 <span style={{background:G.mid,color:"#fff",borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700}}>{r.skin} skin{r.skin!==1?"s":""}</span>
 {r.isCarry&&<span style={{fontSize:11,color:G.gold}}> </span>}
 </div>
 </div>
 ))}
 </div>
 </div>
 );
}

// ------------------------------------------------------------
// NASSAU (mobile-friendly cards)
// ------------------------------------------------------------
function Nassau({players,tees,scores}){
 const chs=players.map(pl=>courseHcp(pl.hcpIdx,getTee(tees,pl.teeId)));
 const minCH=Math.min(...chs);
 const seg=range=>players.map((pl,pi)=>{const gs=scores[pl.id]||{},tee=getTee(tees,pl.teeId);let t=0,c=0;range.forEach(i=>{const g=holeGross(gs,i);if(g!=null){t+=g-strokesOnHole(chs[pi],minCH,tee.si[i]);c++;}});return c===range.length?t:null;});
 const res=tots=>{const v=tots.filter(t=>t!=null);if(!v.length)return tots.map(()=>" ");const mn=Math.min(...v),mx=Math.max(...v);if(mn===mx)return tots.map(t=>t!=null?"AS":" ");return tots.map(t=>t===null?" ":t===mn?"W ":t===mx?"L ":"AS");};
 const fT=seg(H9),bT=seg(B9),oT=seg(HOLES),fR=res(fT),bR=res(bT),oR=res(oT);
 const rc=r=>r==="W "?G.mid:r==="L "?G.red:G.muted;
 const segBg=r=>r==="W "?"#D8F3DC":r==="L "?"#FEE2E2":"#F5F5F5";
 return(
 <div style={{display:"flex",flexDirection:"column",gap:10}}>
 {players.map((pl,i)=>(
 <div key={pl.id} style={{background:"#fff",borderRadius:12,padding:"12px 14px",border:"1px solid "+G.border}}>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
 <TeeBadge teeId={pl.teeId} tees={tees}/>
 <span style={{fontWeight:700,fontSize:15,color:G.dark}}>{pl.name}</span>
 <span style={{fontSize:11,color:G.muted}}>CHCP {chs[i]}</span>
 </div>
 <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
 {[
 {label:"Front 9",net:fT[i],result:fR[i],bg:"#2D6A4F"},
 {label:"Back 9",net:bT[i],result:bR[i],bg:"#1A6B40"},
 {label:"Overall",net:oT[i],result:oR[i],bg:G.gold},
 ].map(({label,net,result,bg})=>(
 <div key={label} style={{borderRadius:10,overflow:"hidden",border:"1px solid "+G.border}}>
 <div style={{background:bg,color:"#fff",padding:"4px 8px",fontSize:10,fontWeight:700,textAlign:"center"}}>{label}</div>
 <div style={{padding:"8px 4px",textAlign:"center",background:segBg(result)}}>
 <div style={{fontSize:18,fontWeight:800,color:rc(result)}}>{result}</div>
 <div style={{fontSize:12,color:G.muted}}>Net: {net??' '}</div>
 </div>
 </div>
 ))}
 </div>
 </div>
 ))}
 </div>
 );
}

// ------------------------------------------------------------
// MATCH PLAY (ROUND ROBIN)
// ------------------------------------------------------------
function MatchPlay({players,tees,scores}) {
 if (!players || players.length < 2) {
 return (
 <div style={{textAlign:"center",padding:40,color:G.muted}}>
 <div style={{fontSize:16,marginBottom:8}}>Match Play requires at least 2 active players.</div>
 <div style={{fontSize:12}}>Go to Setup to activate players.</div>
 </div>
 );
 }

 // Calculate all head-to-head matchups
 const matchups = [];
 for (let i = 0; i < players.length; i++) {
 for (let j = i + 1; j < players.length; j++) {
 const p1 = players[i];
 const p2 = players[j];
 const t1 = getTee(tees, p1.teeId);
 const t2 = getTee(tees, p2.teeId);
 const ch1 = courseHcp(p1.hcpIdx, t1);
 const ch2 = courseHcp(p2.hcpIdx, t2);
 const minCH = Math.min(ch1, ch2);
 
 let p1Up = 0;
 let holesPlayed = 0;
 
 HOLES.forEach(holeIdx => {
 const g1 = holeGross(scores[p1.id] || {}, holeIdx);
 const g2 = holeGross(scores[p2.id] || {}, holeIdx);
 
 if (g1 != null && g2 != null) {
 const s1 = strokesOnHole(ch1, minCH, t1.si[holeIdx]);
 const s2 = strokesOnHole(ch2, minCH, t2.si[holeIdx]);
 const net1 = g1 - s1;
 const net2 = g2 - s2;
 
 if (net1 < net2) p1Up++;
 else if (net2 < net1) p1Up--;
 
 holesPlayed++;
 }
 });
 
 const holesRemaining = 18 - holesPlayed;
 const isComplete = holesPlayed === 18 || Math.abs(p1Up) > holesRemaining;
 
 let status;
 if (holesPlayed === 0) {
 status = "Not Started";
 } else if (isComplete) {
 if (p1Up > 0) status = `${p1.name} Won ${p1Up}UP`;
 else if (p1Up < 0) status = `${p2.name} Won ${Math.abs(p1Up)}UP`;
 else status = "Halved";
 } else {
 if (p1Up > 0) status = `${p1.name} ${p1Up}UP (${holesPlayed} holes)`;
 else if (p1Up < 0) status = `${p2.name} ${Math.abs(p1Up)}UP (${holesPlayed} holes)`;
 else status = `All Square (${holesPlayed} holes)`;
 }
 
 matchups.push({
 p1, p2, p1Up, holesPlayed, holesRemaining, isComplete, status
 });
 }
 }
 
 // Calculate standings
 const standings = players.map(pl => {
 let wins = 0, losses = 0, halves = 0;
 matchups.forEach(m => {
 if (m.isComplete) {
 if (m.p1.id === pl.id) {
 if (m.p1Up > 0) wins++;
 else if (m.p1Up < 0) losses++;
 else halves++;
 } else if (m.p2.id === pl.id) {
 if (m.p1Up < 0) wins++;
 else if (m.p1Up > 0) losses++;
 else halves++;
 }
 }
 });
 return { ...pl, wins, losses, halves, points: wins * 2 + halves };
 }).sort((a, b) => b.points - a.points);

 return (
 <div>
 {/* Standings */}
 <div style={{marginBottom:20}}>
 <h3 style={{margin:"0 0 12px 0",fontSize:15,fontWeight:700,color:G.dark}}>Standings</h3>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 {standings.map((pl, idx) => (
 <div key={pl.id} style={{background:"#fff",borderRadius:10,padding:"10px 12px",border:"1px solid "+G.border,
 borderLeft:idx===0?"4px solid "+G.gold:"1px solid "+G.border}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
 <div style={{display:"flex",alignItems:"center",gap:8}}>
 <span style={{fontSize:18,fontWeight:800,color:G.dark}}>#{idx+1}</span>
 <span style={{fontWeight:700,fontSize:14,color:G.dark}}>{pl.name}</span>
 <TeeBadge teeId={pl.teeId} tees={tees}/>
 </div>
 <div style={{display:"flex",alignItems:"center",gap:12,fontSize:12}}>
 <span style={{color:G.mid,fontWeight:700}}>{pl.wins}W</span>
 <span style={{color:G.red,fontWeight:700}}>{pl.losses}L</span>
 <span style={{color:G.muted,fontWeight:700}}>{pl.halves}H</span>
 <span style={{background:G.gold,color:"#fff",padding:"2px 8px",borderRadius:99,fontWeight:800,fontSize:11}}>{pl.points} pts</span>
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>

 {/* All Matchups */}
 <div>
 <h3 style={{margin:"0 0 12px 0",fontSize:15,fontWeight:700,color:G.dark}}>All Matches</h3>
 <div style={{display:"flex",flexDirection:"column",gap:8}}>
 {matchups.map((m, idx) => (
 <div key={idx} style={{background:"#fff",borderRadius:10,padding:"10px 12px",border:"1px solid "+G.border}}>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
 <div style={{display:"flex",alignItems:"center",gap:8}}>
 <span style={{fontWeight:700,fontSize:13,color:G.dark}}>{m.p1.name}</span>
 <span style={{fontSize:12,color:G.muted}}>vs</span>
 <span style={{fontWeight:700,fontSize:13,color:G.dark}}>{m.p2.name}</span>
 </div>
 <div style={{fontSize:12,fontWeight:700,color:m.isComplete?(m.p1Up>0?G.mid:m.p1Up<0?G.red:G.muted):G.muted}}>
 {m.status}
 </div>
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 );
}

// ------------------------------------------------------------
// ROUND ROBIN
// ------------------------------------------------------------
export default function GolfTrackerV23ArchiveFix() {
 const [tab, setTab] = useState("entry");
 const [fmt, setFmt] = useState("Low Net");
 const [library, setLibrary] = useState(DEF_LIBRARY);
 const [round, setRound] = useState(DEF_ROUND);
 const [archive, setArchive] = useState([]);
 const [savedRounds, setSavedRounds] = useState([]);
 const [loading, setLoading] = useState(true);

 const [libSync, setLibSync] = useState("saved");
 const [roundSync, setRoundSync]= useState("saved");
 const [libSaved, setLibSaved] = useState("");
 const [roundSaved,setRoundSaved]=useState("");
 const [showNewRoundConfirm, setShowNewRoundConfirm] = useState(false);

 const libInit = useRef(false);
 const roundInit = useRef(false);
 const roundSaveTimer = useRef(null);
 const libSaveTimer = useRef(null);

 useEffect(()=>{
 (async()=>{
 try {
 // Try v14 first, fall back to v13 for migration
 let lr = await storage.get("golf_library_v14", true);
 if (!lr?.value) {
 // Migrate from v13
 lr = await storage.get("golf_library_v13", true);
 if (lr?.value) {
 console.log(" ... Migrating library from v13 to v14...");
 // Will be saved as v14 on first save
 }
 }
 if (lr?.value) {
 const d=JSON.parse(lr.value);
 if(d.roster) setLibrary(l=>({...l,roster:d.roster}));
 if(d.courses) setLibrary(l=>({...l,courses:d.courses}));
 if(d.savedAt) setLibSaved(new Date(d.savedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}));
 }
 } catch(e) { console.error("Load library error:", e); }
 try {
 let rr = await storage.get("golf_round_v14", true);
 if (!rr?.value) {
 rr = await storage.get("golf_round_v13", true);
 if (rr?.value) console.log(" ... Migrating round from v13 to v14...");
 }
 if (rr?.value) {
 const d=JSON.parse(rr.value);
 setRound(d);
 if(d.savedAt) setRoundSaved(new Date(d.savedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}));
 }
 } catch(e) { console.error("Load round error:", e); }
 try {
 let ar = await storage.get("golf_archive_v14", false);
 if (!ar?.value) {
 ar = await storage.get("golf_archive_v13", false);
 if (ar?.value) console.log(" ... Migrating archive from v13 to v14...");
 }
 if (ar?.value) setArchive(JSON.parse(ar.value));
 } catch(e) { console.error("Load archive error:", e); }
 try {
 let sr = await storage.get("golf_saved_rounds_v14", false);
 if (!sr?.value) {
 sr = await storage.get("golf_saved_rounds_v13", false);
 if (sr?.value) console.log(" ... Migrating saved rounds from v13 to v14...");
 }
 if (sr?.value) setSavedRounds(JSON.parse(sr.value));
 } catch(e) { console.error("Load saved rounds error:", e); }
 setLoading(false);
 libInit.current = true;
 roundInit.current = true;
 })();
 },[]);

 useEffect(()=>{ 
 if(libInit.current) {
 setLibSync("idle");
 // Auto-save library after 5 seconds (less frequent than rounds)
 if(libSaveTimer.current) clearTimeout(libSaveTimer.current);
 libSaveTimer.current = setTimeout(async ()=>{
 setLibSync("saving");
 try {
 const d={roster:library.roster,courses:library.courses,savedAt:new Date().toISOString()};
 await storage.set("golf_library_v14", JSON.stringify(d), true);
 setLibSaved(new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}));
 setLibSync("saved");
 } catch(e){ 
 console.error("Auto-save library failed:", e);
 setLibSync("error"); 
 }
 }, 5000);
 }
 return () => {
 if(libSaveTimer.current) clearTimeout(libSaveTimer.current);
 };
 },[library]);

 useEffect(()=>{ 
 if(roundInit.current) {
 setRoundSync("idle");
 // Auto-save after 2 seconds of inactivity
 if(roundSaveTimer.current) clearTimeout(roundSaveTimer.current);
 roundSaveTimer.current = setTimeout(async ()=>{
 setRoundSync("saving");
 try {
 const d={...round,savedAt:new Date().toISOString()};
 await storage.set("golf_round_v14", JSON.stringify(d), true);
 setRoundSaved(new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}));
 setRoundSync("saved");
 } catch(e){ 
 console.error("Auto-save round failed:", e);
 setRoundSync("error"); 
 }
 }, 2000);
 }
 return () => {
 if(roundSaveTimer.current) clearTimeout(roundSaveTimer.current);
 };
 },[round]);

 const saveLibrary = async()=>{
 setLibSync("saving");
 try {
 const d={roster:library.roster,courses:library.courses,savedAt:new Date().toISOString()};
 await storage.set("golf_library_v14", JSON.stringify(d), true);
 setLibSaved(new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}));
 setLibSync("saved");
 } catch(e){ 
 console.error("Manual save library failed:", e);
 setLibSync("error"); 
 }
 };

 const saveRound = async()=>{
 setRoundSync("saving");
 try {
 const d={...round,savedAt:new Date().toISOString()};
 await storage.set("golf_round_v14", JSON.stringify(d), true);
 setRoundSaved(new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}));
 setRoundSync("saved");
 } catch(e){ 
 console.error("Manual save round failed:", e);
 setRoundSync("error"); 
 }
 };

 const updateScore = useCallback((pid,field,val)=>{
 setRound(prev=>({...prev,scores:{...prev.scores,[pid]:{...(prev.scores[pid]||{}),[field]:val}}}));
 },[]);

 const handleArchiveRound = async () => {
 const course = library.courses.find(c=>c.active) || library.courses[0];
 const activePlayers = library.roster.filter(p=>p.active).map(p=>({
 ...p, teeId: round.playerTees[p.id] || p.defaultTee
 }));
 const archiveEntry = {
 ...round,
 archivedAt: new Date().toISOString(),
 courseName: course.name,
 courseData: course,
 rosterData: library.roster,
 activeGames: activeGames,
 players: activePlayers.map(pl=>{
 const tee = getTee(course.tees, pl.teeId);
 const ch = courseHcp(pl.hcpIdx, tee);
 const gs = round.scores[pl.id] || {};
 return { name:pl.name, gross:calcGross(gs), net:(calcGross(gs)||0)-ch, sbf:calcSbf(gs,tee,ch) };
 })
 };
 const newArchive = [...archive, archiveEntry];
 setArchive(newArchive);
 try {
 await storage.set("golf_archive_v14", JSON.stringify(newArchive), false);
 alert("✅ Round archived successfully!\n\nYou can re-export it anytime from the Export tab.");
 } catch(e) { 
 alert("⚠️ Archive save error: "+e.message+"\n\nTry again or contact support."); 
 console.error("Archive save failed:", e);
 }
 };

 const finalizeRound = async () => {
 const course = library.courses.find(c=>c.active) || library.courses[0];
 const activePlayers = library.roster.filter(p=>p.active).map(p=>({
 ...p, teeId: round.playerTees[p.id] || p.defaultTee
 }));

 // Check if round is complete
 const completedPlayers = activePlayers.filter(p=>calcGross(round.scores[p.id]||{})!=null).length;
 if (completedPlayers !== activePlayers.length) {
 if (!window.confirm(`Only ${completedPlayers}/${activePlayers.length} players have completed all 18 holes. Finalize anyway?`)) return;
 }

 // Calculate results for all players
 const results = activePlayers.map(pl=>{
 const tee = getTee(course.tees, pl.teeId);
 const ch = courseHcp(pl.hcpIdx, tee);
 const gs = round.scores[pl.id] || {};
 const gross = calcGross(gs);
 const net = gross != null ? gross - ch : null;
 const sbf = calcSbf(gs,tee,ch);
 const putts = calcPutts(gs);
 return {
 name: pl.name,
 tee: tee.name,
 hcp: pl.hcpIdx,
 courseHcp: ch,
 gross,
 net,
 stableford: sbf,
 putts,
 front9: calcSeg(gs,H9),
 back9: calcSeg(gs,B9),
 };
 }).sort((a,b)=>(a.net||999)-(b.net||999));

 // Create summary
 const winner = results[0];
 const summary = ` ROUND COMPLETE! 

${round.name} - ${round.date}
${course.name}

 WINNER: ${winner.name}
 Net Score: ${winner.net} (Gross: ${winner.gross})
 Stableford: ${winner.stableford} pts

 FINAL STANDINGS:
${results.map((r,i)=>`${i+1}. ${r.name}: ${r.net} net (${r.gross} gross, ${r.stableford} pts)`).join('\n')}

Round has been archived and can be re-exported anytime!`;

 // Archive the round
 const archiveEntry = {
 ...round,
 finalized: true,
 finalizedAt: new Date().toISOString(),
 archivedAt: new Date().toISOString(),
 courseName: course.name,
 courseData: course,
 rosterData: library.roster,
 activeGames: activeGames,
 players: results,
 summary,
 };

 const newArchive = [...archive, archiveEntry];
 setArchive(newArchive);

 // Remove this round from saved rounds if it exists there
 const roundMatchesSaved = (saved) => 
 saved.name === round.name && 
 saved.date === round.date &&
 JSON.stringify(saved.scores) === JSON.stringify(round.scores);

 const newSaved = savedRounds.filter(saved => !roundMatchesSaved(saved));
 if (newSaved.length !== savedRounds.length) {
 setSavedRounds(newSaved);
 try {
 await storage.set("golf_saved_rounds_v14", JSON.stringify(newSaved), false);
 } catch(e) { console.error("Error updating saved rounds:", e); }
 }

 try {
 await storage.set("golf_archive_v14", JSON.stringify(newArchive), true);

 // Show summary
 alert(summary);

 // Auto-export to Excel and prompt to share
 if (window.confirm("Export scorecard to Excel?")) {
 exportRoundToExcel(round, library);
 setTimeout(() => {
 alert("Scorecard exported!\n\n📱 ON IPHONE:\n1. Check Downloads folder (Files app)\n2. Tap the Excel file\n3. Tap the share icon\n4. Choose Email or WhatsApp\n5. Send to your group!\n\n💻 ON DESKTOP:\nFile saved to Downloads folder - attach to email.");
 }, 800);
 }

 // Ask if they want to start a new round
 if (window.confirm("Start a new round?")) {
 newRound(true); // Skip the confirmation since we just asked
 } else {
 setTab("export");
 }
 } catch(e) {
 alert("Error archiving round: "+e.message);
 }
 };

 const newRound = (skipConfirm = false) => {
 if (!skipConfirm) {
 setShowNewRoundConfirm(true);
 return;
 }
 const fresh = {
 name: "Round " + new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"}),
 date: new Date().toISOString().split("T")[0],
 gameFormat: round.gameFormat || "stroke_net",
 activeGames: round.activeGames?.length ? round.activeGames : ["stroke_net"],
 playerTees: { ...round.playerTees }, // keep tee assignments
 scores: {}, // clear scores only
 };
 setRound(fresh);
 setRoundSync("idle");
 setTab("entry");
 };

 const saveCurrentRound = async () => {
 const course = library.courses.find(c=>c.active) || library.courses[0];
 const activePlayers = library.roster.filter(p=>p.active);
 const completedHoles = HOLES.filter(i => activePlayers.every(p => holeGross((round.scores[p.id]||{}), i) !== null)).length;

 const savedEntry = {
 ...round,
 savedAt: new Date().toISOString(),
 courseName: course.name,
 courseId: course.id,
 playerCount: activePlayers.length,
 completedHoles,
 progress: `${completedHoles}/18 holes`,
 };

 const newSaved = [...savedRounds, savedEntry];
 setSavedRounds(newSaved);
 try {
 await storage.set("golf_saved_rounds_v14", JSON.stringify(newSaved), false);
 alert(`Round "${round.name}" saved! You can resume it later from the Saved Rounds tab.`);
 } catch(e) { alert("Error saving round: "+e.message); }
 };

 const loadSavedRound = (saved) => {
 if (!window.confirm(`Load "${saved.name}"? This will replace your current round.`)) return;
 setRound({
 name: saved.name,
 date: saved.date,
 gameFormat: saved.gameFormat,
 activeGames: saved.activeGames || [saved.gameFormat],
 playerTees: saved.playerTees || {},
 scores: saved.scores || {},
 });
 setRoundSync("idle"); // Reset sync state to trigger save
 setTab("entry");
 alert(`Loaded "${saved.name}". Continue scoring where you left off!`);
 };

 const deleteSavedRound = async (index) => {
 if (!window.confirm("Delete this saved round?")) return;
 const newSaved = savedRounds.filter((_, i) => i !== index);
 setSavedRounds(newSaved);
 try {
 await storage.set("golf_saved_rounds_v14", JSON.stringify(newSaved), false);
 alert("Saved round deleted successfully!");
 } catch(e) { 
 console.error("Error deleting saved round:", e);
 alert("Error deleting saved round: " + e.message);
 }
 };

 const activeCourse = library.courses.find(c=>c.active) || library.courses[0];
 const activeTees = activeCourse.tees;
 const activePlayers = buildActivePlayers(library, round);
 const activeGames = round.activeGames?.length ? round.activeGames : [round.gameFormat || "stroke_net"];
 const currentGameFmt = GAME_FORMATS.find(g=>g.id===activeGames[0]) || GAME_FORMATS[0];

 // Build dynamic tabs - only show game tabs for selected games
 const TABS = [
 {id:"entry", icon:" ", label:"Hole Entry"},
 {id:"scores", icon:" ", label:"Score Grid"},
 {id:"board", icon:" ", label:"Leaderboard"},
 // Only show game tabs if that game is selected
 ...((activeGames && activeGames.includes("match")) ? [{id:"match", icon:"vs", label:"Match Play"}] : []),
 ...((activeGames && activeGames.includes("skins")) ? [{id:"skins", icon:" deg", label:"Skins"}] : []),
 ...((activeGames && activeGames.includes("nassau")) ? [{id:"nassau", icon:" ", label:"Nassau"}] : []),
 ...((activeGames && activeGames.includes("bingo_bango_bongo")) ? [{id:"bingo", icon:" ", label:"Bingo Bango"}] : []),
 {id:"games", icon:" ", label:"Game Format"},
 {id:"saved", icon:" ", label:"Saved Rounds"},
 {id:"export", icon:" ", label:"Export"},
 {id:"setup", icon:" ", label:"Setup"},
 ];

 if (loading) return (
 <div style={{minHeight:"100vh",background:G.deep,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
 <div style={{fontSize:48}}> </div>
 <div style={{color:"#fff",fontSize:16,opacity:.8}}>Loading </div>
 </div>
 );

 return (
 <div style={{minHeight:"100vh",background:`linear-gradient(160deg,${G.deep} 0%,${G.dark} 45%,${G.deep} 100%)`,fontFamily:"system-ui,sans-serif"}}>

 {/* HEADER */}
 <div style={{background:"rgba(0,0,0,.5)",borderBottom:"1px solid rgba(255,255,255,.08)",padding:"0 12px",position:"sticky",top:0,zIndex:100,backdropFilter:"blur(10px)"}}>
 <div style={{maxWidth:1500,margin:"0 auto"}}>
 {/* Top bar */}
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0 4px",gap:8}}>
 <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
 <span style={{fontSize:22,flexShrink:0}}> </span>
 <div style={{minWidth:0}}>
 <div style={{fontFamily:"Georgia,serif",fontSize:15,fontWeight:900,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>Golf Tracker</div>
 <div style={{fontSize:9,color:G.bright,letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap",overflow:"hidden"}}>{round.name} . {round.date}</div>
 </div>
 </div>
 <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
 {roundSync==="idle" && <span style={{fontSize:10,color:"rgba(255,255,255,.5)",marginRight:2}}> </span>}
 {roundSync==="saving" && <span style={{fontSize:10,color:G.gold,marginRight:2}}> </span>}
 {roundSync==="saved" && <span style={{fontSize:10,color:G.bright,marginRight:2}}> </span>}
 <button onClick={saveCurrentRound}
 style={{background:"rgba(201,168,76,.25)",color:G.gold,border:"1px solid rgba(201,168,76,.4)",borderRadius:8,padding:"6px 10px",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
 Save
 </button>
 <button onClick={finalizeRound}
 style={{background:"rgba(46,125,79,.25)",color:G.bright,border:"1px solid rgba(46,125,79,.4)",borderRadius:8,padding:"6px 10px",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
 Finalize
 </button>
 <button onClick={()=>exportRoundToExcel(round,library)}
 style={{background:"rgba(82,183,136,.25)",color:G.bright,border:"1px solid rgba(82,183,136,.4)",borderRadius:8,padding:"6px 10px",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
 XLS
 </button>
 </div>
 </div>

 {/* Scrollable tab bar */}
 <div style={{display:"flex",gap:0,overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",msOverflowStyle:"none",paddingBottom:1}}>
 {TABS.map(t=>(
 <button key={t.id} onClick={()=>setTab(t.id)}
 style={{padding:"8px 11px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:600,whiteSpace:"nowrap",
 color:tab===t.id?"#fff":"rgba(255,255,255,.45)",
 borderBottom:tab===t.id?"3px solid "+G.bright:"3px solid transparent",transition:"all .18s",flexShrink:0}}>
 {t.icon}<br/><span style={{fontSize:9}}>{t.label}</span>
 </button>
 ))}
 </div>
 </div>
 </div>

 {/* BODY */}
 <div style={{maxWidth:1500,margin:"0 auto",padding:"12px 10px 60px"}}>

 <div style={{background:G.cream,borderRadius:14,padding:"14px 12px",boxShadow:"0 2px 16px rgba(0,0,0,.08)"}}>

 {tab!=="setup" && tab!=="games" && tab!=="export" && (
 <RoundSetupBanner library={library} round={round} setRound={setRound}/>
 )}

 {tab==="entry" && (
 <>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
 <span style={{fontSize:18}}> </span>
 <h2 style={{margin:0,fontSize:16,fontWeight:700,color:G.dark,fontFamily:"Georgia,serif"}}>Hole Entry</h2>
 </div>
 {activePlayers.length===0
 ? <div style={{textAlign:"center",padding:40,color:G.muted}}>No active players. Go to Setup Roster to activate players.</div>
 : <HoleEntry players={activePlayers} tees={activeTees} scores={round.scores} onChange={updateScore} activeCourse={activeCourse} onFinalize={finalizeRound}/>
 }
 </>
 )}

 {tab==="scores" && (
 <>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
 <span style={{fontSize:18}}> </span>
 <h2 style={{margin:0,fontSize:16,fontWeight:700,color:G.dark,fontFamily:"Georgia,serif"}}>Score Grid</h2>
 </div>
 {activePlayers.length===0
 ? <div style={{textAlign:"center",padding:40,color:G.muted}}>No active players. Go to Setup Roster to activate players.</div>
 : <ScoreGrid players={activePlayers} tees={activeTees} scores={round.scores} onChange={updateScore}/>
 }
 </>
 )}

 {tab==="board" && (
 <>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
 <span style={{fontSize:18}}> </span>
 <h2 style={{margin:0,fontSize:16,fontWeight:700,color:G.dark,fontFamily:"Georgia,serif"}}>Leaderboard</h2>
 </div>
 <Leaderboard players={activePlayers} tees={activeTees} scores={round.scores} fmt={fmt} setFmt={setFmt}/>
 </>
 )}


 {tab==="match" && (
 <>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
 <span style={{fontSize:18}}>vs</span>
 <h2 style={{margin:0,fontSize:16,fontWeight:700,color:G.dark,fontFamily:"Georgia,serif"}}>Match Play</h2>
 </div>
 <MatchPlay players={activePlayers} tees={activeTees} scores={round.scores}/>
 </>
 )}

 {tab==="skins" && (
 <>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
 <span style={{fontSize:18}}> deg</span>
 <h2 style={{margin:0,fontSize:16,fontWeight:700,color:G.dark,fontFamily:"Georgia,serif"}}>Skins</h2>
 </div>
 <Skins players={activePlayers} tees={activeTees} scores={round.scores}/>
 </>
 )}

 {tab==="nassau" && (
 <>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
 <span style={{fontSize:18}}> </span>
 <h2 style={{margin:0,fontSize:16,fontWeight:700,color:G.dark,fontFamily:"Georgia,serif"}}>Nassau</h2>
 </div>
 <Nassau players={activePlayers} tees={activeTees} scores={round.scores}/>
 </>
 )}

 {tab==="bingo" && (
 <>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
 <span style={{fontSize:18}}> </span>
 <h2 style={{margin:0,fontSize:16,fontWeight:700,color:G.dark,fontFamily:"Georgia,serif"}}>Bingo Bango Bongo</h2>
 </div>
 <BingoBangoBongo players={activePlayers} tees={activeTees} scores={round.scores}/>
 </>
 )}

 {tab==="games" && (
 <>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
 <span style={{fontSize:18}}> </span>
 <h2 style={{margin:0,fontSize:16,fontWeight:700,color:G.dark,fontFamily:"Georgia,serif"}}>Game Formats</h2>
 </div>
 <GameFormatPicker
 activeGames={activeGames}
 onChange={games=>setRound(r=>({...r,activeGames:games,gameFormat:games[0]}))}
 />
 </>
 )}

 {tab==="saved" && (
 <>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
 <span style={{fontSize:18}}> </span>
 <h2 style={{margin:0,fontSize:16,fontWeight:700,color:G.dark,fontFamily:"Georgia,serif"}}>Saved Rounds</h2>
 </div>
 <div style={{marginBottom:16}}>
 <Btn onClick={saveCurrentRound} bg={G.gold} style={{marginRight:8}}> Save Current Round</Btn>
 <span style={{fontSize:12,color:G.muted}}>Save your in-progress round to resume later</span>
 </div>
 {savedRounds.length === 0 ? (
 <div style={{textAlign:"center",padding:"40px 20px",color:G.muted,background:G.lite,borderRadius:12,border:"1px solid "+G.border}}>
 No saved rounds yet. Click "Save Current Round" above to save your progress.
 </div>
 ) : (
 <div style={{display:"flex",flexDirection:"column",gap:10}}>
 {[...savedRounds].reverse().map((sr, idx)=>{
 const realIdx = savedRounds.length - 1 - idx;
 return (
 <div key={idx} style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1px solid "+G.border,display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
 <div style={{fontSize:28}}> </div>
 <div style={{flex:1,minWidth:200}}>
 <div style={{fontWeight:700,fontSize:14,color:G.dark}}>{sr.name}</div>
 <div style={{fontSize:12,color:G.muted,marginTop:2}}>
 {sr.date} . {sr.courseName} . {sr.playerCount} players . {sr.progress}
 </div>
 <div style={{fontSize:11,color:G.muted,marginTop:4}}>
 Saved: {new Date(sr.savedAt).toLocaleString()}
 </div>
 </div>
 <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
 <button onClick={()=>loadSavedRound(sr)}
 style={{background:G.mid,color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
 Load Round
 </button>
 <button onClick={()=>deleteSavedRound(realIdx)}
 style={{background:"#FEE2E2",color:G.red,border:"none",borderRadius:8,padding:"7px 14px",fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
 Delete
 </button>
 </div>
 </div>
 );
 })}
 </div>
 )}
 </>
 )}

 {tab==="export" && (
 <>
 <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
 <span style={{fontSize:18}}> </span>
 <h2 style={{margin:0,fontSize:16,fontWeight:700,color:G.dark,fontFamily:"Georgia,serif"}}>Export & Archive</h2>
 </div>
 <ExportArchiveTab round={round} library={library} archive={archive} onArchive={handleArchiveRound}/>
 </>
 )}

 {tab==="setup" && (
 <>
 <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
 <div style={{display:"flex",alignItems:"center",gap:8}}>
 <span style={{fontSize:18}}> </span>
 <h2 style={{margin:0,fontSize:16,fontWeight:700,color:G.dark,fontFamily:"Georgia,serif"}}>Setup</h2>
 </div>
 <div style={{display:"flex",alignItems:"center",gap:6}}>
 <button onClick={newRound}
 style={{background:"#E67E22",color:"#fff",border:"none",borderRadius:8,padding:"5px 12px",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
 New Round
 </button>
 <button onClick={()=>{
 if(!window.confirm(" CLEAR ALL DATA?\n\nDelete everything and reload defaults:\n All 6 courses\n 8 default players\n Fresh start")) return;
 localStorage.clear();
 window.location.reload();
 }} style={{background:"#C0392B",color:"#fff",border:"none",borderRadius:8,padding:"5px 12px",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
 Clear All
 </button>
 {libSync!=="saved"&&(
 <span style={{fontSize:11,color:libSync==="saving"?G.gold:G.muted}}>{libSync==="saving"?" Saving...":" Auto-saving..."}</span>
 )}
 </div>
 </div>
 <SetupTab library={library} setLibrary={setLibrary} onLibrarySave={saveLibrary} libSaveStatus={libSync}/>
 </>
 )}

 </div>

 <div style={{textAlign:"center",color:"rgba(255,255,255,.25)",fontSize:10,marginTop:16,letterSpacing:.5}}>
 Golf Tracker v23 . Archive Fix . Red Hawk Ridge . Quick Putts . WhatsApp . {GAME_FORMATS.length} Formats
 </div>
 </div>

 {/* New Round Confirmation Modal */}
 {showNewRoundConfirm && (
 <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.7)",
 display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20}}>
 <div style={{background:"#fff",borderRadius:16,padding:24,maxWidth:400,width:"100%",boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}>
 <h3 style={{margin:"0 0 12px 0",fontSize:20,fontWeight:800,color:G.dark}}>Start New Round?</h3>
 <p style={{margin:"0 0 20px 0",fontSize:14,color:G.muted,lineHeight:1.5}}>
 This will clear all current scores but keep your players, tees, and game formats.
 </p>
 <div style={{display:"flex",gap:10}}>
 <button onClick={()=>setShowNewRoundConfirm(false)}
 style={{flex:1,padding:"12px",background:"#f5f5f5",color:G.muted,border:"none",borderRadius:10,
 fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
 Cancel
 </button>
 <button onClick={()=>{setShowNewRoundConfirm(false);newRound(true);}}
 style={{flex:1,padding:"12px",background:G.mid,color:"#fff",border:"none",borderRadius:10,
 fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
 Start New Round
 </button>
 </div>
 </div>
 </div>
 )}

 </div>
 );
}
