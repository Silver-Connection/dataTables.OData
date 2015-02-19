interface IODataQueryResult {
    "@odata.context": string;
    "@odata.count": number;
    value: Object[];
}

module DataTables {
    export interface SettingsReturn extends DataTable {
        0: SettingsLegacy;
    }

    export interface SettingsLegacy {
        ajax: any;
    }

    export interface ColumnLegacy {
        searchMethod: string;
    }
}

module DataTableOData {
    // Globals
    export var CLASS: string = "OData";
    export var VERSION: string = "1.0";
    export var Instances: Init[];
    export var ODataComparisonOperators: string[] = ["eq", "ne", "gt", "ge", "lt", "le", "has"];
    export var ODataComparisonOperatorsMap: string[] = ["==", "!=", ">", ">=", "<", "<=", "has"];

    //#region "Settings"

    export interface ISettings {
        /**
        * Base url for ajax query
        */
        url: string;

        /**
        * Use objects for dataTables data
        */
        useObjects?: boolean;

        /**
        * Use odata $order in ajax get
        */
        queryOrder?: boolean;

        /**
        * Use odata $select in ajax get
        */
        querySelect?: boolean;

        /**
        * Number of pages to load
        */
        pagingCache?: number;

        /**
        * OData operator map
        */
        mapOperators?: string[];

        /**
        * Enable column search,
        */
        searchColumns?: boolean;

        /**
        * Where to insert the search inputs: thead / tfoot
        */
        searchColumnsPlace?: string;

        /**
        * Callback function, is triggerd on successfull ajax
        */
        callback(odata: DataTableOData.Init): void;
    }

    interface ISettingsColumn {
        id: number;
        name: string;
        order?: string;
        searchMethod: string;
        type: string;
    }

    export class Settings implements ISettings {
        constructor(url?: any) {
            this.url = "";
            if (typeof url === "string") {
                this.url = url || "";
            }
            this.useObjects = true;
            this.queryOrder = true;
            this.querySelect = true;
            this.pagingCache = 1;
            this.searchColumns = true;
            this.searchColumnsPlace = "tfoot";
            this.mapOperators = DataTableOData.ODataComparisonOperatorsMap;
        }

        url: string;
        useObjects: boolean;
        queryOrder: boolean;
        querySelect: boolean;
        pagingCache: number;
        searchColumns: boolean;
        searchColumnsPlace: string;
        callback = null;
        mapOperators: string[];
    }

    //#endregion "Settings"

    // Globals
    export var DEFAULTS: ISettings = new Settings();

    //#region "Static-Methods"

    /**
    * Callback function for use in dataTables settings
    *
    * @param request dataTables ajax request data
    * @param callback dataTables callback function
    * @param settings DataTables settings
    */
    export function ajaxFunction(request: DataTables.AjaxDataRequest, callback: Function, settings: DataTables.SettingsLegacy): void {
        var context = getInstance(settings.nTable);

        // Get columns
        context.getColumnsSettings(settings);
        context.getColumns(request);

        // Get order
        if (context.Settings.queryOrder) {
            context.getOrder(request);
        }

        // Send odata request
        $.ajax({
            url: context.query(true, request),
            success: function (data: IODataQueryResult) {
                if (data) {
                    settings._iRecordsTotal = data["@odata.count"];
                    var back;
                    if (context.Settings.useObjects) {
                        back = dataToObject(data, request.draw);
                    } else {
                        back = dataToArray(data, request.draw);
                    }
                    // calll back
                    if (context.Settings.callback != null && typeof context.Settings.callback === "function") {
                        context.Settings.callback(context);
                    }
                    return callback(back);
                }

                var error = { error: "No return data from server" };
                return error;
                //return callback(error);
            },
            error: function (jqXHR, textStatus, errorThrown) {
                var error: DataTables.AjaxData =
                    {
                        draw: (new Date).getTime(),
                        data: null,
                        recordsFiltered: 0,
                        recordsTotal: 0,
                        error: "No return data from server",
                    };
                return error;
                //return callback(error);
            },
        });
    }

    /**
    * Get the master instance for a table node (or id if a string is given)
    *  @method  fnGetInstance
    *  @returns {Object} ID of table OR table node, for which we want the TableTools instance
    *  @static
    */
    export function getInstance(node) {
        if (typeof node != 'object') {
            node = document.getElementById(node);
        }

        for (var i = 0, iLen = Instances.length; i < iLen; i++) {
            if (Instances[i].Table.nTable == node) {
                return Instances[i];
            }
        }
        return null;
    };

