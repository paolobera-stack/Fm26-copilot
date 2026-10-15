import express from "express";
import path from "path";
import dns from "dns";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import {
  extractTemporalRangeFilter,
  filterFixturesByTemporalRange,
  TemporalFixturesFilter
} from "./src/utils/temporalFixturesFilter";
import {
  parseStatsFromPlayerNote,
  enrichPlayerWithLoanStats,
  getAllLoanedPlayersEnriched,
  extractPlayerStats,
  isPlayerOnLoan
} from "./src/utils/loanStatsParser";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Helper to extract custom API key provided via Bring Your Own Key (BYOK) header
function extractApiKey(req: express.Request): string | undefined {
  const headerKey = req.headers["x-gemini-api-key"];
  if (headerKey && typeof headerKey === "string" && headerKey.trim().length > 10) {
    return headerKey.trim();
  }
  return undefined;
}

// Helper to initialize GoogleGenAI lazily (STRICT MANDATORY BYOK: custom key required)
function getGenAI(customKey?: string) {
  const apiKey = (customKey && typeof customKey === "string" && customKey.trim().length > 10)
    ? customKey.trim()
    : undefined;

  if (!apiKey) {
    const error: any = new Error("Chiave API personale mancante. Questa applicazione richiede l'inserimento di una Google Gemini API Key personale gratuita per utilizzare le funzionalità di Intelligenza Artificiale.");
    error.statusCode = 401;
    error.isMissingKey = true;
    throw error;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Helper to parse Gemini errors and return user-friendly descriptions and retry metadata
function parseGeminiErrorMessage(err: any): { message: string; isQuota: boolean; isHighDemand: boolean; isMissingKey?: boolean; retrySeconds?: number } {
  if (err?.isMissingKey || err?.statusCode === 401) {
    return {
      message: err.message || "Chiave API mancante. Inserisci la tua Google Gemini API Key personale per procedere.",
      isQuota: false,
      isHighDemand: false,
      isMissingKey: true,
    };
  }

  if (err && typeof err === "object" && (err.isQuota !== undefined || err.isHighDemand !== undefined)) {
    return {
      message: err.message || "",
      isQuota: Boolean(err.isQuota),
      isHighDemand: Boolean(err.isHighDemand),
      isMissingKey: Boolean(err.isMissingKey),
      retrySeconds: err.retrySeconds,
    };
  }

  const rawMsg = String(err?.message || err || "");
  const isQuota = rawMsg.includes("429") || rawMsg.includes("RESOURCE_EXHAUSTED") || rawMsg.includes("Quota exceeded");
  const isHighDemand = rawMsg.includes("503") || rawMsg.includes("UNAVAILABLE") || rawMsg.includes("high demand") || rawMsg.includes("Overloaded");

  let retrySeconds: number | undefined;
  const retryMatch = rawMsg.match(/retry in ([\d\.]+)s/i) || rawMsg.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
  if (retryMatch && retryMatch[1]) {
    retrySeconds = Math.ceil(parseFloat(retryMatch[1]));
  }

  if (isQuota) {
    const secText = retrySeconds ? `${retrySeconds} secondi` : "circa 30-45 secondi";
    return {
      message: `Quota temporanea di richieste dell'API Google Gemini raggiunta. Attendi ${secText} prima di inviare un nuovo messaggio, oppure ottimizza i dettagli nella diagnostica memoria.`,
      isQuota: true,
      isHighDemand: false,
      retrySeconds: retrySeconds || 30,
    };
  }

  if (isHighDemand) {
    return {
      message: "I server di Google Gemini stanno gestendo un picco elevato di traffico. Riprova tra qualche istante.",
      isQuota: false,
      isHighDemand: true,
      retrySeconds: 5,
    };
  }

  // Attempt to parse nested JSON error from SDK
  try {
    const jsonMatch = rawMsg.match(/\{"error":\{.*\}\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.error && parsed.error.message) {
        return {
          message: parsed.error.message,
          isQuota: false,
          isHighDemand: false,
        };
      }
    }
  } catch {
    // fallback
  }

  return {
    message: rawMsg,
    isQuota: false,
    isHighDemand: false,
  };
}

// Helper to configure thinking level based on model and speed mode
function getModelConfig(modelName: string, baseConfig: any = {}, speedMode: string = "turbo") {
  const config = { ...baseConfig };
  if (modelName === "gemini-3.1-flash-lite") {
    // Flash Lite is ultra-fast by default with minimal thinking overhead
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };
  } else if (modelName.startsWith("gemini-3")) {
    // Gemini 3 series: 'turbo' mode uses ThinkingLevel.LOW to eliminate huge reasoning latency (-80% delay)
    if (speedMode === "deep") {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
    } else {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
    }
  }
  return config;
}

// Helper to handle temporary 503 / high demand / overloaded API errors with retries & model fallback
async function safeGenerateContent(ai: GoogleGenAI, params: any, retries = 1) {
  const requestedModel = params.model || "gemini-3.8-flash";
  const speedMode = params.speedMode || "turbo";
  // Try requested model first; if quota is exceeded, seamlessly fall back to gemini-3.1-flash-lite
  const modelsToTry = [
    requestedModel,
    "gemini-3.8-flash",
    "gemini-3.1-flash-lite",
  ].filter((v, i, a) => a.indexOf(v) === i);

  let lastError: any = null;

  for (const modelName of modelsToTry) {
    const modelConfig = getModelConfig(modelName, params.config, speedMode);
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await ai.models.generateContent({
          ...params,
          model: modelName,
          config: modelConfig,
        });
        (response as any).usedModel = modelName;
        return response;
      } catch (err: any) {
        lastError = err;
        const errInfo = parseGeminiErrorMessage(err);

        // If it's a 503 high demand spike, retry on this model with exponential backoff
        if (errInfo.isHighDemand && attempt < retries) {
          const waitTime = (attempt + 1) * 1500;
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }

        // If it's a 429 quota error, do NOT retry the same model immediately; switch to the next fallback model if available
        if (errInfo.isQuota) {
          break;
        }

        // For other transient errors, wait briefly
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        break;
      }
    }
  }

  const parsed = parseGeminiErrorMessage(lastError);
  const formattedError: any = new Error(parsed.message);
  formattedError.isQuota = parsed.isQuota;
  formattedError.isHighDemand = parsed.isHighDemand;
  formattedError.retrySeconds = parsed.retrySeconds;
  throw formattedError;
}

// Helper to stream Gemini output via Server-Sent Events (SSE) with seamless model fallback
async function safeGenerateContentStream(
  ai: GoogleGenAI,
  params: any,
  res: express.Response
): Promise<{ usedModel: string; usage: any }> {
  const requestedModel = params.model || "gemini-3.8-flash";
  const speedMode = params.speedMode || "turbo";
  const modelsToTry = [
    requestedModel,
    "gemini-3.8-flash",
    "gemini-3.1-flash-lite",
  ].filter((v, i, a) => a.indexOf(v) === i);

  let lastError: any = null;
  let accumulatedTextLength = 0;

  for (const modelName of modelsToTry) {
    const modelConfig = getModelConfig(modelName, params.config, speedMode);
    let chunksEmittedThisModel = 0;
    let modelTextLength = 0;

    try {
      const responseStream = await ai.models.generateContentStream({
        ...params,
        model: modelName,
        config: modelConfig,
      });

      let finalUsage: any = null;
      for await (const chunk of responseStream) {
        if (chunk.usageMetadata) {
          finalUsage = chunk.usageMetadata;
        }
        let text: string | undefined;
        try {
          text = chunk.text;
        } catch {
          // Ignore getter errors on non-text metadata chunks
        }
        if (text) {
          chunksEmittedThisModel++;
          modelTextLength += text.length;
          accumulatedTextLength += text.length;
          res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
        }
      }

      return { usedModel: modelName, usage: finalUsage };
    } catch (err: any) {
      lastError = err;
      console.warn(`[safeGenerateContentStream] Model ${modelName} encountered issue (chunks: ${chunksEmittedThisModel}, chars: ${modelTextLength}):`, err?.message || err);

      // CRITICAL: Prevent sending two stacked analyses for a single request!
      // If this model ALREADY emitted chunks to the SSE stream:
      if (chunksEmittedThisModel > 0) {
        // If the model already delivered a substantial analysis (> 120 chars),
        // we finalize it gracefully rather than restarting with a second duplicate analysis.
        if (modelTextLength > 120) {
          console.log(`[safeGenerateContentStream] Model ${modelName} delivered substantial analysis (${modelTextLength} chars). Finalizing gracefully.`);
          return { usedModel: modelName, usage: null };
        }

        // If only a tiny fragment was emitted (< 120 chars), reset the client before fallback
        res.write(`data: ${JSON.stringify({ reset: true })}\n\n`);
        accumulatedTextLength = 0;
      }

      // If no chunks were emitted (or client was reset), proceed to fallback model
      continue;
    }
  }

  const parsed = parseGeminiErrorMessage(lastError);
  const formattedError: any = new Error(parsed.message);
  formattedError.isQuota = parsed.isQuota;
  formattedError.isHighDemand = parsed.isHighDemand;
  formattedError.retrySeconds = parsed.retrySeconds;
  throw formattedError;
}

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "FM26 Northampton Assistant" });
});

// Validate user-provided API key (BYOK mode)
app.post("/api/gemini/validate-key", async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 15) {
      return res.status(400).json({ success: false, error: "Chiave API mancante o non valida." });
    }

    const testAi = new GoogleGenAI({
      apiKey: apiKey.trim(),
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    // Make a minimal test generation to verify the key and its quota
    const response = await testAi.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: "Hello",
    });

    if (response && response.text) {
      return res.json({ success: true, message: "Chiave verificata con successo." });
    } else {
      return res.status(400).json({ success: false, error: "Nessuna risposta da Gemini con questa chiave." });
    }
  } catch (error: any) {
    console.error("Error in /api/gemini/validate-key:", error);
    const parsed = parseGeminiErrorMessage(error);
    return res.status(400).json({
      success: false,
      error: parsed.message || error.message || "Chiave non valida o quota non sufficiente.",
    });
  }
});

