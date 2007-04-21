// FIXME handle enabled/disabled state

/**
 * Component rendering peer: Table
 */
EchoRender.ComponentSync.Table = function() {
    this.selectionModel = null;
    this.lastSelectedIndex = null;
};

EchoRender.ComponentSync.Table.prototype = new EchoRender.ComponentSync;

EchoRender.ComponentSync.Table._HEADER_ROW = -1;

/**
 * A string of periods used for the IE 100% table width workaround.
 */
EchoRender.ComponentSync.Table._SIZING_DOTS = ". . . . . . . . . . . . . . . . . . . . . . . . . . . . . "
            + ". . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . ";

EchoRender.ComponentSync.Table.prototype.renderAdd = function(update, parentElement) {
    if (this._isSelectionEnabled()) {
        this.selectionModel = new EchoApp.ListSelectionModel(parseInt(this.component.getProperty("selectionMode")));
    }
    
    var tableElement = document.createElement("table");
    tableElement.id = this.component.renderId;
    
    var width = this.component.getRenderProperty("width");
    var render100PercentWidthWorkaround = false;
    if (width && EchoWebCore.Environment.QUIRK_IE_TABLE_PERCENT_WIDTH_SCROLLBAR_ERROR && width.value == 100 && width.units == "%") {
        width = null;
        render100PercentWidthWorkaround = true;
    }
    this._renderMainStyle(tableElement, width);
    
    var tbodyElement = document.createElement("tbody");
    tbodyElement.id = this.component.renderId + "_tbody";
    tableElement.appendChild(tbodyElement);
    parentElement.appendChild(tableElement);
    
    var insets = this.component.getRenderProperty("insets");
    if (!insets) {
        insets = new EchoApp.Property.Insets(0);
    }
    if (this._isHeaderVisible()) {
        // FIXME render colgroup if needed
        tbodyElement.appendChild(this._renderRow(update, EchoRender.ComponentSync.Table._HEADER_ROW, insets));
    }
    var rowCount = this._getRowCount();
    for (var rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        tbodyElement.appendChild(this._renderRow(update, rowIndex, insets));
    }
    if (render100PercentWidthWorkaround) {
        this._render100PercentWidthWorkaround(tableElement);
    }
    
    if (this._isSelectionEnabled()) {
        var selectedIndices = EchoCore.tokenizeString(this.component.getProperty("selection"), ",");
        for (var i = 0; i < selectedIndices.length; i++) {
            if (selectedIndices[i] == "") {
                continue;
            }
            this._setSelected(parseInt(selectedIndices[i]), true);
        }
    }
    
    this._addEventListeners(tableElement);
};

/**
 * Renders the main style.
 *
 * @param element the main element
 * @param width {Number} the width to use
 */
EchoRender.ComponentSync.Table.prototype._renderMainStyle = function(element, width) {
    element.style.borderCollapse = "collapse";
    if (this._isSelectionEnabled()) {
        element.style.cursor = "pointer";
    }
    EchoRender.Property.Color.renderFB(this.component, element);
    EchoRender.Property.Font.renderDefault(this.component, element);
    var border = this.component.getRenderProperty("border");
    if (border) {
        EchoRender.Property.Border.render(border, element);
        if (border.size && !EchoWebCore.Environment.QUIRK_CSS_BORDER_COLLAPSE_INSIDE) {
            element.style.margin = (EchoRender.Property.Extent.toPixels(border.size, false) / 2) + "px";
        }
    }
    if (width) {
        element.style.width = width;
    }
};

/**
 * Renders the IE 100% table width workaround, only call this method when the workaround should be applied.
 *
 * @param element the main element
 */
EchoRender.ComponentSync.Table.prototype._render100PercentWidthWorkaround = function(element) {
    if (element.rows.length == 0) {
        return;
    }
    var columns = element.rows[0].cells;
    for (var i = 0; i < columns.length; ++i) {
        var sizingDivElement = document.createElement("div");
        sizingDivElement.style.fontSize = "50px";
        sizingDivElement.style.height = "0px";
        sizingDivElement.style.overflow = "hidden";
        sizingDivElement.appendChild(document.createTextNode(EchoRender.ComponentSync.Table._SIZING_DOTS));
        columns[i].appendChild(sizingDivElement);
    }
};

/**
 * Renders an appropriate style for a row (i.e. selected or deselected).
 *
 * @param rowIndex {Number} the index of the row
 */
