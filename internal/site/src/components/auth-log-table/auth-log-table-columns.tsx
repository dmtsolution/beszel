import type { Column, ColumnDef } from "@tanstack/react-table"
import { t } from "@lingui/core/macro"
import { ArrowUpDownIcon, ClockIcon, KeyRoundIcon, ShieldIcon, TerminalIcon, UserIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AuthEventType } from "@/lib/enums"
import { cn } from "@/lib/utils"
import type { AuthLogRecord } from "@/types"

function HeaderButton({ column, name, Icon }: { column: Column<AuthLogRecord>; name: string; Icon: React.ElementType }) {
	const isSorted = column.getIsSorted()
	return (
		<Button
			className={cn(
				"h-9 px-3 flex items-center gap-2 duration-50",
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

export function getAuthEventLabel(type: AuthEventType) {
	switch (type) {
		case AuthEventType.SSHSuccess:
			return t`SSH login`
		case AuthEventType.SSHFailure:
			return t`SSH failed`
		case AuthEventType.Sudo:
			return t`Sudo`
		case AuthEventType.Ban:
			return t`Banned`
		case AuthEventType.Unban:
			return t`Unbanned`
		default:
			return t`Unknown`
	}
}

export function getAuthEventColor(type: AuthEventType) {
	switch (type) {
		case AuthEventType.SSHSuccess:
			return "bg-green-500"
		case AuthEventType.SSHFailure:
			return "bg-red-500"
		case AuthEventType.Sudo:
			return "bg-blue-500"
		case AuthEventType.Ban:
			return "bg-red-600"
		case AuthEventType.Unban:
			return "bg-zinc-500"
		default:
			return "bg-zinc-500"
	}
}

export const authLogTableCols: ColumnDef<AuthLogRecord>[] = [
	{
		id: "time",
		size: 190,
		accessorFn: (record) => record.time,
		header: ({ column }) => <HeaderButton column={column} name={t`Time`} Icon={ClockIcon} />,
		cell: ({ getValue }) => {
			const time = getValue() as number
			return (
				<span className="ms-1.5 whitespace-nowrap block">
					{new Date(time * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })}
				</span>
			)
		},
	},
	{
		id: "type",
		size: 150,
		accessorFn: (record) => record.type,
		header: ({ column }) => <HeaderButton column={column} name={t`Event`} Icon={ShieldIcon} />,
		cell: ({ getValue }) => {
			const eventType = getValue() as AuthEventType
			return (
				<Badge variant="outline" className="ms-1.5 dark:border-white/12">
					<span className={cn("size-2 me-1.5 rounded-full", getAuthEventColor(eventType))} />
					{getAuthEventLabel(eventType)}
				</Badge>
			)
		},
	},
	{
		id: "user",
		size: 140,
		accessorFn: (record) => record.user,
		header: ({ column }) => <HeaderButton column={column} name={t`User`} Icon={UserIcon} />,
		cell: ({ getValue }) => {
			const user = getValue() as string
			return <span className="ms-1.5 truncate block font-mono text-xs">{user || "—"}</span>
		},
	},
	{
		id: "source_ip",
		size: 150,
		accessorFn: (record) => record.source_ip,
		header: ({ column }) => <HeaderButton column={column} name={t`Source IP`} Icon={KeyRoundIcon} />,
		cell: ({ getValue }) => {
			const ip = getValue() as string
			return <span className="ms-1.5 truncate block font-mono text-xs">{ip || "—"}</span>
		},
	},
	{
		id: "detail",
		size: 400,
		accessorFn: (record) => record.detail,
		header: ({ column }) => <HeaderButton column={column} name={t`Detail`} Icon={TerminalIcon} />,
		cell: ({ getValue }) => {
			const detail = getValue() as string
			return (
				<span className="ms-1.5 truncate block font-mono text-xs" title={detail}>
					{detail || "—"}
				</span>
			)
		},
	},
]
