"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { PLATFORM_USER_STATUS_FILTER } from "@synapse/shared"
import type { PlatformUserStatusFilter } from "@synapse/shared"
import type { PlatformUserView } from "@synapse/shared/schemas"
import { api } from "@/lib/api"
import { createLogger } from "@/lib/client-logger"
import { toast } from "sonner"
import { Ban, Loader2, LogOut, RotateCcw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const clientLog = createLogger("web.dashboard.users")

const PAGE_SIZE = 20

type StatusFilter = PlatformUserStatusFilter
type ConfirmAction = { kind: "suspend" | "sign-out"; user: PlatformUserView }

function StatusBadges({ user }: { user: PlatformUserView }) {
  if (user.deletedAt) {
    return <Badge variant="destructive">Closed</Badge>
  }
  if (user.suspendedAt) {
    return (
      <>
        <Badge variant="destructive">Suspended</Badge>
        <Badge variant="outline">Active</Badge>
      </>
    )
  }
  return <Badge variant="outline">Active</Badge>
}

export default function DashboardUsersPage() {
  const router = useRouter()
  const [guardChecked, setGuardChecked] = useState(false)
  const [users, setUsers] = useState<PlatformUserView[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [status, setStatus] = useState<StatusFilter>(
    PLATFORM_USER_STATUS_FILTER.ACTIVE
  )
  const [loading, setLoading] = useState(true)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Page gate: platform user management is admin-only. The sidebar already
  // hides the entry for non-admins; this redirect closes the direct-URL path.
  useEffect(() => {
    let cancelled = false
    api
      .getPlatformNavigation()
      .then((navigation) => {
        if (cancelled) return
        if (!navigation.canAccessPlatformUsers) {
          router.replace("/dashboard")
          return
        }
        setGuardChecked(true)
      })
      .catch((error) => {
        clientLog.error("Failed to resolve platform navigation:", error)
        if (!cancelled) router.replace("/dashboard")
      })
    return () => {
      cancelled = true
    }
  }, [router])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const response = await api.getPlatformUsers({
        search: debouncedSearch || undefined,
        page,
        pageSize: PAGE_SIZE,
        status,
      })
      setUsers(response.users)
      setTotal(response.total)
    } catch (error) {
      clientLog.error("Failed to load platform users:", error)
      toast.error("Failed to load users")
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, page, status])

  useEffect(() => {
    if (guardChecked) void loadUsers()
  }, [guardChecked, loadUsers])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  async function runConfirmedAction() {
    if (!confirmAction) return
    setConfirmBusy(true)
    const { kind, user } = confirmAction
    try {
      if (kind === "suspend") {
        await api.suspendPlatformUser(user.id)
        toast.success(`${user.email} has been suspended`)
      } else {
        await api.signOutPlatformUserEverywhere(user.id)
        toast.success(`${user.email} has been signed out everywhere`)
      }
      setConfirmAction(null)
      await loadUsers()
    } catch (error) {
      clientLog.error(`Failed to ${kind} user:`, error)
      toast.error(error instanceof Error ? error.message : "Action failed")
    } finally {
      setConfirmBusy(false)
    }
  }

  async function handleUnsuspend(user: PlatformUserView) {
    setBusyUserId(user.id)
    try {
      await api.unsuspendPlatformUser(user.id)
      toast.success(`${user.email} is no longer suspended`)
      await loadUsers()
    } catch (error) {
      clientLog.error("Failed to unsuspend user:", error)
      toast.error(error instanceof Error ? error.message : "Action failed")
    } finally {
      setBusyUserId(null)
    }
  }

  if (!guardChecked) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Checking access...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground">
          Registered Users
        </h3>
        <p className="text-sm text-muted-foreground">
          Every registered account across the platform. Suspend abusive accounts
          or force a sign-out on all devices.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search email or name"
            className="pl-8"
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as StatusFilter)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PLATFORM_USER_STATUS_FILTER.ACTIVE}>
              Active
            </SelectItem>
            <SelectItem value={PLATFORM_USER_STATUS_FILTER.CLOSED}>
              Closed
            </SelectItem>
            <SelectItem value={PLATFORM_USER_STATUS_FILTER.ALL}>All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-border bg-card">
        {loading ? (
          <div className="flex items-center justify-center px-6 py-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading users...
          </div>
        ) : users.length === 0 ? (
          <div className="px-6 py-12 text-sm text-muted-foreground">
            No users match the current filters.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Workspaces</TableHead>
                <TableHead className="text-right">Runs (7d)</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const busy = busyUserId === user.id
                return (
                  <TableRow key={user.id}>
                    <TableCell className="max-w-[260px] truncate font-medium">
                      {user.email}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {user.name}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <StatusBadges user={user} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {user.workspaceCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {user.agentRuns7d}
                    </TableCell>
                    <TableCell>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {user.suspendedAt ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 px-2"
                            disabled={busy}
                            onClick={() => void handleUnsuspend(user)}
                          >
                            {busy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                            Unsuspend
                          </Button>
                        ) : user.deletedAt ? (
                          <span className="text-xs text-muted-foreground">
                            Closed
                          </span>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1.5 px-2 text-red-500 hover:text-red-600"
                              onClick={() =>
                                setConfirmAction({ kind: "suspend", user })
                              }
                            >
                              <Ban className="h-4 w-4" />
                              Suspend
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1.5 px-2"
                              onClick={() =>
                                setConfirmAction({ kind: "sign-out", user })
                              }
                            >
                              <LogOut className="h-4 w-4" />
                              Sign out everywhere
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total} user{total === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.kind === "suspend"
                ? "Suspend this account?"
                : "Sign out everywhere?"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.kind === "suspend"
                ? `${confirmAction.user.email} will be barred from the platform immediately and signed out of all devices. You can unsuspend the account at any time.`
                : `${confirmAction?.user.email} will be signed out of all devices (web, mobile and pending device logins). This does not close the account.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={confirmBusy}
              onClick={() => setConfirmAction(null)}
            >
              Cancel
            </Button>
            <Button
              variant={
                confirmAction?.kind === "suspend" ? "destructive" : "default"
              }
              disabled={confirmBusy}
              onClick={() => void runConfirmedAction()}
            >
              {confirmBusy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : null}
              {confirmAction?.kind === "suspend"
                ? "Suspend account"
                : "Sign out everywhere"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
