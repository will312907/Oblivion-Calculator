import React, { useEffect, useMemo, useRef, useState } from "react";
import { createWorker } from "tesseract.js";
import {
  Upload, RotateCcw, Search, ShieldCheck, Image as ImageIcon,
  X, FileImage, CheckCircle2, AlertTriangle, ScanText
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
type ImageEntry = { id: string; file: File; url: string };
type StatValues = Record<string, number>;

const common = [
  "VIT", "INT", "PV", "PM", "ATQF", "ATQM", "DEFF", "DEFM",
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
const groups: Record<StatGroup, string[]> = {
  Comuns: common,
  Avançados: advanced,
  Especial: special
};
const allStats = [...common, ...advanced, ...special];
const zeroStats: Record<string, string> = Object.fromEntries(allStats.map(name => [name, "0"]));

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseNumber(value: string | number, percentage = false): number {
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
    const decimals = normalized.length - comma - 1;
    normalized = !percentage && decimals === 3 && comma > 0
      ? normalized.replace(/,/g, "")
      : normalized.replace(",", ".");
  } else if (dot >= 0) {
    const decimals = normalized.length - dot - 1;
    normalized = !percentage && decimals === 3 && dot > 0
      ? normalized.replace(/\./g, "")
      : normalized;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number, percentage = false): string {
  return value.toLocaleString("pt-BR", {
    maximumFractionDigits: percentage ? 3 : 2,
    minimumFractionDigits: 0
  });
}

type OcrRule = { key: string; alias: string; percent?: boolean };
const customAliases: OcrRule[] = [
  { key: "PV Máx.%", alias: "PV MÁX. %", percent: true },
  { key: "PV Máx.%", alias: "PV MAX %", percent: true },
  { key: "PM Máx.%", alias: "PM MÁX. %", percent: true },
  { key: "PM Máx.%", alias: "PM MAX %", percent: true },
  { key: "PV", alias: "PV MÁX. FIXO" },
  { key: "PV", alias: "PV MÁX." },
  { key: "PV", alias: "PV MAX" },
  { key: "PV", alias: "HP" },
  { key: "PM", alias: "PM MÁX." },
  { key: "PM", alias: "MP" },
  { key: "ATQF", alias: "ATQ F" },
  { key: "ATQM", alias: "ATQ M" },
  { key: "DEFF", alias: "DEF F" },
  { key: "DEFM", alias: "DEF M" },
  { key: "Precisão", alias: "PRECISAO" },
  { key: "Esquiva", alias: "FLEE" },
  { key: "TC Variável", alias: "TEMPO DE CONJURAÇÃO VARIÁVEL" },
  { key: "TC Fixo", alias: "TEMPO DE CONJURAÇÃO FIXO" },
  { key: "Ignorar DEFF", alias: "IGNORAR DEF F" },
  { key: "Ignorar DEFM", alias: "IGNORAR DEF M" }
];
const ocrRules: OcrRule[] = [
  ...allStats.map(key => ({ key, alias: key, percent: key.includes("%") })),
  ...customAliases
].sort((a, b) => normalizeText(b.alias).length - normalizeText(a.alias).length);

function matchRule(line: string): OcrRule | undefined {
  const normalizedLine = normalizeText(line);
  if (!normalizedLine) return undefined;
  return ocrRules.find(rule => {
    const alias = normalizeText(rule.alias);
    if (!alias || !normalizedLine.startsWith(alias)) return false;
    if (rule.percent && !(/%/.test(line) || normalizeText(line).includes("porcento"))) return false;
    return true;
  });
}

function valuesFromOcr(text: string, sumDuplicates: boolean): StatValues {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const output: StatValues = {};
  for (let index = 0; index < lines.length; index += 1) {
    const rule = matchRule(lines[index]);
    if (!rule) continue;

    let numericText = lines[index];
    let found = numericText.match(/[-+]?\d[\d.,]*/)?.[0];
    if (!found) {
      for (let next = index + 1; next < Math.min(index + 3, lines.length); next += 1) {
        if (matchRule(lines[next])) break;
        found = lines[next].match(/[-+]?\d[\d.,]*/)?.[0];
        if (found) break;
      }
    }
    if (!found) continue;

    const parsed = parseNumber(found, rule.key.includes("%"));
    if (!Number.isFinite(parsed)) continue;
    if (sumDuplicates) output[rule.key] = (output[rule.key] ?? 0) + parsed;
    else output[rule.key] = parsed;
  }
  return output;
}

function mergeEquipmentOcr(texts: string[]): StatValues {
  const combined: StatValues = {};
  texts.forEach(text => {
    const parsed = valuesFromOcr(text, true);
    Object.entries(parsed).forEach(([key, value]) => {
      combined[key] = (combined[key] ?? 0) + value;
    });
  });
  return combined;
}

function MultiImageUpload({
  title,
  description,
  images,
  onChange
}: {
  title: string;
  description: string;
  images: ImageEntry[];
  onChange: (images: ImageEntry[]) => void;
}) {
  const latestImages = useRef(images);
  latestImages.current = images;

  useEffect(() => () => {
    latestImages.current.forEach(image => URL.revokeObjectURL(image.url));
  }, []);

  function addFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    const valid: ImageEntry[] = [];
    const rejected: string[] = [];

    files.forEach((file, index) => {
      if (!file.type.startsWith("image/")) {
        rejected.push(file.name);
      } else if (file.size > 15 * 1024 * 1024) {
        rejected.push(file.name + " (mais de 15 MB)");
      } else {
        valid.push({
          id: `${Date.now()}-${file.lastModified}-${index}-${file.name}`,
          file,
          url: URL.createObjectURL(file)
        });
      }
    });

    if (rejected.length) {
      valid.forEach(image => URL.revokeObjectURL(image.url));
      window.alert("Alguns arquivos não foram adicionados. Use imagens de até 15 MB cada.");
    } else if (valid.length) {
      onChange([...images, ...valid]);
    }
    event.currentTarget.value = "";
  }

  function removeImage(id: string) {
    const removed = images.find(image => image.id === id);
    if (removed) URL.revokeObjectURL(removed.url);
    onChange(images.filter(image => image.id !== id));
  }

  return (
    <div className="multi-upload">
      <div className="multi-upload-head">
        <div>
          <b>{title}</b>
          <small>{description}</small>
        </div>
        <label className="upload-button">
          <Upload size={14} /> Adicionar imagens
          <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={addFiles} />
        </label>
      </div>
      {images.length === 0 ? (
        <div className="multi-upload-empty">
          <ImageIcon size={25} />
          <span>Selecione uma ou várias imagens de uma vez</span>
        </div>
      ) : (
        <div className="image-thumbnails">
          {images.map((image, index) => (
            <div className="image-thumbnail" key={image.id}>
              <img src={image.url} alt={image.file.name} />
              <span>{index + 1}. {image.file.name}</span>
              <button type="button" aria-label={`Remover ${image.file.name}`} onClick={() => removeImage(image.id)}>
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="upload-count">{images.length} imagem(ns) selecionada(s)</div>
    </div>
  );
}

function AttributeRows({
  names,
  currentValues,
  projectedValues,
  onChange
}: {
  names: string[];
  currentValues: Record<string, string>;
  projectedValues: Record<string, number>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <>
      <div className="stat-head stat-head-compare">
        <span>Atributo</span>
        <span>Atual</span>
        <span>Projetado</span>
        <span>Diferença</span>
      </div>
      {names.length ? names.map(name => {
        const current = parseNumber(currentValues[name] ?? "0", name.includes("%"));
        const projected = projectedValues[name] ?? current;
        const difference = projected - current;
        return (
          <div className="stat-row stat-row-compare" key={name}>
            <span>{name}</span>
            <input
              inputMode="decimal"
              value={currentValues[name] ?? "0"}
              onChange={event => onChange(name, event.target.value)}
            />
            <output>{formatNumber(projected, name.includes("%"))}{name.includes("%") ? "%" : ""}</output>
            <output className={difference > 0 ? "positive" : difference < 0 ? "negative" : "neutral"}>
              {difference > 0 ? "+" : ""}{formatNumber(difference, name.includes("%"))}{name.includes("%") ? " p.p." : ""}
            </output>
          </div>
        );
      }) : <p className="empty-state">Nenhum atributo encontrado para essa busca.</p>}
    </>
  );
}

export default function App() {
  const [cls, setCls] = useState<ClassName>("Wizard");
  const [character, setCharacter] = useState("");
  const [stats, setStats] = useState<Record<string, string>>({ ...zeroStats });
  const [tab, setTab] = useState<StatGroup>("Comuns");
  const [filter, setFilter] = useState("");
  const [characterImages, setCharacterImages] = useState<ImageEntry[]>([]);
  const [currentGearImages, setCurrentGearImages] = useState<ImageEntry[]>([]);
  const [replacementGearImages, setReplacementGearImages] = useState<ImageEntry[]>([]);
  const [characterOcr, setCharacterOcr] = useState("");
  const [currentGearOcr, setCurrentGearOcr] = useState("");
  const [replacementGearOcr, setReplacementGearOcr] = useState("");
  const [currentGearStats, setCurrentGearStats] = useState<StatValues>({});
  const [replacementGearStats, setReplacementGearStats] = useState<StatValues>({});
  const [busy, setBusy] = useState<"character" | "current" | "replacement" | "">("");
  const [notice, setNotice] = useState("");

  const visibleStats = useMemo(
    () => groups[tab].filter(name => name.toLocaleLowerCase("pt-BR").includes(filter.toLocaleLowerCase("pt-BR"))),
    [tab, filter]
  );

  const projectedValues = useMemo(() => {
    const result: Record<string, number> = {};
    allStats.forEach(name => {
      const current = parseNumber(stats[name] ?? "0", name.includes("%"));
      result[name] = current
        + (replacementGearStats[name] ?? 0)
        - (currentGearStats[name] ?? 0);
    });
    return result;
  }, [stats, currentGearStats, replacementGearStats]);

  const currentHpObserved = parseNumber(stats.PV ?? "0");
  const currentPctObserved = parseNumber(stats["PV Máx.%"] ?? "0", true);
  const currentVit = parseNumber(stats.VIT ?? "0");
  const classCoefficient = classes[cls];
  const basePct = currentPctObserved - (currentGearStats["PV Máx.%"] ?? 0);
  const hpMultiplierNow = 1 + currentPctObserved / 100;
  const hpMultiplierNext = 1 + (basePct + (replacementGearStats["PV Máx.%"] ?? 0)) / 100;
  const canCalculateHp = currentHpObserved > 0 && hpMultiplierNow > 0 && hpMultiplierNext > 0;

  const personalizedB = canCalculateHp
    ? currentHpObserved / hpMultiplierNow
      - classCoefficient.k * (currentVit + (currentGearStats.VIT ?? 0))
      - (currentGearStats.PV ?? 0)
    : 0;

  const hpCurrent = canCalculateHp
    ? (personalizedB + (currentGearStats.PV ?? 0)
      + classCoefficient.k * (currentVit + (currentGearStats.VIT ?? 0))) * hpMultiplierNow
    : 0;

  const hpProjected = canCalculateHp
    ? (personalizedB + (replacementGearStats.PV ?? 0)
      + classCoefficient.k * (currentVit + (replacementGearStats.VIT ?? 0))) * hpMultiplierNext
    : 0;
  const calculatorProjectedValues = {
    ...projectedValues,
    PV: canCalculateHp ? hpProjected : (projectedValues.PV ?? 0)
  };

  function updateStat(key: string, value: string) {
    setStats(previous => ({ ...previous, [key]: value }));
  }

  async function recognizeImages(images: ImageEntry[]): Promise<string[]> {
    if (!images.length) return [];
    const worker = await createWorker("por");
    const texts: string[] = [];
    try {
      for (const image of images) {
        const result = await worker.recognize(image.file);
        texts.push(result.data.text);
      }
    } finally {
      await worker.terminate();
    }
    return texts;
  }

  async function onCharacterImagesChange(images: ImageEntry[]) {
    setCharacterImages(images);
    if (!images.length) {
      setCharacterOcr("");
      return;
    }
    setBusy("character");
    try {
      const texts = await recognizeImages(images);
      const combined = texts.join("\n");
      setCharacterOcr(combined);
      const parsed = valuesFromOcr(combined, false);
      if (Object.keys(parsed).length) {
        setStats(previous => ({
          ...previous,
          ...Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]))
        }));
        setNotice(`Leitura concluída: ${Object.keys(parsed).length} atributo(s) preenchido(s). Confira os valores reconhecidos.`);
      } else {
        setNotice("As imagens foram carregadas, mas não reconheci atributos com segurança. Confira o texto OCR e tente um print mais nítido.");
      }
    } catch (error) {
      console.error("Character OCR failed:", error);
      setNotice("Não foi possível ler as imagens do personagem. Confira a conexão e tente novamente.");
    } finally {
      setBusy("");
    }
  }

  async function onEquipmentImagesChange(
    images: ImageEntry[],
    side: "current" | "replacement"
  ) {
    if (side === "current") setCurrentGearImages(images);
    else setReplacementGearImages(images);

    if (!images.length) {
      if (side === "current") {
        setCurrentGearOcr("");
        setCurrentGearStats({});
      } else {
        setReplacementGearOcr("");
        setReplacementGearStats({});
      }
      return;
    }

    setBusy(side);
    try {
      const texts = await recognizeImages(images);
      const combined = texts.join("\n");
      const values = mergeEquipmentOcr(texts);
      if (side === "current") {
        setCurrentGearOcr(combined);
        setCurrentGearStats(values);
      } else {
        setReplacementGearOcr(combined);
        setReplacementGearStats(values);
      }
      setNotice(
        Object.keys(values).length
          ? `Equipamento lido: ${Object.keys(values).length} atributo(s) identificado(s). A comparação foi atualizada na calculadora completa.`
          : "As imagens do equipamento foram carregadas, mas nenhum atributo foi identificado automaticamente. Revise o OCR."
      );
    } catch (error) {
      console.error("Equipment OCR failed:", error);
      setNotice("Não foi possível ler as imagens do equipamento. Confira a conexão e tente novamente.");
    } finally {
      setBusy("");
    }
  }

  function applyCharacterOcr() {
    const parsed = valuesFromOcr(characterOcr, false);
    if (!Object.keys(parsed).length) {
      setNotice("Não encontrei pares de atributo e valor no texto. Revise a transcrição ou preencha manualmente.");
      return;
    }
    setStats(previous => ({
      ...previous,
      ...Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]))
    }));
    setNotice(`${Object.keys(parsed).length} atributo(s) aplicado(s) a partir do texto revisado.`);
  }

  function applyEquipmentOcr(side: "current" | "replacement") {
    const text = side === "current" ? currentGearOcr : replacementGearOcr;
    const values = mergeEquipmentOcr([text]);
    if (side === "current") setCurrentGearStats(values);
    else setReplacementGearStats(values);
    setNotice(
      Object.keys(values).length
        ? `${Object.keys(values).length} atributo(s) do equipamento aplicados à comparação.`
        : "Nenhum atributo de equipamento foi reconhecido no texto revisado."
    );
  }

  function reset() {
    if (!window.confirm("Zerar todos os valores e remover as imagens carregadas?")) return;
    [...characterImages, ...currentGearImages, ...replacementGearImages]
      .forEach(image => URL.revokeObjectURL(image.url));
    setCharacter("");
    setCls("Wizard");
    setStats({ ...zeroStats });
    setCharacterImages([]);
    setCurrentGearImages([]);
    setReplacementGearImages([]);
    setCharacterOcr("");
    setCurrentGearOcr("");
    setReplacementGearOcr("");
    setCurrentGearStats({});
    setReplacementGearStats({});
    setTab("Comuns");
    setFilter("");
    setNotice("Todos os valores foram zerados.");
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
        <button className="button secondary" onClick={reset}>
          <RotateCcw size={15} /> Zerar calculadora
        </button>
      </header>

      <main>
        <section className="panel hero">
          <div className="profile-fields profile-fields-hero">
            <label>Nome do personagem
              <input value={character} onChange={event => setCharacter(event.target.value)} placeholder="Preenchido após identificar o personagem" />
            </label>
            <label>Classe
              <select value={cls} onChange={event => setCls(event.target.value as ClassName)}>
                {Object.keys(classes).map(name => <option key={name}>{name}</option>)}
              </select>
            </label>
          </div>
          <div className="hp-summary">
            <div><small>PV MÁX. ATUAL (LIDO)</small><b>{currentHpObserved > 0 ? formatNumber(hpCurrent) : "0"}</b></div>
            <span className="arrow">→</span>
            <div><small>PV MÁX. PROJETADO</small><b>{canCalculateHp ? formatNumber(hpProjected) : "0"}</b></div>
            <strong className={hpProjected - hpCurrent >= 0 ? "positive" : "negative"}>
              {canCalculateHp ? `${hpProjected - hpCurrent >= 0 ? "+" : ""}${formatNumber(hpProjected - hpCurrent)} PV` : "Aguardando leitura"}
            </strong>
          </div>
          <p className="hint">
            Comece carregando os prints dos atributos do personagem. Os campos iniciam zerados e são preenchidos conforme os dados reconhecidos no OCR.
          </p>
          {!canCalculateHp && (
            <div className="calculation-warning">
              <AlertTriangle size={15} />
              O cálculo de PV Máx. será habilitado após reconhecer PV, VIT e PV Máx. % no perfil do personagem.
            </div>
          )}
        </section>

        <section className="panel">
          <div className="section-head">
            <div><span className="step">01</span><h2>Dados do personagem</h2></div>
            <p>É possível selecionar vários prints de uma só vez. Os atributos reconhecidos serão preenchidos automaticamente.</p>
          </div>
          <MultiImageUpload
            title="Prints dos atributos do personagem"
            description="Selecione uma ou várias imagens de status. Novas imagens podem ser adicionadas depois."
            images={characterImages}
            onChange={images => { void onCharacterImagesChange(images); }}
          />
          {busy === "character" && <div className="ocr-progress"><ScanText size={15} /> Lendo imagens do personagem…</div>}
          <div className="ocr-box">
            <div className="ocr-box-head"><b>Texto reconhecido (editável)</b><button className="button secondary small-button" onClick={applyCharacterOcr}>Aplicar texto revisado</button></div>
            <textarea value={characterOcr} onChange={event => setCharacterOcr(event.target.value)}
              placeholder="O texto reconhecido nas imagens aparecerá aqui. Você pode corrigir a transcrição e aplicar novamente." />
            <small>O OCR tenta identificar nomes e valores conhecidos. Revise a leitura, pois números ou abreviações podem ser confundidos no print.</small>
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <div><span className="step">02</span><h2>Equipamentos para comparação</h2></div>
            <p>Carregue várias imagens de cada conjunto. Os atributos identificados serão somados e comparados automaticamente.</p>
          </div>
          <div className="equipment-grid">
            <div>
              <MultiImageUpload
                title="Equipamentos atuais"
                description="Imagens dos itens atualmente equipados."
                images={currentGearImages}
                onChange={images => { void onEquipmentImagesChange(images, "current"); }}
              />
              {busy === "current" && <div className="ocr-progress"><ScanText size={15} /> Lendo equipamentos atuais…</div>}
              <details className="ocr-details">
                <summary>Conferir / corrigir texto OCR dos itens atuais</summary>
                <textarea value={currentGearOcr} onChange={event => setCurrentGearOcr(event.target.value)}
                  placeholder="Texto reconhecido nos itens atuais…" />
                <button className="button secondary small-button" onClick={() => applyEquipmentOcr("current")}>Aplicar texto revisado</button>
              </details>
            </div>
            <div>
              <MultiImageUpload
                title="Equipamentos substitutos"
                description="Imagens dos itens que deseja testar."
                images={replacementGearImages}
                onChange={images => { void onEquipmentImagesChange(images, "replacement"); }}
              />
              {busy === "replacement" && <div className="ocr-progress"><ScanText size={15} /> Lendo equipamentos substitutos…</div>}
              <details className="ocr-details">
                <summary>Conferir / corrigir texto OCR dos itens substitutos</summary>
                <textarea value={replacementGearOcr} onChange={event => setReplacementGearOcr(event.target.value)}
                  placeholder="Texto reconhecido nos itens substitutos…" />
                <button className="button secondary small-button" onClick={() => applyEquipmentOcr("replacement")}>Aplicar texto revisado</button>
              </details>
            </div>
          </div>
          <p className="hint">
            Não existem mais campos fixos para VIT, INT, ATQM ou PV. Cada imagem pode trazer atributos diferentes; os valores reconhecidos entram na comparação por atributo.
          </p>
        </section>

        <section className="panel">
          <div className="section-head">
            <div><span className="step">03</span><h2>Calculadora completa de atributos</h2></div>
            <p>A comparação atual × projetado aparece diretamente em cada atributo, considerando os bônus identificados nos dois conjuntos de equipamentos.</p>
          </div>
          <div className="tabs">
            {(["Comuns", "Avançados", "Especial"] as StatGroup[]).map(group => (
              <button className={tab === group ? "active" : ""} key={group} onClick={() => { setTab(group); setFilter(""); }}>
                {group === "Comuns" ? "Atributos Comuns" : group === "Avançados" ? "Atributos Avançados" : "Especial"}
              </button>
            ))}
          </div>
          <div className="search">
            <Search size={15} />
            <input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Buscar atributo…" />
          </div>
          <div className="attribute-table-scroll">
            <AttributeRows
              names={visibleStats}
              currentValues={stats}
              projectedValues={calculatorProjectedValues}
              onChange={updateStat}
            />
          </div>
          <div className="comparison-legend">
            <span><i className="legend-current" /> Atual: valor lido no personagem</span>
            <span><i className="legend-projected" /> Projetado: atual − equipamento atual + substituto</span>
          </div>
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
          <p className="hint"><ShieldCheck size={14} /> Os coeficientes aprovados foram mantidos. O cálculo depende da leitura correta de PV, VIT e PV Máx. % do personagem.</p>
        </section>

        {notice && (
          <div className="notice" role="status">
            <CheckCircle2 size={16} />
            {notice}
            <button aria-label="Fechar aviso" onClick={() => setNotice("")}>×</button>
          </div>
        )}
      </main>

      <footer><span>OBLIVION CALCULATOR · MVP 1.0</span></footer>
    </div>
  );
}
