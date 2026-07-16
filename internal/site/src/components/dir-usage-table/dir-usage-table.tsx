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
import { dirUsageTableCols } from "@/components/dir-usage-table/dir-usage-table-columns"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { pb } from "@/lib/api"
import { $allSystemsById } from "@/lib/stores"
import { cn, formatBytes, useBrowserStorage } from "@/lib/utils"
import type { DirUsageRecord } from "@/types"
import { Separator } from "../ui/separator"

export default function DirUsageTable({ systemId }: { systemId?: string }) {
	const loadTime = Date.now()
	const [data, setData] = useState<DirUsageRecord[]>([])
	const [sorting, setSorting] = useBrowserStorage<SortingState>(
		`sort-du-${systemId ? 1 : 0}`,
		[{ id: "size", desc: true }],
		sessionStorage
	)
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
	const [globalFilter, setGlobalFilter] = useState("")

	// clear old data when systemId changes
	useEffect(() => {
		return setData([])
	}, [systemId])

	useEffect(() => {
		function fetchData(systemId?: string) {
			pb.collection<DirUsageRecord>("dir_usage")
				.getList(0, 2000, {
					fields: "path,size,system,updated",
					filter: systemId ? pb.filter("system={:system}", { system: systemId }) : undefined,
				})
				.then(
					({ items }) =>
						items.length &&
						setData((curItems) => {
							const lastUpdated = Math.max(items[0].updated, items.at(-1)?.updated ?? 0)
							const paths = new Set()
							const newItems: DirUsageRecord[] = []
							for (const item of items) {
								if (Math.abs(lastUpdated - item.updated) < 70_000) {
									paths.add(item.path)
									newItems.push(item)
								}
							}
							for (const item of curItems) {
								if (!paths.has(item.path) && lastUpdated - item.updated < 70_000) {
									newItems.push(item)
								}
							}
							return newItems
						})
				)
		}

		// initial load
		fetchData(systemId)

		// if no systemId, pull data after every system update
		if (!systemId) {
			return $allSystemsById.listen((_value, _oldValue, systemId) => {
				if (Date.now() - loadTime > 500) {
					fetchData(systemId)
				}
			})
		}

		// if systemId, refetch after the system is updated, but skip if we
		// already have a fresh-enough scan (directory scans run every ~10 minutes)
		return listenKeys($allSystemsById, [systemId], (_newSystems) => {
			const lastUpdated = data[0]?.updated ?? 0
			if (lastUpdated > Date.now() - 9.5 * 60 * 1000) {
				return
			}
			fetchData(systemId)
		})
	}, [systemId])

	const table = useReactTable({
		data,
		columns: dirUsageTableCols,
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
			const entry = row.original
			return (entry.path ?? "").toLowerCase().includes((filterValue as string).toLowerCase())
		},
	})

	const rows = table.getRowModel().rows
	const visibleColumns = table.getVisibleLeafColumns()

	const totalSize = data.reduce((sum, entry) => sum + entry.size, 0)
	const { value: totalValue, unit: totalUnit } = formatBytes(totalSize, false, undefined, false)

	if (!data.length && !globalFilter) {
		return null
	}

	return (
		<Card className="@container w-full px-3 py-5 sm:py-6 sm:px-6">
			<CardHeader className="p-0 mb-3 sm:mb-4">
				<div className="grid md:flex gap-x-5 gap-y-3 w-full items-end">
					<div className="px-2 sm:px-1">
						<CardTitle className="mb-2">
							<Trans>Directories</Trans>
						</CardTitle>
						<div className="text-sm text-muted-foreground flex items-center flex-wrap">
							<Trans>
								Total: {totalValue.toFixed(1)} {totalUnit}
							</Trans>
							<Separator orientation="vertical" className="h-4 mx-2 bg-primary/40" />
							<Trans>Updated every 10 minutes.</Trans>
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
				<AllDirUsageTable table={table} rows={rows} colLength={visibleColumns.length} />
			</div>
		</Card>
	)
}

const AllDirUsageTable = memo(function AllDirUsageTable({
	table,
	rows,
	colLength,
}: {
	table: TableType<DirUsageRecord>
	rows: Row<DirUsageRecord>[]
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
				<table className="text-sm w-full h-full text-nowrap">
					<DirUsageTableHead table={table} />
					<TableBody>
						{rows.length ? (
							virtualRows.map((virtualRow) => {
								const row = rows[virtualRow.index]
								return <DirUsageTableRow key={row.id} row={row} virtualRow={virtualRow} />
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

function DirUsageTableHead({ table }: { table: TableType<DirUsageRecord> }) {
	return (
		<TableHeader className="sticky top-0 z-50 w-full border-b-2">
			{table.getHeaderGroups().map((headerGroup) => (
				<tr key={headerGroup.id}>
					{headerGroup.headers.map((header) => (
						<TableHead className="px-2" key={header.id}>
							{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
						</TableHead>
					))}
				</tr>
			))}
		</TableHeader>
	)
}

const DirUsageTableRow = memo(function DirUsageTableRow({
	row,
	virtualRow,
}: {
	row: Row<DirUsageRecord>
	virtualRow: VirtualItem
}) {
	return (
		<TableRow>
			{row.getVisibleCells().map((cell) => (
				<TableCell
					key={cell.id}
					className="py-0"
					style={{
						height: virtualRow.size,
					}}
				>
					{flexRender(cell.column.columnDef.cell, cell.getContext())}
				</TableCell>
			))}
		</TableRow>
	)
})