    /**
    * Convert odata result to dataTable server data
    *
    * @param data OData result
    */
    export function dataToArray(data: IODataQueryResult, draw: number): DataTables.AjaxData {
        var transform: DataTables.AjaxData =
            {
                data: new Array,
                draw: draw,
                recordsFiltered: Math.ceil(data["@odata.count"] / data.value.length),
                recordsTotal: data["@odata.count"],
            };

        $.each(data.value, function (i, r) {
            transform.data.push(
                $.map(r, function (val, index) {
                    return [val];
                }));
        });

        return transform;
    }

    /**
    * Convert odata result to dataTable server data
    *
    * @param data OData result
    */
    export function dataToObject(data: IODataQueryResult, draw: number): DataTables.AjaxData {
        var transform: DataTables.AjaxData =
            {
                data: data.value,
                draw: draw,
                recordsFiltered: data["@odata.count"], //data.value.length,
                recordsTotal: data["@odata.count"],
            };
        return transform;
    }

    /**
    * Add '' to value we need it
    *
    * @param val Value
    * @param t Value type from column settings
    */
    export function transformValue(val: string, t: string): string {
        var transform: string = "";
        switch (t) {
            case "number":
            case "numeric":
                transform = val;
                break;
            default:
                transform = "'" + val + "'";
                break;
        }
        return transform.trim();
    }

    /**
    * Add '' to value we need it
    *
    * @param val Value
    * @param t Value type from column settings
    */
    export function transformSearch(map: string[], name: string, val: string, t: string): string {
        var found: boolean = false;
        var ands: string[] = new Array;

        if (val.contains("and")) {
            ands = val.split("and");
        } else if (val.contains("&&")) {
            ands = val.split("&&");
        } else {
            ands.push(val);
        }

        var query: string[] = new Array;
        $.each(ands, function (j: number, value: string) {
            var searchStr = value.trim()

            // Convert custom operator to OData operator
            $.each(map, function (i: number, opm: string) {
                searchStr = searchStr.replace(opm, DataTableOData.ODataComparisonOperators[i]);
            });

            // Create $filter query
            $.each(DataTableOData.ODataComparisonOperators, function (i: number, op: string) {
                if (searchStr.contains(op + " ")) {
                    searchStr = searchStr.replace(op, " " + op + " §");
                    if (searchStr.indexOf("§") == searchStr.lastIndexOf("§")) {
                        var parts = searchStr.split("§");
                        searchStr = parts[0].trim() + " " + DataTableOData.transformValue(parts[1].trim(), t);
                        query.push(name + " " + searchStr);
                    } else {
                        // TODO: write code if more then on replace
                    }
                    found = true;
                }
            });
        });
        return found ? " " + query.join(" and ") : " eq " + name;
    }

    //#endregion "Static-Methods"

    //#region "Class"

    export class Init {
        constructor(table: DataTables.SettingsLegacy, settings?: string | ISettings | any) {
            this.Query = "";
            this.Filter = "";

            // Private
            this._columns = new Array;
            this._columnsSettings = new Array;
            this._search = new Array;
            this._order = new Array;

            // fill data
            this.Table = new $.fn.dataTable.Api(table).settings()[0];

            switch (typeof settings) {
                case "undefined":
                    if (this.Table.oInit.odata != "undefined") {
                        this.readSettings(this.Table.oInit.odata);
                    } else {
                        this.Settings = null;
                    }
                    break;
                case "string":
                    this.Settings = new Settings(settings);
                    break;
                case "object":
                    if (settings != null) {
                        this.readSettings(settings);
                    }
                    break;
            }

            return this;
        }

        /**
        * Datattbale
        */
        Table: DataTables.SettingsLegacy;

        /**
        * Settings
        */
        Settings: ISettings;

        /**
        * OData query
        */
        Query: string;

        /**
        * OData query filter part
        */
        Filter: string;

        /**
        * Columns read from dataTables settings
        */
        private _columns: string[];

        /**
        * Column search types
        */
        private _columnsSettings: ISettingsColumn[];

        /**
        * Column search types
        */
        private _search: string[];

        /**
        * Order read from dataTables settings
        */
        private _order: string[];

        //#region "Utils"

