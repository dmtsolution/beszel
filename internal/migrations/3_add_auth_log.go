package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// This migration adds the auth_log collection, which stores authentication
// and security-relevant events parsed from system logs (SSH logins, sudo
// command usage, fail2ban bans). Unlike dir_usage/systemd_services, this is
// an append-only event log: each row is a distinct historical event, not a
// current-state snapshot, so there is no upsert-by-key semantics here.
func init() {
	m.Register(func(app core.App) error {
		jsonData := `[
	{
		"id": "pbc_auth_log001",
		"listRule": null,
		"viewRule": null,
		"createRule": null,
		"updateRule": null,
		"deleteRule": null,
		"name": "auth_log",
		"type": "base",
		"fields": [
			{
				"autogeneratePattern": "[a-z0-9]{15}",
				"hidden": false,
				"id": "text3208210256",
				"max": 15,
				"min": 15,
				"name": "id",
				"pattern": "^[a-z0-9]+$",
				"presentable": false,
				"primaryKey": true,
				"required": true,
				"system": true,
				"type": "text"
			},
			{
				"cascadeDelete": true,
				"collectionId": "2hz5ncl8tizk5nx",
				"hidden": false,
				"id": "al_system",
				"maxSelect": 1,
				"minSelect": 0,
				"name": "system",
				"presentable": false,
				"required": false,
				"system": false,
				"type": "relation"
			},
			{
				"hidden": false,
				"id": "al_time",
				"max": null,
				"min": null,
				"name": "time",
				"onlyInt": true,
				"presentable": false,
				"required": true,
				"system": false,
				"type": "number"
			},
			{
				"hidden": false,
				"id": "al_type",
				"max": null,
				"min": null,
				"name": "type",
				"onlyInt": true,
				"presentable": false,
				"required": false,
				"system": false,
				"type": "number"
			},
			{
				"autogeneratePattern": "",
				"hidden": false,
				"id": "al_user",
				"max": 0,
				"min": 0,
				"name": "user",
				"pattern": "",
				"presentable": false,
				"primaryKey": false,
				"required": false,
				"system": false,
				"type": "text"
			},
			{
				"autogeneratePattern": "",
				"hidden": false,
				"id": "al_source_ip",
				"max": 0,
				"min": 0,
				"name": "source_ip",
				"pattern": "",
				"presentable": false,
				"primaryKey": false,
				"required": false,
				"system": false,
				"type": "text"
			},
			{
				"autogeneratePattern": "",
				"hidden": false,
				"id": "al_detail",
				"max": 0,
				"min": 0,
				"name": "detail",
				"pattern": "",
				"presentable": false,
				"primaryKey": false,
				"required": false,
				"system": false,
				"type": "text"
			},
			{
				"hidden": false,
				"id": "autodate2990389176",
				"name": "created",
				"onCreate": true,
				"onUpdate": false,
				"presentable": false,
				"system": false,
				"type": "autodate"
			}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_auth_log_system_time` + "`" + ` ON ` + "`" + `auth_log` + "`" + ` (\n  ` + "`" + `system` + "`" + `,\n  ` + "`" + `time` + "`" + `\n)"
		],
		"system": false
	}
]`
		return app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false)
	}, func(app core.App) error {
		if c, err := app.FindCollectionByNameOrId("auth_log"); err == nil {
			if err := app.Delete(c); err != nil {
				return err
			}
		}
		return nil
	})
}
