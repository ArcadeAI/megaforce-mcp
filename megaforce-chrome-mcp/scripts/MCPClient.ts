import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  ListToolsRequest,
  ListToolsResultSchema,
  CallToolRequest,
  CallToolResultSchema,
  ListPromptsRequest,
  ListPromptsResultSchema,
  GetPromptRequest,
  GetPromptResultSchema,
  ListResourcesRequest,
  ListResourcesResultSchema,
  LoggingMessageNotificationSchema,
  ResourceListChangedNotificationSchema,
  ElicitRequestSchema,
  ResourceLink,
  ReadResourceRequest,
  ReadResourceResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getDisplayName } from '@modelcontextprotocol/sdk/shared/metadataUtils.js';

export type ElicitationHandler = (request: unknown) => Promise<unknown>;

export type MCPClientOptions = {
  serverUrl?: string;
  name?: string;
  version?: string;
  elicitationHandler?: ElicitationHandler;
  onLog?: (message: string) => void;
};

export class MCPClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private serverUrl: string;
  private sessionId: string | undefined = undefined;
  private notificationCount = 0;
  private notificationsToolLastEventId: string | undefined = undefined;
  private readonly name: string;
  private readonly version: string;
  private readonly elicitationHandler?: ElicitationHandler;
  private readonly onLog?: (message: string) => void;

  constructor(options?: MCPClientOptions) {
    this.serverUrl = options?.serverUrl || 'http://localhost:3000/mcp';
    this.name = options?.name || 'example-client';
    this.version = options?.version || '1.0.0';
    this.elicitationHandler = options?.elicitationHandler;
    this.onLog = options?.onLog;
  }

  getSessionId(): string | undefined {
    return this.sessionId;
  }

  isConnected(): boolean {
    return !!this.client && !!this.transport;
  }

  async connect(url?: string): Promise<void> {
    if (this.client) {
      this.log('Already connected. Disconnect first.');
      return;
    }
    if (url) {
      this.serverUrl = url;
    }
    this.log(`Connecting to ${this.serverUrl}...`);

    try {
      this.client = new Client({
        name: this.name,
        version: this.version,
      }, {
        capabilities: {
          elicitation: {},
        },
      });
      this.client.onerror = (error) => {
        this.log(`Client error: ${String(error)}`);
      };

      if (this.elicitationHandler) {
        this.client.setRequestHandler(ElicitRequestSchema, this.elicitationHandler);
      } else {
        this.client.setRequestHandler(ElicitRequestSchema, async () => ({ action: 'decline' }));
      }

      this.transport = new StreamableHTTPClientTransport(new URL(this.serverUrl), { sessionId: this.sessionId });

      this.client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
        this.notificationCount++;
        this.log(`Notification #${this.notificationCount}: ${notification.params.level} - ${notification.params.data}`);
      });

      this.client.setNotificationHandler(ResourceListChangedNotificationSchema, async (_) => {
        this.log('Resource list changed notification received!');
        try {
          if (!this.client) {
            this.log('Client disconnected, cannot fetch resources');
            return;
          }
          const resourcesResult = await this.client.request({ method: 'resources/list', params: {} }, ListResourcesResultSchema);
          this.log(`Available resources count: ${resourcesResult.resources.length}`);
        } catch {
          this.log('Failed to list resources after change notification');
        }
      });

      await this.client.connect(this.transport);
      this.sessionId = this.transport.sessionId;
      this.log(`Transport created with session ID: ${this.sessionId}`);
      this.log('Connected to MCP server');
    } catch (error) {
      this.log(`Failed to connect: ${String(error)}`);
      this.client = null;
      this.transport = null;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.client || !this.transport) {
      this.log('Not connected.');
      return;
    }
    try {
      await this.transport.close();
      this.log('Disconnected from MCP server');
      this.client = null;
      this.transport = null;
    } catch (error) {
      this.log(`Error disconnecting: ${String(error)}`);
    }
  }

  async terminateSession(): Promise<void> {
    if (!this.client || !this.transport) {
      this.log('Not connected.');
      return;
    }
    try {
      this.log(`Terminating session with ID: ${this.transport.sessionId}`);
      await this.transport.terminateSession();
      this.log('Session terminated successfully');
      if (!this.transport.sessionId) {
        this.log('Session ID has been cleared');
        this.sessionId = undefined;
        await this.transport.close();
        this.log('Transport closed after session termination');
        this.client = null;
        this.transport = null;
      } else {
        this.log('Server responded with 405 Method Not Allowed (session termination not supported)');
        this.log(`Session ID is still active: ${this.transport.sessionId}`);
      }
    } catch (error) {
      this.log(`Error terminating session: ${String(error)}`);
    }
  }

  async reconnect(): Promise<void> {
    if (this.client) {
      await this.disconnect();
    }
    await this.connect();
  }

  async listTools(): Promise<void> {
    if (!this.client) {
      this.log('Not connected to server.');
      return;
    }
    try {
      const toolsRequest: ListToolsRequest = { method: 'tools/list', params: {} };
      const toolsResult = await this.client.request(toolsRequest, ListToolsResultSchema);
      this.log('Available tools:');
      if (toolsResult.tools.length === 0) {
        this.log('  No tools available');
      } else {
        for (const tool of toolsResult.tools) {
          this.log(`  - id: ${tool.name}, name: ${getDisplayName(tool)}, description: ${tool.description}`);
        }
      }
    } catch (error) {
      this.log(`Tools not supported by this server (${String(error)})`);
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<{ resourceLinks: ResourceLink[] } | void> {
    if (!this.client) {
      this.log('Not connected to server.');
      return;
    }
    try {
      const request: CallToolRequest = {
        method: 'tools/call',
        params: { name, arguments: args }
      };
      this.log(`Calling tool '${name}' with args: ${JSON.stringify(args)}`);
      const result = await this.client.request(request, CallToolResultSchema);
      this.log('Tool result:');
      const resourceLinks: ResourceLink[] = [];
      result.content.forEach(item => {
        if (item.type === 'text') {
          this.log(`  ${item.text}`);
        } else if (item.type === 'resource_link') {
          const resourceLink = item as ResourceLink;
          resourceLinks.push(resourceLink);
          this.log(`  📁 Resource Link: ${resourceLink.name}`);
          this.log(`     URI: ${resourceLink.uri}`);
          if (resourceLink.mimeType) this.log(`     Type: ${resourceLink.mimeType}`);
          if (resourceLink.description) this.log(`     Description: ${resourceLink.description}`);
        } else if (item.type === 'resource') {
          this.log(`  [Embedded Resource: ${item.resource.uri}]`);
        } else if (item.type === 'image') {
          this.log(`  [Image: ${item.mimeType}]`);
        } else if (item.type === 'audio') {
          this.log(`  [Audio: ${item.mimeType}]`);
        } else {
          this.log(`  [Unknown content type]: ${JSON.stringify(item)}`);
        }
      });
      if (resourceLinks.length > 0) {
        this.log(`\nFound ${resourceLinks.length} resource link(s). Use 'read-resource <uri>' to read their content.`);
      }
      return { resourceLinks };
    } catch (error) {
      this.log(`Error calling tool ${name}: ${String(error)}`);
    }
  }

  async callGreetTool(name: string): Promise<void> {
    await this.callTool('greet', { name });
  }

  async callMultiGreetTool(name: string): Promise<void> {
    this.log('Calling multi-greet tool with notifications...');
    await this.callTool('multi-greet', { name });
  }

  async callCollectInfoTool(infoType: string): Promise<void> {
    this.log(`Testing elicitation with collect-user-info tool (${infoType})...`);
    await this.callTool('collect-user-info', { infoType });
  }

  async startNotifications(interval: number, count: number): Promise<void> {
    this.log(`Starting notification stream: interval=${interval}ms, count=${count || 'unlimited'}`);
    await this.callTool('start-notification-stream', { interval, count });
  }

  async runNotificationsToolWithResumability(interval: number, count: number): Promise<void> {
    if (!this.client) {
      this.log('Not connected to server.');
      return;
    }
    try {
      this.log(`Starting notification stream with resumability: interval=${interval}ms, count=${count || 'unlimited'}`);
      this.log(`Using resumption token: ${this.notificationsToolLastEventId || 'none'}`);
      const request: CallToolRequest = {
        method: 'tools/call',
        params: { name: 'start-notification-stream', arguments: { interval, count } }
      };
      const onLastEventIdUpdate = (event: string) => {
        this.notificationsToolLastEventId = event;
        this.log(`Updated resumption token: ${event}`);
      };
      const result = await this.client.request(request, CallToolResultSchema, {
        resumptionToken: this.notificationsToolLastEventId,
        onresumptiontoken: onLastEventIdUpdate
      });
      this.log('Tool result:');
      result.content.forEach(item => {
        if (item.type === 'text') {
          this.log(`  ${item.text}`);
        } else {
          this.log(`  ${item.type} content: ${JSON.stringify(item)}`);
        }
      });
    } catch (error) {
      this.log(`Error starting notification stream: ${String(error)}`);
    }
  }

  async listPrompts(): Promise<void> {
    if (!this.client) {
      this.log('Not connected to server.');
      return;
    }
    try {
      const promptsRequest: ListPromptsRequest = { method: 'prompts/list', params: {} };
      const promptsResult = await this.client.request(promptsRequest, ListPromptsResultSchema);
      this.log('Available prompts:');
      if (promptsResult.prompts.length === 0) {
        this.log('  No prompts available');
      } else {
        for (const prompt of promptsResult.prompts) {
          this.log(`  - id: ${prompt.name}, name: ${getDisplayName(prompt)}, description: ${prompt.description}`);
        }
      }
    } catch (error) {
      this.log(`Prompts not supported by this server (${String(error)})`);
    }
  }

  async getPrompt(name: string, args: Record<string, unknown>): Promise<void> {
    if (!this.client) {
      this.log('Not connected to server.');
      return;
    }
    try {
      const promptRequest: GetPromptRequest = { method: 'prompts/get', params: { name, arguments: args as Record<string, string> } };
      const promptResult = await this.client.request(promptRequest, GetPromptResultSchema);
      this.log('Prompt template:');
      promptResult.messages.forEach((msg, index) => {
        this.log(`  [${index + 1}] ${msg.role}: ${msg.content.text}`);
      });
    } catch (error) {
      this.log(`Error getting prompt ${name}: ${String(error)}`);
    }
  }

  async listResources(): Promise<void> {
    if (!this.client) {
      this.log('Not connected to server.');
      return;
    }
    try {
      const resourcesRequest: ListResourcesRequest = { method: 'resources/list', params: {} };
      const resourcesResult = await this.client.request(resourcesRequest, ListResourcesResultSchema);
      this.log('Available resources:');
      if (resourcesResult.resources.length === 0) {
        this.log('  No resources available');
      } else {
        for (const resource of resourcesResult.resources) {
          this.log(`  - id: ${resource.name}, name: ${getDisplayName(resource)}, description: ${resource.uri}`);
        }
      }
    } catch (error) {
      this.log(`Resources not supported by this server (${String(error)})`);
    }
  }

  async readResource(uri: string): Promise<void> {
    if (!this.client) {
      this.log('Not connected to server.');
      return;
    }
    try {
      const request: ReadResourceRequest = { method: 'resources/read', params: { uri } };
      this.log(`Reading resource: ${uri}`);
      const result = await this.client.request(request, ReadResourceResultSchema);
      this.log('Resource contents:');
      for (const content of result.contents) {
        this.log(`  URI: ${content.uri}`);
        if (content.mimeType) this.log(`  Type: ${content.mimeType}`);
        if ('text' in content && typeof content.text === 'string') {
          this.log('  Content:');
          this.log('  ---');
          this.log(content.text.split('\n').map((line: string) => '  ' + line).join('\n'));
          this.log('  ---');
        } else if ('blob' in content && typeof content.blob === 'string') {
          this.log(`  [Binary data: ${content.blob.length} bytes]`);
        }
      }
    } catch (error) {
      this.log(`Error reading resource ${uri}: ${String(error)}`);
    }
  }

  async cleanup(): Promise<void> {
    if (this.client && this.transport) {
      try {
        if (this.transport.sessionId) {
          try {
            this.log('Terminating session before exit...');
            await this.transport.terminateSession();
            this.log('Session terminated successfully');
          } catch (error) {
            this.log(`Error terminating session: ${String(error)}`);
          }
        }
        await this.transport.close();
      } catch (error) {
        this.log(`Error closing transport: ${String(error)}`);
      }
    }
  }

  private log(message: string): void {
    if (this.onLog) {
      this.onLog(message);
    } else {
      // eslint-disable-next-line no-console
      console.log(message);
    }
  }
}


