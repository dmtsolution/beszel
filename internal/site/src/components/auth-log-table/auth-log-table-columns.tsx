import type { Column, ColumnDef } from "@tanstack/react-table"
import { t } from "@lingui/core/macro"
import { ArrowUpDownIcon, ClockIcon, EyeIcon, FolderIcon, KeyRoundIcon, ShieldIcon, UserIcon } from "lucide-react"
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
		case AuthEventType.HTTPAccess:
			return t`HTTP`
		case AuthEventType.HTTPSuspicious:
			return t`Suspicious request`
		case AuthEventType.WebServerError:
			return t`Web server error`
		default:
			return t`Unknown`
	}
}

/** Status-code-aware color for HTTP events; falls back to a fixed color per event type otherwise. */
export function getAuthEventColor(type: AuthEventType, statusCode?: number) {
	if (type === AuthEventType.HTTPAccess && statusCode) {
		if (statusCode >= 500) return "bg-red-600"
		if (statusCode >= 400) return "bg-orange-500"
		if (statusCode >= 300) return "bg-blue-500"
		return "bg-green-500"
	}
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
		case AuthEventType.HTTPAccess:
			return "bg-zinc-500"
		case AuthEventType.HTTPSuspicious:
			return "bg-red-600"
		case AuthEventType.WebServerError:
			return "bg-yellow-500"
		default:
			return "bg-zinc-500"
	}
}

export function makeAuthLogTableCols(openSheet: (record: AuthLogRecord) => void): ColumnDef<AuthLogRecord>[] {
	return [
		{
			id: "time",
			size: 180,
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
			size: 160,
			accessorFn: (record) => record.type,
			header: ({ column }) => <HeaderButton column={column} name={t`Event`} Icon={ShieldIcon} />,
			cell: ({ row }) => {
				const eventType = row.original.type as AuthEventType
				const statusCode = row.original.status_code
				const label = getAuthEventLabel(eventType)
				return (
					<Badge variant="outline" className="ms-1.5 dark:border-white/12">
						<span className={cn("size-2 me-1.5 rounded-full", getAuthEventColor(eventType, statusCode))} />
						{eventType === AuthEventType.HTTPAccess && statusCode ? `${label} ${statusCode}` : label}
					</Badge>
				)
			},
		},
		{
			id: "user",
			size: 110,
			accessorFn: (record) => record.user,
			header: ({ column }) => <HeaderButton column={column} name={t`User`} Icon={UserIcon} />,
			cell: ({ getValue }) => {
				const user = getValue() as string
				return <span className="ms-1.5 truncate block font-mono text-xs">{user || "—"}</span>
			},
		},
		{
			id: "source_ip",
			size: 130,
			accessorFn: (record) => record.source_ip,
			header: ({ column }) => <HeaderButton column={column} name={t`Source IP`} Icon={KeyRoundIcon} />,
			cell: ({ getValue }) => {
				const ip = getValue() as string
				return <span className="ms-1.5 truncate block font-mono text-xs">{ip || "—"}</span>
			},
		},
		{
			id: "path",
			size: 320,
			accessorFn: (record) => record.path || record.detail,
			header: ({ column }) => <HeaderButton column={column} name={t`Path / Detail`} Icon={FolderIcon} />,
			cell: ({ row }) => {
				const value = row.original.path || row.original.detail
				return (
					<span className="ms-1.5 truncate block font-mono text-xs" title={value}>
						{value || "—"}
					</span>
				)
			},
		},
		{
			id: "view",
			size: 40,
			enableSorting: false,
			header: () => <span className="flex justify-center text-xs text-muted-foreground">{t`Details`}</span>,
			cell: ({ row }) => (
				<div className="flex justify-center">
					<Button
						variant="ghost"
						size="icon"
						className="size-7 text-muted-foreground"
						aria-label={t`View details`}
						onClick={(e) => {
							e.stopPropagation()
							openSheet(row.original)
						}}
					>
						<EyeIcon className="size-4" />
					</Button>
				</div>
			),
		},
	]
}