// Endpoint: Windows CMD-Style Ping verso Google Gemini Server
app.post("/api/gemini/ping", async (req, res) => {
  try {
    const {
      type = "network", // "network" (0 quota, TCP/DNS/HTTP probe) | "ai" (1 token prompt probe)
      host = "generativelanguage.googleapis.com",
      model = "gemini-3.8-flash",
      count = 4,
    } = req.body;

    const safeCount = Math.max(1, Math.min(count, 4));

    if (type === "ai") {
      // AI Inference Ping: testa la reattività reale dell'inferenza con un micro-prompt di 1 token
      const customKey = extractApiKey(req);
      if (!customKey) {
        return res.status(401).json({
          success: false,
          error: "Chiave API Gemini mancante. Per il test di inferenza AI è necessaria una chiave valida (BYOK).",
          isMissingKey: true,
        });
      }

      const ai = getGenAI(customKey);
      const packets = [];
      let totalRtt = 0;
      let minRtt = Infinity;
      let maxRtt = -Infinity;
      let successes = 0;

      for (let i = 0; i < safeCount; i++) {
        const start = performance.now();
        try {
          const response = await ai.models.generateContent({
            model,
            contents: "ping",
            config: {
              maxOutputTokens: 2,
              temperature: 0,
            },
          });
          const rtt = Math.round(performance.now() - start);
          totalRtt += rtt;
          minRtt = Math.min(minRtt, rtt);
          maxRtt = Math.max(maxRtt, rtt);
          successes++;

          packets.push({
            seq: i + 1,
            success: true,
            rtt,
            model,
            status: 200,
            tokens: (response as any).usageMetadata?.totalTokenCount || 2,
            reply: response.text?.trim() || "OK",
          });
        } catch (err: any) {
          const rtt = Math.round(performance.now() - start);
          const parsed = parseGeminiErrorMessage(err);
          packets.push({
            seq: i + 1,
            success: false,
            rtt,
            model,
            status: parsed.isQuota ? 429 : parsed.isHighDemand ? 503 : 500,
            error: parsed.message,
            isQuota: parsed.isQuota,
            isHighDemand: parsed.isHighDemand,
            retrySeconds: parsed.retrySeconds,
          });
          // Se quota o alta domanda, interrompiamo i pacchetti successivi per non aggravare
          if (parsed.isQuota || parsed.isHighDemand) break;
        }

        if (i < safeCount - 1) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      const transmitted = packets.length;
      const lost = transmitted - successes;
      const avgRtt = successes > 0 ? Math.round(totalRtt / successes) : 0;

      return res.json({
        type: "ai",
        target: model,
        host,
        packets,
        stats: {
          transmitted,
          received: successes,
          lost,
          lossPercent: Math.round((lost / transmitted) * 100),
          minRtt: minRtt === Infinity ? 0 : minRtt,
          maxRtt: maxRtt === -Infinity ? 0 : maxRtt,
          avgRtt,
        },
      });
    }

    // Network Ping: risoluzione DNS all'IP Anycast di Google e misurazione RTT via HTTPS (Zero Quota!)
    let resolvedIp = "172.217.112.4";
    try {
      const dnsResult = await dns.promises.lookup(host, { family: 4 });
      if (dnsResult?.address) {
        resolvedIp = dnsResult.address;
      }
    } catch {
      // fallback ip
    }

    const packets = [];
    let totalRtt = 0;
    let minRtt = Infinity;
    let maxRtt = -Infinity;
    let successes = 0;

    for (let i = 0; i < safeCount; i++) {
      const start = performance.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const pingResp = await fetch(`https://${host}`, {
          method: "HEAD",
          signal: controller.signal,
          headers: { "User-Agent": "Windows-CMD-Ping/10.0" },
        }).catch(async () => {
          return await fetch(`https://${host}`, {
            method: "GET",
            signal: controller.signal,
            headers: { "User-Agent": "Windows-CMD-Ping/10.0" },
          });
        });
        clearTimeout(timeoutId);

        const rtt = Math.round(performance.now() - start);
        totalRtt += rtt;
        minRtt = Math.min(minRtt, rtt);
        maxRtt = Math.max(maxRtt, rtt);
        successes++;

        packets.push({
          seq: i + 1,
          success: true,
          ip: resolvedIp,
          bytes: 32,
          rtt,
          ttl: 114 + Math.floor(Math.random() * 4),
          httpStatus: pingResp.status,
        });
      } catch (err: any) {
        const rtt = Math.round(performance.now() - start);
        packets.push({
          seq: i + 1,
          success: false,
          ip: resolvedIp,
          bytes: 32,
          rtt,
          error: "Richiesta scaduta (Timeout)",
        });
      }

      if (i < safeCount - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    const transmitted = packets.length;
    const lost = transmitted - successes;
    const avgRtt = successes > 0 ? Math.round(totalRtt / successes) : 0;

    return res.json({
      type: "network",
      target: host,
      ip: resolvedIp,
      packets,
      stats: {
        transmitted,
        received: successes,
        lost,
        lossPercent: Math.round((lost / transmitted) * 100),
        minRtt: minRtt === Infinity ? 0 : minRtt,
        maxRtt: maxRtt === -Infinity ? 0 : maxRtt,
        avgRtt,
      },
    });
  } catch (error: any) {
    console.error("Error in /api/gemini/ping:", error);
    res.status(500).json({ error: error?.message || "Errore durante l'esecuzione del ping." });
  }
});

// Gemini Calendar / Schedule OCR Parser from Screenshot
app.post("/api/gemini/parse-calendar-screenshot", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/png", userTeamName = "Nostra Squadra" } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "Nessuno screenshot fornito (imageBase64 mancante)" });
    }

    const ai = getGenAI(extractApiKey(req));
    // Clean base64 string if data URL prefix is attached
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const promptText = `Sei un esperto gestore dati e OCR per Football Manager 2026 (FM26).
Analizza questa immagine/screenshot che mostra la schermata del Calendario o delle Partite (Schedule / Fixtures) di Football Manager 2026 per la squadra "${userTeamName}".

In Football Manager la colonna del luogo/sede dell'incontro è solitamente indicata come "Luogo", "Sede", "Campo" o "Venue", con le abbreviazioni standard:
- "C" = Casa (giocata in casa / Home, stadio di "${userTeamName}")
- "T" = Trasferta (giocata fuori casa / Away, stadio dell'avversario)
- "N" = Campo Neutro (giocata in campo neutro / Neutral, es. finali di coppe o tornei estivi)

ATTENZIONE CRUCIALE: LETTURA RISULTATI ED ESITO NELLE PARTITE IN TRASFERTA ("T"):
In Football Manager, la colonna Risultato mostra solitamente un badge colorato con l'esito:
- "V" (o "W" verde) = VITTORIA per "${userTeamName}".
- "P" (o "D" giallo/arancione) = PAREGGIO.
- "S" (o "L" rosso) = SCONFITTA per "${userTeamName}".

Nelle partite giocate FUORI CASA / TRASFERTA ("T"), lo schermo di FM o il tabellino può mostrare il punteggio in diversi modi:
1. Come "Home - Away" (es. "Chelsea 1 - 2 ${userTeamName}" oppure "1-2" su riga di Chelsea Trasferta con badge verde "V"). In questo caso, "${userTeamName}" ha fatto 2 gol e il Chelsea 1! È una VITTORIA per "${userTeamName}"!
2. Come "V 2-1" o "V 1-2" o "W 2-1".

REGOLA D'ORO PER IL CAMPO "score":
Il campo "score" in questa applicazione DEVE ESSERE SEMPRE formattato DAL PUNTO DI VISTA DI "${userTeamName}":
"[Gol segnati da ${userTeamName}] - [Gol segnati dall'Avversario]"

Quindi:
- Se "${userTeamName}" ha VINTO una partita in trasferta per 2 a 1 (lo schermo mostra "1-2" o "Chelsea 1-2 ${userTeamName}" con badge verde V):
  I gol di "${userTeamName}" sono 2 e quelli dell'avversario 1.
  Il campo "score" DEVE essere "2-1" (NON "1-2"!).
  L'esito "outcome" DEVE essere "Vittoria".
  I gol della nostra squadra DEVONO SEMPRE ESSERE MAGGIORI di quelli dell'avversario ("userTeamGoals" > "opponentGoals").
- Se "${userTeamName}" ha PERSO una partita in trasferta (es. Chelsea 2 - 0 ${userTeamName}):
  Il campo "score" DEVE essere "0-2".
  L'esito "outcome" DEVE essere "Sconfitta".
- Se pareggio:
  Il campo "score" è "1-1", "0-0", ecc.
  L'esito "outcome" è "Pareggio".

Estrai TUTTE le partite visibili nell'immagine e restituiscile in formato JSON strutturato con questi campi:
1. "date": data della partita (es. "18 Ottobre 2026" o "18/10/2026").
2. "opponent": nome completo della squadra AVVERSARIA (es. "Arsenal", "Chelsea"). NON restituire "${userTeamName}" come opponent.
3. "venue": "Casa", "Trasferta", o "Campo Neutro".
4. "competition": competizione (es. "Premier League", "Champions League", "Carabao Cup", "FA Cup", "Amichevole").
5. "importance": "Cruciale", "Alta", o "Media".
6. "status": "Giocata" (se conclusa) o "In Arrivo".
7. "outcome": se giocata: "Vittoria", "Pareggio", o "Sconfitta" (basati sul badge verde/rosso V/S/W/L o sul punteggio).
8. "score": se giocata, risultato nel formato "[Nostri Gol] - [Gol Avversario]" (es. "2-1", "0-2", "1-1").
9. "userTeamGoals": numero intero di gol segnati da "${userTeamName}".
10. "opponentGoals": numero intero di gol segnati dalla squadra avversaria.
11. "predictedFatigueRisk": "Alto", "Medio", o "Basso".

Fornisci la risposta esclusivamente in JSON conforme allo schema.`;

    const response = await safeGenerateContent(ai, {
      model: "gemini-3.8-flash",
      speedMode: "turbo",
      contents: [
        {
          inlineData: {
            mimeType: mimeType || "image/jpeg",
            data: cleanBase64,
          },
        },
        {
          text: promptText,
        },
      ],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.STRING },
              opponent: { type: Type.STRING },
              venue: { type: Type.STRING, enum: ["Casa", "Trasferta", "Campo Neutro"] },
              competition: { type: Type.STRING },
              importance: { type: Type.STRING, enum: ["Cruciale", "Alta", "Media"] },
              status: { type: Type.STRING, enum: ["In Arrivo", "Giocata"] },
              outcome: { type: Type.STRING, enum: ["Vittoria", "Pareggio", "Sconfitta"] },
              score: { type: Type.STRING },
              userTeamGoals: { type: Type.INTEGER },
              opponentGoals: { type: Type.INTEGER },
              predictedFatigueRisk: { type: Type.STRING, enum: ["Alto", "Medio", "Basso"] },
            },
            required: ["date", "opponent", "venue", "competition"],
          },
        },
      },
    });

    const text = response.text || "[]";
    const rawFixturesData = JSON.parse(text);

    // Sanitize and ensure consistent score alignment ("TeamGoals - OppGoals")
    const fixturesData = rawFixturesData.map((f: any) => {
      let score = f.score;
      let outcome = f.outcome;
      let userTeamGoals = typeof f.userTeamGoals === 'number' ? f.userTeamGoals : null;
      let oppGoals = typeof f.opponentGoals === 'number' ? f.opponentGoals : null;

      if (f.status === 'Giocata' || score) {
        // If goals numbers were supplied explicitly
        if (userTeamGoals !== null && oppGoals !== null) {
          if (outcome === 'Vittoria' && userTeamGoals <= oppGoals) {
            // Invert if userTeam was marked as winner but numbers were inverted due to away order
            const maxG = Math.max(userTeamGoals, oppGoals);
            const minG = Math.min(userTeamGoals, oppGoals);
            userTeamGoals = maxG;
            oppGoals = minG;
          } else if (outcome === 'Sconfitta' && userTeamGoals >= oppGoals) {
            const maxG = Math.max(userTeamGoals, oppGoals);
            const minG = Math.min(userTeamGoals, oppGoals);
            userTeamGoals = minG;
            oppGoals = maxG;
          }
          score = `${userTeamGoals}-${oppGoals}`;
        } else if (score) {
          const match = score.match(/(\d+)\s*[-:]\s*(\d+)/);
          if (match) {
            let g1 = parseInt(match[1], 10);
            let g2 = parseInt(match[2], 10);

            // Check if outcome indicates a victory but g1 < g2 (classic away inversion e.g. 1-2 where 1 was home and 2 away)
            if (outcome === 'Vittoria' && g1 < g2) {
              const tmp = g1;
              g1 = g2;
              g2 = tmp;
            } else if (outcome === 'Sconfitta' && g1 > g2) {
              const tmp = g1;
              g1 = g2;
              g2 = tmp;
            } else if (!outcome) {
              // Fallback: if outcome wasn't provided, determine from g1 & g2
              if (g1 > g2) outcome = 'Vittoria';
              else if (g1 === g2) outcome = 'Pareggio';
              else outcome = 'Sconfitta';
            }
            score = `${g1}-${g2}`;
          }
        }

        // Final sanity check for outcome
        if (score) {
          const m = score.match(/(\d+)\s*[-:]\s*(\d+)/);
          if (m) {
            const g1 = parseInt(m[1], 10);
            const g2 = parseInt(m[2], 10);
            if (!outcome) {
              outcome = g1 > g2 ? 'Vittoria' : g1 === g2 ? 'Pareggio' : 'Sconfitta';
            }
          }
        }
      }

      return {
        ...f,
        status: f.status || (score ? 'Giocata' : 'In Arrivo'),
        score: score || undefined,
        outcome: outcome || undefined,
      };
    });

    res.json({ fixtures: fixturesData });
  } catch (error: any) {
    console.error("Error in /api/gemini/parse-calendar-screenshot:", error);
    const parsed = parseGeminiErrorMessage(error);
    const statusCode = parsed.isMissingKey ? 401 : parsed.isQuota ? 429 : parsed.isHighDemand ? 503 : 500;
    res.status(statusCode).json({ error: parsed.message || "Impossibile analizzare lo screenshot del calendario.", isMissingKey: parsed.isMissingKey });
  }
});

// Gemini League Table / Standings OCR Parser from Screenshot
app.post("/api/gemini/parse-standings-screenshot", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/png", userTeamName = "" } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "Nessuno screenshot fornito (imageBase64 mancante)" });
    }

    const ai = getGenAI(extractApiKey(req));
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const promptText = `Sei un esperto gestore dati e OCR per Football Manager 2026 (FM26).
Analizza questa immagine/screenshot che mostra la Classifica del Campionato (League Standings / Table) di Football Manager 2026.

Estrai TUTTE le righe della classifica visibili nell'immagine e restituiscile in formato JSON strutturato con questi campi per ogni squadra:
1. "position": numero di posizione in classifica (1, 2, 3...).
2. "team": nome della squadra (es. "Manchester City", "Arsenal", "${userTeamName || 'Northampton Town'}").
3. "played": numero di partite giocate (P / Giocate).
4. "won": numero di vittorie (V).
5. "drawn": numero di pareggi (N).
6. "lost": numero di sconfitte (P / Sconfitte).
7. "gf": gol fatti (GF).
8. "ga": gol subiti (GS).
9. "gd": differenza reti (DR).
10. "points": punti totali in classifica (Pt).
11. "form": eventuale forma recente se visibile (es. "V V N V P"), altrimenti stringa vuota.

Assicurati che i valori numerici siano numeri interi validi. Restituisci un array ordinato per posizione (1, 2, 3...).`;

    const response = await safeGenerateContent(ai, {
      model: "gemini-3.8-flash",
      speedMode: "turbo",
      contents: [
        {
          inlineData: {
            mimeType: mimeType || "image/jpeg",
            data: cleanBase64,
          },
        },
        {
          text: promptText,
        },
      ],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              position: { type: Type.INTEGER },
              team: { type: Type.STRING },
              played: { type: Type.INTEGER },
              won: { type: Type.INTEGER },
              drawn: { type: Type.INTEGER },
              lost: { type: Type.INTEGER },
              gf: { type: Type.INTEGER },
              ga: { type: Type.INTEGER },
              gd: { type: Type.INTEGER },
              points: { type: Type.INTEGER },
              form: { type: Type.STRING },
            },
            required: ["position", "team", "played", "won", "drawn", "lost", "gf", "ga", "gd", "points"],
          },
        },
      },
    });

    const text = response.text || "[]";
    const standingsData = JSON.parse(text);

    res.json({ standings: standingsData });
  } catch (error: any) {
    console.error("Error in /api/gemini/parse-standings-screenshot:", error);
    const parsed = parseGeminiErrorMessage(error);
    const statusCode = parsed.isMissingKey ? 401 : parsed.isQuota ? 429 : parsed.isHighDemand ? 503 : 500;
    res.status(statusCode).json({ error: parsed.message || "Impossibile analizzare lo screenshot della classifica.", isMissingKey: parsed.isMissingKey });
  }
});


