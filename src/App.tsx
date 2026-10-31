import React, { useEffect, useMemo, useState } from "react";
import { createWorker } from "tesseract.js";
import {
  Upload, Save, RotateCcw, Search, ShieldCheck, UserRound,
  Image as ImageIcon, AlertTriangle, CheckCircle2
} from "lucide-react";
import "./style.css";

const classes = {
  Wizard: { k: 71.5, b: 30630 },
  Paladino: { k: 87.624, b: 68023.411 },
  Cigana: { k: 69.29610630, b: 50810.276680 },
  Priest: { k: 57.39405082, b: 55528.449536 },
  Sniper: { k: 71.54410178995039, b: 36897.07785205952 },
} as const;

type ClassName = keyof typeof classes;
type StatGroup = "Comuns" | "Avançados" | "Especial";
type Bonus = {
  vit: number;
  pv: number;
  pvPct: number;
  int: number;
  atqm: number;
  ignoreDefm: number;
};

const blankBonus: Bonus = { vit: 0, pv: 0, pvPct: 0, int: 0, atqm: 0, ignoreDefm: 0 };
const defaultCurrent: Bonus = { ...blankBonus, atqm: 339, int: 6, ignoreDefm: 27 };
const defaultNext: Bonus = { ...blankBonus, pv: 1045, atqm: 291, int: 7, ignoreDefm: 31 };

const common = [
  "PV", "PM", "ATQF", "ATQM", "DEFF", "DEFM",
  "ATQF (Refino)", "ATQM (Refino)", "DEFF (Refino)", "DEFM (Refino)",
  "Recuperar PV", "Recuperar PM", "Precisão", "Esquiva"
];
const advanced = [
  "VATQ", "VMOV", "TC Variável", "TC Variável %", "TC Fixo", "TC Fixo %",
  "Efeito de Cura", "Cura Recebida", "CRIT", "RES CRIT", "Dano CRIT %",
  "Resistência a Dano CRIT %", "Bônus de Dano Físico", "Redução de Dano Físico",
  "Bônus de Dano Mágico", "Redução de Dano Mágico", "Ignorar DEFF", "Ignorar DEFM",
  "Ignorar DEFF %", "Ignorar DEFM %", "Bônus de Dano Fixo", "Dano Mágico Bônus",
  "Redução de Dano Fixo", "Bônus de Dano à Distância",
  "Redução de Dano à Distância", "Bônus de Dano Corpo a Corpo"
];
const special = [
  "PV Máx.%", "PM Máx.%", "ATQF Equipamento %", "ATQM Equipamento %",
  "DEFF Equipamento %", "DEFM Equipamento %", "TdR Global",
  "Dano/Redução x Pequenos", "Dano/Redução x Médios", "Dano/Redução x Grandes",
  "Dano Bruto", "Dano/Redução x Humanoide", "Dano/Redução x Demônio",
  "Dano/Redução x Planta", "Dano/Redução x Morto-Vivo", "Dano/Redução x Peixe",
  "Dano/Redução x Dragão", "Dano Habilidade Vento / Resistência Vento",
  "Dano Habilidade Terra / Redução Terra", "Dano Habilidade Fogo / Resistência Fogo",
  "Dano Habilidade Água / Redução Água", "Resistência Neutro",
  "Dano Habilidade Fantasma / Resistência Fantasma", "Redução Veneno",
  "Dano x Inimigo Vento, Fogo, Água, Sagrado", "Redução x Chefe"
];
const groups: Record<StatGroup, string[]> = { Comuns: common, Avançados: advanced, Especial: special };

const initialStats: Record<string, string> = Object.fromEntries(
  [...common, ...advanced, ...special].map(name => [
    name,
    name === "PV" ? "92694" : name === "PV Máx.%" ? "81.78" : ""
  ])
);

