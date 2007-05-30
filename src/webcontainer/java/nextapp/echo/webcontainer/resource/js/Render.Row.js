/**
 * Component rendering peer: Row
 */
EchoRender.ComponentSync.Row = function() {
};
  
EchoRender.ComponentSync.Row.prototype = new EchoRender.ComponentSync;

EchoRender.ComponentSync.Row._defaultCellInsets = new EchoApp.Property.Insets(0);

EchoRender.ComponentSync.Row._createRowPrototype = function() {
    var divElement = document.createElement("div");
    divElement.style.outlineStyle = "none";
    divElement.tabIndex = "-1";

    var tableElement = document.createElement("table");
    tableElement.style.borderCollapse = "collapse";
    divElement.appendChild(tableElement);

    var tbodyElement = document.createElement("tbody");
    tableElement.appendChild(tbodyElement);
    
    var trElement = document.createElement("tr");
    tbodyElement.appendChild(trElement);

    return divElement;
};

EchoRender.ComponentSync.Row._rowPrototype = EchoRender.ComponentSync.Row._createRowPrototype();

EchoRender.ComponentSync.Row.prototype.getContainerElement = function(component) {
    return this._childIdToElementMap[component.renderId];
};

EchoRender.ComponentSync.Row.prototype.processKeyDown = function(e) { 
    switch (e.keyCode) {
    case 37:
        var focusChanged = EchoRender.Focus.visitNextFocusComponent(this.component, true);
        if (focusChanged) {
            // Prevent default action (vertical scrolling).
            EchoWebCore.DOM.preventEventDefault(e);
        }
        return !focusChanged;
    case 39:
        var focusChanged = EchoRender.Focus.visitNextFocusComponent(this.component, false);
        if (focusChanged) {
            // Prevent default action (vertical scrolling).
            EchoWebCore.DOM.preventEventDefault(e);
        }
        return !focusChanged;
    }
};

EchoRender.ComponentSync.Row.prototype.renderAdd = function(update, parentElement) {
    this._divElement = EchoRender.ComponentSync.Row._rowPrototype.cloneNode(true);
    this._divElement.id = this.component.renderId;
    
    EchoRender.Property.Border.render(this.component.getRenderProperty("border"), this._divElement);
    EchoRender.Property.Color.renderFB(this.component, this._divElement);
    EchoRender.Property.Insets.renderComponentProperty(this.component, "insets", null, this._divElement, "padding");
    
    //                div              table      tbody      tr
    this._trElement = this._divElement.firstChild.firstChild.firstChild;

    this._cellSpacing = EchoRender.Property.Extent.toPixels(this.component.getRenderProperty("cellSpacing"), false);
    if (this._cellSpacing) {
        this._spacingPrototype = document.createElement("td");
        this._spacingPrototype.style.width = this._cellSpacing + "px";
    }
    
    this._childIdToElementMap = new Object();

    var componentCount = this.component.getComponentCount();
    for (var i = 0; i < componentCount; ++i) {
        var child = this.component.getComponent(i);
        this._renderAddChild(update, child);
    }
    
    EchoWebCore.EventProcessor.add(this._divElement, "keydown", new EchoCore.MethodRef(this, this.processKeyDown), false);
    
    parentElement.appendChild(this._divElement);
};

EchoRender.ComponentSync.Row.prototype._renderAddChild = function(update, child, index) {
    if (index != null && index == update.parent.getComponentCount() - 1) {
        index = null;
    }
    
    var tdElement = document.createElement("td");
    this._childIdToElementMap[child.renderId] = tdElement;
    EchoRender.renderComponentAdd(update, child, tdElement);

    var layoutData = child.getRenderProperty("layoutData");
    var insets;
    if (layoutData) {
    	insets = layoutData.getProperty("insets");
        EchoRender.Property.Color.renderComponentProperty(layoutData, "background", null, tdElement, "backgroundColor");
        EchoRender.Property.FillImage.renderComponentProperty(layoutData, "backgroundImage", null, tdElement);
		EchoRender.Property.Alignment.renderComponentProperty(layoutData, "alignment", null, tdElement, true, this.component);
	    var width = layoutData.getProperty("width");
	    if (width) {
	        if (width.units == "%") {
		    	tdElement.style.width = width.toString();
	        } else {
		    	tdElement.style.width = EchoRender.Property.Extent.toPixels(width, true) + "px";
	        }
	    }
    }
    if (!insets) {
    	insets = EchoRender.ComponentSync.Row._defaultCellInsets;
    }
    EchoRender.Property.Insets.renderPixel(insets, tdElement, "padding");
    
    if (index == null) {
        // Full render or append-at-end scenario
        
        // Render spacing td first if index != 0 and cell spacing enabled.
        if (this._cellSpacing && this._trElement.firstChild) {
            this._trElement.appendChild(this._spacingPrototype.cloneNode(false));
        }

        // Render child td second.
        this._trElement.appendChild(tdElement);
    } else {
        // Partial render insert at arbitrary location scenario (but not at end)
        var insertionIndex = this._cellSpacing ? index * 2 : index;
        var beforeElement = this._trElement.childNodes[insertionIndex]
        
        // Render child td first.
        this._trElement.insertBefore(tdElement, beforeElement);
        
        // Then render spacing td if required.
        if (this._cellSpacing) {
            this._trElement.insertBefore(this._spacingPrototype.cloneNode(false), beforeElement);
        }
    }
};

EchoRender.ComponentSync.Row.prototype._renderRemoveChild = function(update, child) {
    var childElement = this._childIdToElementMap[child.renderId];
    
    if (this._cellSpacing) {
        // If cell spacing is enabled, remove a spacing element, either before or after the removed child.
        // In the case of a single child existing in the Row, no spacing element will be removed.
        if (childElement.previousSibling) {
            this._trElement.removeChild(childElement.previousSibling);
        } else if (childElement.nextSibling) {
            this._trElement.removeChild(childElement.nextSibling);
        }
    }
    this._trElement.removeChild(childElement);

    delete this._childIdToElementMap[child.renderId];
};

EchoRender.ComponentSync.Row.prototype.renderDispose = function(update) { 
    EchoWebCore.EventProcessor.remove(this._divElement, "keydown", new EchoCore.MethodRef(this, this.processKeyDown), false);
    this._divElement.id = "";
    this._divElement = null;
    this._trElement = null;
    this._childIdToElementMap = null;
    this._spacingPrototype = null;
};

EchoRender.ComponentSync.Row.prototype.renderUpdate = function(update) {
    var fullRender = false;
    if (update.hasUpdatedProperties() || update.hasUpdatedLayoutDataChildren()) {
        // Full render
        fullRender = true;
    } else {
        var removedChildren = update.getRemovedChildren();
        if (removedChildren) {
            // Remove children.
            for (var i = 0; i < removedChildren.length; ++i) {
                var child = removedChildren[i];
                this._renderRemoveChild(update, child);
            }
        }
        var addedChildren = update.getAddedChildren();
        if (addedChildren) {
            // Add children.
            for (var i = 0; i < addedChildren.length; ++i) {
                this._renderAddChild(update, addedChildren[i], this.component.indexOf(addedChildren[i])); 
            }
        }
    }
    if (fullRender) {
        EchoRender.Util.renderRemove(update, update.parent);
        var containerElement = EchoRender.Util.getContainerElement(update.parent);
        this.renderAdd(update, containerElement);
    }
    
    return fullRender;
};

EchoRender.registerPeer("Row", EchoRender.ComponentSync.Row);