# Resumo Estruturado — STJ / STF

Aplicação web que gera o **resumo estruturado** de petições exigido pelo art. 343-A do
Regimento Interno do STJ, regulamentado pela **Instrução Normativa STJ/GP n. 42/2026**.

A partir do upload de uma petição (PDF ou texto), a ferramenta produz os cinco campos do
resumo (I a V), com contagem de caracteres por campo e limite de 3.000. O usuário escolhe a
via recursal, o que define o Campo V: **relevância** (recurso especial, STJ) ou
**repercussão geral** (recurso extraordinário, STF).

A geração usa a API da Anthropic (modelo Claude). A chave de API fica **exclusivamente no
servidor** — o navegador nunca a recebe.

---

## Como funciona

```
Navegador (public/index.html)
      │  POST /api/generate  { via, petition:{ kind, data|text } }
      ▼
Servidor (server.js)  ── monta o prompt e chama ──▶  api.anthropic.com/v1/messages
      │  { ok, result:{ peca, campoI..campoV } }                (com x-api-key)
      ▼
Renderização dos 5 campos + contagem de caracteres
```

---

## Requisitos

- **Node.js 18 ou superior**
- Uma **chave de API da Anthropic** (https://console.anthropic.com)

---

## Rodando localmente

```bash
# 1. Instale as dependências
npm install

# 2. Configure a chave
cp .env.example .env
# edite o .env e cole sua ANTHROPIC_API_KEY

# 3. Carregue as variáveis e inicie
#    (Node 20.6+ suporta --env-file nativamente)
node --env-file=.env server.js
#    ou, se preferir usar o script:
#    export $(grep -v '^#' .env | xargs) && npm start
```

Acesse **http://localhost:3000**.

> Sem a variável `ANTHROPIC_API_KEY`, o servidor inicia e serve a página, mas a geração
> retorna erro pedindo a configuração da chave.

---

## Variáveis de ambiente

| Variável             | Obrigatória | Padrão              | Descrição                                              |
|----------------------|-------------|---------------------|--------------------------------------------------------|
| `ANTHROPIC_API_KEY`  | sim         | —                   | Chave da API da Anthropic.                             |
| `MODEL`              | não         | `claude-sonnet-5`   | ID do modelo. Ver docs para IDs atuais.               |
| `MAX_TOKENS`         | não         | `8000`              | Máximo de tokens de saída.                             |
| `PORT`               | não         | `3000`              | Porta do servidor.                                     |

IDs de modelo podem mudar; confira em
https://docs.claude.com/en/docs/about-claude/models antes de publicar.

---

## Deploy

A aplicação é um servidor Node único que serve o frontend e a API. Funciona em qualquer
plataforma que rode Node ou containers.

### Render / Railway / Fly.io (Node)

1. Suba este diretório para um repositório Git.
2. Crie um novo serviço "Web Service" apontando para o repositório.
3. Build command: `npm install` · Start command: `npm start`.
4. Defina a variável de ambiente `ANTHROPIC_API_KEY` (e, se quiser, `MODEL`).
5. A plataforma injeta `PORT` automaticamente — o servidor já a respeita.

### Docker (VPS, Cloud Run, etc.)

```bash
docker build -t resumo-estruturado .
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=suachave resumo-estruturado
```

### VPS com Node (systemd/pm2)

```bash
npm install --omit=dev
export ANTHROPIC_API_KEY=suachave
pm2 start server.js --name resumo-estruturado
```

Coloque um proxy reverso (Nginx/Caddy) com HTTPS na frente e aponte seu domínio.

---

## Segurança e conformidade (importante para uso jurídico)

- **Confidencialidade / sigilo.** Petições podem conter dados pessoais e informações
  sigilosas. Ao usar a ferramenta, o inteiro teor é enviado à API da Anthropic para
  processamento. Avalie a adequação à **LGPD** e ao dever de sigilo do seu caso, e
  considere os termos de uso de dados da Anthropic (incluindo opções corporativas de
  retenção zero de dados) antes de tramitar material sigiloso.
- **Chave protegida.** A chave nunca chega ao cliente; mantenha o `.env` fora do controle
  de versão (já incluído no `.gitignore`).
- **Sem armazenamento.** O servidor não persiste petições nem resultados; tudo ocorre em
  memória durante a requisição. Se quiser histórico, será necessário implementar
  armazenamento próprio (e reavaliar a conformidade).
- **Limite de tamanho.** O corpo da requisição é limitado a 30 MB (PDFs em base64).
- **Custos.** Cada geração consome tokens e gera custo na sua conta da Anthropic. Considere
  autenticação/limitação de acesso se for publicar para muitos usuários.

---

## Aviso

O resumo estruturado é de **responsabilidade exclusiva da parte ou do advogado**
(art. 4º da IN STJ/GP n. 42/2026). O conteúdo é gerado por IA e **exige conferência
humana** antes do protocolo. A inexatidão deliberada ou a omissão substancial podem ser
consideradas atentado à dignidade da justiça (arts. 5º e 77 do Código de Processo Civil).
As regras do STF quanto ao recurso extraordinário devem ser verificadas separadamente.
