package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// This migration adds structured HTTP fields to auth_log (method, path,
// status_code, user_agent, source_port), so the UI can offer a full detail
// view and per-field filtering instead of relying on the free-text "detail"
// column alone.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("auth_log")
		if err != nil {
			return err
		}
		collection.Fields.Add(
			&core.TextField{Name: "method"},
			&core.TextField{Name: "path"},
			&core.NumberField{Name: "status_code", OnlyInt: true},
			&core.TextField{Name: "user_agent"},
			&core.NumberField{Name: "source_port", OnlyInt: true},
		)
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("auth_log")
		if err != nil {
			return err
		}
		collection.Fields.RemoveByName("method")
		collection.Fields.RemoveByName("path")
		collection.Fields.RemoveByName("status_code")
		collection.Fields.RemoveByName("user_agent")
		collection.Fields.RemoveByName("source_port")
		return app.Save(collection)
	})
}
