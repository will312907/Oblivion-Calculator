import React, { useMemo, useState } from "react";
import { createWorker } from "tesseract.js";
import { Upload, Save, RotateCcw, Search, ShieldCheck, UserRound, Image as ImageIcon } from "lucide-react";
import "./style.css";

const classes = {
  Wizard: { k: 71.5, b: 30630 },
  Paladino: { k: 87.624, b: 68023.411 },
  Cigana: { k: 69.29610630, b: 50810.276680 },
  Priest: { k: 57.39405082, b: 55528.449536 },
  Sniper: { k: 71.54410178995039, b: 36897.07785205952 },
} as const;
type ClassName = keyof typeof classes;
type Bonus = { vit: number; pv: number; pvPct: number; int: number; atqm: number; ignoreDefm: number };
const blank: Bonus = { vit: 0, pv: 0, pvPct: 0, int: 0, atqm: 0, ignoreDefm: 0 };
const common = ["PV", "PM", "ATQF", "ATQM", "DEFF", "DEFM", "ATQF (Refino)", "ATQM (Refino)", "DEFF (Refino)", "DEFM (Refino)", "Recuperar PV", "Recuperar PM", "Precisão", "Esquiva"];
const advanced = ["VATQ", "VMOV", "TC Variável", "TC Variável %", "TC Fixo", "TC Fixo %", "Efeito de Cura", "Cura Recebida", "CRIT", "RES CRIT", "Dano CRIT %", "Resistência a Dano CRIT %", "Bônus de Dano Físico", "Redução de Dano Físico", "Bônus de Dano Mágico", "Redução de Dano Mágico", "Ignorar DEFF", "Ignorar DEFM", "Ignorar DEFF %", "Ignorar DEFM %", "Bônus de Dano Fixo", "Dano Mágico Bônus", "Redução de Dano Fixo", "Bônus de Dano à Distância", "Redução de Dano à Distância", "Bônus de Dano Corpo a Corpo"];
const special = ["PV Máx.%", "PM Máx.%", "ATQF Equipamento %", "ATQM Equipamento %", "DEFF Equipamento %", "DEFM Equipamento %", "TdR Global", "Dano/Redução x Pequenos", "Dano/Redução x Médios", "Dano/Redução x Grandes", "Dano Bruto", "Dano/Redução x Humanoide", "Dano/Redução x Demônio", "Dano/Redução x Planta", "Dano/Redução x Morto-Vivo", "Dano/Redução x Peixe", "Dano/Redução x Dragão", "Dano Habilidade Vento / Resistência Vento", "Dano Habilidade Terra / Redução Terra", "Dano Habilidade Fogo / Resistência Fogo", "Dano Habilidade Água / Redução Água", "Resistência Neutro", "Dano Habilidade Fantasma / Resistência Fantasma", "Redução Veneno", "Dano x Inimigo Vento, Fogo, Água, Sagrado", "Redução x Chefe"];
const initial: Record<string, string> = Object.fromEntries([...common, ...advanced, ...special].map(x => [x, x === "PV" ? "92694" : x === "PV Máx.%" ? "81.78" : ""]));
function n(v: string | number) { const parsed = Number(String(v).replace(",", ".").replace(/[^\d.-]/g, "")); return Number.isFinite(parsed) ? parsed : 0; }
function fmt(v: number) { return Math.round(v).toLocaleString("pt-BR"); }

function BonusEditor({ title, value, onChange }: { title: string; value: Bonus; onChange: (v: Bonus) => void }) {
  const fields: [keyof Bonus, string][] = [["vit", "VIT"], ["pv", "PV Máx. fixo"], ["pvPct", "PV Máx. %"], ["int", "INT"], ["atqm", "ATQM"], ["ignoreDefm", "Ignorar DEFM"]];
  return <div className="bonus-editor"><h4>{title}</h4>{fields.map(([key, label]) => <label key={key}>{label}<input type="number" step="any" value={value[key]} onChange={e => onChange({ ...value, [key]: n(e.target.value) })} /></label>)}</div>;
}
function ImageUpload({ label, image, onChange }: { label: string; image: string; onChange: (f: File) => void }) {
  return <label className="image-upload"><div className="preview">{image ? <img src={image} alt={label} /> : <ImageIcon size={30} />}<span>{label}</span></div><span className="upload-link"><Upload size={14}/> Selecionar imagem</span><input type="file" accept="image/*" onChange={e => e.target.files?.[0] && onChange(e.target.files[0])} /></label>;
}

