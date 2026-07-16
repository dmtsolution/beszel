package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// This migration adds the dir_usage collection, which tracks disk usage per
// top-level directory on the monitored system (e.g. /home, /var, /var/lib/docker).
func init() {
	m.Register(func(app core.App) error {
		jsonData := `[
	{
		"id": "pbc_dir_usage001",
		"listRule": null,
		"viewRule": null,
		"createRule": null,
		"updateRule": null,
		"deleteRule": null,
		"name": "dir_usage",
		"type": "base",
		"fields": [
			{
				"autogeneratePattern": "[a-z0-9]{10}",
				"hidden": false,
				"id": "text3208210256",
				"max": 10,
				"min": 10,
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
				"id": "du_system",
				"maxSelect": 1,
				"minSelect": 0,
				"name": "system",
				"presentable": false,
				"required": false,
				"system": false,
				"type": "relation"
			},
			{
				"autogeneratePattern": "",
				"hidden": false,
				"id": "du_path",
				"max": 0,
				"min": 0,
				"name": "path",
				"pattern": "",
				"presentable": false,
				"primaryKey": false,
				"required": false,
				"system": false,
				"type": "text"
			},
			{
				"hidden": false,
				"id": "du_size",
				"max": null,
				"min": null,
				"name": "size",
				"onlyInt": true,
				"presentable": false,
				"required": false,
				"system": false,
				"type": "number"
			},
			{
				"hidden": false,
				"id": "du_updated",
				"max": null,
				"min": null,
				"name": "updated",
				"onlyInt": true,
				"presentable": false,
				"required": true,
				"system": false,
				"type": "number"
			}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_dir_usage_system` + "`" + ` ON ` + "`" + `dir_usage` + "`" + ` (` + "`" + `system` + "`" + `)"
		],
		"system": false
	}
]`
		return app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false)
	}, func(app core.App) error {
		// down: remove the dir_usage collection
		if c, err := app.FindCollectionByNameOrId("dir_usage"); err == nil {
			if err := app.Delete(c); err != nil {
				return err
			}
		}
		return nil
	})
}
