# Setting up moodle-mcp in Claude Desktop

This guide walks through connecting `moodle-mcp` to Claude Desktop so your agent can publish content to Moodle on your behalf.

## Prerequisites

1. **Node.js 20+** installed. Verify with `node --version`.
2. **Claude Desktop** installed (Mac, Windows, or Linux).
3. **A Moodle instance** (4.x or 5.x) you administer.
4. **Web Services enabled** in that Moodle instance, with a token for your user.

## 1. Generate a Web Services token in Moodle

As a Moodle site administrator:

1. Navigate to **Site administration → Server → Web services**.
2. Enable web services if not already enabled.
3. Under **External services**, enable the "Moodle mobile web service" (or create a dedicated external service — recommended for audit clarity) and include these functions at minimum:
   - `core_webservice_get_site_info`
   - `core_course_get_courses_by_field`
   - `core_course_get_contents`
   - `core_enrol_get_enrolled_users`
   - `core_course_edit_section`
   - `core_course_edit_module`
4. Under **Manage tokens**, create a token for a user with `editingteacher` or `manager` on the courses you plan to manage. Copy the token — you will paste it into the Claude config below.

> **Audit tip:** create a dedicated user called `moodle-mcp-bot` (or similar) and generate the token for that user. Moodle's activity log will then distinguish human vs MCP actions.

## 2. Find your Claude Desktop config file

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

Create the file if it does not exist.

## 3. Add the `moodle` server

```json
{
  "mcpServers": {
    "moodle": {
      "command": "npx",
      "args": ["-y", "moodle-mcp"],
      "env": {
        "MOODLE_URL": "https://your-moodle.example.com",
        "MOODLE_WS_TOKEN": "paste-your-token-here",
        "MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

If you already have other MCP servers configured, merge the `moodle` entry into your existing `mcpServers` object.

## 4. Restart Claude Desktop

Quit and reopen the app. You should see `moodle` listed among connected MCP servers (check the status icon near the chat composer). The five tools will now be available to the agent:

- `obtener_contexto_curso`
- `publicar_ficha_clase`
- `publicar_preview`
- `confirmar_preview`
- `ws_raw`

## 5. First smoke test

Ask the agent:

> Use `ws_raw` to call `core_webservice_get_site_info` and show me the site name.

If you get back your Moodle site name, wiring is correct. If you get a token error, double-check step 1 and make sure `core_webservice_get_site_info` is included in the external service functions list.

## Troubleshooting

- **"Invalid or expired Moodle Web Services token"** — regenerate the token in Moodle; copy-paste errors are common.
- **"Moodle WS returned HTTP 404"** — verify `MOODLE_URL` has no trailing slash and no `/webservice/...` suffix (the MCP appends that itself).
- **Logs** — the MCP writes JSON per line to stderr. Claude Desktop exposes these through its "MCP logs" UI; set `MCP_LOG_LEVEL=debug` while diagnosing.
- **Connection refused in dev** — set `MOODLE_ALLOW_INSECURE=true` if you are pointing at a local `http://localhost:8081` docker sandbox.
