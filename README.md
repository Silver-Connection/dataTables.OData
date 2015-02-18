# dataTables.OData
OData V.4 support for DataTables V. 1.10.x

## Basic initialisation

1. Add the keyword 'O' in dataTables dom settings
2. Add OData settings to dataTbales initialisation settings
3. Add columns settings 

```javascript
// Settings
var dt_settings = 
{
	 columns: [
		{ data: "Name", searchMethod: "contains" },
		{ data: "Age", type: "number" },
		{ data: "Dogs", type: "number" },
	],
	odata: {
		url: "/odata/service",
	},
	processing: true,
	serverSide: true,
	stateSave: true,
};

// DT initialisation
var dt = $("#table").DataTables(dt_settings);

```
