import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { summarize } from './tools/summarize';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const ROUTE = '/mcp';

function isInitializeRequest(body: unknown): boolean {
  return !!body && typeof body === 'object' && (body as any).method === 'initialize';
}

function createSummarizerServer(): McpServer {
  const server = new McpServer({ name: 'summarizer-mcp', version: '0.1.0' }, { capabilities: { logging: {} } });

  server.registerTool('summarize', {
    title: 'Summarize',
    description: 'Summarize the given text',
    inputSchema: {
      text: z.string().describe('Text to summarize')
    }
  }, async ({ text }) => {
    console.log('Summarizing text:', text);
    const summary = await summarize(text);
    return {
      content: [{ type: 'text', text: summary }]
    };
  });

  return server;
}

const transports: Record<string, StreamableHTTPServerTransport> = {};

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname !== ROUTE) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    const sessionIdHeader = (req.headers['mcp-session-id'] || req.headers['Mcp-Session-Id']) as string | undefined;
    const method = req.method || 'GET';

    if (method === 'POST') {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', async () => {
        let parsed: unknown = undefined;
        if (raw.length > 0) {
          try {
            parsed = JSON.parse(raw);
          } catch {
            res.statusCode = 400;
            res.end('Invalid JSON');
            return;
          }
        }

        try {
          if (sessionIdHeader && transports[sessionIdHeader]) {
            const transport = transports[sessionIdHeader];
            await transport.handleRequest(req, res, parsed);
            return;
          }

          if (!sessionIdHeader && isInitializeRequest(parsed)) {
            const transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              onsessioninitialized: (sid: string) => {
                transports[sid] = transport;
              }
            });

            transport.onclose = () => {
              const sid = transport.sessionId;
              if (sid && transports[sid]) {
                delete transports[sid];
              }
            };

            const mcp = createSummarizerServer();
            await mcp.connect(transport);
            await transport.handleRequest(req, res, parsed);
            return;
          }

          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: No valid session ID provided' }, id: null }));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }));
        }
      });
      return;
    }

    if (method === 'GET') {
      const sid = sessionIdHeader;
      if (!sid || !transports[sid]) {
        res.statusCode = 400;
        res.end('Invalid or missing session ID');
        return;
      }
      await transports[sid].handleRequest(req, res);
      return;
    }

    if (method === 'DELETE') {
      const sid = sessionIdHeader;
      if (!sid || !transports[sid]) {
        res.statusCode = 400;
        res.end('Invalid or missing session ID');
        return;
      }
      await transports[sid].handleRequest(req, res);
      return;
    }

    res.statusCode = 405;
    res.end('Method Not Allowed');
  } catch (error) {
    try {
      res.statusCode = 500;
      res.end('Internal Server Error');
    } catch {}
  }
});

server.listen(PORT, () => {
  console.log(`MCP Streamable HTTP server listening on http://localhost:${PORT}${ROUTE}`);
});

// Graceful shutdown for hot-reload and signals
async function shutdown(reason: string) {
  try {
    console.log(`[shutdown] ${reason}`);
    // Close HTTP server
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      // In case server was not listening yet
      if (!(server as any)._handle) resolve();
    });
    // Close any active transports/sessions
    const ids = Object.keys(transports);
    for (const sid of ids) {
      const transport = transports[sid];
      try {
        const maybeClose = (transport as unknown as { close?: () => Promise<void> | void }).close;
        if (typeof maybeClose === 'function') {
          await maybeClose.call(transport);
        }
      } catch {}
      delete transports[sid];
    }
  } catch (err) {
    // no-op
  } finally {
    // Let Bun/Node exit
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));