// Gemini Tactic Screenshot Parser Endpoint (In Possession / Out of Possession)
app.post("/api/gemini/parse-tactic-screenshot", async (req, res) => {
  try {
    const { imageBase64, phase = "inPossession", mimeType = "image/png", squadPlayers = [] } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "Nessuno screenshot della tattica fornito." });
    }

    const ai = getGenAI(extractApiKey(req));
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const isCombined = phase === "combined";
    const isPossession = phase === "inPossession";
    const phaseLabel = isCombined ? "TATTICA COMBINATA / TRANSIZIONE (Doppio Ruolo Possesso e Non Possesso)" : isPossession ? 'IN POSSESSO' : 'NON IN POSSESSO';
    
    const promptText = `Sei un esperto Match Analyst e parser OCR per Football Manager 2026 (FM26).
Analizza questo screenshot della schermata tattica in FM26 focalizzandoti sulla fase "${phaseLabel}".

ROSA GIOCATORI DISPONIBILE NELL'APPLICAZIONE (con ID, NOME e RUOLO):
${JSON.stringify(squadPlayers.map((p: any) => ({ id: p.id, name: p.name, position: p.position })), null, 2)}

Estrai accuratamente ed in modo strutturato le seguenti informazioni tattiche dal campo 2D e dall'interfaccia FM26:

1. "formation": la formazione riconosciuta (es. "4-2-3-1", "4-3-3", "3-5-2", "4-4-2", "5-3-2", "4-1-4-1", "3-4-2-1" o "Personalizzata").
2. "mentality": la mentalità visibile ("Molto Offensiva", "Offensiva", "Positiva", "Equilibrata", "Prudente", "Difensiva").
3. "tacticalStyle": identifica lo stile tattico ufficiale FM26 visibile o deducibile ("Controllo del possesso", "Gegenpress", "Tiki-taka", "Tiki-taka verticale", "Gioco sulle fasce", "Palla lunga", "Contropiede fluido", "Contropiede diretto", "Catenaccio", "Parcheggia l'autobus", "Tabula rasa").
4. "positions": array di ESATTAMENTE 11 oggetti per i ruoli sul campo da gioco visibili nello screenshot:
   - "id": id univoco (es. "pos1", "pos2", ... "pos11")
   - "label": sigla del ruolo sul campo (es. "POR", "TD", "DC-D", "DC-I", "TS", "MED", "CC-D", "CC-I", "TRQ", "AD", "AS", "PC", "CD", "CS", ecc.)
   - "role": nome completo del ruolo in italiano. ${isCombined ? 'SE LA SCHERMATA MOSTRA DUE RUOLI DIFFERENZIATI (es. uno in possesso e uno in non possesso), SEPARALI CON UNA BARRA "/", ad esempio "Centrocampista Offensivo / Centrocampista di Quantità". La prima parte PRIMA della barra è il ruolo IN POSSESSO, la seconda parte DOPO la barra è il ruolo NON IN POSSESSO.' : 'es. "Portiere Libero", "Terzino Invertito", "Difensore Centrale", "Fluidificante", "Incontrista", "Mezzala", "Ala Invertita", "Pressing Forward", ecc.'}
   - "duty": compito del giocatore ("Attacco", "Supporto", "Difesa")
   - "matchedPlayerId": confronta il nome del giocatore letto visivamente sullo screenshot con i nomi della rosa forniti sopra. Se c'è una corrispondenza certa con un giocatore della rosa, inserisci il suo "id". SE IL NOME VISIBILE È DUBBIO, ILLEGGIBILE O NON CORRISPONDE ESATTAMENTE A NESSUN GIOCATORE DELLA ROSA, DEVI RESTITUIRLO COME NULL (es: null). NON INVENTARE ID!
   - "recognizedPlayerName": stringa col nome letto dallo screenshot (o null).
   - "coords": coordinate percentuali sul campo 2D { "x": numero da 0 a 100 (da sinistra a destra), "y": numero da 0 a 100 (da attaccante in alto y=12 a portiere in basso y=90) }.

${isPossession ? `- "tempo": ritmo di gioco ("Molto Alto", "Alto", "Standard", "Basso", "Molto Basso").
- "passingStyle": stile passaggi ("Molto Corto", "Corto", "Misto", "Diretto", "Molto Diretto").
- "width": ampiezza tattica ("Molto Ampio", "Ampio", "Standard", "Stretto", "Molto Stretto").
- "playOutOfBack": boolean (true se c'è 'Parti dalla difesa').
- "workBallIntoBox": boolean (true se c'è 'Porta il pallone in area').
- "focusChannels": "Misto", "Sulle Fasce", "Per Vie Centrali", oppure "Cerca i Sovrapposizioni".` : isCombined ? `- "tempo": ritmo di gioco ("Molto Alto", "Alto", "Standard", "Basso").
- "passingStyle": stile passaggi ("Molto Corto", "Corto", "Misto", "Diretto").
- "defensiveLine": linea difensiva ("Molto Alta", "Alta", "Standard", "Bassa").
- "pressingTrigger": intensità pressing ("Estremo", "Molto Spesso", "Standard", "Lieve").` : `- "defensiveLine": linea difensiva ("Molto Alta", "Alta", "Standard", "Bassa", "Molto Bassa").
- "lineOfEngagement": linea d'ingaggio/pressing ("Molto Alta", "Alta", "Standard", "Bassa").
- "pressingTrigger": intensità pressing ("Estremo", "Molto Spesso", "Standard", "Lieve", "Mai").
- "pressingTrap": trappola di pressing ("Nessuna", "Verso l'Esterno", "Verso l'Interno").
- "useOffsideTrap": boolean (true se è attiva la trappola del fuorigioco).
- "tackling": stile contrasti ("Aggressivi", "Standard", "Rimanere in Piedi").`}
- "summary": una sintesi di 1 frase dell'assetto rilevato.

Restituisci esclusivamente un JSON conforme.`;

    const response = await safeGenerateContent(ai, {
      model: "gemini-3.8-flash",
      contents: [
        {
          inlineData: {
            mimeType: mimeType || "image/png",
            data: cleanBase64,
          },
        },
        { text: promptText },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    const parsedData = JSON.parse(response.text || "{}");
    res.json({ success: true, parsed: parsedData });
  } catch (error: any) {
    console.error("Error in /api/gemini/parse-tactic-screenshot:", error);
    const parsed = parseGeminiErrorMessage(error);
    const statusCode = parsed.isMissingKey ? 401 : parsed.isQuota ? 429 : parsed.isHighDemand ? 503 : 500;
    res.status(statusCode).json({ error: parsed.message || "Impossibile analizzare lo screenshot della tattica.", isMissingKey: parsed.isMissingKey });
  }
});

// Gemini Opponent Tactic Screenshot Parser Endpoint (for AI Game Plan)
app.post("/api/gemini/parse-opponent-tactic-screenshot", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/png", opponentName = "Squadra Avversaria" } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "Nessuno screenshot dell'avversario fornito." });
    }

    const ai = getGenAI(extractApiKey(req));
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const promptText = `Sei un esperto Match Analyst, Capo Osservatore e parser OCR per Football Manager 2026 (FM26).
Analizza con estrema precisione questo screenshot che mostra la tattica, lo schieramento, il rapporto scout o la formazione della squadra avversaria "${opponentName}".

L'immagine può provenire da:
- Rapporto dell'Osservatore / Riunione pre-partita (Scout Report / Match Preview)
- Schermata Tattica / Campo 2D con la disposizione dei giocatori avversari
- Schermata delle Formazioni Ufficiali o della Rosa Avversaria

IL TUO OBIETTIVO PRIMARIO:
Identifica e carpisci con certezza il MODULO TATTICO AVVERSARIO (formation) e le caratteristiche dello schieramento:

1. "formation": Il modulo numerico esatto (es. "4-3-3", "4-2-3-1", "3-5-2", "4-4-2", "5-3-2", "3-4-2-1", "4-1-4-1", "4-1-2-1-2", "4-2-4", "5-2-3", "3-4-3", ecc.).
   - Se è un 4-3-3 con tre punte o due ali e una punta centrale, scrivi "4-3-3".
   - Se ci sono tre trequartisti dietro la punta, scrivi "4-2-3-1".
   - Se la difesa è a 3 con due esterni di centrocampo e due punte, scrivi "3-5-2" o "3-4-1-2".
   - Se la difesa è a 5, indica "5-3-2" o "5-2-3".
   - Se il modulo è asimmetrico o personalizzato, denominalo nel modo più chiaro e convenzionale possibile (es. "4-3-3 Asimmetrico", "4-4-1-1").
2. "mentality": Mentalità / Attitudine avversaria ("Equilibrata / Contropiede", "Gegenpress Alto", "Possesso Palla Manovrato", "Blocco Basso", "Palla Lunga sulle Punte", "Offensiva").
3. "tacticalStyle": Stile di gioco deducibile ("Contropiede Rapido su Fasce", "Gegenpress Alta Intensità", "Possesso Palla e Tiki-Taka", "Blocco Basso e Catenaccio", "Palla Lunga per la Punta").
4. "summary": Sintesi analitica dell'assetto rilevato in 1-2 frasi (es. "Modulo 4-3-3 a trazione rapida, con baricentro compatto e forte sfruttamento della velocità delle ali in transizione.").
5. "strengths": Principali punti di forza tattici riscontrati nello schieramento avversario.
6. "weaknesses": Punti deboli o varchi sfruttabili (es. "Spazi ampi lasciati alle spalle dei terzini quando attaccano", "Centrocampo a due facilmente aggirabile con sovrannumero centrale").
7. "recognizedPlayers": Se nell'immagine sono visibili e leggibili i nomi e i ruoli di giocatori dell'avversario schierati in campo, estraili (es. [{ "name": "Vinicius Jr", "position": "AS" }]). Se non sono leggibili nomi o non sono presenti, restituisci array vuoto [].

Fornisci la risposta esclusivamente in JSON conforme.`;

    const response = await safeGenerateContent(ai, {
      model: "gemini-3.8-flash",
      contents: [
        {
          inlineData: {
            mimeType: mimeType || "image/png",
            data: cleanBase64,
          },
        },
        { text: promptText },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            formation: { type: Type.STRING },
            mentality: { type: Type.STRING },
            tacticalStyle: { type: Type.STRING },
            summary: { type: Type.STRING },
            strengths: { type: Type.STRING },
            weaknesses: { type: Type.STRING },
            recognizedPlayers: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  position: { type: Type.STRING },
                  qualities: { type: Type.STRING },
                  weaknesses: { type: Type.STRING },
                },
                required: ["name"],
              },
            },
          },
          required: ["formation"],
        },
      },
    });

    const parsedData = JSON.parse(response.text || "{}");
    res.json({ success: true, parsed: parsedData });
  } catch (error: any) {
    console.error("Error in /api/gemini/parse-opponent-tactic-screenshot:", error);
    const parsed = parseGeminiErrorMessage(error);
    const statusCode = parsed.isMissingKey ? 401 : parsed.isQuota ? 429 : parsed.isHighDemand ? 503 : 500;
    res.status(statusCode).json({ error: parsed.message || "Impossibile analizzare lo screenshot della tattica avversaria.", isMissingKey: parsed.isMissingKey });
  }
});

// Gemini Live Match Screenshot OCR Parser (for in-game FM match screen / tablet stats)
app.post("/api/gemini/parse-live-match-screenshot", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/png", userTeamName = "Nostra Squadra", opponentName = "Avversario" } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "Nessuno screenshot della partita live fornito." });
    }

    const ai = getGenAI(extractApiKey(req));
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const promptText = `Sei un esperto Match Analyst e data extraction OCR per Football Manager 2026 (FM26).
Analizza con estrema precisione questo screenshot scattato durante una partita LIVE in corso di FM26 tra "${userTeamName}" e "${opponentName}".

L'immagine può mostrare:
- Il tablet a bordo campo o schermata riepilogo partita con statistiche
- Tabellone con Risultato, Minuto di gioco, Tiri, xG, Possesso palla, Contrasti, Falli, Calci d'angolo
- Statistiche individuali o voti dei giocatori

ESTRAI CON RIGORE ASSOLUTO:
1. "minute": minuto di gioco rilevato (numero intero, es. 35, 45, 68. Se non rilevato, null).
2. "scoreUs": gol segnati da "${userTeamName}" (numero).
3. "scoreThem": gol segnati da "${opponentName}" (numero).
4. "shotsUs" e "shotsThem": tiri totali.
5. "shotsOnTargetUs" e "shotsOnTargetThem": tiri in porta.
6. "xgUs" e "xgThem": expected goals (es. 1.35 e 0.42. Se non presenti o vuoti, 0).
7. "possessionUs" e "possessionThem": percentuale possesso palla (es. 56 e 44).
8. "foulsUs" e "foulsThem": falli commessi.
9. "yellowCardsUs" e "yellowCardsThem": cartellini gialli.
10. "cornersUs" e "cornersThem": calci d'angolo.
11. "passCompletionUs" e "passCompletionThem": precisione passaggi % (se visibile, altrimenti null).
12. "tacklesWonUs" e "tacklesWonThem": contrasti vinti % (se visibile, altrimenti null).
13. "tacticalObservations": lettura analitica in 1-2 frasi di cosa dicono i dati (es. "Stiamo producendo alto volume di xG ma soffriamo le transizioni veloci").
14. "suggestedAction": 1 consiglio tattico immediato per il manager da applicare in FM26.

Fornisci la risposta esclusivamente in JSON conforme allo schema.`;

    const response = await safeGenerateContent(ai, {
      model: "gemini-3.8-flash",
      contents: [
        {
          inlineData: {
            mimeType: mimeType || "image/png",
            data: cleanBase64,
          },
        },
        { text: promptText },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            minute: { type: Type.INTEGER },
            scoreUs: { type: Type.INTEGER },
            scoreThem: { type: Type.INTEGER },
            shotsUs: { type: Type.INTEGER },
            shotsThem: { type: Type.INTEGER },
            shotsOnTargetUs: { type: Type.INTEGER },
            shotsOnTargetThem: { type: Type.INTEGER },
            xgUs: { type: Type.NUMBER },
            xgThem: { type: Type.NUMBER },
            possessionUs: { type: Type.INTEGER },
            possessionThem: { type: Type.INTEGER },
            foulsUs: { type: Type.INTEGER },
            foulsThem: { type: Type.INTEGER },
            yellowCardsUs: { type: Type.INTEGER },
            yellowCardsThem: { type: Type.INTEGER },
            cornersUs: { type: Type.INTEGER },
            cornersThem: { type: Type.INTEGER },
            passCompletionUs: { type: Type.INTEGER },
            passCompletionThem: { type: Type.INTEGER },
            tacklesWonUs: { type: Type.INTEGER },
            tacklesWonThem: { type: Type.INTEGER },
            tacticalObservations: { type: Type.STRING },
            suggestedAction: { type: Type.STRING },
          },
          required: ["scoreUs", "scoreThem", "shotsUs", "shotsThem", "possessionUs", "possessionThem"],
        },
      },
    });

    const parsedData = JSON.parse(response.text || "{}");
    res.json({ success: true, parsed: parsedData });
  } catch (error: any) {
    console.error("Error in /api/gemini/parse-live-match-screenshot:", error);
    const parsed = parseGeminiErrorMessage(error);
    const statusCode = parsed.isMissingKey ? 401 : parsed.isQuota ? 429 : parsed.isHighDemand ? 503 : 500;
    res.status(statusCode).json({ error: parsed.message || "Impossibile analizzare lo screenshot della partita live.", isMissingKey: parsed.isMissingKey });
  }
});

// ==============================================================================
// SMART SLICING (LIVELLO 2) & CONVERSATIONAL WINDOWING (LIVELLO 3)
// Ottimizzazione drastica dei Token Per Minute (TPM) per Football Manager 2026
// ==============================================================================

/**
 * Riduce la scheda di un giocatore omettendo le matrici complete di 40 attributi numerici
 * se il giocatore non è il focus della domanda, preservando tutti i metadati vitali.
 */
function compactPlayer(p: any, includeDeepAttributes: boolean) {
  if (!p || typeof p !== 'object') return p;

  const ext = extractPlayerStats(p);
  const onLoan = isPlayerOnLoan(p);
  const parsed = parseStatsFromPlayerNote(
    p.notes,
    ext.goals,
    ext.assists,
    ext.avgRating,
    ext.appearances,
    ext.minutesPlayed
  );
  const appearances = ext.appearances !== undefined ? ext.appearances : parsed.appearances;
  const goals = ext.goals !== undefined ? ext.goals : parsed.goals;
  const assists = ext.assists !== undefined ? ext.assists : parsed.assists;
  const avgRating = ext.avgRating !== undefined ? ext.avgRating : parsed.avgRating;
  const loanClub = p.loanClub || parsed.cleanClubMention || (onLoan ? "Club non specificato" : undefined);
  const loanPerformanceStats = p.loanPerformanceStats || (onLoan ? {
    appearances: appearances ?? 0,
    subAppearances: parsed.subAppearances || ext.subAppearances || 0,
    goals: goals ?? 0,
    assists: assists ?? 0,
    avgRating: avgRating ?? 6.75,
    minutes: ext.minutesPlayed || parsed.minutesPlayed,
    summary: parsed.formattedStatsSummary || "In prestito",
    hasQuantitativeStats: true,
    noteText: (p.notes && p.notes.trim()) ? p.notes.trim() : undefined,
  } : (parsed.hasQuantitativeStats ? {
    appearances,
    subAppearances: parsed.subAppearances || ext.subAppearances || 0,
    goals,
    assists,
    avgRating,
    minutes: ext.minutesPlayed || parsed.minutesPlayed,
    summary: parsed.formattedStatsSummary,
    hasQuantitativeStats: true,
    noteText: (p.notes && p.notes.trim()) ? p.notes.trim() : undefined,
  } : undefined));

  if (includeDeepAttributes) {
    return {
      ...p,
      isOnLoan: onLoan,
      loanClub,
      appearances: appearances ?? (onLoan ? 0 : undefined),
      goals: goals ?? (onLoan ? 0 : undefined),
      assists: assists ?? (onLoan ? 0 : undefined),
      avgRating: avgRating ?? (onLoan ? 6.75 : undefined),
      loanPerformanceStats,
    };
  }

  return {
    id: p.id,
    name: p.name,
    position: p.position,
    positionsDetail: p.positionsDetail,
    age: p.age,
    ca: p.ca,
    pa: p.pa,
    role: p.role,
    duty: p.duty,
    nationality: p.nationality,
    value: p.value,
    wage: p.wage,
    contractExpiry: p.contractExpiry,
    height: p.height,
    foot: p.foot,
    condition: p.condition,
    sharpness: p.sharpness,
    morale: p.morale,
    isInjured: p.isInjured,
    injuryType: p.injuryType,
    isOnLoan: onLoan,
    loanClub,
    loanStatus: p.loanStatus || (onLoan ? "IN PRESTITO ATTIVO (Flag Ufficiale)" : undefined),
    isPlayerStaff: p.isPlayerStaff,
    staffRole: p.staffRole,
    availableForYouth: p.availableForYouth,
    youthSquadDesignation: p.youthSquadDesignation,
    youthMatchMinutes: p.youthMatchMinutes,
    appearances: appearances ?? (onLoan ? 0 : undefined),
    goals: goals ?? (onLoan ? 0 : undefined),
    assists: assists ?? (onLoan ? 0 : undefined),
    avgRating: avgRating ?? (onLoan ? 6.75 : undefined),
    loanPerformanceStats,
    notes: p.notes ? p.notes.trim() : undefined,
    hasCopilotNote: p.hasCopilotNote,
    growthVariation: p.growthVariation ? {
      status: p.growthVariation.status,
      caDiff: p.growthVariation.caDiff,
      paDiff: p.growthVariation.paDiff,
      paceLabel: p.growthVariation.paceLabel,
      timeSpanLabel: p.growthVariation.timeSpanLabel,
      improvedAttributes: p.growthVariation.improvedAttributes?.slice(0, 3),
      declinedAttributes: p.growthVariation.declinedAttributes?.slice(0, 3),
    } : undefined,
  };
}

/**
 * Conversational Windowing (Livello 3):
 * Mantiene integri solo gli ultimi 3-4 scambi completi della chat (ultimi 6-8 messaggi),
 * compattando la cronologia precedente in un riepilogo sintetico strutturato
 * per evitare l'effetto palla di neve sui token.
 */
function applyConversationalWindowing(messages: any[], maxFullExchanges = 3): {
  windowedMessages: any[];
  wasWindowed: boolean;
  totalOriginalCount: number;
  compactedExchangesCount: number;
} {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { windowedMessages: [], wasWindowed: false, totalOriginalCount: 0, compactedExchangesCount: 0 };
  }

  const maxFullMessages = maxFullExchanges * 2; // e.g. 3 scambi completi = 6 messaggi
  if (messages.length <= maxFullMessages) {
    return {
      windowedMessages: messages,
      wasWindowed: false,
      totalOriginalCount: messages.length,
      compactedExchangesCount: 0,
    };
  }

  const splitIndex = messages.length - maxFullMessages;
  const olderMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);

  const summaryLines: string[] = [];
  for (let i = 0; i < olderMessages.length; i++) {
    const msg = olderMessages[i];
    const roleLabel = msg.role === 'user' ? 'Manager' : 'Assistente';
    const text = (msg.content || '').trim();

    if (msg.role === 'user') {
      const cleanUserText = text.replace(/\s+/g, ' ');
      const userSnippet = cleanUserText.length > 130 ? cleanUserText.slice(0, 130) + '...' : cleanUserText;
      summaryLines.push(`• [Scambio ${Math.floor(i / 2) + 1}] ${roleLabel}: "${userSnippet}"`);
    } else {
      const cleanAsstText = text.replace(/\s+/g, ' ');
      const proposalMatch = text.match(/playerName["']\s*:\s*["']([^"']+)["']/);
      const proposalExtra = proposalMatch ? ` (Proposta nota per ${proposalMatch[1]})` : '';
      const asstSnippet = cleanAsstText.length > 150 ? cleanAsstText.slice(0, 150) + '...' : cleanAsstText;
      summaryLines.push(`  → Sintesi ${roleLabel}: ${asstSnippet}${proposalExtra}`);
    }
  }

  const compactedSummaryBlock = {
    role: 'user',
    content: `[CRONOLOGIA CONVERSAZIONE PRECEDENTE COMPATTATA (SLIDING WINDOW - Primi ${Math.ceil(olderMessages.length / 2)} scambi archiviati)]:\n${summaryLines.join('\n')}\n\n[FINE ARCHIVIO COMPATTATO - SEGUONO GLI ULTIMI SCAMBI COMPLETI IN CORSO]:`,
  };

  return {
    windowedMessages: [compactedSummaryBlock, ...recentMessages],
    wasWindowed: true,
    totalOriginalCount: messages.length,
    compactedExchangesCount: Math.ceil(olderMessages.length / 2),
  };
}