EchoRender.ComponentSync.Table.prototype._renderRowStyle = function(rowIndex) {
    var selected = this._isSelectionEnabled() && this.selectionModel.isSelectedIndex(rowIndex);
    var tableElement = document.getElementById(this.component.renderId);
    var trElement = tableElement.rows[rowIndex + (this._isHeaderVisible() ? 1 : 0)];
    
    for (var i = 0; i < trElement.cells.length; ++i) {
        var cell = trElement.cells[i];
        if (selected) {
            // FIXME
            //EchoCssUtil.restoreOriginalStyle(cell);
            //EchoCssUtil.applyTemporaryStyle(cell, this.selectionStyle);
            EchoRender.Property.Font.renderComponentProperty(this.component, "selectionFont", null, cell);
            EchoRender.Property.Color.renderComponentProperty(this.component, "selectionForeground", null, cell, "color");
            EchoRender.Property.Color.renderComponentProperty(this.component, "selectionBackground", null, cell, "background");
            EchoRender.Property.FillImage.renderComponentProperty(this.component, "selectionBackgroundImage", null, cell); 
        } else {
            // FIXME
            //EchoCssUtil.restoreOriginalStyle(cell);
            cell.style.color = "";
            cell.style.backgroundColor = "";
            cell.style.backgroundImage = "";
        }
    }
};

/**
 * Renders a single row.
 *
 * @param update the update
 * @param rowIndex {Number} the index of the row
 * @param defaultInsets {EchoApp.Property.Insets} the insets to use when no insets are specified in the layout-data
 */
EchoRender.ComponentSync.Table.prototype._renderRow = function(update, rowIndex, defaultInsets) {
    var trElement = document.createElement("tr");
    if (rowIndex == EchoRender.ComponentSync.Table._HEADER_ROW) {
        trElement.id = this.component.renderId + "_tr_header";
    } else {
        trElement.id = this.component.renderId + "_tr_" + rowIndex; 
    }
    var columnCount = this._getColumnCount();
    for (var columnIndex = 0; columnIndex < columnCount; columnIndex++) {
        var tdElement = document.createElement("td");
        tdElement.id = this.component.renderId + "_cell_" + columnIndex;
        trElement.appendChild(tdElement);
        var child = this._getCellComponent(columnIndex, rowIndex);
        var layoutData = child.getRenderProperty("layoutData");
        if (layoutData) {
            EchoRender.Property.Color.renderComponentProperty(layoutData, "background", null, tdElement, "backgroundColor");
            EchoRender.Property.FillImage.renderComponentProperty(layoutData, "backgroundImage", null, tdElement);
            EchoRender.Property.Alignment.renderComponentProperty(layoutData, "alignment", null, tdElement, true, this.component);
            EchoRender.Property.Insets.renderComponentProperty(layoutData, "insets", defaultInsets, tdElement, "padding");
        } else {
            EchoRender.Property.Insets.renderPixel(defaultInsets, tdElement, "padding");
        }
        EchoRender.Property.Border.render(this.component.getRenderProperty("border"), tdElement);
        EchoRender.renderComponentAdd(update, child, tdElement);
    }
    return trElement;
};

EchoRender.ComponentSync.Table.prototype.renderUpdate = function(update) {
    EchoRender.Util.renderRemove(update, update.parent);
    var containerElement = EchoRender.Util.getContainerElement(update.parent);
    this.renderAdd(update, containerElement);
};

EchoRender.ComponentSync.Table.prototype.renderDispose = function(update) {
    var tableElement = document.getElementById(this.component.renderId);
    var rowCount = this._getRowCount();
    for (var i = 0; i < rowCount; ++i) {
        EchoWebCore.EventProcessor.removeAll(tableElement.rows[i]);
    }
};

/**
 * Method to obtain the component located at the cell with given column and row indices.
 * 
 * @param {Number} columnIndex the index of the column
 * @param {Number} rowIndex the index of the row
 * @return the component.
 * @type EchoApp.Component
 */
EchoRender.ComponentSync.Table.prototype._getCellComponent = function(columnIndex, rowIndex) {
    var rowOffset = (this._isHeaderVisible() ? 1 : 0);
    return this.component.getComponent((rowIndex + rowOffset) * this._getColumnCount() + columnIndex);
};

EchoRender.ComponentSync.Table.prototype._getRowIndex = function(element) {
    var stringIndex = element.id.lastIndexOf("_tr_") + 4;
    return parseInt(element.id.substring(stringIndex));
};

/**
 * Sets the selection state of a table row.
 *
 * @param {Number} rowIndex the index of the row
 * @param {Boolean} newValue the new selection state
 */
EchoRender.ComponentSync.Table.prototype._setSelected = function(rowIndex, newValue) {
    this.selectionModel.setSelectedIndex(rowIndex, newValue);
    this._renderRowStyle(rowIndex);
};

/**
 * Deselects all selected rows.
 */
EchoRender.ComponentSync.Table.prototype._clearSelected = function() {
    var rowCount = this._getRowCount();
    for (var i = 0; i < rowCount; ++i) {
        if (this.selectionModel.isSelectedIndex(i)) {
            this._setSelected(i, false);
        }
    }
};

// action & event handling

/**
 * Adds event listeners.
 *
 * @param tableElement the table element
 */
