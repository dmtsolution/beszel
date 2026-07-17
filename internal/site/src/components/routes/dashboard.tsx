import { Trans } from "@lingui/react/macro"
import { useStore } from "@nanostores/react"
import { getPagePath } from "@nanostores/router"
import { AlertTriangleIcon, BanIcon, KeySquareIcon, ServerIcon, ShieldAlertIcon, XCircleIcon } from "lucide-react"
import { memo, useEffect, useState } from "react"
import { ActiveAlerts } from "@/components/active-alerts"
import { FooterRepoLink } from "@/components/footer-repo-link"
import { $router, Link } from "@/components/router"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { pb } from "@/lib/api"
import { AuthEventType, SystemStatus } from "@/lib/enums"
import { $allSystemsById } from "@/lib/stores"
import { cn } from "@/lib/utils"

const DAY_SECONDS = 86400

async function countAuthLog(filter: string): Promise<number> {
	try {
		const result = await pb.collection("auth_log").getList(1, 1, { filter, fields: "id" })
		return result.totalItems
	} catch {
		return 0
	}
}

function StatTile({
	title,
	value,
	icon: Icon,
	color,
	href,
}: {
	title: React.ReactNode
	value: React.ReactNode
	icon: React.ElementType
	color?: "good" | "warning" | "critical"
	href?: string
}) {
	const colorClass =
		color === "critical"
			? "text-red-500"
			: color === "warning"
				? "text-orange-500"
				: color === "good"
					? "text-green-500"
					: "text-primary"

	const content = (
		<Card className={cn("h-full", href && "hover:-translate-y-px duration-200 hover:shadow-md shadow-black/5")}>
			<CardContent className="flex items-center gap-4 py-2">
				<Icon className={cn("size-8 shrink-0", colorClass)} strokeWidth={1.5} />
				<div>
					<div className="text-2xl font-semibold tabular-nums">{value}</div>
					<div className="text-sm text-muted-foreground">{title}</div>
				</div>
			</CardContent>
		</Card>
	)

	if (!href) return content

	return (
		<Link href={href} className="contents">
			{content}
		</Link>
	)
}

export default memo(function Dashboard() {
	const allSystems = useStore($allSystemsById)
	const systems = Object.values(allSystems)
	const systemsUp = systems.filter((s) => s.status === SystemStatus.Up).length
	const systemsDown = systems.filter((s) => s.status === SystemStatus.Down).length
	const failedServices = systems.reduce((sum, s) => sum + (s.info.sv?.[1] ?? 0), 0)

	const [sshSuccess, setSshSuccess] = useState<number | null>(null)
	const [sshFailed, setSshFailed] = useState<number | null>(null)
	const [banned, setBanned] = useState<number | null>(null)
	const [suspicious, setSuspicious] = useState<number | null>(null)

	useEffect(() => {
		document.title = "Dashboard / Beszel"

		const cutoff = Math.floor(Date.now() / 1000) - DAY_SECONDS
		countAuthLog(pb.filter("type = {:t} && time >= {:c}", { t: AuthEventType.SSHSuccess, c: cutoff })).then(setSshSuccess)
		countAuthLog(pb.filter("type = {:t} && time >= {:c}", { t: AuthEventType.SSHFailure, c: cutoff })).then(setSshFailed)
		countAuthLog(pb.filter("type = {:t} && time >= {:c}", { t: AuthEventType.Ban, c: cutoff })).then(setBanned)
		countAuthLog(pb.filter("type = {:t} && time >= {:c}", { t: AuthEventType.HTTPSuspicious, c: cutoff })).then(setSuspicious)
	}, [])

	const dash = (n: number | null) => (n === null ? "—" : n)

	const firstSystemId = systems[0]?.id

	return (
		<>
			<div className="flex flex-col gap-4">
				<Card className="px-3 py-5 sm:py-6 sm:px-6">
					<CardHeader className="p-0 mb-4">
						<div className="px-2 sm:px-1">
							<CardTitle className="mb-1.5">
								<Trans>Dashboard</Trans>
							</CardTitle>
							<CardDescription>
								<Trans>Overview of your systems' activity and security.</Trans>
							</CardDescription>
						</div>
					</CardHeader>
					<CardContent className="p-0">
						<div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
							<StatTile
								title={<Trans>Systems up</Trans>}
								value={`${systemsUp} / ${systems.length}`}
								icon={ServerIcon}
								color={systemsDown > 0 ? "warning" : "good"}
								href={getPagePath($router, "systems")}
							/>
							<StatTile
								title={<Trans>Failed services</Trans>}
								value={failedServices}
								icon={XCircleIcon}
								color={failedServices > 0 ? "critical" : "good"}
								href={getPagePath($router, "systems")}
							/>
							<StatTile
								title={<Trans>SSH logins (24h)</Trans>}
								value={dash(sshSuccess)}
								icon={KeySquareIcon}
								color="good"
								href={firstSystemId && getPagePath($router, "system_logs", { id: firstSystemId })}
							/>
							<StatTile
								title={<Trans>SSH failures (24h)</Trans>}
								value={dash(sshFailed)}
								icon={ShieldAlertIcon}
								color={sshFailed ? "warning" : undefined}
								href={firstSystemId && getPagePath($router, "system_logs", { id: firstSystemId })}
							/>
							<StatTile
								title={<Trans>IPs banned (24h)</Trans>}
								value={dash(banned)}
								icon={BanIcon}
								color={banned ? "critical" : undefined}
								href={firstSystemId && getPagePath($router, "system_logs", { id: firstSystemId })}
							/>
							<StatTile
								title={<Trans>Suspicious requests (24h)</Trans>}
								value={dash(suspicious)}
								icon={AlertTriangleIcon}
								color={suspicious ? "critical" : undefined}
								href={firstSystemId && getPagePath($router, "system_logs", { id: firstSystemId })}
							/>
						</div>
					</CardContent>
				</Card>
				<ActiveAlerts />
			</div>
			<FooterRepoLink />
		</>
	)
})