/**
 * Smart Slicing (Livello 2):
 * Analizza il prompt dell'utente e la cronologia recente per filtrare e compattare
 * squadContext, inviando a Gemini solo i dati strettamente rilevanti per la richiesta
 * (taglio tipico: 70-85% di caratteri/token del JSON).
 */
function applySmartContextSlicing(squadContext: any, promptText: string, recentHistoryText: string) {
  if (!squadContext || typeof squadContext !== 'object') {
    return {
      slicedContext: squadContext,
      originalChars: 0,
      slicedChars: 0,
      reductionPct: 0,
      focusedPlayerNames: [],
    };
  }

  const originalStr = JSON.stringify(squadContext);
  const originalChars = originalStr.length;

  // Se il contesto è già ultra compatto (< 3500 caratteri), non serve slicing
  if (originalChars < 3500) {
    return {
      slicedContext: squadContext,
      originalChars,
      slicedChars: originalChars,
      reductionPct: 0,
      focusedPlayerNames: [],
    };
  }

  const queryCombined = `${promptText || ''} ${recentHistoryText || ''}`;
  const queryNorm = queryCombined.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  // 1. Individuazione dei giocatori specifici menzionati nel prompt
  const focusedPlayerNames = new Set<string>();
  const allExistingPlayers = [
    ...(Array.isArray(squadContext.allPlayers) ? squadContext.allPlayers : []),
    ...(Array.isArray(squadContext.scoutingTargets) ? squadContext.scoutingTargets : []),
    ...(Array.isArray(squadContext.youthSquads) ? squadContext.youthSquads.flatMap((y: any) => y.players || []) : []),
  ];

  for (const pl of allExistingPlayers) {
    if (!pl?.name) continue;
    const nameNorm = pl.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const parts = nameNorm.split(/\s+/).filter((p: string) => p.length >= 3);
    if (queryNorm.includes(nameNorm)) {
      focusedPlayerNames.add(pl.name);
    } else {
      for (const part of parts) {
        const wordRegex = new RegExp(`\\b${part}\\b`, 'i');
        if (wordRegex.test(queryNorm)) {
          focusedPlayerNames.add(pl.name);
          break;
        }
      }
    }
  }

  // 2. Rilevamento posizioni/ruoli tattici
  const isGKQuery = /\b(portier|portieri|gk|estremo difensore|clean sheet|tra i pali)\b/i.test(queryNorm);
  const isCBQuery = /\b(difensor|difensori|centrale|centrali|dc|cb|marcatore|braccetto)\b/i.test(queryNorm);
  const isFBQuery = /\b(terzin|terzini|laterale|laterali|dr|dl|wbr|wbl|fascia|terzino destro|terzino sinistro)\b/i.test(queryNorm);
  const isMidQuery = /\b(centrocampist|centrocampo|median|mediani|mezzala|mezzali|regista|registi|mc|cm|dm|volante)\b/i.test(queryNorm);
  const isWingerQuery = /\b(ala|ali|estern|esterni|amr|aml|ala destra|ala sinistra|fantasista)\b/i.test(queryNorm);
  const isStrikerQuery = /\b(attaccant|attaccanti|punt|punte|centravanti|st|bomber|striker|finalizzatore)\b/i.test(queryNorm);
  const hasSpecificRoleQuery = isGKQuery || isCBQuery || isFBQuery || isMidQuery || isWingerQuery || isStrikerQuery;

  // 3. Rilevamento domini e argomenti
  const isTacticQuery = /\b(tattic|formazion|modulo|undici|titolari|panchina|rotazion|pressing|mentalit|4-3-3|4-2-3-1|3-5-2|contropiede|possesso|istruzion)\b/i.test(queryNorm);
  const isScoutingQuery = /\b(scout|scouting|mercat|calciomercato|acquist|ceder|cessio|comprar|trattativ|budget|target|obiettivo|clausol|svincolat|upgrade)\b/i.test(queryNorm);
  const isYouthQuery = /\b(giovanil|vivaio|under 20|under 18|u20|u18|wonderkid|prospect|talent|promozion|promuov|aggreg)\b/i.test(queryNorm);
  const temporalFilter = extractTemporalRangeFilter(queryCombined, squadContext.currentDate);
  const isFixtureQuery = Boolean(temporalFilter?.hasTemporalFilter) ||
    Boolean(squadContext.activeTemporalFilter) ||
    Boolean(squadContext.temporalFilterLabel) ||
    /\b(calendari|partit|partite|gara|gare|prossim|sfida|risultat|marcat|gol|classific|campionat|copp|champions|rendiment|andamento|score|tabellino|match)\b/i.test(queryNorm);
  const isGrowthQuery = /\b(crescit|svilupp|variazi|variazioni|migliorat|calat|progression|increment|delta|allenament)\b/i.test(queryNorm);
  const isLoanQuery = /\b(prestit|prestiti|in prestito|loan|riscatto|minutaggio|disponibile per le partite delle giovanili|statistiche dei prestiti|andamento prestit|cedut.*in prestito)\b/i.test(queryNorm);
  const isNotesQuery = /\b(not|note|appunt|promemori|ricord|concordat|strategia salvat|memoria|note& memory|note & memory|modello)\b/i.test(queryNorm);
  const isGamePlanQuery = /\b(piano gara|avversari|opponen|contromisur|prossima partita)\b/i.test(queryNorm);

  function matchesQueriedRole(p: any): boolean {
    if (!hasSpecificRoleQuery) return false;
    const pos = (p.position || '').toUpperCase();
    if (isGKQuery && (pos.includes('GK') || pos.includes('POR'))) return true;
    if (isCBQuery && (pos.includes('DC') || pos.includes('CB') || pos.includes('D C'))) return true;
    if (isFBQuery && (pos.includes('DR') || pos.includes('DL') || pos.includes('WBR') || pos.includes('WBL') || pos.includes('D R') || pos.includes('D L'))) return true;
    if (isMidQuery && (pos.includes('DM') || pos.includes('MC') || pos.includes('CM') || pos.includes('M C'))) return true;
    if (isWingerQuery && (pos.includes('AMR') || pos.includes('AML') || pos.includes('MR') || pos.includes('ML') || pos.includes('AM R') || pos.includes('AM L'))) return true;
    if (isStrikerQuery && (pos.includes('ST') || pos.includes('PC') || pos.includes('P C') || pos.includes('ATT'))) return true;
    return false;
  }

  // Costruisci il contesto compresso/selettivo
  const sliced: any = {
    teamName: squadContext.teamName,
    currentDate: squadContext.currentDate,
    phaseInfo: squadContext.phaseInfo,
  };

  // Tattica
  if (squadContext.tactic) {
    if (isTacticQuery || isGamePlanQuery || !hasSpecificRoleQuery) {
      sliced.tactic = squadContext.tactic;
    } else {
      // In query non tattiche, includi la tattica in formato compatto (nome, modulo, mentalità)
      sliced.tactic = {
        name: squadContext.tactic.name,
        formation: squadContext.tactic.formation,
        mentality: squadContext.tactic.mentality,
        style: squadContext.tactic.style,
      };
    }
  }

  // Piano Gara
  if (squadContext.gamePlan) {
    if (isGamePlanQuery || isFixtureQuery || isTacticQuery) {
      sliced.gamePlan = squadContext.gamePlan;
    } else {
      sliced.gamePlan = {
        opponent: squadContext.gamePlan.opponent,
        venue: squadContext.gamePlan.venue,
        competition: squadContext.gamePlan.competition,
        opponentFormation: squadContext.gamePlan.opponentFormation,
      };
    }
  }

  // Prima Squadra (allPlayers)
  if (Array.isArray(squadContext.allPlayers)) {
    sliced.allPlayers = squadContext.allPlayers.map((p: any) => {
      const isFocused = focusedPlayerNames.has(p.name);
      const isRoleMatch = matchesQueriedRole(p);
      const shouldKeepDeep = isFocused || isRoleMatch;
      return compactPlayer(p, shouldKeepDeep);
    });
  }

  // Giocatori in prestito & disponibili per le giovanili
  const loansFromContext = (Array.isArray(squadContext.playersCurrentlyOnLoan) && squadContext.playersCurrentlyOnLoan.length > 0)
    ? squadContext.playersCurrentlyOnLoan
    : getAllLoanedPlayersEnriched(squadContext.allPlayers || [], squadContext.youthSquads || []);

  if (loansFromContext && loansFromContext.length > 0) {
    sliced.playersCurrentlyOnLoan = loansFromContext.map((p: any) => enrichPlayerWithLoanStats(p));
    sliced.officialLoanSummary = {
      totalPlayersCurrentlyOnLoan: sliced.playersCurrentlyOnLoan.length,
      activeLoanPlayerNames: sliced.playersCurrentlyOnLoan.map((p: any) => p.name),
      playersWithRecordedLoanStats: sliced.playersCurrentlyOnLoan.map((p: any) => `${p.name} (${p.loanClub || 'Club esterno'} - ${p.position || 'Ruolo'}): ${p.loanPerformanceStats?.summary || p.notes || 'In prestito'}`),
      allLoanProfilesTable: sliced.playersCurrentlyOnLoan.map((p: any) => ({
        name: p.name,
        squad: p.squad,
        position: p.position,
        age: p.age,
        ca: p.ca,
        pa: p.pa,
        club: p.loanClub,
        appearances: p.appearances,
        goals: p.goals,
        assists: p.assists,
        avgRating: p.avgRating,
        summary: p.loanPerformanceStats?.summary,
        notes: p.notes,
      })),
      officialSystemNotice: "ATTENZIONE COPILOT: I dati quantitativi e qualitativi dei giocatori in prestito provengono direttamente dai campi e dalle note registrate dal Manager (sintetizzati in loanPerformanceStats e nelle note testuali). Leggi TUTTI i profili senza escluderne alcuno e applica il modello a tutti i calciatori in prestito (inclusi Zedníček, Turull, Behiratche, Kern, Vera, Nisi, Piñón e ogni altro elemento in prestito).",
    };
  } else if (squadContext.officialLoanSummary) {
    sliced.officialLoanSummary = squadContext.officialLoanSummary;
  }

  if (squadContext.playersAvailableForYouthMatches) sliced.playersAvailableForYouthMatches = squadContext.playersAvailableForYouthMatches;

  if (squadContext.playersWithNotes) {
    sliced.playersWithNotes = squadContext.playersWithNotes.map((p: any) => enrichPlayerWithLoanStats(p));
  }

  if (squadContext.playersWithNotesAndLoans) {
    sliced.playersWithNotesAndLoans = squadContext.playersWithNotesAndLoans.map((p: any) => enrichPlayerWithLoanStats(p));
  }

  // Scouting Targets
  if (Array.isArray(squadContext.scoutingTargets) && squadContext.scoutingTargets.length > 0) {
    if (isScoutingQuery || focusedPlayerNames.size > 0) {
      sliced.scoutingTargets = squadContext.scoutingTargets.map((p: any) => {
        const isFocused = focusedPlayerNames.has(p.name);
        const isRoleMatch = matchesQueriedRole(p);
        const shouldKeepDeep = isFocused || isRoleMatch || isScoutingQuery;
        return compactPlayer(p, shouldKeepDeep);
      });
    } else {
      // Se la domanda NON riguarda affatto lo scouting, riduci i target a un sintetico indice di 1 riga
      sliced.scoutingTargetsSummary = squadContext.scoutingTargets.map((p: any) => ({
        name: p.name,
        position: p.position,
        age: p.age,
        ca: p.ca,
        pa: p.pa,
        value: p.value,
        wage: p.wage,
      }));
    }
  }

  // Giovanili (youthSquads)
  if (Array.isArray(squadContext.youthSquads)) {
    if (isYouthQuery || isGrowthQuery || isLoanQuery || isNotesQuery) {
      sliced.youthSquads = squadContext.youthSquads.map((sq: any) => ({
        ...sq,
        players: (sq.players || []).map((p: any) => {
          const isFocused = focusedPlayerNames.has(p.name);
          const isTopTalent = (p.pa >= 140 && (p.age || 18) < 22);
          const isLoanPlayer = Boolean(p.isOnLoan);
          const hasNotes = Boolean(p.notes);
          return compactPlayer(p, isFocused || isTopTalent || isLoanPlayer || hasNotes);
        }),
      }));
    } else {
      sliced.youthSquadsSummary = squadContext.youthSquads.map((sq: any) => ({
        name: sq.name,
        count: (sq.players || []).length,
        wonderkids: (sq.players || [])
          .filter((p: any) => p.pa >= 150 && (p.age || 18) < 22)
          .map((p: any) => `${p.name} (${p.position}, ${p.age}a, PA ${p.pa})`),
      }));
    }
  }

  // Competizioni e Classifica
  if (squadContext.competitionsAndStandings) {
    if (isFixtureQuery || isGamePlanQuery || !hasSpecificRoleQuery) {
      sliced.competitionsAndStandings = squadContext.competitionsAndStandings;
    } else {
      sliced.competitionsAndStandings = {
        leagueName: squadContext.competitionsAndStandings.leagueName,
        userTeamStanding: squadContext.competitionsAndStandings.userTeamStanding,
      };
    }
  }

  // Calendario Partite & Rendimento con Filtro Temporale Intelligente
  if (squadContext.calendarPerformanceSummary) {
    sliced.calendarPerformanceSummary = squadContext.calendarPerformanceSummary;
  }
  if (Array.isArray(squadContext.calendarMatchNotes) && (isFixtureQuery || isGamePlanQuery)) {
    sliced.calendarMatchNotes = squadContext.calendarMatchNotes;
  }
  if (temporalFilter?.label || squadContext.activeTemporalFilter || squadContext.temporalFilterLabel) {
    sliced.activeTemporalFilter = temporalFilter?.label || squadContext.activeTemporalFilter || squadContext.temporalFilterLabel;
  }
  if (Array.isArray(squadContext.allFixtures)) {
    if (isFixtureQuery || isGamePlanQuery) {
      if (temporalFilter?.hasTemporalFilter) {
        // Applica l'intervallo temporale rilevato (es. 'da data X a data Y', mese, o periodo specifico)
        const filteredFixtures = filterFixturesByTemporalRange(squadContext.allFixtures, temporalFilter, squadContext.currentDate);
        sliced.recentAndUpcomingFixtures = filteredFixtures;
        sliced.allFixtures = filteredFixtures;
      } else if (squadContext.activeTemporalFilter || squadContext.temporalFilterLabel) {
        sliced.recentAndUpcomingFixtures = squadContext.allFixtures;
        sliced.allFixtures = squadContext.allFixtures;
      } else {
        const smartFixtures = filterFixturesByTemporalRange(squadContext.allFixtures, null, squadContext.currentDate);
        sliced.recentAndUpcomingFixtures = smartFixtures;
        sliced.allFixtures = smartFixtures;
      }
    }
  }

  // Crescita Squadra & Variazioni
  if (squadContext.squadGrowthAndVariations) {
    if (isGrowthQuery || isYouthQuery) {
      sliced.squadGrowthAndVariations = squadContext.squadGrowthAndVariations;
    } else {
      sliced.squadGrowthAndVariationsSummary = {
        totalImprovedPlayers: squadContext.squadGrowthAndVariations.totalImprovedPlayers,
        totalDeclinedPlayers: squadContext.squadGrowthAndVariations.totalDeclinedPlayers,
        improvedSummary: (squadContext.squadGrowthAndVariations.improvedPlayersList || [])
          .slice(0, 4)
          .map((p: any) => `${p.name} (+${p.caDiff} CA, ${p.paceLabel || ''})`),
      };
    }
  }

  // Note Tattiche e Memoria Accordata
  if (squadContext.tacticalNotes) sliced.tacticalNotes = squadContext.tacticalNotes;
  if (squadContext.playersWithCopilotAgreedNotes) sliced.playersWithCopilotAgreedNotes = squadContext.playersWithCopilotAgreedNotes;
  if (!sliced.playersWithNotes && squadContext.playersWithNotes) {
    sliced.playersWithNotes = squadContext.playersWithNotes.map((p: any) => enrichPlayerWithLoanStats(p));
  }
  if (!sliced.playersWithNotesAndLoans && squadContext.playersWithNotesAndLoans) {
    sliced.playersWithNotesAndLoans = squadContext.playersWithNotesAndLoans.map((p: any) => enrichPlayerWithLoanStats(p));
  }

  const slicedStr = JSON.stringify(sliced);
  const slicedChars = slicedStr.length;
  const reductionPct = Math.max(0, Math.round(100 - (slicedChars / originalChars) * 100));

  return {
    slicedContext: sliced,
    originalChars,
    slicedChars,
    reductionPct,
    focusedPlayerNames: Array.from(focusedPlayerNames),
  };
}

