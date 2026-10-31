import React, { useEffect, useMemo, useRef, useState } from "react";
import { createWorker, PSM } from "tesseract.js";
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
  "FOR", "AGI", "VIT", "INT", "DES", "SOR",
  "PV", "PM", "ATQF", "ATQM", "DEFF", "DEFM",
  "ATQF (Refino)", "ATQM (Refino)", "DEFF (Refino)", "DEFM (Refino)",
  "Recuperar PV", "Recuperar PM", "Precisão", "Esquiva"
];
const advanced = [
  "VATQ%", "VMOV%", "TC Variável", "TC Variável %", "TC Fixo", "TC Fixo %",
  "Efeito de Cura", "Cura Recebida", "CRIT", "RES CRIT", "Dano CRIT%",
  "Resistência a Dano CRIT %", "Bônus de Dano Físico", "Redução de Dano Físico",
  "Bônus de Dano Mágico", "Redução de Dano Mágico", "Ignorar DEFF", "Ignorar DEFM",
  "Ignorar DEFF %", "Ignorar DEFM %", "Bônus de Dano Fixo", "Dano Mágico Bônus",
  "Redução de Dano Fixo", "Bônus de Dano à Distância",
  "Redução de Dano à Distância", "Bônus de Dano Corpo a Corpo"
];
const special = [
  "PV Máx.%", "PM Máx.%", "ATQF Equipamento %", "ATQM Equipamento %",
  "DEFF Equipamento %", "DEFM Equipamento %", "TdR Global",
  "Dano x Inimigos Pequenos", "Redução de Dano x Inimigos Pequenos",
  "Dano x Inimigos Médios", "Redução de Dano x Inimigos Médios",
  "Dano x Inimigos Grandes", "Redução de Dano x Inimigos Grandes",
  "Dano Bruto",
  "Dano x Humanoide", "Redução de Dano x Humanoide",
  "Dano x Demônio", "Redução de Dano x Demônio",
  "Dano x Planta", "Redução de Dano x Planta",
  "Dano x Morto-Vivo", "Redução de Dano x Morto-Vivo",
  "Dano x Peixe", "Redução de Dano x Peixe",
  "Dano x Dragão", "Redução de Dano x Dragão",
  "Dano de Habilidade Vento", "Resistência de Dano de Vento",
  "Dano de Habilidade Terra", "Redução de Dano de Habilidade de Terra",
  "Dano de Habilidade Fogo", "Resistência de Dano de Fogo",
  "Dano de Habilidade Água", "Redução de Dano de Água",
  "Resistência de Dano Neutro",
  "Dano de Habilidade Fantasma", "Resistência de Dano Fantasma",
  "Redução de Dano de Veneno",
  "Dano x Inimigo de Vento", "Dano x Inimigo de Fogo",
  "Dano x Inimigo de Água", "Dano x Inimigo Sagrado",
  "Redução de Dano x Chefe"
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

type OcrRule = { key: string; aliases: string[]; percent?: boolean };

const ocrAliases: Record<string, string[]> = {
  "FOR": ["FOR", "STR", "FORCA"],
  "AGI": ["AGI", "AGILIDADE"],
  "VIT": ["VIT", "VITALIDADE"],
  "INT": ["INT", "INTELIGENCIA"],
  "DES": ["DES", "DEX", "DESTREZA"],
  "SOR": ["SOR", "LUK", "SORTE"],
  "PV": ["PV", "HP", "VIDA", "HP MAX"],
  "PM": ["PM", "SP", "MANA", "SP MAX"],
  "ATQF": ["ATQF", "ATGF", "ATQ F", "ATK F", "P ATK"],
  "ATQM": ["ATQM", "ATQ M", "MATK", "M ATK"],
  "DEFF": ["DEFF", "DEF F", "PDEF", "P DEF"],
  "DEFM": ["DEFM", "DEF M", "MDEF", "M DEF"],
  "ATQF (Refino)": ["ATQF REF", "ATGF REF", "ATQF REFINO", "ATGF REFINO", "ATQF REFIN"],
  "ATQM (Refino)": ["ATQM REF", "ATQM REFINO", "ATQM REFINA"],
  "DEFF (Refino)": ["DEFF REF", "DEFF REFINO"],
  "DEFM (Refino)": ["DEFM REF", "DEFM REFINO"],
  "Precisão": ["PRECISAO", "PRECISÃO", "PRECISION"],
  "Esquiva": ["ESQUIVA", "FLEE", "EVASION"],
  "VATQ%": ["VATQ%", "VATQ"],
  "VMOV%": ["VMOV%", "VMOV"],
  "PV Máx.%": ["PV MAX %", "PV MAX%", "PV MAXIMO %", "MAX HP %"],
  "PM Máx.%": ["PM MAX %", "PM MAX%", "PM MAXIMO %", "MAX SP %"],
  "ATQF Equipamento %": ["ATQF DE EQUIPAMENTO%", "ATGF DE EQUIPAMENTO%", "ATQF EQUIPAMENTO %"],
  "ATQM Equipamento %": ["ATQM DE EQUIPAMENTO%", "ATQM EQUIPAMENTO %"],
  "DEFF Equipamento %": ["DEFF DE EQUIPAMENTO%", "DEFF EQUIPAMENTO %"],
  "DEFM Equipamento %": ["DEFM DE EQUIPAMENTO%", "DEFM EQUIPAMENTO %"],
  "TdR Global": ["TDR GLOBAL%", "TDR GLOBAL"],
  "TC Variável": ["TC VARIAVEL", "CONJURACAO VARIAVEL"],
  "TC Variável %": ["TC VARIAVEL %", "TC VARIAVEL%", "CONJURACAO VARIAVEL %"],
  "TC Fixo": ["TC FIXO", "CONJURACAO FIXA"],
  "TC Fixo %": ["TC FIXO %", "TC FIXO%", "CONJURACAO FIXA %"],
  "Efeito de Cura": ["EFEITO DE CURA"],
  "Cura Recebida": ["CURA RECEBIDA", "URA RECEBIDA"],
  "CRIT": ["CRIT", "CRITICO"],
  "RES CRIT": ["RES CRIT", "RES CRIT."],
  "Dano CRIT%": ["DANO CRIT%", "DANO CRIT %"],
  "Resistência a Dano CRIT %": ["RESISTENCIA A DANO CRIT", "RESISTENCIA DANO CRIT", "5 A DANO CRIT"],
  "Bônus de Dano Físico": ["BONUS DE DANO FISICO", "NUS DE DANO F", "DANO FISICO"],
  "Redução de Dano Físico": ["REDUCAO DE DANO FISICO", "EDUCAO DE DAR"],
  "Bônus de Dano Mágico": ["BONUS DE DANO MAGICO", "NUS DANO M", "NUS DANO M%"],
  "Redução de Dano Mágico": ["REDUCAO DE DANO MAGICO", "REDUCAO DE D"],
  "Ignorar DEFF": ["IGNORAR DEFF", "IGNORAR DEF F"],
  "Ignorar DEFM": ["IGNORAR DEFM", "IGNORAR DEF M"],
  "Ignorar DEFF %": ["IGNORAR DEFF %", "IGNORAR DEFF%"],
  "Ignorar DEFM %": ["IGNORAR DEFM %", "IGNORAR DEFM%"],
  "Bônus de Dano Fixo": ["BONUS DE DANO FIXO", "NUS DE DANO"],
  "Dano Mágico Bônus": ["DANO MAGICO BONUS", "DANO M BONUS"],
  "Redução de Dano Fixo": ["REDUCAO DE DANO FIXO", "ADUCAO DE DAR"],
  "Bônus de Dano à Distância": ["BONUS DE DANO A DISTANCIA", "IUS DE DANO JX"],
  "Redução de Dano à Distância": ["REDUCAO DE DANO A DISTANCIA", "CAO DE DANO J"],
  "Bônus de Dano Corpo a Corpo": ["BONUS DE DANO CORPO A CORPO", "3 ONUS DE DANC"],
  "Dano x Inimigos Pequenos": ["DANO X INIMIGOS PEQUENOS", "DANO X INIMIGO PEQUENO"],
  "Redução de Dano x Inimigos Pequenos": ["REDUCAO DE DANO X INIMIGOS PEQUENOS"],
  "Dano x Inimigos Médios": ["DANO X INIMIGOS MEDIOS", "DANO X INIMIGO MEDIO"],
  "Redução de Dano x Inimigos Médios": ["REDUCAO DE DANO X INIMIGOS MEDIOS"],
  "Dano x Inimigos Grandes": ["DANO X INIMIGOS GRANDES", "DANO X INIMIGO GRANDE"],
  "Redução de Dano x Inimigos Grandes": ["REDUCAO DE DANO X INIMIGOS GRANDES"],
  "Dano Bruto": ["DANO BRUTO", "DANO X BRUTO"],
  "Dano x Humanoide": ["DANO X HUMANOIDE"],
  "Redução de Dano x Humanoide": ["REDUCAO DE DANO X HUMANOIDE", "REDUCAO DE DANO X HUMANIDADE"],
  "Dano x Demônio": ["DANO X DEMONIO"],
  "Redução de Dano x Demônio": ["REDUCAO DE DANO X DEMONIO"],
  "Dano x Planta": ["DANO X PLANTA"],
  "Redução de Dano x Planta": ["REDUCAO DE DANO X PLANTA"],
  "Dano x Morto-Vivo": ["DANO X MORTO VIVO"],
  "Redução de Dano x Morto-Vivo": ["REDUCAO DE DANO X MORTO VIVO"],
  "Dano x Peixe": ["DANO X PEIXE"],
  "Redução de Dano x Peixe": ["REDUCAO DE DANO X PEIXE"],
  "Dano x Dragão": ["DANO X DRAGAO"],
  "Redução de Dano x Dragão": ["REDUCAO DE DANO X DRAGAO"],
  "Dano de Habilidade Vento": ["DANO DE HABILIDADE VENTO", "DANO HABILIDADE VENTO"],
  "Resistência de Dano de Vento": ["RESISTENCIA DE DANO DE VENTO", "RESISTENCIA DANO VENTO"],
  "Dano de Habilidade Terra": ["DANO DE HABILIDADE TERRA", "DANO HABILIDADE TERRA", "DANO DE HABILIDADE DE TM"],
  "Redução de Dano de Habilidade de Terra": ["REDUCAO DE DANO DE HABILIDADE DE TERRA", "REDUCAO DANO HABILIDADE TERRA"],
  "Dano de Habilidade Fogo": ["DANO DE HABILIDADE FOGO", "DANO HABILIDADE FOGO"],
  "Resistência de Dano de Fogo": ["RESISTENCIA DE DANO DE FOGO", "RESISTENCIA DANO FOGO"],
  "Dano de Habilidade Água": ["DANO DE HABILIDADE AGUA", "DANO HABILIDADE AGUA"],
  "Redução de Dano de Água": ["REDUCAO DE DANO DE AGUA"],
  "Resistência de Dano Neutro": ["RESISTENCIA DE DANO NEUTRO", "RESISTENCIA NEUTRO"],
  "Dano de Habilidade Fantasma": ["DANO DE HABILIDADE FANTASMA", "DANO HABILIDADE FANTASMA"],
  "Resistência de Dano Fantasma": ["RESISTENCIA DE DANO FANTASMA"],
  "Redução de Dano de Veneno": ["REDUCAO DE DANO DE VENENO", "REDUCAO VENENO"],
  "Dano x Inimigo de Vento": ["DANO X INIMIGO DE VENTO", "DANO X INIMIGO VENTO"],
  "Dano x Inimigo de Fogo": ["DANO X INIMIGO DE FOGO", "DANO X INIMIGO FOGO"],
  "Dano x Inimigo de Água": ["DANO X INIMIGO DE AGUA", "DANO X INIMIGO AGUA"],
  "Dano x Inimigo Sagrado": ["DANO X INIMIGO SAGRADO"],
  "Redução de Dano x Chefe": ["REDUCAO DE DANO X CHEFE", "REDUCAO X CHEFE"]
};

const ocrRules: OcrRule[] = allStats.map(key => ({
  key,
  aliases: [...new Set([key, ...(ocrAliases[key] ?? [])])],
  percent: key.includes("%")
})).sort((a, b) =>
  Math.max(...b.aliases.map(alias => normalizeText(alias).length))
  - Math.max(...a.aliases.map(alias => normalizeText(alias).length))
);

type LabelMatch = { rule: OcrRule; start: number; end: number; aliasLength: number };

function normalizeWithMap(value: string): { normalized: string; positions: number[] } {
  let normalized = "";
  const positions: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const folded = value[index].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    for (const character of folded) {
      if (/[a-z0-9]/.test(character)) {
        normalized += character;
        positions.push(index);
      }
    }
  }
  return { normalized, positions };
}

