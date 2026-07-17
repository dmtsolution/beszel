import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"
import {
	type ColumnFiltersState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getSortedRowModel,
	type Row,
	type SortingState,
	type Table as TableType,
	useReactTable,
} from "@tanstack/react-table"
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual"
import { FilterIcon } from "lucide-react"
import { listenKeys } from "nanostores"
import { memo, useEffect, useMemo, useRef, useState } from "react"
import { getAuthEventColor, getAuthEventLabel, makeAuthLogTableCols } from "@/components/auth-log-table/auth-log-table-columns"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { pb } from "@/lib/api"
import { AuthEventType } from "@/lib/enums"
import { $allSystemsById } from "@/lib/stores"
import { cn, useBrowserStorage } from "@/lib/utils"
import type { AuthLogRecord } from "@/types"
import { Separator } from "../ui/separator"

const MAX_EVENTS = 500

type Period = "1h" | "24h" | "7d" | "30d" | "all" | "custom"

const periodSeconds: Record<Exclude<Period, "all">, number> = {
	"1h": 3600,
	"24h": 86400,
	"7d": 7 * 86400,
	"30d": 30 * 86400,
}

const allEventTypes = [
	AuthEventType.SSHSuccess,
	AuthEventType.SSHFailure,
	AuthEventType.Sudo,
	AuthEventType.Ban,
	AuthEventType.Unban,
	AuthEventType.HTTPAccess,
	AuthEventType.HTTPSuspicious,
	AuthEventType.WebServerError,
]

