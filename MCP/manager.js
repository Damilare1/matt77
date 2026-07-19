import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import mcpConfig from '../config/mcp.json' assert { type: 'json' };

export class McpManager {
    constructor() {
        this.clients = new Map();
        this.toolMap = new Map();
        this.serverDefaults = new Map();
        this.openAITools = [];
    }

    async initialize() {
        const servers = mcpConfig.mcpServers || {};
        for (const [serverName, serverConfig] of Object.entries(servers)) {
            try {
                await this._connectServer(serverName, serverConfig);
            } catch (e) {
                console.error(`Failed to connect MCP server "${serverName}":`, e.message);
            }
        }

        console.log(`MCP initialized: ${this.clients.size} server(s), ${this.toolMap.size} tool(s)`);
    }

    async _connectServer(serverName, serverConfig) {
        let transport;
        const transportType = serverConfig.transport || 'stdio';

        if (transportType === 'stdio') {
            const resolvedEnv = serverConfig.env
                ? Object.fromEntries(
                    Object.entries(serverConfig.env).map(([k, v]) => [
                        k,
                        typeof v === 'string' ? v.replace(/\$\{(\w+)\}/g, (_, key) => process.env[key] || '') : v
                    ])
                )
                : undefined;
            transport = new StdioClientTransport({
                command: serverConfig.command,
                args: serverConfig.args || [],
                env: resolvedEnv ? { ...process.env, ...resolvedEnv } : undefined,
            });
        } else if (transportType === 'http') {
            const resolvedUrl = serverConfig.url.replace(/\$\{(\w+)\}/g, (_, key) => process.env[key] || '');
            transport = new StreamableHTTPClientTransport(
                new URL(resolvedUrl)
            );
        } else {
            console.warn(`Unknown transport "${transportType}" for MCP server "${serverName}", skipping`);
            return;
        }

        const client = new Client({
            name: `matt77-${serverName}`,
            version: '1.0.0',
        });

        await client.connect(transport);
        this.clients.set(serverName, client);

        if (serverConfig.defaults) {
            const resolvedDefaults = Object.fromEntries(
                Object.entries(serverConfig.defaults)
                    .map(([k, v]) => [k, typeof v === 'string' ? v.replace(/\$\{(\w+)\}/g, (_, key) => process.env[key] || '') : v])
                    .filter(([, v]) => v !== '')
            );
            this.serverDefaults.set(serverName, resolvedDefaults);
        }

        const { tools } = await client.listTools();
        for (const tool of tools) {
            if (this.toolMap.has(tool.name)) {
                console.warn(`MCP tool name collision: "${tool.name}" from "${serverName}" overwrites existing`);
            }
            this.toolMap.set(tool.name, serverName);
            this.openAITools.push({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description || '',
                    parameters: tool.inputSchema || { type: 'object', properties: {} },
                },
            });
        }

        console.log(`MCP server "${serverName}" connected: ${tools.length} tool(s)`);
    }

    getOpenAITools() {
        return this.openAITools;
    }

    hasTool(name) {
        return this.toolMap.has(name);
    }

    async callTool(name, args) {
        const serverName = this.toolMap.get(name);
        if (!serverName) {
            return `MCP tool "${name}" not found`;
        }

        const client = this.clients.get(serverName);
        if (!client) {
            return `MCP server "${serverName}" not connected`;
        }

        const defaults = this.serverDefaults.get(serverName) || {};
        const result = await client.callTool({ name, arguments: { ...defaults, ...args } });

        return result.content
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('\n') || 'Done';
    }

    async shutdown() {
        for (const [serverName, client] of this.clients.entries()) {
            try {
                await client.close();
                console.log(`MCP server "${serverName}" disconnected`);
            } catch (e) {
                console.error(`Error closing MCP server "${serverName}":`, e.message);
            }
        }
        this.clients.clear();
        this.toolMap.clear();
        this.serverDefaults.clear();
        this.openAITools = [];
    }
}
