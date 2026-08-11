# AI Assistant — Design Doc (Fase 15)

> **Status: draft v0.1** — esperando feedback del mantenedor antes de
> implementar. Las decisiones de scope marcadas con ❓ requieren
> respuesta explícita.

## 0. Pregunta aclaratoria del mantenedor

> *"Quiero que se plantee bien porque me refiero a que una IA externa
> de Ollama por ejemplo pueda conectarse a la app mientras el
> usuario la usa y pueda asistirle."*

Reformulado en una frase: **un proceso de IA externo (Ollama +
wrapper) se conecta a la app en localhost, recibe eventos del
estado del usuario, razona con el LLM, y puede actuar (con
confirmación) para asistirle en tiempo real.**

Eso es más que "un panel de chat" — es un **agente observando al
usuario** (sabe qué ejercicio está haciendo, qué queries ha
corrido, qué errores ha tenido, hace cuánto está atascado) y
ofreciendo ayuda contextual. Es también menos que "control total"
— la IA nunca toca el editor sin confirmación, y todas sus
acciones quedan registradas en un transcript visible.

## 1. Lo que la app expone (lado app)

### 1.1 Transport

Un **WebSocket server en `ws://localhost:4711`** que la app monta
en arranque (cuando el toggle "Asistente IA" está ON). El puerto
4711 es "AI Assistant" en números-de-teléfono (meme intencional
de Anthropic).

**Por qué WebSocket, no alternativas**:

- **HTTP polling** — demasiada latencia para "AI watches the user".
- **Server-Sent Events (SSE) + POST** — funciona pero son dos
  canales, dos timeouts, dos acks. WebSocket es uno solo.
- **MCP sobre stdio** — requiere que el AI corra como
  subproceso de la app. No encaja con "AI externa".
- **MCP sobre HTTP+SSE** — viable pero más piezas (un MCP server
  completo, JSON-RPC, resource discovery). Lo evaluamos en §6.
- **Browser automation (CDP / Playwright)** — funciona, pero
  acopla el AI al DOM, no a la app. Menos semántico.

WebSocket es la opción **más simple que cumple el contrato**:
bidireccional, persistente, una conexión, JSON sobre el wire.

### 1.2 Esquema del wire (JSON, UTF-8)

```typescript
// App → AI (state events, "stream")
type StateEvent =
  | { type: 'hello'; version: string; capabilities: string[]; locale: string }
  | { type: 'context'; snapshot: UserContext }
  | { type: 'query'; query: string; ok: boolean; error?: string; rows?: number; ms: number; ts: number }
  | { type: 'exercise'; id: string; title: string; status: 'open' | 'completed'; ts: number }
  | { type: 'hint'; index: number; total: number; ts: number }
  | { type: 'idle'; seconds: number; ts: number }
  | { type: 'closed'; reason: 'user_disabled' | 'tab_closed' | 'error' }

// AI → App (tool calls, "invoke")
type Invoke =
  | { type: 'tool'; id: string; name: ToolName; args: ToolArgs }
  | { type: 'ping' }
  | { type: 'goodbye' }

// App → AI (tool result, "ack")
type Ack =
  | { type: 'result'; id: string; ok: boolean; payload?: unknown; error?: string }
  | { type: 'pong' }
```

### 1.3 Tools (read + action)

Read tools (ejecutados inmediatamente):

```typescript
'get_context'      → { snapshot: UserContext }      // current full state
'get_schema'       → { tables, views, indexes }     // live DB introspection
'get_exercise'     → { id, title, statement, hints, solution, attempts }
'get_recent_queries' → { limit, queries: QueryResult[] }
'get_progress'     → { completed: string[]; percent: number }
```

Action tools (requieren confirmación del usuario):

```typescript
'apply_sql_to_editor'  → { sql, rationale }           // types in the editor
'reveal_hint'           → { index, rationale }          // opens a specific hint
'mark_attempt'          → { success, hints_used }       // for the user's own stats
'post_chat_message'     → { severity, text }            // shows in the chat panel
```

`post_chat_message` es la más interesante: el AI "habla" a través
de la UI. Las otras son mutaciones que la app pinta en un panel
"IA quiere hacer X — [Aplicar] [Rechazar]".

### 1.4 Privacy gates (del roadmap)

- **Toggle maestro OFF por default** en Settings. El WS server
  ni siquiera arranca si está en OFF.
- **Confirmación por cada acción mutante** (no read).
- **Transcript siempre visible** — el panel "IA" muestra cada
  evento enviado y cada tool call ejecutado, con timestamp.
- **API key encriptada** (SubtleCrypto + device salt) si el provider
  es OpenAI / Anthropic. Ollama local no requiere key.
- **Kill switch global** — un solo botón "Desconectar IA" en el
  panel cierra la WS y apaga el server.

## 2. Lo que el AI expone (lado AI)

Ollama por sí mismo es pasivo (HTTP request/response). Para que sea
un "agente" que se conecta y razona, hace falta un wrapper. El
roadmap llama a esto "15.3 Transporte" — me parece la pieza menos
interesante porque cada usuario puede escribir el suyo, pero la
documento igualmente.