export default function AuthLogTable({ systemId, alwaysShow }: { systemId?: string; alwaysShow?: boolean }) {
	const loadTime = Date.now()
	const [data, setData] = useState<AuthLogRecord[]>([])
	const [sorting, setSorting] = useBrowserStorage<SortingState>(
		`sort-al-${systemId ? 1 : 0}`,
		[{ id: "time", desc: true }],
		sessionStorage
	)
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
	const [globalFilter, setGlobalFilter] = useState("")
	const [selectedTypes, setSelectedTypes] = useState<Set<AuthEventType>>(new Set())
	const [period, setPeriod] = useBrowserStorage<Period>("logs-period", "24h", sessionStorage)
	const [customDateTime, setCustomDateTime] = useState("")

	const [sheetOpen, setSheetOpen] = useState(false)
	const activeEvent = useRef<AuthLogRecord | null>(null)
	const openSheet = (record: AuthLogRecord) => {
		activeEvent.current = record
		setSheetOpen(true)
	}

	const columns = useMemo(() => makeAuthLogTableCols(openSheet), [])

	useEffect(() => {
		return setData([])
	}, [systemId])

	useEffect(() => {
		function fetchData(systemId?: string) {
			pb.collection<AuthLogRecord>("auth_log")
				.getList(0, MAX_EVENTS, {
					sort: "-time",
					fields: "id,time,type,user,source_ip,detail,method,path,status_code,user_agent,source_port,system",
					filter: systemId ? pb.filter("system={:system}", { system: systemId }) : undefined,
				})
				.then(({ items }) => items.length && setData(items))
		}

		fetchData(systemId)

		if (!systemId) {
			return $allSystemsById.listen((_value, _oldValue, systemId) => {
				if (Date.now() - loadTime > 500) {
					fetchData(systemId)
				}
			})
		}

		return listenKeys($allSystemsById, [systemId], (_newSystems) => {
			fetchData(systemId)
		})
	}, [systemId])

	const filteredData = useMemo(() => {
		let out = data
		if (selectedTypes.size > 0) {
			out = out.filter((d) => selectedTypes.has(d.type as AuthEventType))
		}
		if (period === "custom") {
			if (customDateTime) {
				const cutoff = new Date(customDateTime).getTime() / 1000
				out = out.filter((d) => d.time >= cutoff)
			}
		} else if (period !== "all") {
			const cutoff = Date.now() / 1000 - periodSeconds[period]
			out = out.filter((d) => d.time >= cutoff)
		}
		return out
	}, [data, selectedTypes, period, customDateTime])

	const table = useReactTable({
		data: filteredData,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		defaultColumn: {
			sortUndefined: "last",
			size: 100,
			minSize: 0,
		},
		state: {
			sorting,
			columnFilters,
			globalFilter,
		},
		onGlobalFilterChange: setGlobalFilter,
		globalFilterFn: (row, _columnId, filterValue) => {
			const event = row.original
			const label = getAuthEventLabel(event.type as AuthEventType)
			const searchString = `${label} ${event.user ?? ""} ${event.source_ip ?? ""} ${event.path ?? ""} ${event.detail ?? ""}`.toLowerCase()
			return (filterValue as string)
				.toLowerCase()
				.split(" ")
				.every((term) => searchString.includes(term))
		},
	})

	const rows = table.getRowModel().rows
	const visibleColumns = table.getVisibleLeafColumns()

	if (!alwaysShow && !data.length && !globalFilter) {
		return null
	}

	return (
		<Card className="@container w-full px-3 py-5 sm:py-6 sm:px-6">
			<CardHeader className="p-0 mb-3 sm:mb-4">
				<div className="grid md:flex gap-x-5 gap-y-3 w-full items-end">
					<div className="px-2 sm:px-1">
						<CardTitle className="mb-2">
							<Trans>Logs</Trans>
						</CardTitle>
						<div className="text-sm text-muted-foreground flex items-center flex-wrap">
							<Trans>Total: {filteredData.length}</Trans>
							<Separator orientation="vertical" className="h-4 mx-2 bg-primary/40" />
							<Trans>SSH logins, sudo commands, fail2ban bans, and web server activity.</Trans>
						</div>
					</div>
					<div className="flex gap-2 ms-auto flex-wrap">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" className="gap-2">
									<FilterIcon className="size-4" />
									<Trans>Type</Trans>
									{selectedTypes.size > 0 && <span className="text-xs opacity-70">({selectedTypes.size})</span>}
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="min-w-52">
								{allEventTypes.map((type) => (
									<DropdownMenuCheckboxItem
										key={type}
										checked={selectedTypes.has(type)}
										onSelect={(e) => e.preventDefault()}
										onCheckedChange={(checked) => {
											setSelectedTypes((prev) => {
												const next = new Set(prev)
												if (checked) {
													next.add(type)
												} else {
													next.delete(type)
												}
												return next
											})
										}}
									>
										<span className={cn("size-2 me-1.5 rounded-full", getAuthEventColor(type))} />
										{getAuthEventLabel(type)}
									</DropdownMenuCheckboxItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
						<Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
							<SelectTrigger className="w-36">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="1h">{t`Last hour`}</SelectItem>
								<SelectItem value="24h">{t`Last 24 hours`}</SelectItem>
								<SelectItem value="7d">{t`Last 7 days`}</SelectItem>
								<SelectItem value="30d">{t`Last 30 days`}</SelectItem>
								<SelectItem value="all">{t`All time`}</SelectItem>
								<SelectItem value="custom">{t`Custom date...`}</SelectItem>
							</SelectContent>
						</Select>
						{period === "custom" && (
							<input
								type="datetime-local"
								value={customDateTime}
								onChange={(e) => setCustomDateTime(e.target.value)}
								className="h-9 px-3 rounded-md border bg-transparent text-sm w-full sm:w-56"
							/>
						)}
						<Input
							placeholder={t`Filter...`}
							value={globalFilter}
							onChange={(e) => setGlobalFilter(e.target.value)}
							className="w-full max-w-full md:w-52"
						/>
					</div>
				</div>
			</CardHeader>
			<div className="rounded-md">
				<AllAuthLogTable table={table} rows={rows} colLength={visibleColumns.length} />
			</div>
			<AuthLogSheet sheetOpen={sheetOpen} setSheetOpen={setSheetOpen} activeEvent={activeEvent} />
		</Card>
	)
}

const AllAuthLogTable = memo(function AllAuthLogTable({
	table,
	rows,
	colLength,
}: {
	table: TableType<AuthLogRecord>
	rows: Row<AuthLogRecord>[]
	colLength: number
}) {
	const scrollRef = useRef<HTMLDivElement>(null)

	const virtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
		count: rows.length,
		estimateSize: () => 44,
		getScrollElement: () => scrollRef.current,
		overscan: 5,
	})
	const virtualRows = virtualizer.getVirtualItems()

	const paddingTop = Math.max(0, virtualRows[0]?.start ?? 0 - virtualizer.options.scrollMargin)
	const paddingBottom = Math.max(0, virtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end ?? 0))

	return (
		<div
			className={cn(
				"h-min max-h-[calc(100dvh-17rem)] max-w-full relative overflow-auto border rounded-md",
				(!rows.length || rows.length > 2) && "min-h-30"
			)}
			ref={scrollRef}
		>
			<div style={{ height: `${virtualizer.getTotalSize() + 40}px`, paddingTop, paddingBottom }}>
				<table className="text-sm w-full h-full text-nowrap table-fixed">
					<AuthLogTableHead table={table} />
					<TableBody>
						{rows.length ? (
							virtualRows.map((virtualRow) => {
								const row = rows[virtualRow.index]
								return <AuthLogTableRow key={row.id} row={row} virtualRow={virtualRow} />
							})
						) : (
							<TableRow>
								<TableCell colSpan={colLength} className="h-30 text-center pointer-events-none">
									<Trans>No results.</Trans>
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</table>
			</div>
		</div>
	)
})

function AuthLogTableHead({ table }: { table: TableType<AuthLogRecord> }) {
	return (
		<TableHeader className="sticky top-0 z-50 w-full border-b-2">
			{table.getHeaderGroups().map((headerGroup) => (
				<tr key={headerGroup.id}>
					{headerGroup.headers.map((header) => (
						<TableHead
							className="px-2"
							key={header.id}
							style={{ width: header.column.id === "path" ? "auto" : header.getSize() }}
						>
							{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
						</TableHead>
					))}
				</tr>
			))}
		</TableHeader>
	)
}

const AuthLogTableRow = memo(function AuthLogTableRow({ row, virtualRow }: { row: Row<AuthLogRecord>; virtualRow: VirtualItem }) {
	return (
		<TableRow>
			{row.getVisibleCells().map((cell) => (
				<TableCell
					key={cell.id}
					className="py-0"
					style={{
						height: virtualRow.size,
						width: cell.column.id === "path" ? "auto" : cell.column.getSize(),
					}}
				>
					{flexRender(cell.column.columnDef.cell, cell.getContext())}
				</TableCell>
			))}
		</TableRow>
	)
})

function AuthLogSheet({
	sheetOpen,
	setSheetOpen,
	activeEvent,
}: {
	sheetOpen: boolean
	setSheetOpen: (open: boolean) => void
	activeEvent: React.RefObject<AuthLogRecord | null>
}) {
	const event = activeEvent.current
	if (!event) return null

	const notAvailable = <span className="text-muted-foreground">N/A</span>

	const renderRow = (key: string, label: React.ReactNode, value?: React.ReactNode, alwaysShow = false) => {
		if (!alwaysShow && (value === undefined || value === null || value === "")) {
			return null
		}
		return (
			<tr key={key} className="border-b last:border-b-0">
				<td className="px-3 py-2 font-medium bg-muted dark:bg-muted/40 align-top w-35">{label}</td>
				<td className="px-3 py-2 break-all">{value ?? notAvailable}</td>
			</tr>
		)
	}

	return (
		<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
			<SheetContent className="w-full sm:max-w-160 p-6 overflow-y-auto">
				<SheetHeader className="p-0">
					<SheetTitle className="flex items-center gap-2">
						<span className={cn("size-2.5 rounded-full", getAuthEventColor(event.type as AuthEventType, event.status_code))} />
						{getAuthEventLabel(event.type as AuthEventType)}
					</SheetTitle>
				</SheetHeader>
				<div className="border rounded-md">
					<table className="w-full text-sm">
						<tbody>
							{renderRow("time", t`Time`, new Date(event.time * 1000).toLocaleString(), true)}
							{renderRow("user", t`User`, event.user)}
							{renderRow("source_ip", t`Source IP`, event.source_ip)}
							{renderRow("source_port", t`Source port`, event.source_port)}
							{renderRow("method", t`Method`, event.method)}
							{renderRow("path", t`Path`, event.path)}
							{renderRow("status_code", t`Status code`, event.status_code)}
							{renderRow("user_agent", t`User agent`, event.user_agent)}
							{renderRow("detail", t`Detail`, event.detail)}
						</tbody>
					</table>
				</div>
			</SheetContent>
		</Sheet>
	)
}