export default function App() {
  const [cls, setCls] = useState<ClassName>("Wizard");
  const [character, setCharacter] = useState("Meu personagem");
  const [vit, setVit] = useState(59);
  const [stats, setStats] = useState(initial);
  const [tab, setTab] = useState("Comuns");
  const [filter, setFilter] = useState("");
  const [current, setCurrent] = useState<Bonus>({ ...blank, atqm: 339, int: 6, ignoreDefm: 27 });
  const [next, setNext] = useState<Bonus>({ ...blank, pv: 1045, atqm: 291, int: 7, ignoreDefm: 31 });
  const [profile, setProfile] = useState("");
  const [oldItem, setOldItem] = useState("");
  const [newItem, setNewItem] = useState("");
  const [ocr, setOcr] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const groups = { Comuns: common, Avançados: advanced, Especial: special };
  const visible = useMemo(() => groups[tab as keyof typeof groups].filter(x => x.toLowerCase().includes(filter.toLowerCase())), [tab, filter]);
  const baseHp = n(stats.PV), basePct = n(stats["PV Máx.%"]), c = classes[cls];
  const personalizedB = baseHp / (1 + (basePct + current.pvPct) / 100) - c.k * (vit + current.vit) - current.pv;
  const hpNow = (personalizedB + current.pv + c.k * (vit + current.vit)) * (1 + (basePct + current.pvPct) / 100);
  const hpNext = (personalizedB + next.pv + c.k * (vit + next.vit)) * (1 + (basePct + next.pvPct) / 100);
  const delta = hpNext - hpNow;
  const setStat = (key: string, value: string) => setStats(old => ({ ...old, [key]: value }));
  const loadImage = (file: File, setter: (s: string) => void) => setter(URL.createObjectURL(file));
  async function runOcr(file: File) {
    setBusy(true); setOcr("");
    try { const worker = await createWorker("por"); const result = await worker.recognize(file); setOcr(result.data.text); await worker.terminate(); }
    catch { setNotice("Não foi possível executar o OCR. Confira a conexão e tente novamente."); }
    finally { setBusy(false); }
  }
  function save() {
    localStorage.setItem("oblivion-character", JSON.stringify({ character, cls, vit, stats, current, next }));
    setNotice("Personagem salvo neste navegador.");
  }
  function reset() {
    if (!confirm("Restaurar os valores iniciais do protótipo?")) return;
    setStats(initial); setVit(59); setCurrent({ ...blank, atqm: 339, int: 6, ignoreDefm: 27 });
    setNext({ ...blank, pv: 1045, atqm: 291, int: 7, ignoreDefm: 31 }); setNotice("Valores iniciais restaurados.");
  }
  return <div className="app">
    <header><div className="brand"><div className="brandmark">OB</div><div><h1>OBLIVION</h1><strong>CALCULATOR</strong><small>CHARACTER ANALYSIS · EQUIPMENT COMPARISON</small></div></div><button className="button secondary" onClick={save}><Save size={15}/> Salvar personagem</button></header>
    <main>
      <section className="panel hero"><div className="profile-photo">{profile ? <img src={profile} alt="Perfil"/> : <UserRound size={36}/>}<label><Upload size={13}/> Foto<input type="file" accept="image/*" onChange={e => e.target.files?.[0] && loadImage(e.target.files[0], setProfile)}/></label></div><div className="profile-fields"><label>Nome do personagem<input value={character} onChange={e => setCharacter(e.target.value)}/></label><label>Classe<select value={cls} onChange={e => setCls(e.target.value as ClassName)}>{Object.keys(classes).map(x => <option key={x}>{x}</option>)}</select></label><label>VIT atual<input type="number" value={vit} onChange={e => setVit(n(e.target.value))}/></label></div>
      <div className="hp-summary"><div><small>HP ATUAL CALCULADO</small><b>{fmt(hpNow)}</b></div><span className="arrow">→</span><div><small>HP PROJETADO</small><b>{fmt(hpNext)}</b></div><strong className={delta >= 0 ? "positive" : "negative"}>{delta >= 0 ? "+" : ""}{fmt(delta)} HP</strong></div><p className="hint">Base B personalizada inferida do HP atual registrado. Os bônus dos itens são aplicados separadamente em PV fixo, VIT e PV Máx. %.</p></section>
      <section className="panel"><div className="section-head"><div><span className="step">01</span><h2>Leitura de imagem do personagem</h2></div><p>Envie um print da tela de atributos. O OCR ajuda na transcrição, mas revise os dados antes de aplicá-los.</p></div><div className="upload-row"><ImageUpload label="Print de atributos" image={profile} onChange={f => {loadImage(f,setProfile); void runOcr(f);}}/><div className="ocr-box"><b>Leitura OCR {busy && "· Processando…"}</b><textarea value={ocr} onChange={e => setOcr(e.target.value)} placeholder="O texto reconhecido aparecerá aqui. Revise e transcreva os valores para os campos abaixo."/><small>O reconhecimento é assistivo; não preenche automaticamente todos os campos.</small></div></div></section>
      <section className="panel"><div className="section-head"><div><span className="step">02</span><h2>Comparação de equipamentos</h2></div><p>Adicione as imagens e informe os bônus identificados nos itens.</p></div><div className="equipment-grid"><div><ImageUpload label="Equipamento atual" image={oldItem} onChange={f => loadImage(f,setOldItem)}/><BonusEditor title="Bônus do item atual" value={current} onChange={setCurrent}/></div><div><ImageUpload label="Novo equipamento" image={newItem} onChange={f => loadImage(f,setNewItem)}/><BonusEditor title="Bônus do substituto" value={next} onChange={setNext}/></div></div><div className="comparison"><h3>Diferenças identificadas</h3><div className="diff-grid">{([["VIT",current.vit,next.vit],["PV Máx. fixo",current.pv,next.pv],["PV Máx. %",current.pvPct,next.pvPct],["INT",current.int,next.int],["ATQM",current.atqm,next.atqm],["Ignorar DEFM",current.ignoreDefm,next.ignoreDefm]] as [string,number,number][]).map(([label,a,b]) => <div className="diff" key={label}><small>{label}</small><b className={b-a >= 0 ? "positive" : "negative"}>{b-a >= 0 ? "+" : ""}{fmt(b-a)}</b></div>)}</div><div className="hp-result"><span>HP projetado após substituição</span><b>{fmt(hpNext)}</b><strong className={delta >= 0 ? "positive" : "negative"}>{delta >= 0 ? "+" : ""}{fmt(delta)} HP</strong></div></div></section>
      <section className="panel"><div className="section-head"><div><span className="step">03</span><h2>Calculadora completa de atributos</h2></div><p>Confira e edite os valores do personagem. As três categorias ficam disponíveis.</p></div><div className="tabs">{Object.keys(groups).map(g => <button className={tab === g ? "active" : ""} key={g} onClick={() => {setTab(g);setFilter("");}}>{g === "Comuns" ? "Atributos Comuns" : g === "Avançados" ? "Atributos Avançados" : "Especial"}</button>)}</div><div className="search"><Search size={15}/><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Buscar atributo…"/></div><div className="stat-head"><span>Atributo</span><span>Valor atual</span></div>{visible.map(key => <label className="stat-row" key={key}><span>{key}</span><input value={stats[key] ?? ""} onChange={e => setStat(key,e.target.value)} placeholder="—"/></label>)}</section>
      <section className="panel"><div className="section-head"><div><span className="step">04</span><h2>Coeficientes de classe</h2></div><p>Calibrações aprovadas cadastradas no sistema.</p></div><div className="calibration">{Object.entries(classes).map(([name,v]) => <div key={name}><b>{name}</b><span>K = {v.k}</span><span>B = {v.b.toLocaleString("pt-BR")}</span></div>)}</div><p className="hint"><ShieldCheck size={14}/> Não altere os coeficientes oficiais sem nova validação por registros independentes de HP, VIT e PV Máx. %.</p></section>
      {notice && <div className="notice">{notice}<button onClick={() => setNotice("")}>×</button></div>}
    </main><footer><span>OBLIVION CALCULATOR · MVP 1.0</span><button className="button secondary" onClick={reset}><RotateCcw size={14}/> Restaurar valores</button></footer>
  </div>;
}