function findLabelMatches(line: string): LabelMatch[] {
  const { normalized, positions } = normalizeWithMap(line);
  const candidates: LabelMatch[] = [];

  for (const rule of ocrRules) {
    for (const alias of rule.aliases) {
      const foldedAlias = normalizeText(alias);
      if (foldedAlias.length < 2) continue;
      let searchFrom = 0;
      while (searchFrom < normalized.length) {
        const foundAt = normalized.indexOf(foldedAlias, searchFrom);
        if (foundAt < 0) break;
        const rawStart = positions[foundAt];
        const rawEnd = positions[foundAt + foldedAlias.length - 1] + 1;
        if (rawStart !== undefined && rawEnd > rawStart) {
          candidates.push({
            rule,
            start: rawStart,
            end: rawEnd,
            aliasLength: foldedAlias.length
          });
        }
        searchFrom = foundAt + 1;
      }
    }
  }

  candidates.sort((a, b) => a.start - b.start || b.aliasLength - a.aliasLength);
  const selected: LabelMatch[] = [];
  for (const candidate of candidates) {
    const immediateTail = line.slice(candidate.end);
    const hasLabelPercent = /^\s*%/.test(immediateTail);
    if (candidate.rule.percent && !hasLabelPercent && !/porcento/i.test(immediateTail.slice(0, 10))) {
      continue;
    }
    if (!candidate.rule.percent && hasLabelPercent) continue;

    const overlaps = selected.some(item =>
      candidate.start < item.end && candidate.end > item.start
    );
    if (overlaps) continue;
    selected.push(candidate);
  }
  return selected.sort((a, b) => a.start - b.start);
}