function parseNumber(value: string | number): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let normalized = String(value).trim().replace(/[%\s]/g, "").replace(/[^\d,.-]/g, "");
  if (!normalized) return 0;

  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (comma >= 0) {
    normalized = normalized.replace(",", ".");
  } else if ((normalized.match(/\./g) ?? []).length > 1) {
    normalized = normalized.replace(/\./g, "");
  } else if (/^-?\d{1,3}\.\d{3}$/.test(normalized)) {
    normalized = normalized.replace(".", "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("pt-BR");
}

function isBonus(value: unknown): value is Bonus {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return ["vit", "pv", "pvPct", "int", "atqm", "ignoreDefm"]
    .every(key => typeof item[key] === "number" && Number.isFinite(item[key]));
}

function BonusEditor({
  title,
  value,
  onChange
}: {
  title: string;
  value: Bonus;
  onChange: (value: Bonus) => void;
}) {
  const fields: [keyof Bonus, string][] = [
    ["vit", "VIT"], ["pv", "PV Máx. fixo"], ["pvPct", "PV Máx. %"],
    ["int", "INT"], ["atqm", "ATQM"], ["ignoreDefm", "Ignorar DEFM"]
  ];

  return (
    <div className="bonus-editor">
      <h4>{title}</h4>
      {fields.map(([key, label]) => (
        <label key={key}>
          {label}
          <input
            type="number"
            step="any"
            value={value[key]}
            onChange={event => onChange({ ...value, [key]: parseNumber(event.target.value) })}
          />
        </label>
      ))}
    </div>
  );
}

function ImageUpload({
  label,
  image,
  onChange
}: {
  label: string;
  image: string;
  onChange: (file: File) => void;
}) {
  return (
    <label className="image-upload">
      <div className="preview">
        {image ? <img src={image} alt={label} /> : <ImageIcon size={30} />}
        <span>{label}</span>
      </div>
      <span className="upload-link"><Upload size={14} /> Selecionar imagem</span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={event => {
          const selected = event.target.files?.[0];
          if (selected) onChange(selected);
          event.currentTarget.value = "";
        }}
      />
    </label>
  );
}

export default function App() {
  const [cls, setCls] = useState<ClassName>("Wizard");
  const [character, setCharacter] = useState("Meu personagem");
  const [vit, setVit] = useState(59);
  const [stats, setStats] = useState<Record<string, string>>(initialStats);
  const [tab, setTab] = useState<StatGroup>("Comuns");
  const [filter, setFilter] = useState("");
  const [current, setCurrent] = useState<Bonus>(defaultCurrent);
  const [next, setNext] = useState<Bonus>(defaultNext);
  const [profile, setProfile] = useState("");
  const [oldItem, setOldItem] = useState("");
  const [newItem, setNewItem] = useState("");
  const [ocr, setOcr] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("oblivion-character");
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, unknown>;
        if (typeof saved.character === "string") setCharacter(saved.character);
        if (typeof saved.cls === "string" && saved.cls in classes) setCls(saved.cls as ClassName);
        if (typeof saved.vit === "number" && Number.isFinite(saved.vit)) setVit(saved.vit);
        if (saved.stats && typeof saved.stats === "object") {
          setStats({ ...initialStats, ...(saved.stats as Record<string, string>) });
        }
        if (isBonus(saved.current)) setCurrent(saved.current);
        if (isBonus(saved.next)) setNext(saved.next);
        setNotice("Dados salvos anteriormente foram recuperados neste navegador.");
      }
    } catch {
      setNotice("Não foi possível recuperar os dados salvos. Você pode continuar e salvar novamente.");
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => () => {
    [profile, oldItem, newItem].forEach(url => {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    });
  }, [profile, oldItem, newItem]);

  const visibleStats = useMemo(
    () => groups[tab].filter(name => name.toLocaleLowerCase("pt-BR").includes(filter.toLocaleLowerCase("pt-BR"))),
    [tab, filter]
  );

  const baseHp = parseNumber(stats.PV);
  const basePct = parseNumber(stats["PV Máx.%"]);
  const vitBase = Math.max(0, vit);
  const classCoefficient = classes[cls];
  const currentMultiplier = 1 + (basePct + current.pvPct) / 100;
  const projectedMultiplier = 1 + (basePct + next.pvPct) / 100;
  const validHpInput = baseHp > 0 && currentMultiplier > 0 && projectedMultiplier > 0;

  const personalizedB = validHpInput
    ? baseHp / currentMultiplier - classCoefficient.k * (vitBase + current.vit) - current.pv
    : 0;

  const hpNow = validHpInput
    ? (personalizedB + current.pv + classCoefficient.k * (vitBase + current.vit)) * currentMultiplier
    : 0;

  const hpNext = validHpInput
    ? (personalizedB + next.pv + classCoefficient.k * (vitBase + next.vit)) * projectedMultiplier
    : 0;

  const hpDelta = hpNext - hpNow;
  const setStat = (name: string, value: string) => setStats(old => ({ ...old, [name]: value }));

  function replaceImage(file: File, setter: React.Dispatch<React.SetStateAction<string>>): boolean {
    if (!file.type.startsWith("image/")) {
      setNotice("Selecione um arquivo de imagem PNG, JPG ou WEBP.");
      return false;
    }
    if (file.size > 15 * 1024 * 1024) {
      setNotice("A imagem excede 15 MB. Reduza o tamanho e tente novamente.");
      return false;
    }
    const url = URL.createObjectURL(file);
    setter(previous => {
      if (previous.startsWith("blob:")) URL.revokeObjectURL(previous);
      return url;
    });
    return true;
  }

  async function runOcr(file: File) {
    setBusy(true);
    setOcr("");
    let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
    try {
      worker = await createWorker("por");
      const result = await worker.recognize(file);
      setOcr(result.data.text);
      if (!result.data.text.trim()) {
        setNotice("O OCR não identificou texto legível. Tente um print mais nítido.");
      } else {
        setNotice("Leitura concluída. Revise os números antes de copiá-los para os campos.");
      }
    } catch (error) {
      console.error("OCR failed:", error);
      setNotice("Não foi possível ler a imagem. Confira a conexão ou tente um print mais nítido.");
    } finally {
      if (worker) {
        try { await worker.terminate(); } catch (error) { console.warn("OCR worker cleanup failed:", error); }
      }
      setBusy(false);
    }
  }

  function save() {
    try {
      localStorage.setItem("oblivion-character", JSON.stringify({
        character, cls, vit, stats, current, next,
        savedAt: new Date().toISOString()
      }));
      setNotice("Personagem salvo neste navegador. Imagens e texto do OCR não são armazenados.");
    } catch (error) {
      console.error("Local save failed:", error);
      setNotice("Não foi possível salvar. Verifique o espaço disponível no navegador.");
    }
  }

  function reset() {
    if (!window.confirm("Restaurar os valores iniciais do protótipo? Os dados locais salvos serão apagados.")) return;
    localStorage.removeItem("oblivion-character");
    setCharacter("Meu personagem");
    setCls("Wizard");
    setVit(59);
    setStats(initialStats);
    setCurrent(defaultCurrent);
    setNext(defaultNext);
    setProfile("");
    setOldItem("");
    setNewItem("");
    setOcr("");
    setNotice("Valores iniciais restaurados e dados locais removidos.");
  }

  return (
    <div className="app">
      <header>
        <div className="brand">
          <div className="brandmark">OB</div>
          <div>
            <h1>OBLIVION</h1>
            <strong>CALCULATOR</strong>
            <small>CHARACTER ANALYSIS · EQUIPMENT COMPARISON</small>
          </div>
        </div>
        <button className="button secondary" onClick={save} disabled={!hydrated}>
          <Save size={15} /> Salvar personagem
        </button>
      </header>

      <main>
        <section className="panel hero">
          <div className="profile-photo">
            {profile ? <img src={profile} alt="Perfil do personagem" /> : <UserRound size={36} />}
            <label>
              <Upload size={13} /> Foto
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
                const file = event.target.files?.[0];
                if (file) replaceImage(file, setProfile);
                event.currentTarget.value = "";
              }} />
            </label>
          </div>

          <div className="profile-fields">
            <label>Nome do personagem
              <input value={character} onChange={event => setCharacter(event.target.value)} />
            </label>
            <label>Classe
              <select value={cls} onChange={event => setCls(event.target.value as ClassName)}>
                {Object.keys(classes).map(name => <option key={name}>{name}</option>)}
              </select>
            </label>
            <label>VIT base (sem os bônus dos itens comparados)
              <input type="number" min="0" value={vit} onChange={event => setVit(parseNumber(event.target.value))} />
            </label>
          </div>

          <div className="hp-summary">
            <div><small>PV MÁX. ATUAL INFORMADO</small><b>{validHpInput ? formatNumber(hpNow) : "—"}</b></div>
            <span className="arrow">→</span>
            <div><small>PV MÁX. PROJETADO</small><b>{validHpInput ? formatNumber(hpNext) : "—"}</b></div>
            <strong className={hpDelta >= 0 ? "positive" : "negative"}>
              {validHpInput ? `${hpDelta >= 0 ? "+" : ""}${formatNumber(hpDelta)} PV` : "Aguardando dados"}
            </strong>
          </div>

          <p className="hint">
            A fórmula usa o PV Máx. observado com o equipamento atual para inferir a base individual do personagem.
            Informe o VIT base e o PV Máx. % sem os bônus dos itens que estão sendo comparados.
          </p>
          {!validHpInput && (
            <div className="calculation-warning">
              <AlertTriangle size={15} />
              Informe um PV Máx. maior que zero e percentuais que mantenham o multiplicador positivo para calcular.
            </div>
          )}
        </section>

        <section className="panel">
          <div className="section-head">
            <div><span className="step">01</span><h2>Leitura de imagem do personagem</h2></div>
            <p>Envie um print da tela de atributos. O OCR auxilia na transcrição; revise os dados antes de aplicá-los.</p>
          </div>
          <div className="upload-row">
            <ImageUpload label="Print de atributos" image={profile} onChange={file => {
              if (replaceImage(file, setProfile)) void runOcr(file);
            }} />
            <div className="ocr-box">
              <b>Leitura OCR {busy && "· Processando…"}</b>
              <textarea value={ocr} onChange={event => setOcr(event.target.value)}
                placeholder="O texto reconhecido aparecerá aqui. Revise e transcreva os valores para os campos abaixo." />
              <small>O reconhecimento é assistivo; não preenche automaticamente todos os campos.</small>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <div><span className="step">02</span><h2>Comparação de equipamentos</h2></div>
            <p>Adicione as imagens e informe os bônus dos itens nos campos correspondentes.</p>
          </div>
          <div className="equipment-grid">
            <div>
              <ImageUpload label="Equipamento atual" image={oldItem} onChange={file => replaceImage(file, setOldItem)} />
              <BonusEditor title="Bônus do item atual" value={current} onChange={setCurrent} />
            </div>
            <div>
              <ImageUpload label="Novo equipamento" image={newItem} onChange={file => replaceImage(file, setNewItem)} />
              <BonusEditor title="Bônus do substituto" value={next} onChange={setNext} />
            </div>
          </div>

          <div className="comparison">
            <h3>Diferenças dos bônus cadastrados</h3>
            <div className="diff-grid">
              {([
                ["VIT", current.vit, next.vit],
                ["PV Máx. fixo", current.pv, next.pv],
                ["PV Máx. %", current.pvPct, next.pvPct],
                ["INT", current.int, next.int],
                ["ATQM", current.atqm, next.atqm],
                ["Ignorar DEFM", current.ignoreDefm, next.ignoreDefm]
              ] as [string, number, number][]).map(([label, oldValue, newValue]) => {
                const difference = newValue - oldValue;
                return (
                  <div className="diff" key={label}>
                    <small>{label}</small>
                    <b className={difference >= 0 ? "positive" : "negative"}>
                      {difference >= 0 ? "+" : ""}{formatNumber(difference)}
                    </b>
                  </div>
                );
              })}
            </div>
            <div className="hp-result">
              <span>PV Máx. projetado após a substituição</span>
              <b>{validHpInput ? formatNumber(hpNext) : "—"}</b>
              <strong className={hpDelta >= 0 ? "positive" : "negative"}>
                {validHpInput ? `${hpDelta >= 0 ? "+" : ""}${formatNumber(hpDelta)} PV` : "—"}
              </strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <div><span className="step">03</span><h2>Calculadora completa de atributos</h2></div>
            <p>Confira e edite os valores do personagem. As três categorias permanecem disponíveis.</p>
          </div>
          <div className="tabs">
            {(["Comuns", "Avançados", "Especial"] as StatGroup[]).map(group => (
              <button
                className={tab === group ? "active" : ""}
                key={group}
                onClick={() => { setTab(group); setFilter(""); }}
              >
                {group === "Comuns" ? "Atributos Comuns" : group === "Avançados" ? "Atributos Avançados" : "Especial"}
              </button>
            ))}
          </div>
          <div className="search">
            <Search size={15} />
            <input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Buscar atributo…" />
          </div>
          <div className="stat-head"><span>Atributo</span><span>Valor informado</span></div>
          {visibleStats.length > 0 ? visibleStats.map(name => (
            <label className="stat-row" key={name}>
              <span>{name}</span>
              <input
                inputMode="decimal"
                value={stats[name] ?? ""}
                onChange={event => setStat(name, event.target.value)}
                placeholder="—"
              />
            </label>
          )) : <p className="empty-state">Nenhum atributo encontrado para essa busca.</p>}
        </section>

        <section className="panel">
          <div className="section-head">
            <div><span className="step">04</span><h2>Coeficientes de classe</h2></div>
            <p>Calibrações aprovadas cadastradas no sistema.</p>
          </div>
          <div className="calibration">
            {Object.entries(classes).map(([name, coefficient]) => (
              <div key={name}>
                <b>{name}</b>
                <span>K = {coefficient.k}</span>
                <span>B de referência = {coefficient.b.toLocaleString("pt-BR")}</span>
              </div>
            ))}
          </div>
          <p className="hint"><ShieldCheck size={14} /> A base B individual é inferida do PV Máx. informado; o B de referência é exibido para conferência. Não altere os coeficientes sem validação.</p>
        </section>

        {notice && (
          <div className="notice" role="status">
            <CheckCircle2 size={16} />
            {notice}
            <button aria-label="Fechar aviso" onClick={() => setNotice("")}>×</button>
          </div>
        )}
      </main>

      <footer>
        <span>OBLIVION CALCULATOR · MVP 1.0</span>
        <button className="button secondary" onClick={reset}><RotateCcw size={14} /> Restaurar valores</button>
      </footer>
    </div>
  );
}
