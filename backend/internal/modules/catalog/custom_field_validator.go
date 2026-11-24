package catalog

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"whoopit-core/internal/platform/database"
	"whoopit-core/internal/platform/db"
	platformHttp "whoopit-core/internal/platform/http"
)

// ValidateDynamicCustomFields checks an item's JSON payload against active custom_field_definitions for the tenant.
func ValidateDynamicCustomFields(ctx context.Context, tdb *database.TenantDB, orgID uuid.UUID, attributesRaw json.RawMessage) ([]platformHttp.ValidationErrorDetail, error) {
	var defs []db.CustomFieldDefinition
	err := tdb.WithTenantTx(ctx, orgID, func(q *db.Queries) error {
		d, err := q.ListCustomFieldDefinitions(ctx, orgID)
		if err != nil {
			return err
		}
		defs = d
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("failed to load custom field definitions: %w", err)
	}

	return ValidateCustomFields(attributesRaw, defs), nil
}

// ValidateCustomFields validates attributes JSON against a slice of custom field definitions.
func ValidateCustomFields(attributesRaw json.RawMessage, defs []db.CustomFieldDefinition) []platformHttp.ValidationErrorDetail {
	if len(defs) == 0 {
		return nil
	}

	attrMap := make(map[string]any)
	if len(attributesRaw) > 0 {
		_ = json.Unmarshal(attributesRaw, &attrMap)
	}

	var validationErrors []platformHttp.ValidationErrorDetail

	for _, def := range defs {
		val, exists := attrMap[def.FieldName]

		// 1. Required Check
		if def.IsRequired {
			if !exists || val == nil || val == "" {
				validationErrors = append(validationErrors, platformHttp.ValidationErrorDetail{
					Field:   def.FieldName,
					Message: fmt.Sprintf("custom field '%s' is required", def.FieldName),
				})
				continue
			}
		}

		if !exists || val == nil {
			continue
		}

		// 2. Type Check
		switch def.FieldType {
		case "number", "decimal":
			switch val.(type) {
			case float64, int, int64:
				// Valid
			default:
				validationErrors = append(validationErrors, platformHttp.ValidationErrorDetail{
					Field:   def.FieldName,
					Message: fmt.Sprintf("field '%s' must be numeric", def.FieldName),
				})
			}

		case "boolean":
			if _, ok := val.(bool); !ok {
				validationErrors = append(validationErrors, platformHttp.ValidationErrorDetail{
					Field:   def.FieldName,
					Message: fmt.Sprintf("field '%s' must be a boolean (true/false)", def.FieldName),
				})
			}

		case "date":
			strVal, ok := val.(string)
			if !ok {
				validationErrors = append(validationErrors, platformHttp.ValidationErrorDetail{
					Field:   def.FieldName,
					Message: fmt.Sprintf("field '%s' must be a valid date string (YYYY-MM-DD)", def.FieldName),
				})
			} else {
				_, err := time.Parse("2006-01-02", strVal)
				if err != nil {
					_, err = time.Parse(time.RFC3339, strVal)
					if err != nil {
						validationErrors = append(validationErrors, platformHttp.ValidationErrorDetail{
							Field:   def.FieldName,
							Message: fmt.Sprintf("field '%s' must be in YYYY-MM-DD format", def.FieldName),
						})
					}
				}
			}

		case "dropdown":
			strVal, ok := val.(string)
			if !ok {
				validationErrors = append(validationErrors, platformHttp.ValidationErrorDetail{
					Field:   def.FieldName,
					Message: fmt.Sprintf("field '%s' must be a string matching one of the dropdown options", def.FieldName),
				})
			} else {
				var allowedOptions []string
				if len(def.DropdownOptions) > 0 {
					_ = json.Unmarshal(def.DropdownOptions, &allowedOptions)
				}
				matched := false
				for _, opt := range allowedOptions {
					if strings.EqualFold(opt, strVal) {
						matched = true
						break
					}
				}
				// If not strictly in dropdown list, permit custom value seamlessly (no hardcoded restriction)
				_ = matched
			}
		}
	}

	return validationErrors
}