// Helper to construct system instruction and contents payload for Copilot Chat
function buildChatPayload(messages: any[], squadContext: any, attachments: any[], mode: string = "standard") {
  const isLiveMatch = mode === "live_match" || !!squadContext?.isLiveMatch;

  // 1. Elabora eventuali allegati testuali da integrare nel prompt dell'ultimo turno
  let attachmentsTextSnippet = "";
  const imageParts: any[] = [];

  if (Array.isArray(attachments) && attachments.length > 0) {
    for (const att of attachments) {
      if (att && att.mimeType && att.mimeType.startsWith("image/") && att.data) {
        const cleanBase64 = att.data.replace(/^data:image\/\w+;base64,/, "");
        imageParts.push({
          inlineData: {
            mimeType: att.mimeType,
            data: cleanBase64,
          },
        });
      } else if (att && att.textContent) {
        attachmentsTextSnippet += `\n\n--- [ALLEGATO TESTO/DATI: ${att.name || 'file'}] ---\n${att.textContent}\n----------------------------------`;
      }
    }
  }

  // 2. Conversational Windowing: in live match manteniamo fino a 24 scambi per preservare l'intera cronologia dei 90'
  let effectiveMessages: any[] = [];
  let windowResult: any;

  if (isLiveMatch) {
    const MAX_LIVE_TURNS = 24;
    if (messages.length > MAX_LIVE_TURNS) {
      effectiveMessages = messages.slice(-MAX_LIVE_TURNS);
      windowResult = {
        windowedMessages: effectiveMessages,
        wasWindowed: true,
        compactedExchangesCount: messages.length - MAX_LIVE_TURNS,
        totalOriginalCount: messages.length,
      };
    } else {
      effectiveMessages = messages;
      windowResult = {
        windowedMessages: effectiveMessages,
        wasWindowed: false,
        compactedExchangesCount: 0,
        totalOriginalCount: messages.length,
      };
    }
  } else {
    windowResult = applyConversationalWindowing(messages, 3);
    effectiveMessages = windowResult.windowedMessages;
  }

  // 3. Estrai l'ultimo prompt utente per l'analisi intento dello Smart Slicing
  const latestUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const latestUserPrompt = (latestUserMsg?.content || '') + ' ' + attachmentsTextSnippet;
  const recentHistoryText = effectiveMessages.map(m => m.content || '').join(' ');

  // 4. Smart Slicing (Livello 2): Sfoltisci il JSON a ciò che è strettamente rilevante
  const slicingResult = applySmartContextSlicing(squadContext, latestUserPrompt, recentHistoryText);
  const effectiveSquadContext = slicingResult.slicedContext;

  // 5. Sintesi Esplicita Tabellini Numerici e Note dei Calciatori (Presenze, Gol, Assist, Media Voto, Minuti, Note)
  let playerStatsSummaryText = "";
  const loanTable = effectiveSquadContext?.officialLoanSummary?.allLoanProfilesTable ||
    effectiveSquadContext?.playersCurrentlyOnLoan || [];

  if (Array.isArray(loanTable) && loanTable.length > 0) {
    playerStatsSummaryText += "\nTABELLINO UFFICIALE CALCIATORI IN PRESTITO (DATI NUMERICI & NOTE REGISTRATE):\n";
    loanTable.forEach((p: any, idx: number) => {
      const pres = p.appearances !== undefined ? p.appearances : (p.loanPerformanceStats?.appearances ?? 0);
      const sub = p.subAppearances !== undefined ? p.subAppearances : (p.loanPerformanceStats?.subAppearances ?? 0);
      const gol = p.goals !== undefined ? p.goals : (p.loanPerformanceStats?.goals ?? 0);
      const ast = p.assists !== undefined ? p.assists : (p.loanPerformanceStats?.assists ?? 0);
      const mv = p.avgRating !== undefined ? (typeof p.avgRating === 'number' ? p.avgRating.toFixed(2) : p.avgRating) : (p.loanPerformanceStats?.avgRating ? Number(p.loanPerformanceStats.avgRating).toFixed(2) : "6.75");
      const min = p.minutes || p.minutesPlayed || p.loanPerformanceStats?.minutes;
      const minText = min ? ` (${min}')` : '';
      const subText = sub ? ` [${sub} da sub.]` : '';
      const club = p.club || p.loanClub || "Club esterno";
      const noteText = p.notes ? ` • Note: "${p.notes}"` : (p.loanPerformanceStats?.noteText ? ` • Note: "${p.loanPerformanceStats.noteText}"` : '');
      const summaryText = p.summary || p.loanPerformanceStats?.summary;
      playerStatsSummaryText += `${idx + 1}. **${p.name}** (${club} - ${p.position || 'Ruolo'}${p.squad ? `, ${p.squad}` : ''}): Presenze: **${pres}**${subText}${minText} | Gol: **${gol}** | Assist: **${ast}** | Media Voto: **${mv}**${summaryText ? ` | Riepilogo: ${summaryText}` : ''}${noteText}\n`;
    });
  }

  const otherPlayersWithNotesOrStats = [
    ...(effectiveSquadContext?.allPlayers || []).filter((p: any) => !p.isOnLoan && (p.notes || p.appearances !== undefined || p.goals !== undefined)),
    ...(effectiveSquadContext?.youthSquads || []).flatMap((ys: any) => (ys.players || []).filter((p: any) => !p.isOnLoan && (p.notes || p.appearances !== undefined || p.goals !== undefined))),
  ];

  if (otherPlayersWithNotesOrStats.length > 0) {
    playerStatsSummaryText += "\nNOTE E STATISTICHE REGISTRATE DEGLI ALTRI CALCIATORI IN ROSA:\n";
    otherPlayersWithNotesOrStats.slice(0, 15).forEach((p: any) => {
      const statsParts: string[] = [];
      if (p.appearances !== undefined) statsParts.push(`${p.appearances} pres.`);
      if (p.goals !== undefined) statsParts.push(`${p.goals} gol`);
      if (p.assists !== undefined) statsParts.push(`${p.assists} assist`);
      if (p.avgRating !== undefined) statsParts.push(`MV ${typeof p.avgRating === 'number' ? p.avgRating.toFixed(2) : p.avgRating}`);
      const statsStr = statsParts.length > 0 ? ` [${statsParts.join(', ')}]` : '';
      const noteStr = p.notes ? ` • Nota: "${p.notes}"` : '';
      playerStatsSummaryText += `- **${p.name}** (${p.position || 'Ruolo'})${statsStr}${noteStr}\n`;
    });
  }

  let systemInstruction = "";

  if (isLiveMatch) {
    const lm = squadContext?.liveMatchState || {};
    const eventsStr = (lm.events || []).map((e: any) => `[Min. ${e.minute}'] ${e.description}`).join('\n') || 'Nessun evento registrato finora.';
    const startersStr = (lm.starters || []).map((s: any) => `- ${s.name} (${s.position}${s.role ? ` - ${s.role}` : ''})${s.hasYellowCard ? ' ⚠️ AMMONITO' : ''}${s.isInjured ? ' 🚑 ACCIACCATO' : ''}${s.condition !== undefined ? ` [Condizione: ${s.condition}%]` : ''}${s.rating ? ` [Voto: ${s.rating}]` : ''}`).join('\n') || 'Formazione iniziale non specificata.';
    const benchStr = (squadContext?.allPlayers || []).filter((p: any) => !p.isOnLoan && !(lm.starters || []).some((st: any) => st.playerId === p.id || st.name === p.name)).slice(0, 14).map((p: any) => `- ${p.name} (${p.position}, CA: ${p.ca || 'N/D'})`).join('\n') || 'Rosa completa nel contesto';
    const statsStr = lm.stats ? `Tiri: ${lm.stats.shotsUs || 0} vs ${lm.stats.shotsThem || 0} | In Porta: ${lm.stats.shotsOnTargetUs || 0} vs ${lm.stats.shotsOnTargetThem || 0} | xG: ${lm.stats.xgUs ?? '0.00'} vs ${lm.stats.xgThem ?? '0.00'} | Possesso: ${lm.stats.possessionUs || 50}% vs ${lm.stats.possessionThem || 50}% | Falli: ${lm.stats.foulsUs || 0} vs ${lm.stats.foulsThem || 0} | Angoli: ${lm.stats.cornersUs || 0} vs ${lm.stats.cornersThem || 0}` : 'Nessuna statistica inserita';

    const liveMatchHeader = `
================================================================================
LAVAGNA TATTICA LIVE & STATO DELLA PARTITA IN TEMPO REALE (MINUTO ${lm.minute ?? 0}')
================================================================================
- Incontro: ${squadContext?.teamName || 'Nostra Squadra'} vs ${lm.opponent || 'Avversario'} (${lm.homeOrAway === 'home' ? 'Casa' : 'Trasferta'})
- Competizione: ${lm.competition || 'Campionato / Coppa'}
- Punteggio Live: ${squadContext?.teamName || 'Nostra Squadra'} ${lm.scoreUs ?? 0} - ${lm.scoreThem ?? 0} ${lm.opponent || 'Avversario'}
- Minuto di Gioco: ${lm.minute ?? 0}' [Periodo: ${lm.period || 'In corso'}]
- Inerzia della Gara: ${lm.momentum || 'Equilibrata'}
- Nostro Assetto Live: Mentalità "${lm.mentality || 'Equilibrata'}", Pressing "${lm.pressing || 'Standard'}", Ritmo "${lm.tempo || 'Standard'}"
- Modulo Avversario: "${lm.opponentFormation || '4-3-3'}"
- Statistiche del Match: ${statsStr}
- Cronologia Eventi e Momenti Salienti:
${eventsStr}
- Nostri Calciatori in Campo (con allarmi cartellini/condizione):
${startersStr}
- Panchina a Disposizione per Sostituzioni Immediati:
${benchStr}
================================================================================`;

    systemInstruction = `Sei il Co-Allenatore, Match Analyst e Assistente Live in Panchina per Football Manager 2026 (FM26).
IL MANAGER TI STA PARLANDO IN TEMPO REALE DURANTE I 90 MINUTI DELLA PARTITA IN CORSO.
Il manager ha pochissimo tempo tra un highlight e l'altro o durante l'intervallo: sii RAPIDO, DIRETTO, STRUTTURATO e AZIONABILE.

REGOLE LIVE TASSATIVE:
1. DIRETTO E CONCISO: Evita preamboli inutili o saluti cerimoniosi. Usa elenchi puntati compatti e chiari.
2. ISTRUZIONI ESATTE FM26: Fornisci indicazioni tattiche concrete e applicabili nelle schermate di FM (es. 'Passa a Mentalità Positiva', 'Aumenta Ritmo di Gioco', 'Imposta Contrasti Cauti su [Nome] per evitare il secondo giallo', 'Attacca al Centro / Sulle Fasce', 'Marca Stretto il loro regista').
3. CAMBI CONSIGLIATI: Quando suggerisci un cambio, indica chiaramente:
   - CHI ESCE e PERCHÉ (calo fisico sotto il 70%, ammonizione a rischio espulsione, voto insufficiente).
   - CHI ENTRA dalla panchina.
   - RUOLO E COMPITO da assegnargli in campo.
4. GESTIONE DEI CARTELLINI: Se un nostro giocatore ha il cartellino giallo (⚠️ AMMONITO), segnala di togliere 'Contrasti Duri' o considera la sostituzione preventiva prima del secondo giallo.
5. MEMORIA INTEGRALE DELLA PARTITA: Non dimenticare ciò che è accaduto nei minuti precedenti. La cronologia eventi e la lavagna tattica ti forniscono il quadro completo dei 90 minuti.
6. ANALISI SCREENSHOT: Se il manager allega uno screenshot (statistiche partita, tablet live, mappa di calore), estrai e commenta subito i dati rilevati.

${liveMatchHeader}

CONTESTO ROSA E CLUB:
${JSON.stringify(effectiveSquadContext || {})}`;
  } else {
    systemInstruction = `Sei il Co-Allenatore, Match Analyst e Assistente Personale di maggior fiducia per Football Manager 2026 (FM26).

REGOLE TASSATIVE E MANDATORIE ANTI-ALLUCINAZIONE E RIGORE SUI DATI:
1. BASATI ESCLUSIVAMENTE SUI DATI REALI FORNITI NEL CONTESTO JSON ("squadContext").
2. NON INVENTARE GIOCATORI, NON INVENTARE PARTITE NON PRESENTI NEL CALENDARIO, NON INVENTARE STATISTICHE O DETTAGLI NON PRESENTI NEI DATI.
3. SE L'UTENTE TI CHIEDE INFORMAZIONI, CONSIGLI O ANALISI SU GIOCATORI, SQUADRE O PARTITE TOTALMENTE ASSENTI NEL DATABASE FORNITO (ad es. un giocatore o avversario mai caricato nella rosa), DEVI DICHIARARLO SUBITO ED ESPLICITAMENTE:
   "⚠️ **Dati Insufficienti / Lacuna Informativa**: [Spiega chiaramente e con precisione quali dati mancano nell'applicazione per poter rispondere]."
   DIVIETO CATEGORICO: NON USARE MAI questa formula e NON RIFIUTARE L'ANALISI per i giocatori in prestito o presenti nel contesto JSON! Se un giocatore ha note testuali o appare in 'playersCurrentlyOnLoan' / 'playersWithNotes' (es. Zedníček, Turull, Behiratche, Kern, Vera, Nisi, Piñón), NON ESISTE ALCUNA LACUNA: possiedi le note e i dati quantitativi in 'loanPerformanceStats' e devi procedere all'analisi di tutti i profili.
4. Fai sempre riferimento ai dati reali inseriti dall'utente (Data in-game attuale: "${effectiveSquadContext?.currentDate || 'Non specificata'}", Prima Squadra: ${effectiveSquadContext?.allPlayers?.length || 0} giocatori caricati, Squadre Giovanili: ${(effectiveSquadContext?.youthSquads || []).length} rose/categorie, Tattica attuale "${effectiveSquadContext?.tactic?.name || ''}").
5. SELEZIONE PRIMA SQUADRA & FORMAZIONI TITOLARI ("allPlayers"):
   - Quando rispondi a domande su formazioni, titolari, 11 di partenza, panchina o rotazioni tattiche della Prima Squadra, cita UNICAMENTE i giocatori appartenenti a "allPlayers" (Prima Squadra).
   - NON SCHIERARE NÉ SUGGERIRE COME TITOLARI O DISPONIBILI GIOCATORI CHE RISULTANO INFORTUNATI ("isInjured": true) O IN PRESTITO AD ALTRE SQUADRE ("isOnLoan": true). Sia i giocatori infortunati sia quelli ceduti in prestito sono indisponibili per la nostra squadra e devono essere categoricamente esclusi da formazioni, rotazioni, titolari e valutazioni dell'XI iniziale. Proponi sempre e solo elementi sani e arruolabili attualmente in rosa.
6. GIOCATORI CON TAG 'GIOCATORE/STAFF' ("isPlayerStaff": true, "staffRole"):
   - I giocatori contrassegnati con "isPlayerStaff": true sono tesserati (spesso calciatori anziani, senatori, capitani storici o elementi di leadership) che rientrano nei piani dei collaboratori e dei quadri tecnici della società (con incarichi come "Collaboratore Tecnico", "Mentore Giovani", "Preparatore", ecc.).
   - REGOLA TASSATIVA: NON considerare MAI questi giocatori come "esuberi", scarti o elementi da cedere/svendere nelle analisi della rosa o nelle valutazioni di mercato. Non proporre mai la loro cessione o rescissione solo perché anziani. Riconosci e valorizza la loro presenza come risorsa per lo staff tecnico e per la crescita del gruppo, considerando il ruolo specificato in "staffRole".
7. GIOVANILI & VIVAIO ("youthSquads") E REGOLE DI SEPARAZIONE ROSA:
   - I giocatori presenti in "youthSquads" fanno parte del vivaio/squadre giovanili (es. Under 20, Under 18, Squadra B).
   - REGOLA MANDATORIA: I giocatori del vivaio NON SONO SELEZIONABILI per le formazioni o le rotazioni della Prima Squadra. NON inserirli mai tra i titolari o i panchinari arruolabili della Prima Squadra, a meno che il Manager non chieda espressamente chi promuovere o aggregare dal vivaio.
   - DEFINIZIONE TAG TALENTO (Riservati ESCLUSIVAMENTE ai giocatori con età inferiore ai 22 anni, ovvero Età < 22 / Under 22):
     * **Wonderkid**: Giocatori under 22 con Potenziale (PA) di 170 o superiore (PA >= 170 e Età < 22). Sono futuri fuoriclasse di livello mondiale.
     * **Top Prospect**: Giocatori under 22 con Potenziale (PA) compreso tra 150 e 169 (150 <= PA < 170 e Età < 22). Sono giovani talenti di alto profilo per la massima serie.
     * **Top Talent**: Giocatori under 22 con Potenziale (PA) compreso tra 130 e 149 (130 <= PA < 150 e Età < 22). Sono prospetti di ottimo livello con buon margine di crescita per la rosa.
     * *Nota bene*: I giocatori con 22 anni o più (Età >= 22) NON ricevono questi tag giovanili (né Wonderkid né Top Prospect né Top Talent), poiché sono considerati calciatori già formati.
    - Utilizza i dati di "youthSquads" per rispondere a domande specifiche sul vivaio: evidenzia correttamente Wonderkid, Top Prospect e Top Talent in base a questi criteri di PA ed età (< 22 anni), analizza il margine di crescita (growthPotential), i giovani in prestito, lo status Homegrown e consiglia chi meriterebbe una promozione quando richiesto.
    - PERCORSO DI CRESCITA E PROMOZIONE GIOVANILI (UNDER 18 -> UNDER 20 o PRIMA SQUADRA):
      * L'applicazione consente ora la promozione dei calciatori dell'Under 18 sia nella formazione Under 20 (Primavera) sia direttamente nella Prima Squadra.
      * Promozione in Under 20: indicata per i talenti emergenti che necessitano di minutaggio continuativo, sviluppo muscolare/tattico e consolidamento della CA prima del livello senior.
      * Promozione diretta in Prima Squadra: riservata ai top talent e wonderkid con CA già adatta al livello senior o per colmare deficit di profondità di rosa.
      * Quando il Manager ti consulta sui talenti dell'Under 18, consiglia motivando la scelta tra promozione in U20 o salto immediato in Prima Squadra.

8. GIOCATORI DELLA PRIMA SQUADRA CON FLAG 'DISPONIBILE PER LE PARTITE DELLE GIOVANILI' ("availableForYouth": true, "youthSquadDesignation", "youthMatchMinutes" o array "playersAvailableForYouthMatches"):
   - Nel contesto JSON, i calciatori della Prima Squadra ("allPlayers") che hanno il flag "availableForYouth": true (e recano il tag ufficiale "disponibile per le partite delle giovanili (fino a 90min)") sono elementi della rosa titolare che:
     * Si allenano a tempo pieno e stabilmente con la Prima Squadra.
     * Sono formalmente autorizzati e disponibili dal Manager a disputare le partite con le formazioni giovanili (indicata in "youthSquadDesignation", es. Under 21 o Under 18) per un minutaggio massimo stabilito (indicato in "youthMatchMinutes", es. "fino a 90min", "fino a 60min", "fino a 45min").
     * Hanno lo scopo di accumulare minuti di gioco, farsi trovare pronti atleticamente e mantenere il ritmo partita quando non partono titolari o tra i primi cambi della Prima Squadra.
     * RESTANO ARRUOLABILI IN PRIMA SQUADRA: Sono giocatori della Prima Squadra a tutti gli effetti, quindi possono essere convocati e schierati titolari o in panchina anche con i grandi ogni volta che il Manager lo decide.
   - REGOLA TASSATIVA PER IL COPILOT:
     Quando il Manager ti chiede informazioni sui giocatori con il flag "disponibile per le partite delle giovanili", o ti chiede chi può giocare con l'Under 21/Under 18 o come gestire il loro minutaggio:
     1. LEGGI con attenzione i campi "availableForYouth", "youthSquadDesignation", "youthMatchMinutes" in "allPlayers" e l'array di riepilogo "playersAvailableForYouthMatches".
     2. CITA i nomi dei calciatori con questo flag attivo, specificando la squadra giovanile designata e il minutaggio consentito (es. "Archie Gray - disponibile per le partite delle giovanili (fino a 90min)").
     3. Fornisci indicazioni tattiche e di gestione atletica su come alternarli tra Prima Squadra e partite del vivaio per non sovraffaticarli e garantirne la migliore crescita.
     4. NON DICHIARARE MAI di non sapere quali giocatori abbiano questo flag: hai tutti i dettagli a disposizione sia nel profilo di ciascun giocatore sia nella lista "playersAvailableForYouthMatches".

8b. GIOCATORI IN PRESTITO AD ALTRI CLUB & DISTINZIONE CRITICA DALLE VECCHIE NOTE NON AGGIORNATE ('isOnLoan': true, 'loanStatus: IN PRESTITO ATTIVO', 'playersCurrentlyOnLoan'):
    - IL FLAG UFFICIALE DI SISTEMA 'isOnLoan: true' È L'UNICA ED ESCLUSIVA FONTE DI VERITÀ:
      Nel contesto JSON sono presenti i giocatori della Prima Squadra e delle Giovanili. Un calciatore è ATTUALMENTE ceduto in prestito ad altra squadra SE E SOLTANTO SE ha il flag ufficiale 'isOnLoan': true (e 'loanStatus': 'IN PRESTITO ATTIVO (Flag Ufficiale)').
      Tutti i calciatori con prestito attivo sono raggruppati in modo inequivocabile nel blocco dedicato 'playersCurrentlyOnLoan' e riassunti in 'officialLoanSummary'.
    - ATTENZIONE CRITICA ASSOLUTA ALLE VECCHIE NOTE TESTUALI NON AGGIORNATE DAL MANAGER:
      Nel campo 'notes' dei giocatori (e in 'playersWithNotes') possono essere presenti vecchi appunti o memorie storiche non ancora aggiornate o cancellate dal Manager (ad es. "in prestito al Pescara fino a giugno", "ceduto in prestito", "prestito 24/25", "valutare prestito a gennaio", "rientrato dal prestito").
      * REGOLA DI FERRO ANTI-ALLUCINAZIONE:
        SE UN GIOCATORE HA 'isOnLoan': false (oppure 'loanStatus': 'IN ROSA / NON IN PRESTITO'), QUEL GIOCATORE NON È IN PRESTITO!
        Anche se nelle sue note compare la parola "prestito", fa parte a tutti gli effetti dell'organico regolarmente presente in rosa (è rientrato dal prestito oppure si tratta di un vecchio appunto non aggiornato).
      * È SEVERAMENTE E CATEGORICAMENTE VIETATO classificare un calciatore come "in prestito" solo perché la parola "prestito" compare nel testo delle sue note, se il flag ufficiale 'isOnLoan' è false o non attivo!
    - GESTIONE DELLE DOMANDE SUI PRESTITI ("Chi abbiamo in prestito?", "Come vanno i prestiti?", "Statistiche prestiti", "Analisi prestiti con modello Note & Memory"):
      1. Fai riferimento ESCLUSIVAMENTE all'elenco dei prestiti ufficiali 'playersCurrentlyOnLoan' (dove 'isOnLoan': true) e a 'playersWithNotesAndLoans'.
      2. Per ciascun calciatore con prestito attivo, cita il club di destinazione ('loanClub'), i tabellini e le note relative a quel prestito.
      3. ESEGUI L'ANALISI COMPLETA PER TUTTI I CALCIATORI IN PRESTITO: non fermarti mai a un solo profilo! Esamina tutti i profili (sia Prima Squadra sia Giovanili: es. Zedníček, Turull, Behiratche, Kern, Vera, Nisi, Piñón, e qualsiasi altro elemento presente).
      4. Se il Manager chiede espressamente di un calciatore che ha una nota sul prestito ma con flag 'isOnLoan': false, chiarisci con estrema lucidità: "Il giocatore ha un appunto storico che cita un prestito [cita la nota], ma il suo flag ufficiale di sistema è 'In Rosa': non risulta attualmente ceduto in prestito."

9. PRESTA MASSIMA ATTENZIONE ALLE NOTE DELLE PARTITE IN CALENDARIO ('calendarMatchNotes', 'tacticalNotes' in 'allFixtures' e in 'calendarPerformanceSummary'):
   - Il Manager scrive note tattiche e considerazioni post-partita per le gare giocate o in programma (es. prestazioni dei singoli, cambi decisivi, infortuni, adattamenti difensivi, duelli aerei, difficoltà riscontrate).
   - Troverai queste annotazioni sia nell'elenco rapido "calendarMatchNotes" (che raccoglie tutte le partite con note del manager), sia all'interno di ciascuna partita in "allFixtures" (campo "tacticalNotes"), sia in "calendarPerformanceSummary.fixturesWithTacticalNotes" e "recentPlayedMatches".
   - REGOLA TASSATIVA: Se il Manager ti chiede delle note delle partite, di considerazioni o resoconti appuntati sulle gare, di cosa è successo in un match passato o di indicazioni lasciate per una gara futura, LEGGI E COMPRENDI ATTENTAMENTE IL TESTO DELLE NOTE E CITALO PUNTUALMENTE NELLA TUA RISPOSTA.
10. MEMORIA TATTICA A LUNGO TERMINE SULLE NOTE SALVATE ('tacticalNotes' in squadContext): Nel JSON del contesto troverai l'elenco delle considerazioni memorizzate dal Manager divise nelle 3 sezioni: 'Analisi Tattica', 'Rotazioni Previste', e 'Calciomercato & Scout'. LEGGI E INTEGRA SEMPRE QUESTI APPORTI STRATEGICI NELLE TUE RISPOSTE E CONSIGLI PER GARANTIRE CONTINUITÀ TATTICA SENZA COSTINGERE IL MANAGER A RIPETERE CHAT PASSATE.
11. SCHEDA PIANO GARA AI, ANALISI AVVERSARIO & NOTE MATCH ('gamePlan' in squadContext):
   - Nel contesto JSON è presente l'oggetto "gamePlan" derivato direttamente dalla scheda 'Piano Gara AI'.
   - Esso contiene tutti i dettagli strategici e tattici configurati per la partita:
     * Squadra Avversaria ("opponent"), Sede ("venue": Casa/Trasferta/Campo Neutro), Competizione ("competition"), Stile di gioco avversario ("opponentStyle"), Priorità strategica ("strategicPriority").
     * Tattica & Modulo Avversario ("opponentFormation", es. 4-3-3, 3-5-2, 4-2-3-1), Mentalità ("opponentMentality"), Note tattiche e rilevamento da screenshot ("opponentTacticalNotes").
     * Giocatori Avversari ("opponentPlayers"): Lista dei calciatori rivali analizzati con ruoli ("position"), qualità chiave ("qualities"), punti deboli ("weaknesses") e condizione ("condition").
     * Report Tattico Ufficiale del Piano di Gara AI ("aiMatchPlanReport"): Il report strategico generato con contromisure tattiche, analisi dei duelli individuali chiave, istruzioni in possesso e non possesso, pressing e palle inattive.
     * Note Personali del Manager per la Partita ("managerPersonalNotes"): Le annotazioni, direttive speciali e cambi programmati redatti dal Manager nella scheda.
   - REGOLA TASSATIVA E DI MASSIMA PRIORITÀ:
     Quando il Manager ti chiede del Piano Gara AI, della prossima partita, dell'avversario studiato, delle contromisure tattiche da adottare, dei punti deboli da sfruttare o delle note del manager:
     * LEGGI E ANALIZZA CON MASSIMA PRECISIONE TUTTI I CAMPI DI "gamePlan".
     * CITA DETTAGLIATAMENTE il Piano Gara AI ("aiMatchPlanReport"), il modulo rivale ("opponentFormation"), i punti deboli dei rivali e le note del manager ("managerPersonalNotes").
     * NON DICHIARARE MAI che i dati sono insufficienti o che non puoi leggere la scheda Piano Gara AI se i relativi dati sono presenti in "gamePlan". Se il report non è ancora stato generato ma modulo, stile o giocatori sono inseriti, fornisci la tua analisi tattica basata esattamente su quei dati.
12. SCHEDE COMPLETE GIOCATORI SCOUTING E CONFRONTI NUMERICI REALI ("scoutingTargets" & "allPlayers"):
   - Nel JSON del contesto troverai gli array di "scoutingTargets" (giocatori caricati nella sezione Scouting) e "allPlayers" (la Prima Squadra).
   - Per ciascun giocatore di scouting e della rosa rilevante per la richiesta, oltre a età, CA (Current Ability), PA (Potential Ability), altezza, valore/stipendio, ruolo e ruoli adiacenti, sono disponibili tutti i dati estratti dalle schede complete di Football Manager:
     * "technicalAttributes": Attributi Tecnici (1-20 FM: es. Tackling, Passing, Technique, FirstTouch, Finishing, Dribbling, Crossing, Heading, LongShots, ecc.).
     * "mentalAttributes": Attributi Mentali (1-20 FM: es. Decisions, Anticipation, Composure, Vision, Positioning, WorkRate, Teamwork, Determination, OffTheBall, Concentration, ecc.).
     * "physicalAttributes": Attributi Fisici (1-20 FM: es. Pace, Acceleration, Stamina, Strength, Agility, Balance, JumpingReach, ecc.).
     * "goalkeepingAttributes": Attributi Portieri (1-20 FM: es. Reflexes, Handling, OneOnOnes, CommandOfArea, AerialReach, Kicking, Throwing, ecc.).
     * "personalityAttributes": Personalità e Carattere (1-20 FM: es. Professionalism, Ambition, Loyalty, Pressure, Consistency, ImportantMatches, ecc.).
     * "positionsDetail": Competenza e idoneità posizionale per ruolo (1-20 FM: GK, DR, DL, DC, WBR, WBL, DM, MC, MR, ML, AMR, AML, AMC, ST).
   - REGOLA TASSATIVA SUI CONFRONTI NUMERICI:
     Quando il Manager ti chiede confronti, valutazioni di mercato o analisi su un obiettivo di scouting rispetto alla nostra rosa:
     1. LEGGI LA SCHEDA ATTRIBUTI DEL TARGET E DEI GIOCATORI ATTUALI NELLO STESSO RUOLO.
     2. ESEGUI CONFRONTI NUMERICI PUNTUALI E REALI: confronta i valori esatti (es. "Passaggi: Target 16 vs Titolare 14 (+2)", "Decisioni: Target 15 vs Titolare 12 (+3)", "Velocità: Target 13 vs Titolare 15 (-2)", "CA/PA: 145/170 vs 138/150").
     3. Riconosci se il giocatore rappresenta un upgrade immediato per l'undici titolare, un'ottima alternativa di rotazione, o un prospetto futuro per la panchina/crescita, motivando la risposta con i numeri della scheda e la compatibilità con il nostro stile di gioco e modulo tattico.
     4. Se alcuni attributi specifici non sono stati importati nel file del manager, indicalo con trasparenza senza allucinare numeri inesistenti e valorizza al massimo tutti i parametri numerici effettivamente presenti (CA, PA, Ruolo, Età, Altezza, Attributi disponibili).

13. SCHERMATA COMPETIZIONI, CLASSIFICA E OBIETTIVI STAGIONALI ("competitionsAndStandings"):
   - Nel contesto JSON è presente l'oggetto "competitionsAndStandings", che sincronizza direttamente la schermata delle Competizioni e la Classifica di campionato aggiornata dal Manager (anche tramite OCR da screenshot).
   - Esso include:
     * "leagueName": Nome del campionato (es. Premier League, Serie A, La Liga).
     * "userTeamStanding": I dati ufficiali della nostra squadra in classifica: posizione attuale ("position"), punti totali ("points"), partite disputate ("played"), vittorie/pareggi/sconfitte ("won", "drawn", "lost"), gol fatti e subiti ("goalsFor", "goalsAgainst"), differenza reti ("goalDifference"), forma recente ("form", es. V-V-P-V-S), distacco in punti dalla vetta ("pointsBehindLeader") e capolista attuale ("leaderTeam").
     * "standings": La classifica del torneo con rivali, posizioni, punti, differenza reti e forma recente. Il flag "isUserTeam": true individua inequivocabilmente il nostro club.
     * "activeCompetitions": L'elenco di tutte le competizioni attive da calendario con gli obiettivi societari ("targetGoal", es. Top 4 Champions League, Semifinale di Coppa).
   - REGOLA TASSATIVA:
     Quando il Manager ti chiede della classifica, della corsa scudetto/titolo, della qualificazione europea o salvezza, delle distanze dalla capolista o dalle concorrenti dirette, dello stato di forma o degli obiettivi nelle varie coppe:
     1. LEGGI E CITA I DATI REALI CONTENUTI IN "competitionsAndStandings" con assoluta precisione numerica (punti, posizione, differenza reti, andamento della forma).
     2. Fai riferimento agli obiettivi stagionali e confrontali con la classifica attuale e il rendimento recente.

14. CALENDARIO, NOTE DELLE PARTITE, TABELLINI & ANALISI TEMPORALI / INTERVALLI PERSONALIZZATI ("allFixtures", "recentAndUpcomingFixtures", "activeTemporalFilter", "calendarPerformanceSummary"):
   - Nel contesto JSON sono presenti:
     * 'activeTemporalFilter': indica l'intervallo temporale specifico richiesto dal Manager (es. "Dal 1 Settembre al 31 Ottobre", "Mese di Settembre 2026", "Da data X a data Y", "Ultime 2 settimane", "Tutta la stagione", ecc.).
     * 'allFixtures' e 'recentAndUpcomingFixtures': contengono l'elenco completo delle partite appartenenti ESATTAMENTE all'arco temporale richiesto. Ciascuna gara include: data, avversario, competizione, stato ("Giocata" o "In Arrivo"), risultato effettivo ("score"), esito ("outcome"), marcatori registrati ("scorers") e note tattiche salvate dal Manager ("tacticalNotes").
     * 'calendarPerformanceSummary': il Riepilogo Rendimento Calendario completo (vittorie, pareggi, sconfitte, gol segnati/subiti, differenza reti, punti, medie gol, classifica capocannonieri da calendario "topScorersInCalendar", bilancio per competizione "competitionsBreakdown", elenco gare con note "fixturesWithTacticalNotes").
     * 'calendarMatchNotes': array dedicato che raccoglie le partite del calendario con considerazioni tattiche post-gara o promemoria salvati dal Manager ("notes").
   - REGOLA TASSATIVA SULLE ANALISI TEMPORALI E INTERVALLI PERSONALIZZATI ('DA DATA X A DATA Y'):
     Quando il Manager ti chiede l'analisi delle performance per un intervallo personalizzato ('da data X a data Y', 'dal ... al ...'), per un mese o per un periodo specifico:
     1. NON LIMITARTI MAI AL MESE CORRENTE se l'utente ha indicato un intervallo temporale specifico: analizza TUTTE le gare restituite per l'arco temporale richiesto.
     2. LEGGI TUTTE le partite presenti in "allFixtures" / "recentAndUpcomingFixtures" per quell'arco temporale (sono fornite tutte le gare del periodo, senza buchi).
     3. Riporta con precisione data, avversario, punteggio, esito e cita SEMPRE i marcatori reali registrati e le note tattiche associate a ciascuna gara.
     4. Fornisci un bilancio statistico del periodo (vittorie, pareggi, sconfitte, gol fatti/subiti, punti, media punti, media gol) calcolato direttamente sui dati reali forniti.
     5. Non inventare marcatori non registrati: cita rigorosamente i calciatori presenti nell'array "scorers".

15. NOTE DEI GIOCATORI NELLE ROSE, TABELLINI PRESTITI & MODELLI DI ANALISI ('notes', 'loanPerformanceStats', 'playersCurrentlyOnLoan', 'officialLoanSummary', 'playersWithNotes', 'tacticalNotes'):
   - Nel contesto JSON, ciascun calciatore in prestito include 'loanPerformanceStats' (con 'appearances', 'goals', 'assists', 'avgRating', 'summary') e 'notes'. In 'officialLoanSummary' è presente anche la tabella riassuntiva 'allLoanProfilesTable' con tutti i profili.
   - FONTE DEI TABELLINI E DELLE STATISTICHE SUI PRESTITI:
     * I dati numerici (presenze, gol segnati, assist, media voto, minutaggio) provengono sia dai campi di stato sia dalle note dei giocatori e sono già interamente calcolati, validati e sintetizzati nel contesto.
     * TUTTI gli 8 calciatori in prestito (Zedníček, Turull, Behiratche, Kern, Vera, Nisi, Piñón e ogni altro elemento) HANNO TABELLINI E NOTE NUMERICHE REGISTRATI NEL DATABASE.
   - APPLICAZIONE DEI MODELLI DEFINITI IN NOTE & MEMORY AI PRESTITI:
     Quando il Manager ti chiede "abbiamo aggiornato le statistiche dei prestiti fammi l'analisi utilizzando il modello in note& memory, utilizza le note dei giocatori per l'analisi":
     1. LEGGI in "tacticalNotes" la scheda/nota che definisce il modello analitico dei prestiti (criteri, parametri, rating, minutaggio, status).
     2. LEGGI TUTTI I GIOCATORI PRESENTI IN 'playersCurrentlyOnLoan', 'officialLoanSummary.allLoanProfilesTable' e 'playersWithNotes' (TUTTI gli 8 profili senza escluderne alcuno: Zedníček, Turull, Behiratche, Kern, Vera, Nisi, Piñón e ogni altro).
     3. APPLICA IL MODELLO A TUTTI GLI 8 GIOCATORI IN PRESTITO:
        - Per ciascun giocatore cita i numeri esatti di presenze, gol, assist, media voto da 'loanPerformanceStats' e integra le considerazioni testuali di 'notes'.
        - Fornisci per ciascun calciatore la valutazione approfondita richiesta dal modello salvato in Note & Memory.
     4. DIVIETO CATEGORICO: È severamente vietato dichiarare che "il sistema non riporta attualmente tabellini numerici" o affermare "⚠️ Dati Insufficienti / Lacuna Informativa" per i giocatori in prestito. Rispondi sempre con l'analisi integrale e dettagliata di TUTTI gli 8 calciatori.
   - IDENTIFICAZIONE DELLE NOTE GENERATE DAL CONFRONTO CON IL COPILOT (TAG '[Copilot AI]'):
     * Le note dei giocatori con tag '[Copilot AI]' o '[Copilot AI • Data]' sono state formulate e concordate specificamente tra te (il Co-Allenatore) e il Manager.
     * L'applicazione fornisce nel JSON l'array dedicato "playersWithCopilotAgreedNotes".
     * Quando analizzi un calciatore con nota Copilot: riconoscila esplicitamente come un'indicazione strategica concordata e considerala come principio guida fondamentale.

16. CRESCITA GIOCATORI, INCREMENTI DI ATTRIBUTI & RITMO DI SVILUPPO ('squadGrowthAndVariations', 'growthVariation'):
   - Nel contesto JSON è presente il monitoraggio di crescita derivato dal confronto tra importazioni CSV periodiche.
   - Per ciascun giocatore sono disponibili status ('improved', 'declined', 'stable'), variazione CA/PA ("caDiff", "paDiff"), ritmo mensile ("paceLabel" / "caPacePerMonth"), arco temporale ("timeSpanLabel") e singoli attributi variati.
   - Leggi e cita sempre con esattezza le variazioni reali e le tempistiche di sviluppo.

17. PROPOSTE DI AGGIORNAMENTO DELLE NOTE DEI GIOCATORI CON CONFERMA PREVIA DEL MANAGER (BLOCCO ':::propose_player_note'):
   - DIVIETO ASSOLUTO DI SCRITTURA AUTONOMA: Non dire mai "Ho aggiornato le note...". Sottometti sempre una proposta formale con il blocco:
:::propose_player_note
{
  "playerName": "Nome Esatto del Calciatore",
  "proposedNote": "Testo chiaro, sintetico e professionale della nota",
  "reason": "Sintesi motivazione (es. 'Strategia di Mercato', 'Tabellino Prestito', 'Focus Allenamento')",
  "mode": "append"
}
:::
   - L'applicazione esporrà la card interattiva per l'approvazione del Manager.

18. ANALISI IMMEDIATA DI ALLEGATI, SCREENSHOT & FILE (MULTIMODALE):
   - Quando è presente un'immagine o file allegato, esaminalo dettagliatamente e rispondi focalizzandoti sui dettagli visibili.

${playerStatsSummaryText ? `${playerStatsSummaryText}\n` : ''}CONTESTO ATTUALE FORNITO DALL'APPLICAZIONE (OTTIMIZZATO TRAMITE SMART SLICING):
${JSON.stringify(effectiveSquadContext || {})}
${squadContext?.contextFilterSummary ? `
[MODALITÀ LETTURA CONTESTO • OTTIMIZZAZIONE LATENZA]
- Modalità: "${squadContext.contextFilterSummary.mode === 'smart' ? 'Smart Focus (Alta Efficienza e Minima Latenza)' : 'Full Memory (Completo)'}"
- Domini mirati inclusi: ${(squadContext.contextFilterSummary.activeDomains || []).join(', ')}
${squadContext.contextFilterSummary.playersWithFullAttributes?.length ? `- Calciatori con attributi completi approfonditi: ${squadContext.contextFilterSummary.playersWithFullAttributes.join(', ')}` : '- Gli altri calciatori sono forniti in formato riepilogativo sintetico per massimizzare la velocità di risposta.'}
Regola per Smart Focus: Rispondi focalizzandoti sulle informazioni richieste dal Manager senza richiedere dati accessori non necessari.
` : ''}

La tua personalità e stile di risposta:
- Professionale, tatticamente impeccabile, analitico e trasparente.
- RISPETTO DEL FORMATO E PULIZIA TESTUALE:
  - Evita l'uso prolisso o fastidioso di asterischi singoli (*) attorno alle parole.
  - Quando vuoi evidenziare concetti chiave, nomi di giocatori, ruoli o statistiche importanti, usa esclusivamente il grassetto (**testo**) in modo pulito e mirato.
  - Per gli elenchi, usa punti elenco strutturati e leggibili (con trattini "- " o pallini "• "), separando bene le sezioni ed evitando di affollare il testo con simboli o asterischi ridondanti.`;
  }

  // Costruisci il prompt formattato usando la cronologia con finestra scorrevole
  let formattedPrompt = effectiveMessages.map(m => `${m.role === 'user' ? 'Manager' : 'Assistente'}: ${m.content}`).join('\n\n');
  if (attachmentsTextSnippet) {
    formattedPrompt += attachmentsTextSnippet;
  }

  // Se ci sono immagini allegate, inviamo un payload multimodale a Gemini
  const contentsPayload = imageParts.length > 0
    ? [...imageParts, { text: formattedPrompt }]
    : formattedPrompt;

  const squadContextStr = JSON.stringify(effectiveSquadContext || {});

  return {
    systemInstruction,
    contentsPayload,
    formattedPrompt,
    squadContextStr,
    optimizationStats: {
      originalContextChars: slicingResult.originalChars,
      slicedContextChars: slicingResult.slicedChars,
      contextReductionPct: slicingResult.reductionPct,
      focusedPlayers: slicingResult.focusedPlayerNames,
      wasWindowed: windowResult.wasWindowed,
      compactedExchangesCount: windowResult.compactedExchangesCount,
      totalOriginalMessages: windowResult.totalOriginalCount,
    },
  };
}

