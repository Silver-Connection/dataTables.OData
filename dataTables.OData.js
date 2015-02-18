var DataTableOData;
(function (DataTableOData) {
    var Settings = (function () {
        function Settings(url) {
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
        }
        return Settings;
    })();
    DataTableOData.Settings = Settings;
    //#endregion "Settings"
    // Globals
    DataTableOData.Instances;
    DataTableOData.CLASS = "OData";
    DataTableOData.VERSION = "1.0";
    DataTableOData.DEFAULTS = new Settings();
    DataTableOData.ODataComparisonOperators = ["eq", "ne", "gt", "ge", "lt", "le", "has"];
    DataTableOData.ODataComparisonOperatorsMap = ["==", "!=", ">", ">=", "<", "<=", "has"];
    //#region "Static-Methods"
    /**
    * Callback function for use in dataTables settings
    *
    * @param request dataTables ajax request data
    * @param callback dataTables callback function
    * @param settings DataTables settings
    */
    function ajaxFunction(request, callback, settings) {
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
            success: function (data) {
                if (data) {
                    settings._iRecordsTotal = data["@odata.count"];
                    if (context.Settings.useObjects) {
                        return callback(dataToObject(data, request.draw));
                    }
                    else {
                        return callback(dataToArray(data, request.draw));
                    }
                }
                var error = { error: "No return data from server" };
                return error;
                //return callback(error);
            },
            error: function (jqXHR, textStatus, errorThrown) {
                var error = {
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
    DataTableOData.ajaxFunction = ajaxFunction;
    /**
    * Get the master instance for a table node (or id if a string is given)
    *  @method  fnGetInstance
    *  @returns {Object} ID of table OR table node, for which we want the TableTools instance
    *  @static
    */
    function getInstance(node) {
        if (typeof node != 'object') {
            node = document.getElementById(node);
        }
        for (var i = 0, iLen = DataTableOData.Instances.length; i < iLen; i++) {
            if (DataTableOData.Instances[i].Table.nTable == node) {
                return DataTableOData.Instances[i];
            }
        }
        return null;
    }
    DataTableOData.getInstance = getInstance;
    ;
    /**
    * Convert odata result to dataTable server data
    *
    * @param data OData result
    */
    function dataToArray(data, draw) {
        var transform = {
            data: new Array,
            draw: draw,
            recordsFiltered: Math.ceil(data["@odata.count"] / data.value.length),
            recordsTotal: data["@odata.count"],
        };
        $.each(data.value, function (i, r) {
            transform.data.push($.map(r, function (val, index) {
                return [val];
            }));
        });
        return transform;
    }
    DataTableOData.dataToArray = dataToArray;
    /**
    * Convert odata result to dataTable server data
    *
    * @param data OData result
    */
    function dataToObject(data, draw) {
        var transform = {
            data: data.value,
            draw: draw,
            recordsFiltered: data["@odata.count"],
            recordsTotal: data["@odata.count"],
        };
        return transform;
    }
    DataTableOData.dataToObject = dataToObject;
    /**
    * Add '' to value we need it
    *
    * @param val Value
    * @param t Value type from column settings
    */
    function transformValue(val, t) {
        var transform = "";
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
    DataTableOData.transformValue = transformValue;
    /**
    * Add '' to value we need it
    *
    * @param val Value
    * @param t Value type from column settings
    */
    function transformSearch(name, val, t) {
        var found = false;
        var ands = new Array;
        if (val.contains("and")) {
            ands = val.split("and");
        }
        else if (val.contains("&&")) {
            ands = val.split("&&");
        }
        else {
            ands.push(val);
        }
        var query = new Array;
        $.each(ands, function (j, value) {
            var searchStr = value.trim();
            // Convert js operator to OData operator
            $.each(DataTableOData.ODataComparisonOperatorsMap, function (i, opm) {
                searchStr = searchStr.replace(opm, DataTableOData.ODataComparisonOperators[i]);
            });
            // Create $filter query
            $.each(DataTableOData.ODataComparisonOperators, function (i, op) {
                if (searchStr.contains(op + " ")) {
                    searchStr = searchStr.replace(op, " " + op + " §");
                    if (searchStr.indexOf("§") == searchStr.lastIndexOf("§")) {
                        var parts = searchStr.split("§");
                        searchStr = parts[0].trim() + " " + DataTableOData.transformValue(parts[1].trim(), t);
                        query.push(name + " " + searchStr);
                    }
                    else {
                    }
                    found = true;
                }
            });
        });
        return found ? " " + query.join(" and ") : " eq " + name;
    }
    DataTableOData.transformSearch = transformSearch;
    //#endregion "Static-Methods"
    //#region "Class"
    var Init = (function () {
        function Init(table, settings) {
            this.Query = "";
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
                    }
                    else {
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
        //#region "Utils"
        /**
        * Merge user settings with defaults
        *
        * @param settings OData settings
        */
        Init.prototype.readSettings = function (settings) {
            this.Settings = DataTableOData.DEFAULTS;
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
            }
        };
        /**
        * Add coulumn search inputs in tfoot
        *
        * @param data OData result
        */
        Init.prototype.searchColumnAddInputs = function () {
            if (this.Settings.searchColumns) {
                var $this = this;
                var wrap = this.Table.nTable;
                var state = this.Table.oLoadedState;
                var dt = new $.fn.dataTable.Api(this.Table.nTable);
                var row = $("tfoot", wrap);
                var head = $("thead tr:first th", wrap);
                if (this.Settings.searchColumnsPlace !== "tfoot") {
                    $("thead", wrap).append($("thead tr:first", wrap).clone().addClass("odata-search-column"));
                    $("thead tr:first", wrap).css({ "border-bottom-width": "0" });
                    $("thead tr:first th", wrap).css({ "border-bottom-width": "0" });
                    row = $("thead tr.odata-search-column", wrap);
                }
                $("th", row).each(function (i, element) {
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
                            var val = $(this).val();
                            if (val.length == 0) {
                                dt.column(i).search("").draw();
                            }
                            else if (val.length >= 3) {
                                dt.column(i).search(val).draw();
                            }
                        });
                    }
                    else {
                        $(this).html("");
                    }
                });
            }
        };
        //#endregion "Utils"
        //#region "Query"
        /**
        * Read column information from dataTable settings
        *
        * @param settings DataTables settings
        */
        Init.prototype.getColumnsSettings = function (settings) {
            this._columns = new Array;
            var $this = this;
            if (settings.aoColumns.length > 0) {
                $.each(settings.aoColumns, function (i, val) {
                    var name = val.mData;
                    if (name == "undefined") {
                        name = val.sName;
                    }
                    var infos = {
                        id: i,
                        name: name,
                        type: val.sType ? val.sType : "string",
                        order: "",
                        searchMethod: val.searchMethod ? val.searchMethod : "unset",
                    };
                    $this._columnsSettings.push(infos);
                });
            }
        };
        /**
        * Read column information from dataTable settings
        *
        * @param data DataTables ajax request data
        */
        Init.prototype.getColumns = function (data) {
            this._columns = new Array;
            this._search = new Array;
            var $this = this;
            if (data.columns.length > 0) {
                $.each(data.columns, function (i, val) {
                    var name = "";
                    if (parseInt(val.data.toString()) == val.data) {
                        name = val.name.trim();
                        $this.Settings.useObjects = false;
                        $this._columns.push(name);
                    }
                    else {
                        name = val.data.toString().trim();
                        $this._columns.push(name);
                    }
                    if (val.searchable && val.search.value) {
                        var info = $this._columnsSettings[i];
                        if (info.searchMethod == "unset") {
                            var searchStr = DataTableOData.transformSearch(name, val.search.value, info.type);
                            $this._search.push(searchStr.trim());
                        }
                        else {
                            $this._search.push(info.searchMethod + "(" + name + "," + DataTableOData.transformValue(val.search.value, info.type) + ")");
                        }
                    }
                });
            }
        };
        /**
        * Read order information from dataTable settings
        *
        * @param data DataTables ajax request data
        */
        Init.prototype.getOrder = function (data) {
            this._order = new Array;
            var $this = this;
            if (data.order.length > 0) {
                $.each(data.order, function (i, val) {
                    $this._order.push(data.columns[val.column].name + " " + val.dir.trim().toLowerCase());
                });
            }
        };
        /**
        * Build query
        *
        * @param settings DataTables settings
        */
        Init.prototype.query = function (includeUrl, data) {
            if (includeUrl === void 0) { includeUrl = false; }
            this.Query = "$count=true&$format=json";
            // $select
            if (this.Settings.querySelect) {
                this.Query = this.Query + "&$select=" + this._columns.join(",");
            }
            // $order
            if (this.Settings.querySelect) {
                this.Query = this.Query + "&$orderby=" + this._order.join(",");
            }
            // Has dataTable request
            if (data != null) {
                // Server Side
                if (this.Table.oInit.bServerSide) {
                    this.Query = this.Query + "&$top=" + (data.length * this.Settings.pagingCache) + "&$skip=" + data.start;
                }
                // Search
                if (this._search.length > 0) {
                    this.Query = this.Query + "&$filter=" + this._search.join(" and ");
                }
            }
            return (includeUrl ? this.Settings.url + "?" : "") + this.Query;
        };
        return Init;
    })();
    DataTableOData.Init = Init;
})(DataTableOData || (DataTableOData = {}));
(function (window, document, undefined) {
    var factory = function ($, DataTable) {
        "use strict";
        var OData = function (table, settings) {
            if (typeof settings == "undefined") {
                return;
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
        if (typeof $.fn.dataTable == "function" && typeof $.fn.dataTable.versionCheck == "function" && $.fn.dataTable.versionCheck('1.10.0')) {
            $.fn.dataTable.ext.feature.push({
                fnInit: function (settings) {
                    var init = settings.oInit;
                    var odata = $.fn.dataTable.OData(settings, init.odata || {});
                    odata.searchColumnAddInputs();
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
//# sourceMappingURL=dataTables.OData.js.map