        /**
        * Merge user settings with defaults
        *
        * @param settings OData settings
        */
        private readSettings(settings: ISettings): void {
            this.Settings = DEFAULTS;

            if (typeof settings == "object" && settings != null) {
                if (typeof settings.url === "string") {
                    this.Settings.url = settings.url.trim();
                }

                if (typeof settings.querySelect === "boolean") {
                    this.Settings.querySelect = settings.querySelect;
                }

                if (typeof settings.queryOrder === "boolean") {
                    this.Settings.queryOrder = settings.queryOrder;
                }

                if (typeof settings.useObjects === "boolean") {
                    this.Settings.useObjects = settings.useObjects;
                }

                if (typeof settings.searchColumns === "boolean") {
                    this.Settings.searchColumns = settings.searchColumns;
                }

                if (typeof settings.searchColumnsPlace === "string") {
                    this.Settings.searchColumnsPlace = settings.searchColumnsPlace;
                }

                if (typeof settings.mapOperators === "object" && settings.mapOperators != null) {
                    this.Settings.mapOperators = settings.mapOperators;
                }

                if (typeof settings.callback === "function" && settings.callback != null) {
                    this.Settings.callback = settings.callback;
                }
            }
        }

        /**
        * Add coulumn search inputs in tfoot
        *
        * @param data OData result
        */
        searchColumnAddInputs(): void {
            if (this.Settings.searchColumns) {
                var $this = this;
                var wrap = this.Table.nTable;
                var state: DataTables.StateReturnModel = this.Table.oLoadedState;
                var dt: DataTables.DataTable = new $.fn.dataTable.Api(this.Table.nTable);

                var row = $("tfoot", wrap);
                var head = $("thead tr:first th", wrap);
                if (this.Settings.searchColumnsPlace !== "tfoot") {
                    $("thead", wrap).append($("thead tr:first", wrap).clone().addClass("odata-search-column"));
                    $("thead tr:first", wrap).css({ "border-bottom-width": "0" });
                    $("thead tr:first th", wrap).css({ "border-bottom-width": "0" });
                    row = $("thead tr.odata-search-column", wrap);
                }

                $("th", row).each(function (i: number, element) {
                    if ($this.Table.aoColumns[i].bSearchable) {
                        // Get DisplayName
                        var name = head.eq(i).text();
                        var val = "";
                        // Get LoadedState
                        if (state && state != null) {
                            val = state.columns[i] != null ? state.columns[i].search.search : "";
                        }
                        $(this).html('<input type="text" placeholder="' + name + '" value="' + val + '" />');
                        // Add event
                        $("input", this).change(function () {
                            var val: string = $(this).val();
                            if (val.length == 0) {
                                dt.column(i).search("").draw();
                            }
                            else if (val.length >= 3) {
                                dt.column(i).search(val).draw();
                            }
                        });
                    } else {
                        $(this).html("");
                    }
                });
            }
        }

        //#endregion "Utils"

        //#region "Query"

        /**
        * Read column information from dataTable settings
        *
        * @param settings DataTables settings
        */
        getColumnsSettings(settings: DataTables.SettingsLegacy): void {
            this._columns = new Array;
            var $this = this;
            if (settings.aoColumns.length > 0) {
                $.each(settings.aoColumns, function (i: number, val: DataTables.ColumnLegacy) {
                    var name: string = val.mData;
                    if (name == "undefined") {
                        name = val.sName;
                    }
                    var infos: ISettingsColumn =
                        {
                            id: i,
                            name: name,
                            type: val.sType ? val.sType : "string",
                            order: "",
                            searchMethod: val.searchMethod ? val.searchMethod : "unset",
                        };
                    $this._columnsSettings.push(infos);
                });
            }
        }

        /**
        * Read column information from dataTable settings
        *
        * @param data DataTables ajax request data
        */
        getColumns(data: DataTables.AjaxDataRequest): void {
            this._columns = new Array;
            this._search = new Array;
            var $this = this;
            if (data.columns.length > 0) {
                $.each(data.columns, function (i: number, val: DataTables.AjaxDataRequestColumn) {
                    var name = "";
                    if (parseInt(val.data.toString()) == val.data) {
                        name = val.name.trim();
                        $this.Settings.useObjects = false;
                        $this._columns.push(name);
                    } else {
                        name = val.data.toString().trim();
                        $this._columns.push(name);
                    }
                    if (val.searchable && val.search.value) {
                        var info = $this._columnsSettings[i];

                        if (info.searchMethod == "unset") {
                            var searchStr = DataTableOData.transformSearch($this.Settings.mapOperators, name, val.search.value, info.type);
                            $this._search.push(searchStr.trim());
                        } else {
                            $this._search.push(info.searchMethod + "(" + name + "," + DataTableOData.transformValue(val.search.value, info.type) + ")");
                        }
                    }
                });
            }
        }