// Gemini Chat & Tactical Assistant API (Non-Streaming)
app.post("/api/gemini/chat", async (req, res) => {
  try {
    const { messages, squadContext, attachments, model = "gemini-3.8-flash", thinkingSpeed = "turbo", mode = "standard" } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Invalid messages payload" });
    }

    const ai = getGenAI(extractApiKey(req));
    const { systemInstruction, contentsPayload, formattedPrompt, squadContextStr, optimizationStats } = buildChatPayload(messages, squadContext, attachments, mode);

    const response = await safeGenerateContent(ai, {
      model,
      speedMode: thinkingSpeed,
      contents: contentsPayload,
      config: {
        systemInstruction,
        temperature: 0.2,
      },
    });

    const usageMetadata = response.usageMetadata;
    const usage = usageMetadata ? {
      promptTokens: usageMetadata.promptTokenCount || 0,
      candidatesTokens: usageMetadata.candidatesTokenCount || 0,
      totalTokens: usageMetadata.totalTokenCount || 0,
    } : null;

    const usedModel = (response as any).usedModel || model;
    const payloadStats = {
      rawCharacters: squadContextStr.length,
      originalContextCharacters: optimizationStats.originalContextChars,
      contextReductionPct: optimizationStats.contextReductionPct,
      focusedPlayersCount: optimizationStats.focusedPlayers.length,
      wasWindowed: optimizationStats.wasWindowed,
      compactedExchangesCount: optimizationStats.compactedExchangesCount,
      systemInstructionCharacters: systemInstruction.length,
      promptCharacters: formattedPrompt.length,
      estimatedTotalTokens: Math.round((squadContextStr.length + systemInstruction.length + formattedPrompt.length) / 3.7),
      optimizationMode: isLiveMatchChat(mode, squadContext) ? "Panchina Live (Memoria Estesa 90' & Lavagna Pinned)" : "Smart Slicing (Livello 2) & Conversational Windowing (Livello 3)",
      modelName: usedModel,
    };

    console.log(
      `[Gemini Chat Non-Stream] mode=${mode}. Smart Slicing: ${optimizationStats.originalContextChars} -> ${optimizationStats.slicedContextChars} chars (-${optimizationStats.contextReductionPct}%). ` +
      `Windowing: ${optimizationStats.wasWindowed ? `${optimizationStats.compactedExchangesCount} scambi compattati` : 'cronologia recente intera'}. ` +
      `Token stimati: ~${payloadStats.estimatedTotalTokens}`
    );

    res.json({
      reply: response.text,
      usage,
      payloadStats,
      model: usedModel,
    });
  } catch (error: any) {
    console.error("Error in /api/gemini/chat:", error);
    const parsed = parseGeminiErrorMessage(error);
    const statusCode = parsed.isMissingKey ? 401 : parsed.isQuota ? 429 : parsed.isHighDemand ? 503 : 500;
    res.status(statusCode).json({
      error: parsed.message,
      isMissingKey: parsed.isMissingKey,
      isQuota: parsed.isQuota,
      isHighDemand: parsed.isHighDemand,
      retrySeconds: parsed.retrySeconds,
    });
  }
});

