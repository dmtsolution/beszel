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
import { listenKeys } from "nanostores"
import { memo, useEffect, useRef, useState } from "react"
import { authLogTableCols, getAuthEventLabel } from "@/components/auth-log-table/auth-log-table-columns"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { pb } from "@/lib/api"
import { AuthEventType } from "@/lib/enums"
import { $allSystemsById } from "@/lib/stores"
import { cn, useBrowserStorage } from "@/lib/utils"
import type { AuthLogRecord } from "@/types"
import { Separator } from "../ui/separator"

const MAX_EVENTS = 500

export default function AuthLogTable({ systemId }: { systemId?: string }) {
	const loadTime = Date.now()
	const [data, setData] = useState<AuthLogRecord[]>([])
	const [sorting, setSorting] = useBrowserStorage<SortingState>(
		`sort-al-${systemId ? 1 : 0}`,
		[{ id: "time", desc: true }],
		sessionStorage
	)
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
	const [globalFilter, setGlobalFilter] = useState("")

	useEffect(() => {
		return setData([])
	}, [systemId])

	useEffect(() => {
		function fetchData(systemId?: string) {
			pb.collection<AuthLogRecord>("auth_log")
				.getList(0, MAX_EVENTS, {
					sort: "-time",
					fields: "id,time,type,user,source_ip,detail,system",
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

	const table = useReactTable({
		data,
		columns: authLogTableCols,
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
			const searchString = `${label} ${event.user ?? ""} ${event.source_ip ?? ""} ${event.detail ?? ""}`.toLowerCase()
			return (filterValue as string)
				.toLowerCase()
				.split(" ")
				.every((term) => searchString.includes(term))
		},
	})

	const rows = table.getRowModel().rows
	const visibleColumns = table.getVisibleLeafColumns()

	if (!data.length && !globalFilter) {
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
							<Trans>Total: {data.length}</Trans>
							<Separator orientation="vertical" className="h-4 mx-2 bg-primary/40" />
							<Trans>SSH logins, sudo commands, fail2ban bans, and web server errors/suspicious requests.</Trans>
						</div>
					</div>
					<Input
						placeholder={t`Filter...`}
						value={globalFilter}
						onChange={(e) => setGlobalFilter(e.target.value)}
						className="ms-auto px-4 w-full max-w-full md:w-64"
					/>
				</div>
			</CardHeader>
			<div className="rounded-md">
				<AllAuthLogTable table={table} rows={rows} colLength={visibleColumns.length} />
			</div>
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
						<TableHead className="px-2" key={header.id} style={{ width: header.getSize() }}>
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
						width: cell.column.getSize(),
					}}
				>
					{flexRender(cell.column.columnDef.cell, cell.getContext())}
				</TableCell>
			))}
		</TableRow>
	)
})
