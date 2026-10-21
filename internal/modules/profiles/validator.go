package profiles

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/santhosh-tekuri/jsonschema/v6"
	platformHttp "whoopit-core/internal/platform/http"
)

// Supported industry profiles
const (
	ProfileOfficeIT  = "office_it"
	ProfileWarehouse = "warehouse"
	ProfileRetail    = "retail"
	ProfileFactory   = "factory"
)

// Declarative industry schemas adhering to Draft 2020-12
var rawSchemas = map[string]string{
	ProfileOfficeIT: `{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"title": "Office IT Equipment Attributes",
		"type": "object",
		"required": ["serial_number", "ram_gb", "storage_spec", "condition_grade"],
		"properties": {
			"serial_number": {
				"type": "string",
				"minLength": 1
			},
			"ram_gb": {
				"type": "integer",
				"minimum": 4
			},
			"storage_spec": {
				"type": "string",
				"minLength": 1
			},
			"condition_grade": {
				"type": "string",
				"enum": ["A", "B", "C"]
			}
		},
		"additionalProperties": true
	}`,
	ProfileWarehouse: `{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"title": "Warehouse Goods Attributes",
		"type": "object",
		"required": ["lot_number", "expiry_date", "storage_temp"],
		"properties": {
			"lot_number": {
				"type": "string",
				"minLength": 1
			},
			"expiry_date": {
				"type": "string",
				"format": "date"
			},
			"storage_temp": {
				"type": "string",
				"minLength": 1
			}
		},
		"additionalProperties": true
	}`,
	ProfileRetail: `{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"title": "Retail Product Attributes",
		"type": "object",
		"required": ["barcode_upc", "size", "color"],
		"properties": {
			"barcode_upc": {
				"type": "string",
				"minLength": 1
			},
			"size": {
				"type": "string",
				"minLength": 1
			},
			"color": {
				"type": "string",
				"minLength": 1
			}
		},
		"additionalProperties": true
	}`,
	ProfileFactory: `{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"title": "Factory Machine Attributes",
		"type": "object",
		"required": ["machine_model", "maintenance_interval_days"],
		"properties": {
			"machine_model": {
				"type": "string",
				"minLength": 1
			},
			"maintenance_interval_days": {
				"type": "integer",
				"minimum": 1
			}
		},
		"additionalProperties": true
	}`,
}

// SchemaValidator encapsulates compiled JSON schemas for all supported industry profiles.
type SchemaValidator struct {
	compiledSchemas map[string]*jsonschema.Schema
}

// NewSchemaValidator compiles and registers all industry JSON schemas on startup.
func NewSchemaValidator() (*SchemaValidator, error) {
	compiled := make(map[string]*jsonschema.Schema)

	for name, raw := range rawSchemas {
		c := jsonschema.NewCompiler()
		resourceName := fmt.Sprintf("%s.json", name)

		doc, err := jsonschema.UnmarshalJSON(strings.NewReader(raw))
		if err != nil {
			return nil, fmt.Errorf("profiles: failed to unmarshal schema for %s: %w", name, err)
		}

		if err := c.AddResource(resourceName, doc); err != nil {
			return nil, fmt.Errorf("profiles: failed to add schema resource for %s: %w", name, err)
		}

		schema, err := c.Compile(resourceName)
		if err != nil {
			return nil, fmt.Errorf("profiles: failed to compile schema for %s: %w", name, err)
		}

		compiled[name] = schema
	}

	return &SchemaValidator{compiledSchemas: compiled}, nil
}

// ValidateAttributes validates raw JSON bytes against the given profile schema.
// Returns a slice of exact field-level validation errors if validation fails.
func (sv *SchemaValidator) ValidateAttributes(profile string, rawAttrs json.RawMessage) ([]platformHttp.ValidationErrorDetail, error) {
	if profile == "" {
		// If no industry profile requested, raw JSON is considered arbitrary attributes
		return nil, nil
	}

	schema, exists := sv.compiledSchemas[profile]
	if !exists {
		return nil, fmt.Errorf("unknown industry profile: %s", profile)
	}

	if len(rawAttrs) == 0 || string(rawAttrs) == "null" || string(rawAttrs) == "{}" {
		return []platformHttp.ValidationErrorDetail{
			{
				Field:   "attributes",
				Message: fmt.Sprintf("attributes object is required for industry profile '%s'", profile),
			},
		}, nil
	}

	doc, err := jsonschema.UnmarshalJSON(strings.NewReader(string(rawAttrs)))
	if err != nil {
		return []platformHttp.ValidationErrorDetail{
			{
				Field:   "attributes",
				Message: "attributes payload is not valid JSON",
			},
		}, nil
	}

	err = schema.Validate(doc)
	if err == nil {
		return nil, nil
	}

	var validationErrors []platformHttp.ValidationErrorDetail
	if valErr, ok := err.(*jsonschema.ValidationError); ok {
		collectValidationErrors(valErr, &validationErrors)
	} else {
		validationErrors = append(validationErrors, platformHttp.ValidationErrorDetail{
			Field:   "attributes",
			Message: err.Error(),
		})
	}

	return validationErrors, nil
}

func collectValidationErrors(ve *jsonschema.ValidationError, acc *[]platformHttp.ValidationErrorDetail) {
	if len(ve.Causes) == 0 {
		field := "attributes"
		if len(ve.InstanceLocation) > 0 {
			field = strings.Join(ve.InstanceLocation, ".")
		}
		*acc = append(*acc, platformHttp.ValidationErrorDetail{
			Field:   field,
			Message: ve.Error(),
		})
		return
	}

	for _, cause := range ve.Causes {
		collectValidationErrors(cause, acc)
	}
}