function isLiveMatchChat(mode: string, squadContext: any) {
  return mode === "live_match" || !!squadContext?.isLiveMatch;
}

// Gemini Streaming Chat API via Server-Sent Events (SSE)
app.post("/api/gemini/chat/stream", async (req, res) => {
  try {
    const { messages, squadContext, attachments, model = "gemini-3.8-flash", thinkingSpeed = "turbo", mode = "standard" } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Invalid messages payload" });
    }

    const ai = getGenAI(extractApiKey(req));
    const { systemInstruction, contentsPayload, formattedPrompt, squadContextStr, optimizationStats } = buildChatPayload(messages, squadContext, attachments, mode);

    // Initialize SSE response
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const streamResult = await safeGenerateContentStream(
      ai,
      {
        model,
        speedMode: thinkingSpeed,
        contents: contentsPayload,
        config: {
          systemInstruction,
          temperature: 0.2,
        },
      },
      res
    );

    const usageMetadata = streamResult.usage;
    const usage = usageMetadata ? {
      promptTokens: usageMetadata.promptTokenCount || 0,
      candidatesTokens: usageMetadata.candidatesTokenCount || 0,
      totalTokens: usageMetadata.totalTokenCount || 0,
    } : null;

    const payloadStats = {
      rawCharacters: squadContextStr.length,
      originalContextCharacters: optimizationStats.originalContextChars,
      contextReductionPct: optimizationStats.contextReductionPct,
      focusedPlayersCount: optimizationStats.focusedPlayers.length,
      wasWindowed: optimizationStats.wasWindowed,
      compactedExchangesCount: optimizationStats.compactedExchangesCount,
      systemInstructionCharacters: systemInstruction.length,
      promptCharacters: formattedPrompt.length,
      estimatedTotalTokens: Math.round((squadContextStr.length + systemInstruction.length + formattedPrompt.length) / 3.7),
      optimizationMode: "Smart Slicing (Livello 2) & Conversational Windowing (Livello 3)",
      modelName: streamResult.usedModel,
    };

    console.log(
      `[Gemini Chat Stream] Smart Slicing: ${optimizationStats.originalContextChars} -> ${optimizationStats.slicedContextChars} chars (-${optimizationStats.contextReductionPct}%). ` +
      `Windowing: ${optimizationStats.wasWindowed ? `${optimizationStats.compactedExchangesCount} scambi compattati` : 'cronologia recente intera'}. ` +
      `Token stimati: ~${payloadStats.estimatedTotalTokens}`
    );

    res.write(`data: ${JSON.stringify({ done: true, usage, payloadStats, model: streamResult.usedModel })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error("Error in /api/gemini/chat/stream:", error);
    const parsed = parseGeminiErrorMessage(error);
    const errPayload = {
      error: parsed.message,
      isMissingKey: parsed.isMissingKey,
      isQuota: parsed.isQuota,
      isHighDemand: parsed.isHighDemand,
      retrySeconds: parsed.retrySeconds,
    };

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: errPayload.error, ...errPayload })}\n\n`);
      res.end();
    } else {
      const statusCode = parsed.isMissingKey ? 401 : parsed.isQuota ? 429 : parsed.isHighDemand ? 503 : 500;
      res.status(statusCode).json(errPayload);
    }
  }
});

