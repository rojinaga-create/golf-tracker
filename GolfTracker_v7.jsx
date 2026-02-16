import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────
const G = {
  deep:"#0D2B1F", dark:"#1A3C2E", mid:"#2D6A4F", bright:"#52B788",
  gold:"#C9A84C", goldPale:"#FEF9E7", red:"#C0392B",
  cream:"#FAFAF7", muted:"#6B7280", border:"#E0E8E0", lite:"#F4F9F5",
};
const HOLES = Array.from({length:18},(_,i)=>i);
const H9 = HOLES.slice(0,9), B9 = HOLES.slice(9);
const LIB_KEY   = "golf_library_v1";
const ROUND_KEY = "golf_round_v1";
const ARCHIVE_KEY = "golf_archive_v1";
const TEE_COLORS = ["#1565C0","#F9A825","#CCCCCC","#C62828","#2E7D32","#212121","#8D6E63","#7B1FA2"];

// ─────────────────────────────────────────────────────────────
// GAME FORMATS
// ─────────────────────────────────────────────────────────────
const GAME_FORMATS = [
  { id:"stroke_net",    name:"Stroke Play – Net",       icon:"🏌️",  desc:"Lowest net score wins (gross minus course handicap)" },
  { id:"stroke_gross",  name:"Stroke Play – Gross",     icon:"📊",  desc:"Lowest gross score wins – no handicap applied" },
  { id:"stableford",    name:"Stableford",               icon:"⭐",  desc:"Points per hole: Eagle=4, Birdie=3, Par=2, Bogey=1, Dbl+=0" },
  { id:"match",         name:"Round Robin Match Play",   icon:"⚔️",  desc:"Head-to-head match play; all player pairs compete" },
  { id:"skins",         name:"Skins",                    icon:"💰",  desc:"Win a skin on each hole; ties carry over to next hole" },
  { id:"nassau",        name:"Nassau",                   icon:"🔱",  desc:"Three separate bets: Front 9, Back 9, and Overall 18" },
  { id:"bingo_bango_bongo", name:"Bingo Bango Bongo",   icon:"🎯",  desc:"3 points per hole: first on green, closest to pin, first in hole" },
  { id:"wolf",          name:"Wolf",                     icon:"🐺",  desc:"Rotating selector picks partner (or goes alone) each hole" },
  { id:"scramble",      name:"Scramble",                 icon:"🤝",  desc:"Team format – all play from best shot each stroke" },
  { id:"chapman",       name:"Chapman / Pinehurst",      icon:"🌲",  desc:"Partners swap after drive, choose best 2nd, then alternate" },
  { id:"four_ball",     name:"Four-Ball Better Ball",    icon:"⛳",  desc:"Partners play own ball; team score = best ball each hole" },
  { id:"greenies",      name:"Greenies + Sandies",       icon:"🌿",  desc:"Bonus points: hit green in regulation (greenie) or save par from sand (sandie)" },
];

// ─────────────────────────────────────────────────────────────
// DEFAULT LIBRARY DATA
// ─────────────────────────────────────────────────────────────
const DEF_LIBRARY = {
  roster: [
    {id:1, name:"John Smith",    hcpIdx:8.4,  active:true,  defaultTee:"blue"},
    {id:2, name:"Mike Johnson",  hcpIdx:14.2, active:true,  defaultTee:"blue"},
    {id:3, name:"Dave Williams", hcpIdx:22.6, active:true,  defaultTee:"gold"},
    {id:4, name:"Tom Brown",     hcpIdx:5.1,  active:true,  defaultTee:"blue"},
    {id:5, name:"Chris Davis",   hcpIdx:18.9, active:false, defaultTee:"gold"},
    {id:6, name:"Steve Miller",  hcpIdx:11.3, active:false, defaultTee:"gold"},
  ],
  courses: [
    {
      id:"course_1", name:"Pebble Beach Golf Links", active:true,
      tees:[
        { id:"blue", name:"Blue", color:"#1565C0", rating:74.5, slope:143, par:72,
          pars:[4,5,4,4,3,5,3,4,4,4,4,3,5,5,4,4,3,5],
          si:[5,13,11,3,15,7,17,1,9,10,4,16,6,12,2,8,18,14] },
        { id:"gold", name:"Gold", color:"#F9A825", rating:72.1, slope:135, par:72,
          pars:[4,5,4,4,3,5,3,4,4,4,4,3,5,5,4,4,3,5],
          si:[5,13,11,3,15,7,17,1,9,10,4,16,6,12,2,8,18,14] },
      ]
    },
    {
      id:"course_2", name:"Augusta National", active:false,
      tees:[
        { id:"champ", name:"Championship", color:"#212121", rating:76.2, slope:148, par:72,
          pars:[4,5,4,3,4,3,4,5,4,4,4,3,5,4,5,3,4,4],
          si:[1,9,5,17,7,15,3,11,13,6,4,14,8,2,12,18,10,16] },
        { id:"member", name:"Member", color:"#2E7D32", rating:72.5, slope:135, par:72,
          pars:[4,5,4,3,4,3,4,5,4,4,4,3,5,4,5,3,4,4],
          si:[1,9,5,17,7,15,3,11,13,6,4,14,8,2,12,18,10,16] },
      ]
    },
  ]
};

const DEF_ROUND = {
  name: "Saturday Round",
  date: new Date().toISOString().split("T")[0],
  gameFormat: "stroke_net",
  playerTees: {},
  scores: {},
};

// ─────────────────────────────────────────────────────────────
// MATH
// ─────────────────────────────────────────────────────────────
const getTee = (tees,id) => tees.find(t=>t.id===id) || tees[0];
const courseHcp = (idx,tee) => Math.round(idx*(tee.slope/113)+(tee.rating-tee.par));
const strokesOnHole = (ch,minCH,si) => { const x=ch-minCH; return Math.floor(x/18)+(si<=(x%18)?1:0); };
const holeGross = (gs,i) => (gs["h"+i]!=null&&gs["h"+i]!=="") ? +gs["h"+i] : null;
const holePutts = (gs,i) => (gs["p"+i]!=null&&gs["p"+i]!=="") ? +gs["p"+i] : null;
const calcGross = gs => { let t=0,c=0; HOLES.forEach(i=>{const v=holeGross(gs,i);if(v!=null){t+=v;c++;}}); return c===18?t:null; };
const calcSeg   = (gs,r) => { let t=0,c=0; r.forEach(i=>{const v=holeGross(gs,i);if(v!=null){t+=v;c++;}}); return c===r.length?t:null; };
const calcPutts = gs => { let t=0,c=0; HOLES.forEach(i=>{const v=holePutts(gs,i);if(v!=null){t+=v;c++;}}); return c>0?t:null; };
const calcSbf   = (gs,tee,ch) => {
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

// Round Robin
function computeMatchup(pA,pB,chA,chB,tA,tB,scores){
  const minCH=Math.min(chA,chB); let standing=0,thru=0; const holes=[];
  for(let i=0;i<18;i++){
    const gA=holeGross(scores[pA.id]||{},i),gB=holeGross(scores[pB.id]||{},i);
    if(gA==null||gB==null)break;
    const bA=strokesOnHole(chA,minCH,tA.si[i]),bB=strokesOnHole(chB,minCH,tB.si[i]);
    const nA=gA-bA,nB=gB-bB,prev=standing;
    if(nA<nB)standing++;else if(nB<nA)standing--;
    thru=i+1; holes.push({hole:i+1,par:tA.pars[i],gA,bA,nA,gB,bB,nB,chg:standing-prev,standing});
  }
  const left=18-thru,clinched=thru>0&&Math.abs(standing)>left,complete=thru===18||clinched,dormie=!complete&&thru>0&&Math.abs(standing)===left&&left>0;
  let winner=null,resultLabel=thru===0?"Not started":"In Progress";
  if(complete){
    if(standing>0){winner=pA.id;resultLabel=`${pA.name} wins ${Math.abs(standing)}${clinched?" & "+left:""} UP`;}
    else if(standing<0){winner=pB.id;resultLabel=`${pB.name} wins ${Math.abs(standing)}${clinched?" & "+left:""} UP`;}
    else{winner="half";resultLabel="Halved — All Square";}
  } else if(dormie){
    resultLabel=`${standing>0?pA.name:pB.name} DORMIE (${left} to play)`;
  } else if(thru>0){
    resultLabel=standing===0?`All Square (thru ${thru})`:`${standing>0?pA.name:pB.name} ${Math.abs(standing)} UP (thru ${thru})`;
  }
  return{pA,pB,chA,chB,tA,tB,standing,thru,holes,winner,resultLabel,complete,dormie};
}
function computeAllMatchups(players,tees,scores){
  const chs=players.map(pl=>courseHcp(pl.hcpIdx,getTee(tees,pl.teeId)));
  const out=[];
  for(let ai=0;ai<players.length;ai++) for(let bi=ai+1;bi<players.length;bi++)
    out.push(computeMatchup(players[ai],players[bi],chs[ai],chs[bi],getTee(tees,players[ai].teeId),getTee(tees,players[bi].teeId),scores));
  return out;
}
function buildStandings(players,matchups){
  const s={};
  players.forEach(p=>{s[p.id]={id:p.id,name:p.name,teeId:p.teeId,w:0,h:0,l:0,pts:0,played:0};});
  matchups.forEach(m=>{
    if(!m.complete)return;
    s[m.pA.id].played++;s[m.pB.id].played++;
    if(m.winner==="half"){s[m.pA.id].h++;s[m.pA.id].pts++;s[m.pB.id].h++;s[m.pB.id].pts++;}
    else if(m.winner===m.pA.id){s[m.pA.id].w++;s[m.pA.id].pts+=2;s[m.pB.id].l++;}
    else{s[m.pB.id].w++;s[m.pB.id].pts+=2;s[m.pA.id].l++;}
  });
  return Object.values(s).sort((a,b)=>b.pts-a.pts||b.w-a.w);
}

// ─────────────────────────────────────────────────────────────
// EXCEL EXPORT
// ─────────────────────────────────────────────────────────────
function exportRoundToExcel(round, library) {
  const course = library.courses.find(c=>c.active) || library.courses[0];
  const activePlayers = library.roster.filter(p=>p.active).map(p=>({
    ...p, teeId: round.playerTees[p.id] || p.defaultTee
  }));
  const gameFmt = GAME_FORMATS.find(g=>g.id===round.gameFormat) || GAME_FORMATS[0];

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Round Summary ──
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

  // ── Sheet 2: Hole-by-Hole Scores ──
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

  // ── Sheet 3: Stableford / Game Results ──
  const gameData = [];
  gameData.push([`Game Results — ${gameFmt.name}`]);
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
  XLSX.writeFile(wb, `Golf_${safeName}_${dateStr}.xlsx`);
}

// ─────────────────────────────────────────────────────────────
// UI ATOMS
// ─────────────────────────────────────────────────────────────
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
    {active?"● Active":"○ Inactive"}
  </span>
);