function numbersInText(value: string, percentage = false): number[] {
  const normalizedValue = value.replace(/\b[oO]\b/g, "0");
  const matches = normalizedValue.match(/[-+]?\d[\d.,]*/g) ?? [];
  return matches.map(item => parseNumber(item, percentage)).filter(Number.isFinite);
}

function valuesFromOcr(text: string, sumDuplicates: boolean): StatValues {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const output: StatValues = {};

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const labels = findLabelMatches(line);
    if (!labels.length) continue;

    const numericByLabel: number[][] = labels.map((label, labelIndex) => {
      const nextLabel = labels[labelIndex + 1];
      const segment = line.slice(label.end, nextLabel?.start ?? line.length);
      return numbersInText(segment, label.rule.percent);
    });

    labels.forEach((label, labelIndex) => {
      let numbers = numericByLabel[labelIndex];
      if (!numbers.length) {
        const following: number[] = [];
        for (let nextIndex = lineIndex + 1; nextIndex < Math.min(lineIndex + 5, lines.length); nextIndex += 1) {
          if (findLabelMatches(lines[nextIndex]).length) break;
          const rowNumbers = numbersInText(lines[nextIndex], label.rule.percent);
          if (rowNumbers.length) following.push(...rowNumbers);
          if (following.length >= 3) break;
        }
        numbers = following;
      }
      if (!numbers.length) return;

      let parsed = numbers[0];
      if (["FOR", "AGI", "VIT", "INT", "DES", "SOR"].includes(label.rule.key) && numbers.length >= 2) {
        parsed = numbers[0] + numbers[1];
      }
      if (sumDuplicates) output[label.rule.key] = (output[label.rule.key] ?? 0) + parsed;
      else output[label.rule.key] = parsed;
    });
  }

  return output;
}