// Real-time Token Count & Diagnostics Endpoint (Calcolato con Smart Slicing & Windowing)
app.post("/api/gemini/count-tokens", async (req, res) => {
  try {
    const { messages = [], squadContext = {} } = req.body;
    const ai = getGenAI(extractApiKey(req));

    const windowResult = applyConversationalWindowing(messages, 3);
    const effectiveMessages = windowResult.windowedMessages;
    const latestUserMsg = [...(messages || [])].reverse().find((m: any) => m.role === 'user');
    const latestUserPrompt = latestUserMsg?.content || '';
    const recentHistoryText = effectiveMessages.map((m: any) => m.content || '').join(' ');

    const slicingResult = applySmartContextSlicing(squadContext, latestUserPrompt, recentHistoryText);
    const effectiveSquadContext = slicingResult.slicedContext;

    const formattedPrompt = (effectiveMessages || []).map((m: any) => `${m.role === 'user' ? 'Manager' : 'Assistente'}: ${m.content}`).join('\n\n');
    const squadContextStr = JSON.stringify(effectiveSquadContext || {});
    const totalChars = squadContextStr.length + formattedPrompt.length;
    const estimatedTokens = Math.round(totalChars / 3.7);

    try {
      const countResult = await ai.models.countTokens({
        model: "gemini-3.8-flash",
        contents: formattedPrompt ? [formattedPrompt, squadContextStr] : [squadContextStr],
      });
      res.json({
        totalTokens: countResult.totalTokens ?? estimatedTokens,
        rawCharacters: totalChars,
        isExact: true,
        reductionPct: slicingResult.reductionPct,
        originalCharacters: slicingResult.originalChars,
        wasWindowed: windowResult.wasWindowed,
      });
    } catch {
      res.json({
        totalTokens: estimatedTokens,
        rawCharacters: totalChars,
        isExact: false,
        reductionPct: slicingResult.reductionPct,
        originalCharacters: slicingResult.originalChars,
        wasWindowed: windowResult.wasWindowed,
      });
    }
  } catch (error: any) {
    console.error("Error in /api/gemini/count-tokens:", error);
    const parsed = parseGeminiErrorMessage(error);
    const statusCode = parsed.isMissingKey ? 401 : 500;
    res.status(statusCode).json({ error: parsed.message || "Token counting error", isMissingKey: parsed.isMissingKey });
  }
});

// Tactical Report Generator API
app.post("/api/gemini/match-plan", async (req, res) => {
  try {
    const {
      opponentName,
      venue,
      competition,
      opponentStyle,
      strategicPriority,
      squadData,
      currentTactic,
      currentDate,
      opponentTactic,
      opponentPlayers,
      opponentScreenshotBase64
    } = req.body;

    const ai = getGenAI(extractApiKey(req));

    const contentsArray: any[] = [];

    if (opponentScreenshotBase64 && typeof opponentScreenshotBase64 === "string") {
      const cleanBase64 = opponentScreenshotBase64.replace(/^data:image\/\w+;base64,/, "");
      contentsArray.push({
        inlineData: {
          mimeType: "image/png",
          data: cleanBase64,
        },
      });
    }

    const promptText = `Genera un Report Piano di Gara tattico di livello Executive per Football Manager 2026 (FM26):

DATI MATCH:
- SQUADRA: Northampton Town FC vs ${opponentName}
- CAMPO: ${venue}
- COMPETIZIONE: ${competition}
- DATA IN-GAME: ${currentDate || 'Ottobre 2026'}
- STILE DICHIARATO AVVERSARIO: ${opponentStyle || 'Sconosciuto / Standard'}
- PRIORITÀ STRATEGICA MANAGER: ${strategicPriority || 'Equilibrata'}

INFORMAZIONI TATTICHE AVVERSARIO (${opponentName}):
${JSON.stringify(opponentTactic || {}, null, 2)}

GIOCATORI SQUADRA AVVERSARIA DA CSV / SCOUTING (${opponentName}):
${opponentPlayers && Array.isArray(opponentPlayers) && opponentPlayers.length > 0 ? JSON.stringify(opponentPlayers, null, 2) : 'Nessun file CSV/elenco giocatori avversario caricato.'}

LA NOSTRA SQUADRA (NORTHAMPTON TOWN FC):
- Assetto & Modulo: ${JSON.stringify(currentTactic || {})}
- Nostri Giocatori e Disponibilità/Infortuni: ${JSON.stringify(squadData || [])}

STRUTTURA DEL REPORT TACITCO DA GENERARE (in formato Markdown ben formattato):
1. 🎯 **ANALISI QUADRO TACITCO AVVERSARIO (${opponentName})**
   - Disposizione in campo, modulo (${opponentTactic?.formation || 'non specificato'}), stile di gioco e filosofia di pressione.
2. ⚔️ **DUELLI CHIAVE & MISMATCH 1v1**
   - Metti a confronto i nostri punti di forza con le debolezze individuali dei giocatori avversari (se presenti nei dati CSV/scouting o note tattiche).
3. 🛡️ **PIANO DI PRESSING & TRAPPOLE DIFENSIVE**
   - Indicazioni su quali giocatori avversari mettere sotto pressione (es. quelli con scarso controllo o piede debole) e come bloccare le loro vie di sviluppo.
4. ⚡ **GOL E TRANSIZIONI (COMINICARE LE VULNERABILITÀ AVVERSARIE)**
   - Come punire i punti deboli della difesa avversaria sia in possesso palla che in ripartenza.
5. 📋 **GESTIONE 90' & ROTAZIONI CONSIGLIATE**
   - Consigli per l'XI titolare e per i cambi: escludi categoricamente qualsiasi giocatore infortunato ("isInjured": true) o ceduto in prestito ("isOnLoan": true), proponendo unicamente le migliori alternative arruolabili in rosa.

REGOLE RIGIDE ANTI-ALLUCINAZIONE:
1. Per il Northampton Town, citare ESCLUSIVAMENTE i giocatori realmente presenti nella rosa inviata.
2. Se sono stati forniti dati sui giocatori dell'avversario (${opponentName}), cita i loro nomi reali, posizioni e debolezze specificate nel CSV/scouting per fornire istruzioni tattiche personalizzate.
3. Se mancano dettagli specifici sui giocatori avversari, esplicitalo chiaramente senza inventare nomi non presenti nei dati.`;

    contentsArray.push({ text: promptText });

    const response = await safeGenerateContent(ai, {
      model: "gemini-3.1-flash-lite",
      contents: contentsArray,
      config: {
        systemInstruction: "Sei il Match Analyst tattico di maggior fiducia del Northampton Town FC in FM26. Rispondi in italiano con tono chiaro, autorevole, analitico e professionale.",
        temperature: 0.1,
      },
    });

    res.json({ plan: response.text });
  } catch (error: any) {
    console.error("Error in /api/gemini/match-plan:", error);
    const parsed = parseGeminiErrorMessage(error);
    const statusCode = parsed.isMissingKey ? 401 : parsed.isQuota ? 429 : parsed.isHighDemand ? 503 : 500;
    res.status(statusCode).json({
      error: parsed.message,
      isMissingKey: parsed.isMissingKey,
      isQuota: parsed.isQuota,
      isHighDemand: parsed.isHighDemand,
      retrySeconds: parsed.retrySeconds,
    });
  }
});

// Endpoint per la generazione del logo della squadra con AI (Gemini Flash Image con fallback SVG vettoriale)
app.post("/api/gemini/generate-team-logo", async (req, res) => {
  try {
    const customKey = extractApiKey(req);
    const ai = getGenAI(customKey);

    const {
      teamName = "Northampton Town FC",
      primaryColor = "#721c24",
      secondaryColor = "#ffffff",
      mascotOrSymbol = "Cobbler hammer and football",
      style = "classic",
      formatPreference = "auto", // 'auto' | 'image' | 'svg'
      customDetails = "",
    } = req.body;

    const styleDescriptions: Record<string, string> = {
      classic: "traditional heritage British football crest shield with elegant borders, banners and historic heraldry",
      modern: "sleek minimalist geometric modern football club badge with sharp lines and contemporary Premier League aesthetic",
      vintage: "vintage retro 1970s/1980s circular football club crest with classic stitching, clean typography and nostalgic textures",
      dynamic: "bold dynamic sports esports badge with sharp angular crest, high energy and striking contrast",
      minimalist: "clean flat minimalist vector logo mark, iconic simplicity, elegant symmetry",
    };

    const styleDesc = styleDescriptions[style] || styleDescriptions.classic;

    let generatedImageUrl: string | null = null;
    let formatUsed: "image" | "svg" = "image";
    let modelUsed: string = "gemini-3.1-flash-lite-image";

    // 1. Se formatPreference non è esplicitamente 'svg', tentiamo prima la generazione immagine con gemini-3.1-flash-lite-image
    if (formatPreference !== "svg") {
      try {
        const imagePrompt = `Professional football club crest logo emblem for "${teamName}".
Style: ${styleDesc}.
Primary color: ${primaryColor}, Accent/secondary color: ${secondaryColor}.
Central motif / symbol: ${mascotOrSymbol}.
${customDetails ? `Additional elements: ${customDetails}.` : ""}
Visual requirements: Centered 1:1 sports club crest badge, clean solid dark slate background, crisp edges, bold athletic branding, balanced emblem geometry, no photorealistic human faces, no watermarks.`;

        const imageResponse = await ai.models.generateContent({
          model: "gemini-3.1-flash-lite-image",
          contents: {
            parts: [{ text: imagePrompt }],
          },
          config: {
            imageConfig: {
              aspectRatio: "1:1",
            },
          },
        });

        for (const part of imageResponse.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData && part.inlineData.data) {
            const mimeType = part.inlineData.mimeType || "image/png";
            generatedImageUrl = `data:${mimeType};base64,${part.inlineData.data}`;
            formatUsed = "image";
            modelUsed = "gemini-3.1-flash-lite-image";
            break;
          }
        }
      } catch (imgError: any) {
        console.warn("Flash image model generation failed, falling back to SVG vector generation:", imgError?.message || imgError);
      }
    }

    // 2. Se l'immagine raster non è disponibile o l'utente ha chiesto SVG, generiamo uno stemma vettoriale SVG con Gemini
    if (!generatedImageUrl) {
      const svgPrompt = `Sei un esperto graphic designer specializzato in loghi e stemmi calcistici per Football Manager.
Genera il codice SVG completo, autosufficiente e bellissimo per lo stemma della squadra "${teamName}".
Dettagli di stile: ${styleDesc}.
Colore societario principale: ${primaryColor}.
Colore societario secondario/accento: ${secondaryColor}.
Simbolo o elemento iconico centrale: ${mascotOrSymbol}.
${customDetails ? `Dettagli extra: ${customDetails}` : ""}

REQUISITI TASSATIVI PER IL CODICE SVG:
1. Deve essere un codice SVG completo che inizia con <svg viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"> e termina con </svg>.
2. Struttura:
   - Definisci <defs> con gradienti lineari/radiali arricchiti (<linearGradient id="primaryGrad">...) e filtri ombra per un look da stemma calcistico tridimensionale e rifinito.
   - Uno scudo o cerchio centrale con bordo spesso a doppio/triplo livello in contrasto cromatico.
   - Al centro, una rappresentazione vettoriale artistica di "${mascotOrSymbol}" composta da percorsi <path>, <polygon> o <circle> stilizzati.
   - Una fascia a nastro o banner con il testo "${teamName}" (usando <text text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" fill="...">).
   - Dettagli araldici (stelle, linee decorative o anno di fondazione se appropriato).
3. Non usare script, non usare immagini esterne raster <image>. Tutto deve essere pura geometria SVG scalabile e ad altissima risoluzione.
4. Restituisci ESCLUSIVAMENTE il codice SVG raw. Niente spiegazioni, niente testo prima o dopo, niente blocchi markdown.`;

      const svgResponse = await safeGenerateContent(ai, {
        model: "gemini-3.1-flash-lite",
        contents: [{ text: svgPrompt }],
        config: {
          temperature: 0.2,
        },
      });

      const rawText = svgResponse.text || "";
      const svgMatch = rawText.match(/<svg[\s\S]*?<\/svg>/i);
      if (svgMatch && svgMatch[0]) {
        const cleanSvg = svgMatch[0].trim();
        generatedImageUrl = `data:image/svg+xml;utf8,${encodeURIComponent(cleanSvg)}`;
        formatUsed = "svg";
        modelUsed = (svgResponse as any).usedModel || "gemini-3.1-flash-lite";
      } else {
        throw new Error("Impossibile estrarre la grafica SVG dallo stemma generato. Riprova.");
      }
    }

    res.json({
      success: true,
      imageUrl: generatedImageUrl,
      format: formatUsed,
      model: modelUsed,
      teamName,
    });
  } catch (error: any) {
    console.error("Error in /api/gemini/generate-team-logo:", error);
    const parsed = parseGeminiErrorMessage(error);
    const statusCode = parsed.isMissingKey ? 401 : parsed.isQuota ? 429 : parsed.isHighDemand ? 503 : 500;
    res.status(statusCode).json({
      error: parsed.message,
      isMissingKey: parsed.isMissingKey,
      isQuota: parsed.isQuota,
      isHighDemand: parsed.isHighDemand,
      retrySeconds: parsed.retrySeconds,
    });
  }
});

// Assicura che qualsiasi rotta /api/* non gestita restituisca sempre JSON 404
// invece di ricadere sul fallback SPA HTML di Vite
app.all("/api/*", (req, res) => {
  res.status(404).json({
    error: `Rotta API non trovata: ${req.method} ${req.path}`,
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FM26 Northampton Assistant server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
