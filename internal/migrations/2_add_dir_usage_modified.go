package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// This migration adds a "modified" field to the dir_usage collection,
// storing each directory's own last-modified time (unix seconds).
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("dir_usage")
		if err != nil {
			return err
		}
		collection.Fields.Add(&core.NumberField{
			Name:     "modified",
			OnlyInt:  true,
			Required: false,
		})
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("dir_usage")
		if err != nil {
			return err
		}
		collection.Fields.RemoveByName("modified")
		return app.Save(collection)
	})
}
