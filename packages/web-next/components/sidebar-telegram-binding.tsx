"use client"

import * as React from "react"
import { Loader2, Send } from "lucide-react"

import { api } from "@/lib/api"
import { createLogger } from "@/lib/client-logger"
import { useWorkspace } from "@/app/dashboard/workspace-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar"
import type { z } from "zod"
import type { TransportAccountSummarySchema } from "@synapse/shared/schemas"
type TransportAccountSummary = z.infer<typeof TransportAccountSummarySchema>

const clientLog = createLogger("web.components.sidebar-telegram-binding")

/**
 * West-first sidebar binding (founder order 2026-09-30): replaces the WeChat
 * QR personal-login block. Telegram binds via a BotFather bot token (long
 * connection by default — no public webhook surface needed).
 */
export function SidebarTelegramBinding() {
  const { workspaceId } = useWorkspace()
  const [accounts, setAccounts] = React.useState<TransportAccountSummary[]>([])
  const [loaded, setLoaded] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)
  const [botToken, setBotToken] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")

  const loadAccounts = React.useCallback(async () => {
    if (!workspaceId) return
    try {
      const res = await api.getTransportAccounts(workspaceId)
      const rows = (res.accounts ?? []) as TransportAccountSummary[]
      setAccounts(rows.filter((a) => a.transportKind === "telegram"))
    } catch (err) {
      clientLog.error("Failed to load Telegram accounts:", err)
    } finally {
      setLoaded(true)
    }
  }, [workspaceId])

  React.useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  const connected = accounts.length > 0

  async function connect() {
    if (!workspaceId) return
    setBusy(true)
    setError("")
    try {
      await api.createTelegramTransportAccount(workspaceId, {
        displayName: "Telegram Bot",
        connectionMode: "long_connection",
        botToken: botToken.trim(),
      })
      setBotToken("")
      setExpanded(false)
      await loadAccounts()
    } catch (err) {
      clientLog.error("Failed to connect Telegram bot:", err)
      setError("Could not connect that bot token. Check it and try again.")
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="px-2 py-1 text-xs text-muted-foreground">…</div>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {connected ? (
          <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
            <Send className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">
              Telegram connected
              {accounts[0].displayName ? `: ${accounts[0].displayName}` : ""}
            </span>
          </div>
        ) : expanded ? (
          <div className="space-y-2 px-2 py-1">
            <Label htmlFor="sidebar-tg-token" className="text-xs">
              BotFather token
            </Label>
            <Input
              id="sidebar-tg-token"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="123456:ABC-DEF…"
              className="h-7 text-xs"
              disabled={busy}
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-7 flex-1 text-xs"
                onClick={connect}
                disabled={busy || botToken.trim().length < 10}
              >
                {busy ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Send className="size-3" />
                )}
                Connect
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setExpanded(false)}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 px-2 text-xs text-muted-foreground"
            onClick={() => setExpanded(true)}
          >
            <Send className="size-3.5 text-primary" />
            Connect Telegram
          </Button>
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
