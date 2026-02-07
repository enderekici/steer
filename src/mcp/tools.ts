/**
 * MCP tool definitions for abbwak browser primitives.
 *
 * Each tool follows the @modelcontextprotocol/sdk Tool interface with
 * name, description, and a JSON-Schema inputSchema.
 */

export const TOOLS = [
  {
    name: "browser_navigate",
    description:
      "Navigate to a URL in the browser. Returns an accessibility snapshot of the page after navigation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "The URL to navigate to (must include protocol, e.g. https://)",
        },
        sessionId: {
          type: "string",
          description:
            "Optional session ID. If omitted, the default session is used.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_act",
    description:
      "Perform an action on the current page: click an element, type text into an input, select an option, or scroll. Use ref IDs from a previous observe/navigate result to target elements.",
    inputSchema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          enum: ["click", "type", "select", "scroll"],
          description: "The action to perform.",
        },
        ref: {
          type: "string",
          description:
            'Reference ID of the target element (e.g. "r5"). Preferred over selector.',
        },
        selector: {
          type: "string",
          description:
            "CSS selector of the target element. Used as fallback when ref is not available.",
        },
        value: {
          type: "string",
          description:
            'The value to type or the option to select. Required for "type" and "select" actions.',
        },
        direction: {
          type: "string",
          enum: ["up", "down", "left", "right"],
          description:
            'Scroll direction. Only used when action is "scroll". Defaults to "down".',
        },
        sessionId: {
          type: "string",
          description:
            "Optional session ID. If omitted, the default session is used.",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "browser_extract",
    description:
      "Extract content from the current page as plain text, markdown, or structured data matching a JSON schema.",
    inputSchema: {
      type: "object" as const,
      properties: {
        mode: {
          type: "string",
          enum: ["text", "markdown", "structured"],
          description:
            'Extraction mode. Defaults to "text". Use "structured" with a schema to extract specific fields.',
        },
        selector: {
          type: "string",
          description: "CSS selector to scope extraction to a specific element.",
        },
        schema: {
          type: "object",
          description:
            'JSON Schema describing the desired shape. Required when mode is "structured".',
        },
        maxLength: {
          type: "number",
          description:
            "Maximum character length of the returned content. Defaults to 4000.",
        },
        sessionId: {
          type: "string",
          description:
            "Optional session ID. If omitted, the default session is used.",
        },
      },
    },
  },
  {
    name: "browser_observe",
    description:
      "Get an accessibility snapshot of the current page. Returns all interactive elements with ref IDs that can be used with browser_act, plus headings and landmarks for context.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sessionId: {
          type: "string",
          description:
            "Optional session ID. If omitted, the default session is used.",
        },
      },
    },
  },
  {
    name: "browser_screenshot",
    description:
      "Capture a screenshot of the current page. Returns the image as base64-encoded PNG.",
    inputSchema: {
      type: "object" as const,
      properties: {
        fullPage: {
          type: "boolean",
          description:
            "Whether to capture the full scrollable page or just the visible viewport. Defaults to false.",
        },
        sessionId: {
          type: "string",
          description:
            "Optional session ID. If omitted, the default session is used.",
        },
      },
    },
  },
] as const;

export type ToolName = (typeof TOOLS)[number]["name"];