**Wrapper mínimo de referencia (Python, ~150 líneas)**:

```python
# ai_assistant.py
import asyncio, json, websockets, ollama

SYSTEM = """Eres un asistente de SQL Academy. Tienes tools para leer
el estado del usuario y, con su confirmación, aplicar acciones.
Sé conciso. Responde en español a menos que el usuario escriba en
otro idioma."""

async def main():
    async with websockets.connect("ws://localhost:4711") as ws:
        history = [{"role": "system", "content": SYSTEM}]
        async for raw in ws:
            event = json.loads(raw)
            if event["type"] == "hello":
                continue
            if event["type"] == "context":
                history.append({"role": "system",
                    "content": f"Estado actual: {json.dumps(event['snapshot'])}"})
                continue
            if event["type"] == "tool":
                # Handle the tool call the app made *on our behalf*
                # (e.g., the app forwarded a "post_chat_message" back)
                continue
            # Heuristic: ask the LLM what to do based on the latest event
            response = ollama.chat(model="llama3.1", messages=history,
                                   tools=TOOL_DEFS)
            if response.message.tool_calls:
                for call in response.message.tool_calls:
                    await ws.send(json.dumps({
                        "type": "tool", "id": call.id,
                        "name": call.function.name,
                        "args": call.function.arguments}))

asyncio.run(main())
```

**Alternativas al wrapper Python**:

- **LangChain / LangGraph** — ReAct agent con tools. Más
  framework, más features, más complejidad.
- **Claude Agent SDK / OpenAI Agents SDK** — frameworks de
  agentes oficiales con soporte para tools y MCP.
- **MCP** (Model Context Protocol) — el estándar emergente.
  Convertir el WS server en un MCP server le daría acceso a
  Claude Code, Cursor, etc. directamente. **Trade-off**: más
  piezas, más spec que seguir.
- **DIY con curl** — totalmente viable para un MVP.

Para la v1 recomiendo el wrapper Python mínimo. La spec del
protocolo (sección 1.2) es lo único que necesita ser estable.

## 3. UI

### 3.1 AssistantPanel

Un drawer en la esquina inferior derecha (mismo slot que
WorkerErrorBanner). Tres estados visuales:

| Estado    | UI                                                  |
|-----------|-----------------------------------------------------|
| OFF       | Botón flotante "🤖 Pedir ayuda a la IA" → toggle  |
| ON, idle  | Burbuja con "IA conectada" + número de sugerencias  |
| ON, busy  | Burbuja con "Pensando..." + spinner                  |

Cuando se abre, el panel es un chat clásico (input abajo, scroll
arriba) con tres pestañas:

1. **Chat** — conversación libre con el LLM.
2. **Sugerencias** — lista de acciones que la IA quiere hacer
   (cada una con `[Aplicar] [Rechazar]`).
3. **Transcript** — log crudo de todos los eventos (read-only).

### 3.2 "AI sugiere X" — affordance

Cuando la IA llama `apply_sql_to_editor`:

```
┌──────────────────────────────────────────────────┐
│  🤖 La IA sugiere:                                 │
│  Copiar este SQL al editor:                       │
│  ```sql                                            │
│  SELECT name FROM users WHERE age > 18;            │
│  ```                                                │
│  Razón: "Te falta la cláusula WHERE"               │
│  [ Aplicar ]  [ Rechazar ]  [ Ver en el editor ]  │
└──────────────────────────────────────────────────┘
```

`[ Aplicar ]` → la app ejecuta el tool call. `[ Rechazar ]` →
la app registra la negativa y sigue. `[ Ver en el editor ]` →
highlight del texto sin modificar.

## 4. Configuración

Settings → Asistente IA (sección nueva):

```
[ ] Activar asistente IA (requiere WebSocket server en localhost:4711)

Provider:  ◯ Ollama (local)   ◯ OpenAI   ◯ Anthropic   ◯ Custom

Ollama URL:  http://localhost:11434
Modelo:       llama3.1

OpenAI API key: ************************
[ Test connection ]

Nivel de agencia:
( ) Solo lectura (chat + suggestions, no aplica)
(•) Sugerir y aplicar (default — confirma cada acción)
( ) Lectura + apply + reveal_hint + mark_attempt (full)

[ Desconectar IA ahora ]
```

Persistente en `settings` (ya tenemos el store, Fase 12). El toggle
maestro se respeta en arranque: si está OFF, el WS server no se
monta y la sección "Sugerencias" está deshabilitada.

## 5. Riesgos + mitigaciones

| Riesgo                                                | Mitigación |
|--------------------------------------------------------|------------|
| La IA hace tool calls destructivos por error          | Confirmación por tool mutante + transcript visible |
| El AI ve datos sensibles (queries del usuario)        | Solo localhost, opt-in, kill switch |
| Loop infinito de tool calls                           | Rate limit (max 5 tool calls / evento); debounce del LLM |
| Ollama no soporta function calling                   | Wrapper degrada a "chat only" si el LLM no soporta tools |
| El usuario cierra la tab mientras la IA razona      | `closed` event → el AI cancela el ciclo en curso |
| Latencia del LLM local (5-30s en CPU)                 | UI muestra "Pensando..." + cancel button; el LLM corre async |