function extractCharacterMeta(text: string): { character?: string; className?: ClassName } {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const classIndex = lines.findIndex(line => /classe/i.test(line));
  let className: ClassName | undefined;
  if (classIndex >= 0) {
    const nearby = normalizeText(lines.slice(classIndex, classIndex + 2).join(" "));
    if (nearby.includes("arquimago") || nearby.includes("highwizard") || nearby.includes("wizard")) className = "Wizard";
    else if (nearby.includes("paladino") || nearby.includes("paladin")) className = "Paladino";
    else if (nearby.includes("cigana") || nearby.includes("musa")) className = "Cigana";
    else if (nearby.includes("priest") || nearby.includes("arcebispo") || nearby.includes("sacerdote")) className = "Priest";
    else if (nearby.includes("sniper") || nearby.includes("sentinela") || nearby.includes("atirador")) className = "Sniper";
  }

  let character: string | undefined;
  if (classIndex >= 0) {
    const ignored = /personagem|classe|build|detalhes|atributos|equipamento|automatica|nenhum|pactuado|id\d*|pv|pm/i;
    for (let index = classIndex - 1; index >= Math.max(0, classIndex - 7); index -= 1) {
      const candidate = lines[index].replace(/[|:()[\]{}]/g, " ").replace(/\s+/g, " ").trim();
      if (!candidate || ignored.test(candidate) || !/[A-Za-zÀ-ÿ]{3}/.test(candidate)) continue;
      const words = candidate.split(" ").filter(Boolean);
      if (words.length <= 2 && candidate.length <= 24) {
        character = candidate.replace(/^[^A-Za-zÀ-ÿ]+|[^A-Za-zÀ-ÿ]+$/g, "");
        break;
      }
    }
  }
  return { character, className };
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