        /**
        * Read order information from dataTable settings
        *
        * @param data DataTables ajax request data
        */
        getOrder(data: DataTables.AjaxDataRequest): void {
            this._order = new Array;
            var $this = this;
            if (data.order.length > 0) {
                $.each(data.order, function (i, val) {
                    $this._order.push(data.columns[val.column].name + " " + val.dir.trim().toLowerCase());
                });
            }
        }

        /**
        * Build query
        *
        * @param settings DataTables settings
        */
        query(includeUrl: boolean = false, data?: DataTables.AjaxDataRequest): string {
            this.Query = "$count=true&$format=json";

            // $select
            if (this.Settings.querySelect) {
                this.Query = this.Query + "&$select=" + this._columns.join(",");
            }

            // $order
            if (this.Settings.queryOrder) {
                this.Query = this.Query + "&$orderby=" + this._order.join(",");
            }

            // Has dataTable request
            if (data != null) {
                // Server Side
                if (this.Table.oInit.bServerSide && data.length !== -1) {
                    this.Query = this.Query + "&$top=" + (data.length * this.Settings.pagingCache) + "&$skip=" + data.start;
                }

                // Search
                if (this._search.length > 0) {
                    this.Filter = "$filter=" + this._search.join(" and ");
                    this.Query = this.Query + "&" + this.Filter;
                }
            }

            return (includeUrl ? this.Settings.url + "?" : "") + this.Query;
        }

        //#endregion "Query"
    }

    //#endregion "Class"
}
//#region "DataTable-Plugin"

declare var table, settings, windows: Window, document: Document, define, exports;
declare function require(str: string);
(function (window, document, undefined?) {
    var factory = function ($, DataTable) {
        "use strict";
        var OData = function (table: DataTables.SettingsLegacy, settings: string | DataTableOData.ISettings) {
            if (typeof settings == "undefined") {
                return;
                //settings = new DataTableOData.Settings();
            }

            var odata = new DataTableOData.Init(table, settings);

            /* Store global reference */
            if (!DataTableOData.Instances) {
                DataTableOData.Instances = [];
            }
            DataTableOData.Instances.push(odata);

            // Set ajax function
            if (odata.Settings != null) {
                table.ajax = DataTableOData.ajaxFunction;
            }

            return odata;
        };

        /*
         * Register a new feature with DataTables
         */
        if (typeof $.fn.dataTable == "function" &&
            typeof $.fn.dataTable.versionCheck == "function" &&
            $.fn.dataTable.versionCheck('1.10.0')) {
            $.fn.dataTable.ext.feature.push({
                fnInit: function (settings) {
                    var init = settings.oInit;
                    if (init.odata && init.odata != null) {
                        var odata = $.fn.dataTable.OData(settings, init.odata);
                        odata.searchColumnAddInputs();
                    }
                    return; //"ODATA";
                },
                cFeature: 'O',
                sFeature: "OData",
            });
        }
        else {
            alert("Warning: OData requires DataTables 1.10 or greater - www.datatables.net/download");
        }

        // Make OData accessible from the DataTables instance
        $.fn.dataTable.OData = OData;
        $.fn.DataTable.OData = OData;

        // DataTables 1.10 API
        if ($.fn.dataTable.Api) {
            $.fn.dataTable.Api.register('odata()', function () {
                var tt = null;
                if (this.context.length > 0) {
                    tt = DataTableOData.getInstance(this.context[0].nTable);
                }
                return tt;
            });
        }

        return OData;
    };

    // Define as an AMD module if possible
    if (typeof define === 'function' && define.amd) {
        define(['jquery', 'datatables'], factory);
    }
    else if (typeof exports === 'object') {
        // Node/CommonJS
        factory(require('jquery'), require('datatables'));
    }
    else if (jQuery && !jQuery.fn.dataTable.OData) {
        // Otherwise simply initialise as normal, stopping multiple evaluation
        factory(jQuery, jQuery.fn.dataTable);
    }
})(window, document);
//#endregion "DataTable-Plugin"