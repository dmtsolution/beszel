import type { Column, ColumnDef } from "@tanstack/react-table"
import { t } from "@lingui/core/macro"
import { ArrowUpDownIcon, ClockIcon, FolderIcon, HardDriveIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn, decimalString, formatBytes } from "@/lib/utils"
import type { DirUsageRecord } from "@/types"

function HeaderButton({
	column,
	name,
	Icon,
	align = "start",
}: {
	column: Column<DirUsageRecord>
	name: string
	Icon: React.ElementType
	align?: "start" | "end"
}) {
	const isSorted = column.getIsSorted()
	return (
		<Button
			className={cn(
				"h-9 px-3 flex items-center gap-2 duration-50 w-full",
				align === "end" && "justify-end",
				isSorted && "bg-accent/70 light:bg-accent text-accent-foreground/90"
			)}
			variant="ghost"
			onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
		>
			{Icon && <Icon className="size-4" />}
			{name}
			<ArrowUpDownIcon className="size-4" />
		</Button>
	)
}

export const dirUsageTableCols: ColumnDef<DirUsageRecord>[] = [
	{
		id: "path",
		size: 400,
		sortingFn: (a, b) => a.original.path.localeCompare(b.original.path),
		accessorFn: (record) => record.path,
		header: ({ column }) => <HeaderButton column={column} name={t`Path`} Icon={FolderIcon} />,
		cell: ({ getValue }) => {
			return <span className="ms-1.5 block truncate font-mono text-xs">{getValue() as string}</span>
		},
	},
	{
		id: "size",
		size: 220,
		accessorFn: (record) => record.size,
		header: ({ column }) => <HeaderButton column={column} name={t`Size`} Icon={HardDriveIcon} />,
		cell: ({ getValue, row, table }) => {
			const size = getValue() as number
			const maxSize = Math.max(...table.options.data.map((d) => d.size), 1)
			const { value, unit } = formatBytes(size, false, undefined, false)
			const pct = (size / maxSize) * 100
			return (
				<div className="ms-1.5 me-4 flex items-center gap-2">
					<span className="tabular-nums whitespace-nowrap">
						{decimalString(value, value >= 10 ? 1 : 2)} {unit}
					</span>
					<div className="hidden sm:block h-1.5 grow rounded-full bg-muted overflow-hidden min-w-10">
						<div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
					</div>
				</div>
			)
		},
	},
	{
		id: "modified",
		size: 200,
		accessorFn: (record) => record.modified,
		header: ({ column }) => <HeaderButton column={column} name={t`Modified`} Icon={ClockIcon} align="end" />,
		cell: ({ getValue }) => {
			const modified = getValue() as number
			if (!modified) {
				return <span className="me-4 text-muted-foreground block text-right">—</span>
			}
			return (
				<span className="me-4 whitespace-nowrap block text-right">
					{new Date(modified * 1000).toLocaleString(undefined, {
						dateStyle: "medium",
						timeStyle: "short",
					})}
				</span>
			)
		},
	},
]
