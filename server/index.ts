import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.resolve(__dirname, "../dist");
const app = express();
app.use(express.json({ limit: "10mb" }));
app.use("/assets", express.static(path.join(distDirectory, "assets"), {
  immutable: true,
  maxAge: "1y",
}));
app.use(express.static(distDirectory));

app.get("/health", (_req, res) => {
  res.json({ ok: true, app: "OBLIVION CALCULATOR", version: "1.0.0" });
});

const classes = {
  Wizard: { k: 71.5, b: 30630 },
  Paladino: { k: 87.624, b: 68023.411 },
  Cigana: { k: 69.29610630, b: 50810.276680 },
  Priest: { k: 57.39405082, b: 55528.449536 },
  Sniper: { k: 71.54410178995039, b: 36897.07785205952 },
} as const;

type HpInput = {
  className: keyof typeof classes;
  vit: number;
  baseHp: number;
  pvMaxPercent: number;
  currentFixedPv?: number;
  currentVit?: number;
  currentPvPercent?: number;
  newFixedPv?: number;
  newVit?: number;
  newPvPercent?: number;
};

function calculateHp(input: HpInput) {
  const classData = classes[input.className];
  const fixedNow = input.currentFixedPv ?? 0;
  const vitNow = input.currentVit ?? 0;
  const pctNow = input.currentPvPercent ?? 0;
  const fixedNext = input.newFixedPv ?? fixedNow;
  const vitNext = input.newVit ?? vitNow;
  const pctNext = input.newPvPercent ?? pctNow;

  const personalizedB =
    input.baseHp / (1 + (input.pvMaxPercent + pctNow) / 100) -
    classData.k * (input.vit + vitNow) -
    fixedNow;

  const currentHp =
    (personalizedB + fixedNow + classData.k * (input.vit + vitNow)) *
    (1 + (input.pvMaxPercent + pctNow) / 100);
  const projectedHp =
    (personalizedB + fixedNext + classData.k * (input.vit + vitNext)) *
    (1 + (input.pvMaxPercent + pctNext) / 100);

  return {
    className: input.className,
    coefficientK: classData.k,
    personalizedB,
    currentHp: Math.round(currentHp),
    projectedHp: Math.round(projectedHp),
    difference: Math.round(projectedHp - currentHp),
  };
}

function makeMcpServer() {
  const server = new McpServer({ name: "oblivion-calculator", version: "1.0.0" });
  const widgetUri = "ui://widget/oblivion-calculator.html";

  server.registerResource(
    "oblivion-calculator-widget",
    widgetUri,
    {
      title: "OBLIVION CALCULATOR",
      description: "Interface interativa de cálculo e comparação de equipamentos para Ragnarok Origin Classic.",
      mimeType: "text/html;profile=mcp-app",
    },
    async () => {
      const html = await readFile(path.join(distDirectory, "index.html"), "utf8");
      const publicOrigin = (process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL)?.replace(/\/$/, "");
      const externalResources = [
        "https://cdn.jsdelivr.net",
        "https://tessdata.projectnaptha.com",
        "https://fonts.googleapis.com",
        "https://fonts.gstatic.com",
      ];
      const resourceMeta = {
        ui: {
          ...(publicOrigin ? { domain: publicOrigin } : {}),
          csp: {
            connectDomains: [...(publicOrigin ? [publicOrigin] : []), ...externalResources],
            resourceDomains: [...(publicOrigin ? [publicOrigin] : []), ...externalResources],
          },
          prefersBorder: true,
        },
        "openai/widgetDescription":
          "Calculadora interativa OBLIVION para atributos, HP e comparação de equipamentos.",
        "openai/widgetPrefersBorder": true,
      };
      return {
        contents: [{
          uri: widgetUri,
          mimeType: "text/html;profile=mcp-app",
          text: html,
          _meta: resourceMeta,
        }],
      };
    },
  );

  server.registerTool(
    "oblivion_open_calculator",
    {
      title: "Abrir OBLIVION CALCULATOR",
      description:
        "Abre a interface interativa OBLIVION CALCULATOR para Ragnarok Origin Classic. Use quando a pessoa quiser calcular HP, comparar equipamentos, consultar atributos ou calibrar classes.",
      inputSchema: {
        request: z.string().optional().describe("O que deseja fazer na calculadora"),
      },
      _meta: {
        ui: {
          resourceUri: widgetUri,
          visibility: ["model", "app"],
        },
        "openai/outputTemplate": widgetUri,
        "openai/toolInvocation/invoking": "Abrindo OBLIVION CALCULATOR…",
        "openai/toolInvocation/invoked": "OBLIVION CALCULATOR aberto.",
      },
    },
    async ({ request }) => ({
      content: [{
        type: "text",
        text: `OBLIVION CALCULATOR pronto. ${request ?? "A interface está disponível para uso."}`,
      }],
      structuredContent: {
        app: "OBLIVION CALCULATOR",
        request: request ?? "",
        classes: Object.keys(classes),
      },
      _meta: {
        ui: { resourceUri: widgetUri, visibility: ["model", "app"] },
        "openai/outputTemplate": widgetUri,
      },
    }),
  );

  server.registerTool(
    "oblivion_calculate_hp",
    {
      title: "Calcular HP",
      description:
        "Calcula HP atual e projetado usando coeficientes aprovados de classe e bônus de equipamento.",
      inputSchema: {
        className: z.enum(["Wizard", "Paladino", "Cigana", "Priest", "Sniper"]),
        vit: z.number().nonnegative(),
        baseHp: z.number().positive().describe("HP atual observado no jogo"),
        pvMaxPercent: z.number(),
        currentFixedPv: z.number().optional(),
        currentVit: z.number().optional(),
        currentPvPercent: z.number().optional(),
        newFixedPv: z.number().optional(),
        newVit: z.number().optional(),
        newPvPercent: z.number().optional(),
      },
    },
    async (args) => {
      const result = calculateHp(args);
      const signedDifference = result.difference >= 0 ? "+" : "";
      return {
        content: [{
          type: "text",
          text:
            `HP atual: ${result.currentHp.toLocaleString("pt-BR")}. ` +
            `HP projetado: ${result.projectedHp.toLocaleString("pt-BR")}. ` +
            `Diferença: ${signedDifference}${result.difference.toLocaleString("pt-BR")} HP.`,
        }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "oblivion_list_classes",
    {
      title: "Consultar classes calibradas",
      description: "Lista coeficientes K e B das classes oficialmente calibradas.",
      inputSchema: {},
    },
    async () => ({
      content: [{
        type: "text",
        text: Object.entries(classes)
          .map(([name, value]) => `${name}: K=${value.k}; B=${value.b}`)
          .join("\n"),
      }],
      structuredContent: { classes },
    }),
  );

  return server;
}

app.post("/mcp", async (req, res) => {
  const server = makeMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Falha ao processar a solicitação MCP." });
    }
  }
});

const port = Number(process.env.PORT || 3001);
app.listen(port, "0.0.0.0", () => {
  console.log(`OBLIVION CALCULATOR MCP listening on ${port}`);
});
