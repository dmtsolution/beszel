import { Trans } from "@lingui/react/macro"
import { useStore } from "@nanostores/react"
import { getPagePath } from "@nanostores/router"
import { ArrowLeftIcon } from "lucide-react"
import AuthLogTable from "@/components/auth-log-table/auth-log-table"
import { $router, Link, navigate } from "@/components/router"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { $allSystemsById } from "@/lib/stores"

export default function SystemLogsPage({ id }: { id: string }) {
	const allSystems = useStore($allSystemsById)
	const system = allSystems[id]
	const systems = Object.values(allSystems).sort((a, b) => a.name.localeCompare(b.name))

	return (
		<div className="grid gap-4 mb-14">
			<div className="flex items-center gap-3 flex-wrap">
				<Button variant="outline" size="icon" className="shrink-0" asChild>
					<Link href={getPagePath($router, "system", { id })} aria-label="Back">
						<ArrowLeftIcon className="size-4" />
					</Link>
				</Button>
				<h1 className="text-2xl sm:text-[1.6rem] font-semibold truncate">
					<Trans>Logs</Trans>
					{system && <span className="text-muted-foreground font-normal"> - {system.name}</span>}
				</h1>
				{systems.length > 1 && (
					<Select value={id} onValueChange={(newId) => navigate(getPagePath($router, "system_logs", { id: newId }))}>
						<SelectTrigger className="w-full sm:w-52 sm:ms-auto">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{systems.map((s) => (
								<SelectItem key={s.id} value={s.id}>
									{s.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</div>
			<AuthLogTable systemId={id} alwaysShow />
		</div>
	)
}