EchoRender.ComponentSync.Table.prototype._addEventListeners = function(tableElement) {
    var selectionEnabled = this._isSelectionEnabled();
    var rolloverEnabled = this._isRolloverEnabled();
    
    if (selectionEnabled || rolloverEnabled) {
        var rowCount = this._getRowCount();
        if (rowCount == 0) {
            return;
        }
        var mouseEnterLeaveSupport = EchoWebCore.Environment.PROPRIETARY_EVENT_MOUSE_ENTER_LEAVE_SUPPORTED;
        var enterEvent = mouseEnterLeaveSupport ? "mouseenter" : "mouseover";
        var exitEvent = mouseEnterLeaveSupport ? "mouseleave" : "mouseout";
        var rowOffset = (this._isHeaderVisible() ? 1 : 0);
        var rolloverEnterRef = new EchoCore.MethodRef(this, this._processRolloverEnter);
        var rolloverExitRef = new EchoCore.MethodRef(this, this._processRolloverExit);
        var clickRef = new EchoCore.MethodRef(this, this._processClick);
        
        for (var rowIndex = 0; rowIndex < rowCount; ++rowIndex) {
            var trElement = tableElement.rows[rowIndex + rowOffset];
            if (rolloverEnabled) {
                EchoWebCore.EventProcessor.add(trElement, enterEvent, rolloverEnterRef, false);
                EchoWebCore.EventProcessor.add(trElement, exitEvent, rolloverExitRef, false);
            }
            if (selectionEnabled) {
                EchoWebCore.EventProcessor.add(trElement, "click", clickRef, false);
                EchoWebCore.EventProcessor.addSelectionDenialListener(trElement);
            }
        }
    }    
};

EchoRender.ComponentSync.Table.prototype._doAction = function() {
    this.component.fireEvent(new EchoCore.Event(this.component, "action"));
};

EchoRender.ComponentSync.Table.prototype._processClick = function(e) {
    if (!this.component.isActive()) {
        return;
    }
    var trElement = e.registeredTarget;
    var rowIndex = this._getRowIndex(trElement);
    if (rowIndex == -1) {
        return;
    }
    
    EchoWebCore.DOM.preventEventDefault(e);

    if (this.selectionModel.isSingleSelection() || !(e.shiftKey || e.ctrlKey || e.metaKey || e.altKey)) {
        this._clearSelected();
    }

    if (e.shiftKey && this.lastSelectedIndex != -1) {
        var startIndex;
        var endIndex;
        if (this.lastSelectedIndex < rowIndex) {
            startIndex = this.lastSelectedIndex;
            endIndex = rowIndex;
        } else {
            startIndex = rowIndex;
            endIndex = this.lastSelectedIndex;
        }
        for (var i = startIndex; i <= endIndex; ++i) {
            this._setSelected(i, true);
        }
    } else {
        this.lastSelectedIndex = rowIndex;
        this._setSelected(rowIndex, !this.selectionModel.isSelectedIndex(rowIndex));
    }
    
    this.component.setProperty("selection", this.selectionModel.getSelectionString());
    
    this._doAction();
};

EchoRender.ComponentSync.Table.prototype._processRolloverEnter = function(e) {
    if (!this.component.isActive()) {
        return;
    }
    var trElement = e.registeredTarget;
    var rowIndex = this._getRowIndex(trElement);
    if (rowIndex == -1) {
        return;
    }
    
    for (var i = 0; i < trElement.cells.length; ++i) {
        var cell = trElement.cells[i];
        // FIXME
        //EchoCssUtil.applyTemporaryStyle(cell, this.rolloverStyle);
        EchoRender.Property.Font.renderComponentProperty(this.component, "rolloverFont", null, cell);
        EchoRender.Property.Color.renderComponentProperty(this.component, "rolloverForeground", null, cell, "color");
        EchoRender.Property.Color.renderComponentProperty(this.component, "rolloverBackground", null, cell, "background");
        EchoRender.Property.FillImage.renderComponentProperty(this.component, "rolloverBackgroundImage", null, cell); 
    }
};

EchoRender.ComponentSync.Table.prototype._processRolloverExit = function(e) {
    if (!this.component.isActive()) {
        return;
    }
    var trElement = e.registeredTarget;
    var rowIndex = this._getRowIndex(trElement);
    if (rowIndex == -1) {
        return;
    }

    this._renderRowStyle(rowIndex);
};

// property accessors

EchoRender.ComponentSync.Table.prototype._isHeaderVisible = function() {
    return this.component.getProperty("headerVisible");
};

EchoRender.ComponentSync.Table.prototype._isSelectionEnabled = function() {
    return this.component.getRenderProperty("selectionEnabled");
};

EchoRender.ComponentSync.Table.prototype._isRolloverEnabled = function() {
    return this.component.getRenderProperty("rolloverEnabled");
};

EchoRender.ComponentSync.Table.prototype._getColumnCount = function() {
    return this.component.getRenderProperty("columnCount");
};

EchoRender.ComponentSync.Table.prototype._getRowCount = function() {
    return this.component.getRenderProperty("rowCount");
};

EchoRender.registerPeer("Table", EchoRender.ComponentSync.Table);