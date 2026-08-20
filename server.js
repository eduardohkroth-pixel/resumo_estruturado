// Resumo Estruturado — servidor de produção
// Serve o frontend estático e faz proxy seguro para a API da Anthropic.
// A chave de API fica somente no servidor (nunca vai ao navegador).

import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.MODEL || "claude-sonnet-5";
const MAX_TOKENS = Number(process.env.MAX_TOKENS || 8000);
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: "30mb" })); // PDFs em base64 podem ser grandes
app.use(express.static(path.join(__dirname, "public")));

/* ---------------- Prompt (centralizado no servidor) ---------------- */

function campoVBlock(via) {
  if (via === "rext") {
    return (
      "## CAMPO V — REPERCUSSÃO GERAL DO RECURSO EXTRAORDINÁRIO (STF)\n" +
      "A peça foi indicada como RECURSO EXTRAORDINÁRIO. Indique a demonstração da repercussão geral das questões constitucionais discutidas (art. 102, § 3º, da Constituição Federal), sob os aspectos econômico, político, social ou jurídico que ultrapassem os interesses subjetivos da causa, bem como eventual enquadramento em hipótese de repercussão geral presumida. Se a petição não trouxer preliminar de repercussão geral, registre expressamente essa ausência."
    );
  }
  if (via === "na") {
    return (
      "## CAMPO V — NÃO APLICÁVEL\n" +
      "A peça foi indicada como não sendo recurso especial nem extraordinário. Preencha o campoV exatamente com: CAMPO NÃO APLICÁVEL."
    );
  }
  return (
    "## CAMPO V — RELEVÂNCIA DO RECURSO ESPECIAL (STJ)\n" +
    "A peça foi indicada como RECURSO ESPECIAL. Indique a existência de questões relevantes do ponto de vista econômico, político, social ou jurídico que ultrapassem os interesses subjetivos do processo, ou o enquadramento da causa em hipótese de relevância presumida. Se a petição não trouxer a demonstração de relevância, registre expressamente essa ausência."
  );
}

function buildSystem(via) {
  return (
    "Você é um assistente jurídico especializado em processo nos tribunais superiores brasileiros (STJ e STF). " +
    "A partir da petição fornecida, elabore o RESUMO ESTRUTURADO exigido pelo art. 343-A do Regimento Interno do STJ e regulamentado pela Instrução Normativa STJ/GP n. 42/2026, para triagem automatizada de processos.\n\n" +
    "# REGRAS DE PREENCHIMENTO\n" +
    "1. Preencha todos os campos de modo objetivo e fiel ao corpo da petição.\n" +
    "2. É VEDADO usar remissões genéricas (\"vide razões\", \"conforme acima\") ou repetir integralmente os fundamentos da petição.\n" +
    "3. Linguagem clara, objetiva e impessoal, preferencialmente em itens curtos.\n" +
    "4. Cada campo deve ter NO MÁXIMO 3.000 caracteres, incluindo espaços.\n" +
    "5. Use apenas informações efetivamente contidas na petição. Se um dado não constar, escreva \"NÃO CONSTA NA PETIÇÃO\". NUNCA invente, presuma ou complete lacunas.\n" +
    "6. Não emita opinião jurídica nem avalie o mérito; limite-se a resumir o que a petição apresenta.\n" +
    "7. Citações de dispositivos: individualize por diploma, artigo, parágrafo, inciso e/ou alínea. Cite a Constituição como \"Constituição Federal\" e os códigos por extenso (Código de Processo Civil).\n\n" +
    "# CAMPOS\n" +
    "## CAMPO I — SÍNTESE DOS FATOS\nFatos em ordem cronológica, com partes e contexto. Havendo decisão impugnada, indique órgão prolator, data, dispositivo e fundamentos essenciais.\n\n" +
    "## CAMPO II — FUNDAMENTOS DE DIREITO\nPara cada tese, os dispositivos legais e constitucionais tidos como violados ou aplicáveis, individualizados.\n\n" +
    "## CAMPO III — PEDIDOS FORMULADOS\nPretensão final (original ou recursal) e eventuais pedidos sucessivos ou subsidiários.\n\n" +
    "## CAMPO IV — PRECEDENTES, SÚMULAS E ENUNCIADOS\nPrecedentes qualificados/vinculantes, súmulas e enunciados invocados, com número, órgão julgador e data.\n\n" +
    campoVBlock(via) + "\n\n" +
    "# SAÍDA\n" +
    "Responda EXCLUSIVAMENTE com um objeto JSON válido, sem texto antes ou depois, sem markdown, sem crases. Formato exato:\n" +
    '{"peca":"identificação sucinta da peça (natureza/classe e recorrente x recorrido)","campoI":"...","campoII":"...","campoIII":"...","campoIV":"...","campoV":"..."}'
  );
}

function parseJSON(raw) {
  let s = String(raw || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(s); } catch (e) {}
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a > -1 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e) {} }
  return null;
}

/* ---------------- Rota de geração ---------------- */

app.post("/api/generate", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: "Servidor sem ANTHROPIC_API_KEY configurada. Defina a variável de ambiente." });
  }
  const { via, petition } = req.body || {};
  if (!petition) return res.status(400).json({ error: "Petição ausente." });

  let content;
  if (petition.kind === "pdf" && petition.data) {
    content = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: petition.data } },
      { type: "text", text: "Gere o resumo estruturado da petição anexa, em JSON, conforme as regras." }
    ];
  } else if (petition.kind === "text" && petition.text) {
    content = [
      { type: "text", text: "PETIÇÃO:\n\n" + petition.text + "\n\n---\nGere o resumo estruturado desta petição, em JSON, conforme as regras." }
    ];
  } else {
    return res.status(400).json({ error: "Conteúdo da petição inválido." });
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystem(via),
        messages: [{ role: "user", content }]
      })
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: (data && data.error && data.error.message) || "Falha na API da Anthropic." });
    }
    const raw = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    const parsed = parseJSON(raw);
    if (!parsed) {
      return res.status(502).json({ error: "A resposta do modelo não pôde ser interpretada. Tente novamente." });
    }
    return res.json({ ok: true, result: parsed });
  } catch (err) {
    return res.status(500).json({ error: (err && err.message) || "Erro interno do servidor." });
  }
});

// Healthcheck simples para plataformas de deploy
app.get("/healthz", (_req, res) => res.json({ ok: true, model: MODEL }));

app.listen(PORT, () => {
  console.log(`Resumo Estruturado rodando em http://localhost:${PORT}`);
  console.log(`Modelo: ${MODEL} · max_tokens: ${MAX_TOKENS} · chave: ${API_KEY ? "configurada" : "AUSENTE"}`);
});