function SyncBar({status,onSave,lastSaved}){
  const dot={idle:"#C9A84C",saving:"#F9A825",saved:"#52B788",error:G.red}[status];
  const msg={idle:"Unsaved changes",saving:"Saving…",saved:"Synced · "+lastSaved,error:"Save failed — retry"}[status];
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 14px",background:"rgba(0,0,0,.3)",borderRadius:8}}>
      <div style={{width:8,height:8,borderRadius:"50%",background:dot,flexShrink:0,boxShadow:status==="saved"?"0 0 8px #52B788":"none"}}/>
      <span style={{color:"rgba(255,255,255,.7)",fontSize:12,flex:1}}>{msg}</span>
      {(status==="idle"||status==="error")&&(
        <button onClick={onSave} style={{background:G.gold,color:"#fff",border:"none",borderRadius:6,padding:"5px 14px",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>💾 Save</button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HOLE-BY-HOLE INPUT SCREEN
// ─────────────────────────────────────────────────────────────
function HoleEntry({ players, tees, scores, onChange, activeCourse }) {
  const [currentHole, setCurrentHole] = useState(0);
  const [activePlayer, setActivePlayer] = useState(players[0]?.id || null);

  if (!players.length) return (
    <div style={{textAlign:"center",padding:40,color:G.muted}}>No active players. Go to ⚙️ Setup → Roster to activate players.</div>
  );

  const tee = getTee(tees, players.find(p=>p.id===activePlayer)?.teeId || tees[0].id);
  const baseTee = tees[0];
  const par = baseTee.pars[currentHole];
  const si = tee.si ? tee.si[currentHole] : currentHole + 1;

  const allScoresFilled = players.every(p => {
    const gs = scores[p.id] || {};
    return holeGross(gs, currentHole) !== null;
  });

  const goToHole = (h) => {
    if (h >= 0 && h < 18) setCurrentHole(h);
  };

  // Calculate progress
  const completedHoles = HOLES.filter(i => players.every(p => holeGross(scores[p.id]||{}, i) !== null)).length;

  return (
    <div>
      {/* Progress bar */}
      <div style={{background:G.lite,borderRadius:12,padding:"12px 16px",marginBottom:16,border:"1px solid "+G.border}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:13,fontWeight:700,color:G.dark}}>Round Progress</span>
          <span style={{fontSize:12,color:G.muted}}>{completedHoles} / 18 holes complete</span>
        </div>
        <div style={{background:G.border,borderRadius:99,height:8,overflow:"hidden"}}>
          <div style={{background:G.mid,height:"100%",borderRadius:99,width:`${(completedHoles/18)*100}%`,transition:"width .4s"}}/>
        </div>
        {/* Hole dots */}
        <div style={{display:"flex",gap:3,marginTop:8,flexWrap:"wrap"}}>
          {HOLES.map(i=>{
            const filled = players.every(p => holeGross(scores[p.id]||{}, i) !== null);
            const partial = !filled && players.some(p => holeGross(scores[p.id]||{}, i) !== null);
            const active = i === currentHole;
            return (
              <button key={i} onClick={()=>setCurrentHole(i)}
                style={{
                  width:28,height:28,borderRadius:"50%",border:"none",cursor:"pointer",
                  fontWeight:700,fontSize:10,fontFamily:"inherit",
                  background:active?"#C9A84C":filled?G.mid:partial?"#A8D5B5":G.border,
                  color:active||filled?"#fff":partial?G.dark:G.muted,
                  boxShadow:active?"0 0 0 2px #fff,0 0 0 4px "+G.gold:"none",
                  transition:"all .15s"
                }}>
                {i+1}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,alignItems:"start"}}>

        {/* Left: Hole info + navigation */}
        <div>
          {/* Hole header */}
          <div style={{background:`linear-gradient(135deg,${G.dark},${G.mid})`,borderRadius:16,padding:"20px 24px",marginBottom:16,color:"#fff",textAlign:"center"}}>
            <div style={{fontSize:12,opacity:.7,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>
              {currentHole < 9 ? "Front Nine" : "Back Nine"} · Stroke Index {si}
            </div>
            <div style={{fontSize:52,fontWeight:900,fontFamily:"Georgia,serif",lineHeight:1}}>
              {currentHole + 1}
            </div>
            <div style={{fontSize:14,opacity:.8,marginTop:4}}>Hole</div>
            <div style={{display:"flex",justifyContent:"center",gap:24,marginTop:12}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:24,fontWeight:900}}>{par}</div>
                <div style={{fontSize:10,opacity:.7}}>PAR</div>
              </div>
              <div style={{width:1,background:"rgba(255,255,255,.2)"}}/>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:24,fontWeight:900}}>SI {si}</div>
                <div style={{fontSize:10,opacity:.7}}>STROKE INDEX</div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <button onClick={()=>goToHole(currentHole-1)} disabled={currentHole===0}
              style={{flex:1,padding:"10px",background:currentHole===0?"#E8F5E9":G.mid,color:currentHole===0?G.muted:"#fff",border:"none",borderRadius:10,cursor:currentHole===0?"default":"pointer",fontWeight:700,fontSize:14,fontFamily:"inherit"}}>
              ← H{currentHole} {currentHole===0?"":""} 
            </button>
            <button onClick={()=>goToHole(currentHole+1)} disabled={currentHole===17}
              style={{flex:1,padding:"10px",background:currentHole===17?"#E8F5E9":G.mid,color:currentHole===17?G.muted:"#fff",border:"none",borderRadius:10,cursor:currentHole===17?"default":"pointer",fontWeight:700,fontSize:14,fontFamily:"inherit"}}>
              H{currentHole+2} →
            </button>
          </div>

          {/* Quick jump */}
          <div style={{background:G.lite,borderRadius:10,padding:"10px 12px",border:"1px solid "+G.border}}>
            <div style={{fontSize:11,fontWeight:700,color:G.muted,marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>Quick Jump</div>
            <div style={{display:"flex",gap:4,marginBottom:4}}>
              <span style={{fontSize:10,color:G.muted,width:36,paddingTop:4}}>Front</span>
              {H9.map(i=><button key={i} onClick={()=>setCurrentHole(i)} style={{width:24,height:24,borderRadius:4,border:"none",cursor:"pointer",fontSize:10,fontWeight:700,fontFamily:"inherit",background:i===currentHole?G.gold:G.border,color:i===currentHole?"#fff":G.dark}}>{i+1}</button>)}
            </div>
            <div style={{display:"flex",gap:4}}>
              <span style={{fontSize:10,color:G.muted,width:36,paddingTop:4}}>Back</span>
              {B9.map(i=><button key={i} onClick={()=>setCurrentHole(i)} style={{width:24,height:24,borderRadius:4,border:"none",cursor:"pointer",fontSize:10,fontWeight:700,fontFamily:"inherit",background:i===currentHole?G.gold:G.border,color:i===currentHole?"#fff":G.dark}}>{i+1}</button>)}
            </div>
          </div>
        </div>

        {/* Right: Score entry */}
        <div>
          <div style={{fontWeight:700,fontSize:14,color:G.dark,marginBottom:10}}>
            📋 Enter Scores — Hole {currentHole+1}
          </div>

          {players.map((pl) => {
            const gs = scores[pl.id] || {};
            const plTee = getTee(tees, pl.teeId);
            const ch = courseHcp(pl.hcpIdx, plTee);
            const strokes = strokesOnHole(ch, Math.min(...players.map(p=>courseHcp(p.hcpIdx,getTee(tees,p.teeId)))), plTee.si[currentHole]);
            const grossVal = gs["h"+currentHole] ?? "";
            const puttsVal = gs["p"+currentHole] ?? "";
            const ss = scoreStyle(grossVal, plTee.pars[currentHole]);

            return (
              <div key={pl.id} style={{
                background:"#fff",borderRadius:12,padding:"12px 14px",marginBottom:10,
                border:"1.5px solid "+(activePlayer===pl.id?G.mid:G.border),
                boxShadow:activePlayer===pl.id?"0 2px 10px rgba(45,106,79,.12)":"none",
                cursor:"pointer"
              }} onClick={()=>setActivePlayer(pl.id)}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <TeeBadge teeId={pl.teeId} tees={tees}/>
                    <span style={{fontWeight:700,fontSize:14,color:G.dark}}>{pl.name}</span>
                    <span style={{fontSize:11,color:G.muted}}>HCP {pl.hcpIdx} · CHCP {ch}</span>
                  </div>
                  {strokes > 0 && (
                    <span style={{background:"#FEF9E7",color:G.gold,border:"1px solid "+G.gold,borderRadius:6,padding:"2px 7px",fontSize:11,fontWeight:700}}>
                      +{strokes} stroke{strokes>1?"s":""}
                    </span>
                  )}
                </div>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:10,color:G.muted,marginBottom:4,fontWeight:600}}>GROSS SCORE</div>
                    <input
                      type="number" min={1} max={15}
                      value={grossVal}
                      placeholder="—"
                      onChange={e=>onChange(pl.id,"h"+currentHole,e.target.value===""?"":+e.target.value)}
                      onFocus={()=>setActivePlayer(pl.id)}
                      style={{
                        width:"100%",height:52,textAlign:"center",
                        border:"2px solid "+(activePlayer===pl.id?G.mid:G.border),
                        borderRadius:10,fontWeight:900,fontSize:26,
                        outline:"none",fontFamily:"inherit",...ss,
                        cursor:"pointer"
                      }}
                    />
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:10,color:G.muted,marginBottom:4,fontWeight:600}}>PUTTS</div>
                    <input
                      type="number" min={0} max={5}
                      value={puttsVal}
                      placeholder="—"
                      onChange={e=>onChange(pl.id,"p"+currentHole,e.target.value===""?"":+e.target.value)}
                      onFocus={()=>setActivePlayer(pl.id)}
                      style={{
                        width:"100%",height:52,textAlign:"center",
                        border:"2px solid "+(activePlayer===pl.id?"#C9A84C":G.border),
                        borderRadius:10,fontWeight:900,fontSize:26,
                        outline:"none",fontFamily:"inherit",
                        background:"#FFF8E7",color:"#8B6914",
                        cursor:"pointer"
                      }}
                    />
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:10,color:G.muted,marginBottom:4,fontWeight:600}}>NET</div>
                    <div style={{
                      width:"100%",height:52,display:"flex",alignItems:"center",justifyContent:"center",
                      borderRadius:10,border:"1.5px solid "+G.border,background:G.lite,
                      fontWeight:900,fontSize:24,color:G.mid
                    }}>
                      {grossVal!==""?(+grossVal - strokes):"-"}
                    </div>
                  </div>
                </div>
                {/* Quick-score buttons */}
                <div style={{display:"flex",gap:4,marginTop:8,flexWrap:"wrap"}}>
                  {[par-2,par-1,par,par+1,par+2,par+3].filter(s=>s>=1&&s<=12).map(s=>(
                    <button key={s} onClick={e=>{e.stopPropagation();onChange(pl.id,"h"+currentHole,s);setActivePlayer(pl.id);}}
                      style={{
                        flex:1,minWidth:32,padding:"4px 2px",border:"none",borderRadius:7,cursor:"pointer",
                        fontWeight:700,fontSize:12,fontFamily:"inherit",
                        ...scoreStyle(s, plTee.pars[currentHole]),
                        opacity:grossVal===s?1:0.65,
                        boxShadow:grossVal===s?"0 0 0 2px "+G.dark:"none"
                      }}>
                      {s-par===0?"Par":s-par<0?s-par:"+"+(s-par)}<br/>
                      <span style={{fontWeight:900,fontSize:14}}>{s}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Auto-advance when all filled */}
          {allScoresFilled && currentHole < 17 && (
            <button onClick={()=>goToHole(currentHole+1)}
              style={{width:"100%",padding:"12px",background:G.gold,color:"#fff",border:"none",borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit",marginTop:4}}>
              ✓ All scored — Next Hole ({currentHole+2}) →
            </button>
          )}
          {allScoresFilled && currentHole === 17 && (
            <div style={{background:"#D8F3DC",borderRadius:10,padding:"12px",textAlign:"center",fontWeight:700,color:G.dark,marginTop:4}}>
              🏁 Round Complete! Check the Leaderboard.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// GAME FORMAT PICKER
// ─────────────────────────────────────────────────────────────
function GameFormatPicker({ current, onChange }) {
  return (
    <div>
      <div style={{fontWeight:700,fontSize:14,color:G.dark,marginBottom:12}}>
        🎮 Select This Week's Game Format
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10}}>
        {GAME_FORMATS.map(fmt=>{
          const active = fmt.id === current;
          return (
            <button key={fmt.id} onClick={()=>onChange(fmt.id)}
              style={{
                padding:"12px 14px",borderRadius:12,cursor:"pointer",fontFamily:"inherit",
                textAlign:"left",border:"2px solid "+(active?G.mid:G.border),
                background:active?"#EBF5EC":"#fff",
                boxShadow:active?"0 2px 10px rgba(45,106,79,.15)":"none",
                transition:"all .15s"
              }}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                <span style={{fontSize:18}}>{fmt.icon}</span>
                <span style={{fontWeight:700,fontSize:13,color:active?G.mid:G.dark}}>{fmt.name}</span>
                {active && <span style={{marginLeft:"auto",background:G.mid,color:"#fff",borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700}}>Active</span>}
              </div>
              <div style={{fontSize:11,color:G.muted,lineHeight:1.4}}>{fmt.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// EXPORT & ARCHIVE TAB
// ─────────────────────────────────────────────────────────────
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
          <div style={{fontSize:36}}>📊</div>
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
              ["📅 Date",round.date],
              ["📋 Round",round.name],
              ["🏌️ Course",course.name],
              ["🎮 Format",gameFmt.icon+" "+gameFmt.name],
              ["👥 Players",activePlayers.length+" active"],
              ["✅ Complete",completedPlayers+"/"+activePlayers.length+" scored"],
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
            ⚠️ Round is not fully complete ({completedPlayers}/{activePlayers.length} players scored) — you can still export partial data.
          </div>
        )}
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <Btn bg={G.mid} onClick={handleExport} style={{fontSize:14,padding:"10px 22px"}}>
            ⬇️ Download Excel (.xlsx)
          </Btn>
          <Btn bg={roundComplete?G.gold:G.muted} onClick={handleArchive} style={{fontSize:14,padding:"10px 22px"}}>
            🗄️ Archive This Round
          </Btn>
        </div>
      </div>

      {/* Archive list */}
      <div>
        <div style={{fontWeight:700,fontSize:15,color:G.dark,marginBottom:12}}>🗄️ Round Archive ({archive.length})</div>
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
                      {ar.date} · {ar.courseName} · {arGame.name} · {arPlayers.length} players
                    </div>
                    {arPlayers.length > 0 && (
                      <div style={{fontSize:11,color:G.muted,marginTop:4}}>
                        {arPlayers.slice(0,3).map(p=>`${p.name}: ${p.gross??'—'}`).join(' · ')}
                        {arPlayers.length>3&&` · +${arPlayers.length-3} more`}
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
                    ⬇️ Re-export
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

// ─────────────────────────────────────────────────────────────
// BINGO BANGO BONGO
// ─────────────────────────────────────────────────────────────
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
      // Bingo: first on green = lowest gross ≤ par (simplified)
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

  const pName = id => players.find(p=>p.id===id)?.name || '—';
  const sorted = Object.values(totals).sort((a,b)=>b.pts-a.pts);

  return (
    <div>
      <div style={{background:"#FFF8E7",borderRadius:10,padding:"10px 16px",marginBottom:16,border:"1px solid #F0E0A0",fontSize:12,color:"#7A5C00"}}>
        <b>Simplified scoring:</b> Bingo = first to par (≤ par); Bango = lowest gross (closest to pin); Bongo = lowest gross (first in hole). 1 point each.
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
              <td style={{...TD,fontWeight:700,color:r.bingo?G.mid:G.muted}}>{r.bingo?pName(r.bingo):"—"}</td>
              <td style={{...TD,fontWeight:700,color:r.bango?G.gold:"#999"}}>{r.bango?pName(r.bango):"—"}</td>
              <td style={{...TD,fontWeight:700,color:r.bongo?G.dark:G.muted}}>{r.bongo?pName(r.bongo):"—"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SETUP TAB — Master Roster + Course Library
// ─────────────────────────────────────────────────────────────
function SetupTab({library, setLibrary, onLibrarySave, libSaveStatus}) {
  const [sub, setSub] = useState("roster");
  const [editCourseId, setEditCourseId] = useState(null);

  const [newName,  setNewName]  = useState("");
  const [newHcp,   setNewHcp]   = useState("");
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
        si:  [7,3,11,15,17,1,13,5,9,8,4,16,12,2,14,18,6,10] }]
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
  const updateTee    = (cid,tid,field,val) => setLibrary(lib=>({...lib, courses:lib.courses.map(c=>c.id===cid?{...c,tees:c.tees.map(t=>t.id===tid?{...t,[field]:val}:t)}:c)}));
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
        {[["roster","👥 Roster"],["courses","🏌️ Courses"]].map(([id,label])=>(
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
            <div style={{display:"flex",gap:8}}>
              <Btn bg="#2563EB" style={{fontSize:12}} onClick={()=>{setLibrary(lib=>({...lib,roster:lib.roster.map(p=>({...p,active:true}))}));}}>✓ All Active</Btn>
              <Btn bg={G.muted} style={{fontSize:12}} onClick={()=>{setLibrary(lib=>({...lib,roster:lib.roster.map(p=>({...p,active:false}))}));}}>✗ All Inactive</Btn>
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
              {libSaveStatus==="saving"?"Saving…":libSaveStatus==="saved"?"✓ Saved":"💾 Save Roster & Courses"}
            </Btn>
          </div>
        </div>
      )}

      {sub==="courses" && (
        <div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:700,color:G.dark,marginBottom:8}}>Course Library</div>
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
                  {!c.active&&<button onClick={()=>removeCourse(c.id)} style={{background:"#FEE2E2",color:G.red,border:"none",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>✕</button>}
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
                                {lbl==="Par"?t.pars.reduce((s,v)=>s+v,0):"—"}
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
              {libSaveStatus==="saving"?"Saving…":libSaveStatus==="saved"?"✓ Saved":"💾 Save Roster & Courses"}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ROUND SETUP BANNER
// ─────────────────────────────────────────────────────────────
function RoundSetupBanner({library, round, setRound}) {
  const course = library.courses.find(c=>c.active) || library.courses[0];
  const activePlayers = library.roster.filter(p=>p.active);
  const gameFmt = GAME_FORMATS.find(g=>g.id===round.gameFormat) || GAME_FORMATS[0];

  const getTeeForPlayer = (pl) => round.playerTees[pl.id] || pl.defaultTee;
  const setPlayerTee = (pid, tid) => setRound(r=>({...r, playerTees:{...r.playerTees,[pid]:tid}}));

  return (
    <div style={{background:G.lite,borderRadius:12,padding:"14px 18px",marginBottom:18,border:"1px solid "+G.border}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:10,marginBottom:12}}>
        <div>
          <div style={{fontWeight:700,fontSize:14,color:G.dark}}>
            🏌️ {course.name}
            <span style={{marginLeft:8,fontSize:11,background:"#D8F3DC",color:G.dark,padding:"2px 8px",borderRadius:99,fontWeight:600}}>Active Course</span>
            <span style={{marginLeft:8,fontSize:11,background:"#FEF9E7",color:"#7A5C00",padding:"2px 8px",borderRadius:99,fontWeight:600,border:"1px solid #E6C96A"}}>
              {gameFmt.icon} {gameFmt.name}
            </span>
          </div>
          <div style={{fontSize:12,color:G.muted,marginTop:2}}>
            {activePlayers.length} active players · Adjust tee assignments below for this round
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <label style={{fontSize:12,color:G.muted}}>Round name:</label>
          <input value={round.name} onChange={e=>setRound(r=>({...r,name:e.target.value}))}
            style={{padding:"5px 10px",border:"1.5px solid #C8E6C9",borderRadius:7,fontSize:13,outline:"none",fontFamily:"inherit",width:180}}/>
          <input type="date" value={round.date} onChange={e=>setRound(r=>({...r,date:e.target.value}))}
            style={{padding:"5px 10px",border:"1.5px solid #C8E6C9",borderRadius:7,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
        </div>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
        {activePlayers.map(pl=>{
          const teeId = getTeeForPlayer(pl);
          const tee   = getTee(course.tees, teeId);
          return(
            <div key={pl.id} style={{background:"#fff",borderRadius:9,padding:"8px 12px",
              border:"1px solid "+G.border,display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontWeight:700,fontSize:13,color:G.dark}}>{pl.name}</span>
              <span style={{fontSize:11,color:G.muted}}>HCP {pl.hcpIdx}</span>
              <select value={teeId} onChange={e=>setPlayerTee(pl.id,e.target.value)}
                style={{padding:"3px 7px",borderRadius:6,border:"1px solid "+G.border,
                  fontSize:12,fontFamily:"inherit",background:tee.color,
                  color:isLight(tee.color)?"#333":"#fff",fontWeight:700}}>
                {course.tees.map(t=><option key={t.id} value={t.id} style={{background:"#fff",color:"#333"}}>{t.name}</option>)}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Build active player list
// ─────────────────────────────────────────────────────────────
function buildActivePlayers(library, round) {
  return library.roster
    .filter(p=>p.active)
    .map(p=>({
      ...p,
      teeId: round.playerTees[p.id] || p.defaultTee,
    }));
}

// ─────────────────────────────────────────────────────────────
// SCORE GRID
// ─────────────────────────────────────────────────────────────
function ScoreGrid({players, tees, scores, onChange}) {
  const baseTee = tees[0];
  return (
    <div style={{overflowX:"auto"}}>
      <table style={{borderCollapse:"collapse",minWidth:1100}}>
        <thead>
          <tr>
            <th style={{...TH,minWidth:130}} rowSpan={2}>Player</th>
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
            const g=calcGross(gs), net=g!=null?g-ch:null;
            return(
              <tr key={pl.id} style={{background:pi%2===0?"#F4F9F5":"#fff"}}>
                <td style={{...TD,fontWeight:700,color:G.dark}}>{pl.name}</td>
                <td style={{...TD,textAlign:"center"}}><TeeBadge teeId={pl.teeId} tees={tees}/></td>
                <td style={{...TD,textAlign:"center",color:G.muted}}>{pl.hcpIdx}</td>
                <td style={{...TD,textAlign:"center",color:G.mid,fontWeight:800}}>{ch}</td>
                {[{v:calcSeg(gs,H9)??'—',bg:"#FFFBF0",c:G.dark},{v:calcSeg(gs,B9)??'—',bg:"#FFFBF0",c:G.dark},
                  {v:g??'—',bg:"#FFFBF0",c:G.dark},{v:net??'—',bg:"#EEF7F0",c:G.mid},
                  {v:calcSbf(gs,tee,ch),bg:G.goldPale,c:G.gold},{v:calcPutts(gs)??'—',bg:"#FFFBF0",c:G.dark}
                ].map(({v,bg,c},idx)=>(
                  <td key={idx} style={{...TD,textAlign:"center",fontWeight:700,background:bg,color:c}}>{v}</td>
                ))}
                {HOLES.map(i=>{
                  const val=gs["h"+i]??"", ss=scoreStyle(val,tee.pars[i]);
                  return(
                    <td key={i} style={{padding:"2px",border:"1px solid #ddd"}}>
                      <input type="number" min={1} max={15} value={val} placeholder="—"
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
                <td style={{...TD,color:G.gold,fontSize:11,fontWeight:700}}>{pl.name} — Putts</td>
                <td colSpan={9} style={TD}/>
                {HOLES.map(i=>(
                  <td key={i} style={{padding:"2px",border:"1px solid #ddd"}}>
                    <input type="number" min={0} max={5} value={gs["p"+i]??""} placeholder="—"
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

// ─────────────────────────────────────────────────────────────
// LEADERBOARD
// ─────────────────────────────────────────────────────────────
function Leaderboard({players,tees,scores,fmt,setFmt}){
  const rows=players.map(pl=>{
    const tee=getTee(tees,pl.teeId),ch=courseHcp(pl.hcpIdx,tee),gs=scores[pl.id]||{},g=calcGross(gs);
    return{id:pl.id,name:pl.name,teeId:pl.teeId,ch,gross:g,net:g!=null?g-ch:null,sbf:calcSbf(gs,tee,ch),putts:calcPutts(gs),done:g!=null};
  });
  const key={["Low Net"]:"net",Stableford:"sbf",["Total Putts"]:"putts",Gross:"gross"}[fmt];
  const asc=fmt!=="Stableford";
  const ranked=[...rows.filter(r=>r[key]!=null)].sort((a,b)=>asc?a[key]-b[key]:b[key]-a[key]);
  const rankOf=id=>{const i=ranked.findIndex(r=>r.id===id);return i>=0?i+1:null;};
  const medal=r=>r===1?"🥇":r===2?"🥈":r===3?"🥉":`#${r}`;
  return(
    <div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16,alignItems:"center"}}>
        <span style={{color:G.muted,fontSize:13}}>Rank by:</span>
        {["Low Net","Stableford","Total Putts","Gross"].map(f=><Pill key={f} label={f} active={fmt===f} onClick={()=>setFmt(f)}/>)}
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%"}}>
          <thead><tr>{["Rank","Player","Tee","Course HCP","Gross","Net","Stableford","Putts","Status"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r,i)=>{
              const rk=rankOf(r.id);
              return(
                <tr key={r.id} style={{background:i%2===0?"#F4F9F5":"#fff"}}>
                  <td style={{...TD,textAlign:"center",fontSize:18}}>{rk?medal(rk):"—"}</td>
                  <td style={{...TD,fontWeight:700,color:G.dark}}>{r.name}</td>
                  <td style={{...TD,textAlign:"center"}}><TeeBadge teeId={r.teeId} tees={tees}/></td>
                  <td style={{...TD,textAlign:"center",color:G.mid,fontWeight:800}}>{r.ch}</td>
                  <td style={{...TD,textAlign:"center"}}>{r.gross??'—'}</td>
                  <td style={{...TD,textAlign:"center",fontWeight:800,color:G.mid}}>{r.net??'—'}</td>
                  <td style={{...TD,textAlign:"center",fontWeight:800,color:G.gold}}>{r.sbf}</td>
                  <td style={{...TD,textAlign:"center"}}>{r.putts??'—'}</td>
                  <td style={{...TD,textAlign:"center"}}>
                    <span style={{padding:"3px 10px",borderRadius:99,fontSize:11,fontWeight:700,background:r.done?"#D8F3DC":"#FFF3CD",color:r.done?G.dark:"#856404"}}>{r.done?"✓ Done":"In Progress"}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SKINS
// ─────────────────────────────────────────────────────────────
function Skins({players,tees,scores}){
  const chs=players.map(pl=>courseHcp(pl.hcpIdx,getTee(tees,pl.teeId)));
  const minCH=Math.min(...chs);
  let carry=0; const rows=[],totals={};
  HOLES.forEach(i=>{
    const nets=players.map((pl,pi)=>{const g=holeGross(scores[pl.id]||{},i);if(g==null)return null;const tee=getTee(tees,pl.teeId);return{name:pl.name,net:g-strokesOnHole(chs[pi],minCH,tee.si[i])};}).filter(Boolean);
    const skin=1+carry;let winner,isCarry=false;
    if(nets.length===players.length){const mn=Math.min(...nets.map(s=>s.net));const w=nets.filter(s=>s.net===mn);if(w.length===1){winner=w[0].name;totals[winner]=(totals[winner]||0)+skin;carry=0;}else{winner="Carry →";isCarry=true;carry=skin;}}else{winner="—";}
    const par=getTee(tees,players[0]?.teeId||tees[0].id).pars[i];
    rows.push({hole:i+1,par,winner,skin,isCarry});
  });
  return(
    <div>
      <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:18}}>
        {Object.entries(totals).sort((a,b)=>b[1]-a[1]).map(([name,s])=>(
          <div key={name} style={{background:`linear-gradient(135deg,${G.mid},${G.dark})`,color:"#fff",borderRadius:10,padding:"10px 20px",textAlign:"center",minWidth:90}}>
            <div style={{fontSize:24,fontWeight:800}}>{s}</div><div style={{fontSize:11,opacity:.8}}>{name}</div>
          </div>
        ))}
        {!Object.keys(totals).length&&<span style={{color:G.muted,fontSize:13}}>No scores yet.</span>}
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%"}}>
          <thead><tr>{["Hole","Par","Net Winner","Skins","Carry?"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r,i)=>(
            <tr key={r.hole} style={{background:r.isCarry?"#FFF8F0":i%2===0?"#F4F9F5":"#fff"}}>
              <td style={{...TD,textAlign:"center",fontWeight:700}}>{r.hole}</td>
              <td style={{...TD,textAlign:"center"}}>P{r.par}</td>
              <td style={{...TD,fontWeight:700,color:r.isCarry?G.gold:G.dark}}>{r.winner}</td>
              <td style={{...TD,textAlign:"center",fontWeight:700,color:G.mid}}>{r.skin}</td>
              <td style={{...TD,textAlign:"center"}}>{r.isCarry?"🔄 Yes":"—"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// NASSAU
// ─────────────────────────────────────────────────────────────
function Nassau({players,tees,scores}){
  const chs=players.map(pl=>courseHcp(pl.hcpIdx,getTee(tees,pl.teeId)));
  const minCH=Math.min(...chs);
  const seg=range=>players.map((pl,pi)=>{const gs=scores[pl.id]||{},tee=getTee(tees,pl.teeId);let t=0,c=0;range.forEach(i=>{const g=holeGross(gs,i);if(g!=null){t+=g-strokesOnHole(chs[pi],minCH,tee.si[i]);c++;}});return c===range.length?t:null;});
  const res=tots=>{const v=tots.filter(t=>t!=null);if(!v.length)return tots.map(()=>"—");const mn=Math.min(...v),mx=Math.max(...v);if(mn===mx)return tots.map(t=>t!=null?"AS":"—");return tots.map(t=>t===null?"—":t===mn?"W ✓":t===mx?"L ✗":"AS");};
  const fT=seg(H9),bT=seg(B9),oT=seg(HOLES),fR=res(fT),bR=res(bT),oR=res(oT);
  const rc=r=>r==="W ✓"?G.mid:r==="L ✗"?G.red:G.muted;
  return(
    <div style={{overflowX:"auto"}}>
      <table style={{borderCollapse:"collapse",width:"100%"}}>
        <thead><tr>
          <th style={TH}>Player</th><th style={TH}>Tee</th>
          <th style={{...TH,background:"#2D6A4F"}}>F9 Net</th><th style={{...TH,background:"#2D6A4F"}}>Front</th>
          <th style={{...TH,background:"#1A6B40"}}>B9 Net</th><th style={{...TH,background:"#1A6B40"}}>Back</th>
          <th style={{...TH,background:G.gold}}>18 Net</th><th style={{...TH,background:G.gold}}>Overall</th>
        </tr></thead>
        <tbody>{players.map((pl,i)=>(
          <tr key={pl.id} style={{background:i%2===0?"#F4F9F5":"#fff"}}>
            <td style={{...TD,fontWeight:700,color:G.dark}}>{pl.name}</td>
            <td style={{...TD,textAlign:"center"}}><TeeBadge teeId={pl.teeId} tees={tees}/></td>
            <td style={{...TD,textAlign:"center",fontWeight:700}}>{fT[i]??'—'}</td>
            <td style={{...TD,textAlign:"center",fontWeight:800,color:rc(fR[i])}}>{fR[i]}</td>
            <td style={{...TD,textAlign:"center",fontWeight:700}}>{bT[i]??'—'}</td>
            <td style={{...TD,textAlign:"center",fontWeight:800,color:rc(bR[i])}}>{bR[i]}</td>
            <td style={{...TD,textAlign:"center",fontWeight:700}}>{oT[i]??'—'}</td>
            <td style={{...TD,textAlign:"center",fontWeight:800,color:rc(oR[i])}}>{oR[i]}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ROUND ROBIN
// ─────────────────────────────────────────────────────────────
function RoundRobin({players,tees,scores}){
  const [drillKey,setDrillKey]=useState(null);
  const matchups=computeAllMatchups(players,tees,scores);
  const standings=buildStandings(players,matchups);
  const total=matchups.length,done=matchups.filter(m=>m.complete).length;
  const findM=(idA,idB)=>matchups.find(m=>(m.pA.id===idA&&m.pB.id===idB)||(m.pA.id===idB&&m.pB.id===idA));
  const cellLabel=(rowPl,colPl)=>{
    const m=findM(rowPl.id,colPl.id);if(!m)return"—";
    const fromA=m.pA.id===rowPl.id,rel=fromA?m.standing:-m.standing;
    if(m.thru===0)return<span style={{color:G.muted,fontSize:11}}>—</span>;
    if(m.complete||Math.abs(m.standing)>18-m.thru){
      if(rel>0)return<span style={{color:G.mid,fontWeight:800}}>W {Math.abs(rel)}↑</span>;
      if(rel<0)return<span style={{color:G.red,fontWeight:800}}>L {Math.abs(rel)}↓</span>;
      return<span style={{color:G.muted,fontWeight:700}}>½</span>;
    }
    const prefix=rel===0?"AS":`${Math.abs(rel)} ${rel>0?"↑":"↓"}`;
    return<span style={{color:rel>0?G.mid:rel<0?G.red:G.muted,fontSize:11}}>{prefix} ({m.thru})</span>;
  };
  const drillMatch=drillKey?findM(drillKey[0],drillKey[1]):null;
  const medal=i=>i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`;
  const resColor=m=>{if(!m.complete&&m.thru===0)return G.muted;if(m.dormie)return G.gold;if(!m.complete)return"#555";if(m.winner==="half")return"#888";return G.mid;};
  return(
    <div>
      <div style={{background:"#F4F9F5",borderRadius:12,padding:"14px 18px",marginBottom:22,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",border:"1px solid "+G.border}}>
        <div><div style={{fontSize:12,color:G.muted,marginBottom:2}}>Matches Complete</div><div style={{fontSize:24,fontWeight:800,color:G.dark}}>{done} / {total}</div></div>
        <div style={{flex:1,minWidth:120}}>
          <div style={{background:G.border,borderRadius:99,height:8,overflow:"hidden"}}><div style={{background:G.mid,height:"100%",borderRadius:99,width:`${total>0?done/total*100:0}%`,transition:"width .4s"}}/></div>
          <div style={{fontSize:11,color:G.muted,marginTop:4}}>{players.length} players · {total} total matches</div>
        </div>
        <div style={{background:G.goldPale,border:"1px solid #E6C96A",borderRadius:8,padding:"6px 12px",fontSize:11,color:"#7A5C00",fontWeight:600}}>Win=2 · Half=1 · Loss=0</div>
      </div>
      <div style={{marginBottom:24}}>
        <div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700,color:G.dark,marginBottom:10}}>🏆 Standings</div>
        <div style={{overflowX:"auto"}}>
          <table style={{borderCollapse:"collapse",width:"100%"}}>
            <thead><tr>{["Rank","Player","Tee","Played","W","H","L","Points","Win %"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>{standings.map((s,i)=>{
              const pct=s.played>0?Math.round(s.pts/(s.played*2)*100):0;
              return(<tr key={s.id} style={{background:i%2===0?"#F4F9F5":"#fff"}}>
                <td style={{...TD,textAlign:"center",fontSize:18}}>{medal(i)}</td>
                <td style={{...TD,fontWeight:700,color:G.dark}}>{s.name}</td>
                <td style={{...TD,textAlign:"center"}}><TeeBadge teeId={s.teeId} tees={tees}/></td>
                <td style={{...TD,textAlign:"center"}}>{s.played}</td>
                <td style={{...TD,textAlign:"center",fontWeight:700,color:G.mid}}>{s.w}</td>
                <td style={{...TD,textAlign:"center",color:G.muted}}>{s.h}</td>
                <td style={{...TD,textAlign:"center",color:G.red}}>{s.l}</td>
                <td style={{...TD,textAlign:"center"}}><span style={{background:G.dark,color:"#fff",borderRadius:99,padding:"2px 12px",fontWeight:800,fontSize:14}}>{s.pts}</span></td>
                <td style={TD}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{flex:1,background:G.border,borderRadius:99,height:6,minWidth:50,overflow:"hidden"}}><div style={{background:pct>=50?G.mid:G.red,height:"100%",width:pct+"%",borderRadius:99}}/></div>
                    <span style={{fontSize:12,fontWeight:700,color:pct>=50?G.mid:G.red,minWidth:32}}>{pct}%</span>
                  </div>
                </td>
              </tr>);
            })}</tbody>
          </table>
        </div>
      </div>
      <div style={{marginBottom:24}}>
        <div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700,color:G.dark,marginBottom:4}}>⚔️ Head-to-Head Matrix</div>
        <div style={{fontSize:12,color:G.muted,marginBottom:10}}>Row player's result vs column. Click any cell for hole detail.</div>
        <div style={{overflowX:"auto"}}>
          <table style={{borderCollapse:"collapse"}}>
            <thead><tr>
              <th style={{...TH,minWidth:110}}>↓ vs →</th>
              {players.map(p=><th key={p.id} style={{...TH,minWidth:88,textAlign:"center",fontSize:10}}>{p.name.split(" ")[0]}<br/><span style={{fontWeight:400,opacity:.65}}>{getTee(tees,p.teeId).name}</span></th>)}
            </tr></thead>
            <tbody>{players.map((rP,ri)=>(
              <tr key={rP.id} style={{background:ri%2===0?"#F4F9F5":"#fff"}}>
                <td style={{...TD,fontWeight:700,color:G.dark,fontSize:12}}>{rP.name.split(" ")[0]}<br/><span style={{fontWeight:400,color:G.muted,fontSize:10}}>CHCP {courseHcp(rP.hcpIdx,getTee(tees,rP.teeId))}</span></td>
                {players.map((cP,ci)=>{
                  if(rP.id===cP.id)return<td key={cP.id} style={{...TD,textAlign:"center",background:"#E8F5E9",color:G.mid}}>◆</td>;
                  const k=[rP.id,cP.id].sort().join("_"),active=drillKey&&[...drillKey].sort().join("_")===k;
                  return<td key={cP.id} onClick={()=>setDrillKey(active?null:[rP.id,cP.id])} style={{...TD,textAlign:"center",cursor:"pointer",background:active?"#C8E6C9":ri%2===0?"#F4F9F5":"#fff",transition:"background .15s"}}>{cellLabel(rP,cP)}</td>;
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      <div style={{marginBottom:drillMatch?20:0}}>
        <div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700,color:G.dark,marginBottom:10}}>📋 All Matchups</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:10}}>
          {matchups.map(m=>{
            const k=[m.pA.id,m.pB.id].sort().join("_"),dk=drillKey?[...drillKey].sort().join("_"):null,active=dk===k;
            return(<div key={k} onClick={()=>setDrillKey(active?null:[m.pA.id,m.pB.id])} style={{background:active?"#C8E6C9":"#fff",borderRadius:12,padding:"13px 15px",border:"1px solid "+(active?G.mid:G.border),cursor:"pointer",boxShadow:"0 1px 4px rgba(0,0,0,.06)",transition:"all .15s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div><div style={{fontWeight:700,fontSize:13,color:m.standing>0?G.mid:G.dark}}>{m.pA.name}</div><div style={{fontSize:10,color:G.muted,marginTop:1}}><TeeBadge teeId={m.pA.teeId} tees={tees}/>&nbsp;CHCP {m.chA}</div></div>
                <div style={{textAlign:"center",fontSize:11,color:G.muted,padding:"0 6px"}}>vs{m.thru>0&&<><br/><span style={{fontSize:10}}>thru {m.thru}</span></>}</div>
                <div style={{textAlign:"right"}}><div style={{fontWeight:700,fontSize:13,color:m.standing<0?G.mid:G.dark}}>{m.pB.name}</div><div style={{fontSize:10,color:G.muted,marginTop:1}}>CHCP {m.chB}&nbsp;<TeeBadge teeId={m.pB.teeId} tees={tees}/></div></div>
              </div>
              <div style={{textAlign:"center",padding:"6px 0",borderRadius:8,fontSize:12,fontWeight:700,background:m.complete?(m.winner==="half"?"#F0F0F0":"#D8F3DC"):m.thru===0?"#F8F8F8":G.goldPale,color:resColor(m)}}>{m.resultLabel}</div>
            </div>);
          })}
        </div>
      </div>
      {drillMatch&&(
        <div style={{background:"#fff",borderRadius:14,padding:"20px",border:"2px solid "+G.mid,boxShadow:"0 4px 20px rgba(45,106,79,.15)",marginTop:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontFamily:"Georgia,serif",fontSize:17,fontWeight:700,color:G.dark}}>⚔️ {drillMatch.pA.name} vs {drillMatch.pB.name}</div>
            <button onClick={()=>setDrillKey(null)} style={{background:"none",border:"1px solid "+G.border,borderRadius:7,padding:"4px 12px",cursor:"pointer",fontSize:13,color:G.muted}}>✕ Close</button>
          </div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
            {[{pl:drillMatch.pA,ch:drillMatch.chA},{pl:drillMatch.pB,ch:drillMatch.chB}].map(({pl,ch})=>(
              <div key={pl.id} style={{background:"#F4F9F5",borderRadius:9,padding:"8px 14px",fontSize:13}}>
                <TeeBadge teeId={pl.teeId} tees={tees}/>&nbsp;<b>{pl.name}</b> — HCP {pl.hcpIdx} → <b style={{color:G.mid}}>CHCP {ch}</b>
              </div>
            ))}
          </div>
          <div style={{background:`linear-gradient(135deg,${G.dark},${G.mid})`,borderRadius:12,padding:"14px 20px",color:"#fff",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:14}}>
            <div><div style={{fontSize:12,opacity:.7}}>Status</div><div style={{fontFamily:"Georgia,serif",fontSize:22,fontWeight:900}}>{drillMatch.resultLabel}</div></div>
            <div style={{textAlign:"right"}}><div style={{fontSize:12,opacity:.7}}>Through</div><div style={{fontFamily:"Georgia,serif",fontSize:22,fontWeight:900}}>{drillMatch.thru} holes</div></div>
          </div>
          {drillMatch.holes.length>0?(
            <div style={{overflowX:"auto"}}>
              <table style={{borderCollapse:"collapse",width:"100%",fontSize:12}}>
                <thead><tr>{["Hole","Par",drillMatch.pA.name.split(" ")[0]+" G","Stk",drillMatch.pA.name.split(" ")[0]+" Net",drillMatch.pB.name.split(" ")[0]+" G","Stk",drillMatch.pB.name.split(" ")[0]+" Net","Result","Status"].map(h=><th key={h} style={{...TH,fontSize:10}}>{h}</th>)}</tr></thead>
                <tbody>{drillMatch.holes.map((r,i)=>{
                  const wn=r.chg>0?drillMatch.pA.name.split(" ")[0]:r.chg<0?drillMatch.pB.name.split(" ")[0]:null;
                  const rc=r.chg>0?G.mid:r.chg<0?G.red:G.muted;
                  const ldr=r.standing>0?drillMatch.pA.name.split(" ")[0]:r.standing<0?drillMatch.pB.name.split(" ")[0]:null;
                  const sc=r.standing>0?G.mid:r.standing<0?G.red:G.muted;
                  return(<tr key={r.hole} style={{background:i%2===0?"#F4F9F5":"#fff"}}>
                    <td style={{...TD,textAlign:"center",fontWeight:700}}>{r.hole}</td>
                    <td style={{...TD,textAlign:"center"}}>P{r.par}</td>
                    <td style={{...TD,textAlign:"center"}}>{r.gA}</td>
                    <td style={{...TD,textAlign:"center",color:G.gold,fontWeight:700}}>{r.bA>0?"+"+r.bA:"—"}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:800,color:G.mid}}>{r.nA}</td>
                    <td style={{...TD,textAlign:"center"}}>{r.gB}</td>
                    <td style={{...TD,textAlign:"center",color:G.gold,fontWeight:700}}>{r.bB>0?"+"+r.bB:"—"}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:800,color:G.mid}}>{r.nB}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:700,color:rc,fontSize:11}}>{wn?`${wn} W`:"Halved"}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:700,color:sc,fontSize:11}}>{r.standing===0?"AS":`${ldr} ${Math.abs(r.standing)}↑`}</td>
                  </tr>);
                })}</tbody>
              </table>
            </div>
          ):<p style={{color:G.muted,textAlign:"center",padding:20}}>Enter scores to see hole-by-hole detail.</p>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────────────────
export default function GolfTracker() {
  const [tab,      setTab]      = useState("entry");
  const [fmt,      setFmt]      = useState("Low Net");
  const [library,  setLibrary]  = useState(DEF_LIBRARY);
  const [round,    setRound]    = useState(DEF_ROUND);
  const [archive,  setArchive]  = useState([]);
  const [loading,  setLoading]  = useState(true);

  const [libSync,   setLibSync]  = useState("saved");
  const [roundSync, setRoundSync]= useState("saved");
  const [libSaved,  setLibSaved] = useState("");
  const [roundSaved,setRoundSaved]=useState("");

  const libInit   = useRef(false);
  const roundInit = useRef(false);

  useEffect(()=>{
    (async()=>{
      try {
        const lr = await window.storage.get("golf_library_v1", true);
        if (lr?.value) {
          const d=JSON.parse(lr.value);
          if(d.roster)  setLibrary(l=>({...l,roster:d.roster}));
          if(d.courses) setLibrary(l=>({...l,courses:d.courses}));
          if(d.savedAt) setLibSaved(new Date(d.savedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}));
        }
      } catch(_) {}
      try {
        const rr = await window.storage.get("golf_round_v1", true);
        if (rr?.value) {
          const d=JSON.parse(rr.value);
          setRound(d);
          if(d.savedAt) setRoundSaved(new Date(d.savedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}));
        }
      } catch(_) {}
      try {
        const ar = await window.storage.get("golf_archive_v1", true);
        if (ar?.value) setArchive(JSON.parse(ar.value));
      } catch(_) {}
      setLoading(false);
      setTimeout(()=>{ libInit.current=true; roundInit.current=true; }, 200);
    })();
  },[]);

  useEffect(()=>{ if(libInit.current) setLibSync("idle"); },[library]);
  useEffect(()=>{ if(roundInit.current) setRoundSync("idle"); },[round]);

  const saveLibrary = useCallback(async()=>{
    setLibSync("saving");
    try {
      const d={roster:library.roster,courses:library.courses,savedAt:new Date().toISOString()};
      await window.storage.set("golf_library_v1", JSON.stringify(d), true);
      setLibSaved(new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}));
      setLibSync("saved");
    } catch(e){ setLibSync("error"); }
  },[library]);

  const saveRound = useCallback(async()=>{
    setRoundSync("saving");
    try {
      const d={...round,savedAt:new Date().toISOString()};
      await window.storage.set("golf_round_v1", JSON.stringify(d), true);
      setRoundSaved(new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}));
      setRoundSync("saved");
    } catch(e){ setRoundSync("error"); }
  },[round]);

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
      await window.storage.set("golf_archive_v1", JSON.stringify(newArchive), true);
      alert("Round archived successfully! You can now re-export it anytime from the Export tab.");
    } catch(e) { alert("Archive saved locally (storage error: "+e.message+")"); }
  };

  const newRound = () => {
    if (!window.confirm("Start a new round? This will clear all current scores.")) return;
    setRound({name:"Saturday Round",date:new Date().toISOString().split("T")[0],gameFormat:round.gameFormat||"stroke_net",playerTees:{},scores:{}});
  };

  const activeCourse  = library.courses.find(c=>c.active) || library.courses[0];
  const activeTees    = activeCourse.tees;
  const activePlayers = buildActivePlayers(library, round);
  const currentGameFmt = GAME_FORMATS.find(g=>g.id===round.gameFormat) || GAME_FORMATS[0];

  const TABS = [
    {id:"entry",  icon:"⛳", label:"Hole Entry"},
    {id:"scores", icon:"📝", label:"Score Grid"},
    {id:"board",  icon:"🏆", label:"Leaderboard"},
    {id:"match",  icon:"⚔️", label:"Match Play"},
    {id:"skins",  icon:"💰", label:"Skins"},
    {id:"nassau", icon:"🔱", label:"Nassau"},
    {id:"bingo",  icon:"🎯", label:"Bingo Bango"},
    {id:"games",  icon:"🎮", label:"Game Format"},
    {id:"export", icon:"📊", label:"Export"},
    {id:"setup",  icon:"⚙️", label:"Setup"},
  ];

  if (loading) return (
    <div style={{minHeight:"100vh",background:G.deep,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{fontSize:48}}>⛳</div>
      <div style={{color:"#fff",fontSize:16,opacity:.8}}>Loading…</div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:`linear-gradient(160deg,${G.deep} 0%,${G.dark} 45%,${G.deep} 100%)`,fontFamily:"system-ui,sans-serif"}}>

      {/* HEADER */}
      <div style={{background:"rgba(0,0,0,.4)",borderBottom:"1px solid rgba(255,255,255,.08)",padding:"0 16px",position:"sticky",top:0,zIndex:100,backdropFilter:"blur(8px)"}}>
        <div style={{maxWidth:1500,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",flexWrap:"wrap",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:28}}>⛳</span>
              <div>
                <div style={{fontFamily:"Georgia,serif",fontSize:17,fontWeight:900,color:"#fff"}}>Golf Match Tracker</div>
                <div style={{fontSize:10,color:G.bright,letterSpacing:1.2,textTransform:"uppercase"}}>USGA · Multi-Tee · {currentGameFmt.icon} {currentGameFmt.name}</div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <SyncBar status={libSync}   onSave={saveLibrary} lastSaved={libSaved??""}/>
              <SyncBar status={roundSync} onSave={saveRound}   lastSaved={roundSaved??""}/>
              <button onClick={()=>exportRoundToExcel(round,library)}
                style={{background:"rgba(82,183,136,.2)",color:G.bright,border:"1px solid rgba(82,183,136,.4)",borderRadius:8,padding:"6px 14px",fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                ⬇️ Export
              </button>
              <button onClick={newRound}
                style={{background:"rgba(255,255,255,.12)",color:"#fff",border:"1px solid rgba(255,255,255,.25)",borderRadius:8,padding:"6px 14px",fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                🔄 New Round
              </button>
            </div>
          </div>

          {/* Round info bar */}
          <div style={{display:"flex",alignItems:"center",gap:12,padding:"6px 0 8px",fontSize:12,color:"rgba(255,255,255,.6)",flexWrap:"wrap"}}>
            <span style={{color:G.bright,fontWeight:700}}>📅 {round.date}</span>
            <span>·</span>
            <span style={{color:"#fff",fontWeight:600}}>{round.name}</span>
            <span>·</span>
            <span>🏌️ {activeCourse.name}</span>
            <span>·</span>
            <span>👥 {activePlayers.length} players</span>
            <span>·</span>
            <span style={{background:"rgba(201,168,76,.2)",color:G.gold,padding:"2px 8px",borderRadius:99,fontWeight:700,border:"1px solid rgba(201,168,76,.3)"}}>{currentGameFmt.icon} {currentGameFmt.name}</span>
          </div>

          <div style={{display:"flex",gap:0,overflowX:"auto"}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)}
                style={{padding:"9px 14px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600,whiteSpace:"nowrap",color:tab===t.id?"#fff":"rgba(255,255,255,.45)",borderBottom:tab===t.id?"3px solid "+G.bright:"3px solid transparent",transition:"all .18s"}}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* BODY */}
      <div style={{maxWidth:1500,margin:"0 auto",padding:"20px 14px 48px"}}>

        {roundSync==="idle" && tab!=="setup" && (
          <div style={{background:"rgba(201,168,76,.15)",border:"1px solid rgba(201,168,76,.4)",borderRadius:10,padding:"10px 18px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
            <span style={{color:G.gold,fontSize:13,fontWeight:600}}>💾 Unsaved round changes</span>
            <button onClick={saveRound} style={{background:G.gold,color:"#fff",border:"none",borderRadius:7,padding:"6px 16px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Save Round</button>
          </div>
        )}

        <div style={{background:G.cream,borderRadius:16,padding:"20px",boxShadow:"0 2px 16px rgba(0,0,0,.08)"}}>

          {tab!=="setup" && tab!=="games" && tab!=="export" && (
            <RoundSetupBanner library={library} round={round} setRound={setRound}/>
          )}

          {tab==="entry" && (
            <>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                <span style={{fontSize:22}}>⛳</span>
                <h2 style={{margin:0,fontSize:18,fontWeight:700,color:G.dark,fontFamily:"Georgia,serif"}}>Hole-by-Hole Entry</h2>
                <span style={{fontSize:12,color:G.muted,background:"#E8F5E9",borderRadius:99,padding:"3px 10px"}}>Navigate hole to hole with quick-score buttons</span>
              </div>
              {activePlayers.length===0
                ? <div style={{textAlign:"center",padding:40,color:G.muted}}>No active players. Go to ⚙️ Setup → Roster to activate players.</div>
                : <HoleEntry players={activePlayers} tees={activeTees} scores={round.scores} onChange={updateScore} activeCourse={activeCourse}/>
              }
            </>
          )}

          {tab==="scores" && (
            <>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                <span style={{fontSize:22}}>📝</span>
                <h2 style={{margin:0,fontSize:18,fontWeight:700,color:G.dark,fontFamily:"Georgia,serif"}}>Score Grid</h2>
              </div>
              {activePlayers.length===0
                ? <div style={{textAlign:"center",padding:40,color:G.muted}}>No active players. Go to ⚙️ Setup → Roster to activate players.</div>
                : <ScoreGrid players={activePlayers} tees={activeTees} scores={round.scores} onChange={updateScore}/>
              }
            </>
          )}

          {tab==="board" && (
            <>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                <span style={{fontSize:22}}>🏆</span>
                <h2 style={{margin:0,fontSize:18,fontWeight:700,color:G.dark,fontFamily:"Georgia,serif"}}>Leaderboard</h2>
              </div>
              <Leaderboard players={activePlayers} tees={activeTees} scores={round.scores} fmt={fmt} setFmt={setFmt}/>
            </>
          )}

          {tab==="match" && (
            <>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                <span style={{fontSize:22}}>⚔️</span>
                <h2 style={{margin:0,fontSize:18,fontWeight:700,color:G.dark,fontFamily:"Georgia,serif"}}>Round Robin Match Play</h2>
              </div>
              <RoundRobin players={activePlayers} tees={activeTees} scores={round.scores}/>
            </>
          )}

          {tab==="skins" && (
            <>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                <span style={{fontSize:22}}>💰</span>
                <h2 style={{margin:0,fontSize:18,fontWeight:700,color:G.dark,fontFamily:"Georgia,serif"}}>Skins</h2>
              </div>
              <Skins players={activePlayers} tees={activeTees} scores={round.scores}/>
            </>
          )}

          {tab==="nassau" && (
            <>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                <span style={{fontSize:22}}>🔱</span>
                <h2 style={{margin:0,fontSize:18,fontWeight:700,color:G.dark,fontFamily:"Georgia,serif"}}>Nassau</h2>
              </div>
              <Nassau players={activePlayers} tees={activeTees} scores={round.scores}/>
            </>
          )}

          {tab==="bingo" && (
            <>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                <span style={{fontSize:22}}>🎯</span>
                <h2 style={{margin:0,fontSize:18,fontWeight:700,color:G.dark,fontFamily:"Georgia,serif"}}>Bingo Bango Bongo</h2>
              </div>
              <BingoBangoBongo players={activePlayers} tees={activeTees} scores={round.scores}/>
            </>
          )}

          {tab==="games" && (
            <>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                <span style={{fontSize:22}}>🎮</span>
                <h2 style={{margin:0,fontSize:18,fontWeight:700,color:G.dark,fontFamily:"Georgia,serif"}}>This Week's Game Format</h2>
              </div>
              <GameFormatPicker current={round.gameFormat} onChange={fmt=>setRound(r=>({...r,gameFormat:fmt}))}/>
            </>
          )}

          {tab==="export" && (
            <>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                <span style={{fontSize:22}}>📊</span>
                <h2 style={{margin:0,fontSize:18,fontWeight:700,color:G.dark,fontFamily:"Georgia,serif"}}>Export & Archive</h2>
              </div>
              <ExportArchiveTab round={round} library={library} archive={archive} onArchive={handleArchiveRound}/>
            </>
          )}

          {tab==="setup" && (
            <>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:22}}>⚙️</span>
                  <h2 style={{margin:0,fontSize:18,fontWeight:700,color:G.dark,fontFamily:"Georgia,serif"}}>Setup — Roster & Courses</h2>
                </div>
                {libSync==="idle"&&(
                  <div style={{background:"rgba(201,168,76,.15)",border:"1px solid rgba(201,168,76,.4)",borderRadius:8,padding:"7px 14px",display:"flex",alignItems:"center",gap:10}}>
                    <span style={{color:G.gold,fontSize:12,fontWeight:600}}>Unsaved changes</span>
                    <button onClick={saveLibrary} style={{background:G.gold,color:"#fff",border:"none",borderRadius:6,padding:"4px 12px",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Save Now</button>
                  </div>
                )}
              </div>
              <SetupTab library={library} setLibrary={setLibrary} onLibrarySave={saveLibrary} libSaveStatus={libSync}/>
            </>
          )}

        </div>

        <div style={{textAlign:"center",color:"rgba(255,255,255,.25)",fontSize:11,marginTop:24,letterSpacing:.5}}>
          Golf Match Tracker v7 · USGA Handicap · {GAME_FORMATS.length} Game Formats · Excel Export · Round Archive
        </div>
      </div>
    </div>
  );
}