## 6. Roadmap de implementación (Fase 15.1-15.4)

Estimación: 9-12 días según el roadmap. Mi propuesta es partir en
**3 verticales entregables** en lugar de las 4 sub-fases
originales:

1. **Bridge + state stream + chat panel** (5 días) — el núcleo
   de todo. Sin tools, solo chat. Sirve para validar la
   arquitectura.
2. **Tools (read + action) + affordances** (3 días) — la IA
   empieza a actuar con confirmación.
3. **Provider abstraction + Ollama reference wrapper** (2 días) —
   la parte "trivially replaceable" + docs.

Las sub-fases originales (15.1 bridge, 15.2 generation, 15.3
transport, 15.4 chat) las reorganizo así:

| Roadmap original      | Mi propuesta            | Por qué |
|-----------------------|--------------------------|---------|
| 15.1 Bridge (3-4 d)   | Vertical 1 (5 d)         | Bridge sin UI no es testeable; el vertical entrega valor real |
| 15.2 Generation (3-4 d)| **Fuera del scope v1**   | La generación de ejercicios es un feature separado. La movemos a Fase 16+. El roadmap la tiene dentro de 15 pero es ortogonal. |
| 15.3 Transport (1-2 d) | Vertical 3 (2 d)         | El "transport" es la abstracción de provider; mejor al final cuando sabemos qué se abstrae |
| 15.4 Chat UI (2 d)    | Vertical 1 (parte de 5d) | El chat es la UI principal; no se entrega sin él |

**Fase 16 (post-roadmap, propuesta)**: generación de ejercicios con
IA. La separo porque es un feature ortogonal: no comparte
infraestructura con el asistente, y retrasarlo nos permite
focalizar la v1.

## 7. Estructura de archivos propuesta

```
src/core/ai/
  protocol.ts         # tipos del wire (sección 1.2)
  tools.ts            # definición de tools + validadores
  state-stream.ts     # zustand-like store con eventos
  server/
    ws-server.ts      # WS server en localhost:4711
    handshake.ts      # hello + capabilities exchange
    rate-limit.ts     # max N tool calls / evento
  client/
    ollama.ts         # provider Ollama (default)
    openai.ts         # provider OpenAI
    types.ts          # AIProvider interface
  ai-observer.ts      # serializa UserContext → JSON para el LLM
docs/
  AI-ASSISTANT-PROTOCOL.md  # spec completa del wire
  AI-ASSISTANT-REFERENCE-AGENT.md  # cómo escribir un agente
  AI-ASSISTANT-SECURITY.md  # threat model
tests/
  unit/ai/
    protocol.test.ts
    tools.test.ts
    rate-limit.test.ts
    server.test.ts
  e2e/
    ai-assistant.spec.ts   # Playwright: WS server arranca, mock agent conecta, ciclo completo
```

## 8. Decisiones que necesito del mantenedor (❓)

Antes de tocar código, me encantaría alinear contigo en:

1. **¿Vertical 1 con chat + read tools, o el vertical completo
   de una vez?** (5 días vs 10 días)

2. **¿AI side: reference Python wrapper o MCP server?**
   - Reference Python: simple, control total, ~150 líneas
   - MCP server: estándar, integrable con Claude Code / Cursor,
     ~300 líneas + spec
   - Ambos: el WS server interno expone ambos protocolos
   - Solo docs: solo documento el wire, dejo que cada uno
     escriba su agente

3. **¿Nivel de agencia default?** (lectura / sugerir+confirmar / full)
   Recomiendo **sugerir+confirmar** porque es el sweet spot entre
   utilidad y seguridad.

4. **¿Provider default?** Recomiendo **Ollama local con `llama3.1`**
   porque encaja con la promesa "100% offline" de la app.

5. **¿"AI watches the user" proactivo o solo on-demand?**
   - Solo on-demand (chat cuando el usuario abre el panel)
   - Proactivo en idle (>30s sin actividad)
   - Proactivo siempre (eventos push al AI en cada cambio)
   - Recomiendo **on-demand por ahora**, proactivo en Fase 16+
     para evitar el "AI-butler" molesto.

6. **¿El toggle "Asistente IA" se sincroniza con el del TopBar /
   Worker online pill?** Recomiendo un indicador separado para
   no confundir "IA disponible" con "Worker SQL disponible".

7. **¿La IA tiene acceso a la DB seed completa (incluyendo datos
   de muestra como `library/books`)?** Recomiendo **sí, con
   opt-in por DB** — el AI necesita datos reales para ayudar.

Si me confirmas estos 7 puntos, arranco con el Vertical 1.
Si prefieres un vertical más pequeño para validar el approach
(3-4 días en lugar de 5), puedo hacer un "vertical 0" que monta
solo el WS server + el chat panel con un mock agent que no razona
(solo echo del contexto).
