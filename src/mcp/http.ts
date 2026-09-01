import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerTools } from "./server";

// HTTP transport for hosting (DollarDeploy etc.). helmet has no state, so each
// session gets a fresh server; nothing to persist between them.
const MCP_PORT = Number(process.env.MCP_PORT ?? process.env.PORT ?? 3001);

const sessions = new Map<string, WebStandardStreamableHTTPServerTransport>();

async function handleMcp(req: Request): Promise<Response> {
  const sessionId = req.headers.get("mcp-session-id");
  if (sessionId && sessions.has(sessionId)) {
    return sessions.get(sessionId)!.handleRequest(req);
  }

  const server = new McpServer({ name: "helmet", version: "0.1.0" });
  registerTools(server);

  const transport: WebStandardStreamableHTTPServerTransport =
    new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, transport);
      },
      onsessionclosed: (id) => {
        sessions.delete(id);
      },
      enableJsonResponse: true,
    });

  await server.connect(transport);
  return transport.handleRequest(req);
}

Bun.serve({
  port: MCP_PORT,
  routes: {
    "/mcp": { POST: handleMcp, GET: handleMcp, DELETE: handleMcp },
    "/health": () => new Response("ok"),
  },
  fetch: () => new Response("Not found", { status: 404 }),
});

console.log(`helmet MCP server (HTTP) on http://localhost:${MCP_PORT}/mcp`);
